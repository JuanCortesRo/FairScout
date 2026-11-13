"""GET /api/ranking: ranking de TODOS los candidatos evaluados para una vacante.

El puntaje se recalcula en cada consulta a partir de las evaluaciones guardadas (sin volver a llamar al LLM),
así que cambiar `peso_obligatorios` reordena al instante. Solo cuentan las evaluaciones hechas con la versión
vigente de los requisitos; de cada candidato se usa la más reciente.

Los CVs con alerta crítica (`needs_review`) nunca pasan por el LLM: se listan aparte en `en_revision`.
"""
from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CandidatoDB, CorreccionDB, EvaluacionDB, VacanteDB
from app.pipeline.scoring import (
    PESO_OBLIGATORIOS,
    Desglose,
    alertas_para_puntaje,
    calcular_con_desglose,
    ordenar_ranking,
)
from app.routers.correcciones import correcciones_vigentes
from app.schemas import (
    CandidatoEnRevision,
    DetalleRanking,
    EvaluacionRequisito,
    RankingSalida,
    Requisito,
    ResultadoCandidato,
)

router = APIRouter(tags=["ranking"])


@router.get("/ranking", response_model=RankingSalida)
def obtener_ranking(
    vacante_id: str | None = None,
    peso_obligatorios: float = Query(PESO_OBLIGATORIOS, ge=0, le=100),
    db: Session = Depends(get_db),
) -> RankingSalida:
    """Devuelve resultados recalculados para el peso solicitado y candidatos en revisión aparte."""
    if vacante_id is None:
        return RankingSalida(vacante_id=None, peso_obligatorios=peso_obligatorios, candidatos=[])
    vacante = db.get(VacanteDB, vacante_id)
    if vacante is None:
        raise HTTPException(status_code=404, detail="La vacante no existe.")

    filas = calcular_ranking(db, vacante, peso_obligatorios)
    detalles = {
        f.resultado.candidato_id: DetalleRanking(
            puntaje_obligatorios=f.desglose.puntaje_obligatorios,
            puntaje_deseables=f.desglose.puntaje_deseables,
            cobertura=f.desglose.cobertura,
            motivos_confianza=f.desglose.motivos_confianza,
            categorias=f.desglose.categorias,
            citas_sin_verificar=f.desglose.citas_sin_verificar,
        )
        for f in filas
    }

    en_revision = db.scalars(
        select(CandidatoDB)
        .where(CandidatoDB.vacante_id == vacante.id, CandidatoDB.estado == "needs_review")
        .order_by(CandidatoDB.id)
    ).all()

    return RankingSalida(
        vacante_id=vacante.id,
        peso_obligatorios=peso_obligatorios,
        candidatos=[f.resultado for f in filas],
        detalles=detalles,
        en_revision=[
            CandidatoEnRevision(candidato_id=c.id, alertas=c.alertas or [])
            for c in en_revision
        ],
    )


@dataclass(frozen=True)
class FilaRanking:
    resultado: ResultadoCandidato
    desglose: Desglose
    evaluacion: EvaluacionDB      # la evaluación vigente guardada (citas, justificaciones y explicación)
    evaluaciones: list[EvaluacionRequisito]   # resultado por requisito con las correcciones humanas aplicadas


def requisitos_de(vacante: VacanteDB) -> list[Requisito]:
    """Convierte los requisitos persistidos al contrato usado por las reglas de puntuación."""
    return [
        Requisito(id=r.id, nombre=r.nombre, tipo=r.tipo, categoria=r.categoria, peso=r.peso)
        for r in vacante.requisitos
    ]


def calcular_ranking(db: Session, vacante: VacanteDB, peso_obligatorios: float) -> list[FilaRanking]:
    """Obtiene la evaluación más reciente vigente y calcula el ranking sin invocar al LLM."""
    requisitos = requisitos_de(vacante)
    evaluaciones_db = db.scalars(
        select(EvaluacionDB).where(
            EvaluacionDB.vacante_id == vacante.id,
            EvaluacionDB.version_requisitos == vacante.version_requisitos,
        )
    ).all()

    # La evaluación más reciente de cada candidato (la fecha ISO en UTC se ordena como texto).
    vigentes: dict[str, EvaluacionDB] = {}
    for fila in evaluaciones_db:
        actual = vigentes.get(fila.candidato_id)
        if actual is None or _fecha(fila) > _fecha(actual):
            vigentes[fila.candidato_id] = fila

    correcciones = correcciones_vigentes(db, vacante)
    filas: dict[str, FilaRanking] = {}
    for candidato_id, fila in vigentes.items():
        candidato = db.get(CandidatoDB, candidato_id)
        evaluaciones = aplicar_correcciones(
            [EvaluacionRequisito.model_validate(e) for e in fila.resultado["evaluaciones"]],
            correcciones.get(candidato_id, {}),
        )
        alertas = alertas_para_puntaje(candidato.alertas or []) if candidato else []
        resultado, desglose = calcular_con_desglose(
            evaluaciones, requisitos, candidato_id, alertas, peso_obligatorios
        )
        filas[candidato_id] = FilaRanking(resultado, desglose, fila, evaluaciones)
    return [filas[r.candidato_id] for r in ordenar_ranking([f.resultado for f in filas.values()])]


def aplicar_correcciones(evaluaciones: list[EvaluacionRequisito],
                         correcciones: dict[str, CorreccionDB]) -> list[EvaluacionRequisito]:
    """Reemplaza el resultado de la IA por el de la persona; la cita del CV se conserva."""
    if not correcciones:
        return evaluaciones
    corregidas = []
    for e in evaluaciones:
        c = correcciones.get(e.requisito_id)
        if c is None:
            corregidas.append(e)
            continue
        origen = "verificado en entrevista" if c.origen == "entrevista" else "corrección humana"
        motivo = c.motivo or (f'"{c.evidencia}"' if c.evidencia else "")
        corregidas.append(e.model_copy(update={
            "resultado": c.resultado,
            "justificacion": f"{motivo} ({origen})" if motivo else f"Resultado ajustado ({origen}).",
        }))
    return corregidas


def _fecha(fila: EvaluacionDB) -> str:
    return fila.resultado.get("trazabilidad", {}).get("fecha_evaluacion", "")
