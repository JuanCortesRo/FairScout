"""GET /api/ranking: ranking de TODOS los candidatos evaluados para una vacante.

El puntaje se recalcula en cada consulta a partir de las evaluaciones guardadas (sin volver a llamar al LLM),
así que cambiar `peso_obligatorios` reordena al instante. Solo cuentan las evaluaciones hechas con la versión
vigente de los requisitos; de cada candidato se usa la más reciente.

Los CVs con alerta crítica (`needs_review`) nunca pasan por el LLM: se listan aparte en `en_revision`.
Por ahora los CVs no están ligados a una vacante, así que `en_revision` incluye todos los que estén en revisión.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CandidatoDB, EvaluacionDB, VacanteDB
from app.pipeline.scoring import (
    PESO_OBLIGATORIOS,
    alertas_para_puntaje,
    calcular_con_desglose,
    ordenar_ranking,
)
from app.schemas import (
    CandidatoEnRevision,
    DetalleRanking,
    EvaluacionRequisito,
    RankingSalida,
    Requisito,
)

router = APIRouter(tags=["ranking"])


@router.get("/ranking", response_model=RankingSalida)
def obtener_ranking(
    vacante_id: str | None = None,
    peso_obligatorios: float = Query(PESO_OBLIGATORIOS, ge=0, le=100),
    db: Session = Depends(get_db),
) -> RankingSalida:
    if vacante_id is None:
        return RankingSalida(vacante_id=None, peso_obligatorios=peso_obligatorios, candidatos=[])
    vacante = db.get(VacanteDB, vacante_id)
    if vacante is None:
        raise HTTPException(status_code=404, detail="La vacante no existe.")

    requisitos = [
        Requisito(id=r.id, nombre=r.nombre, tipo=r.tipo, categoria=r.categoria, peso=r.peso)
        for r in vacante.requisitos
    ]
    filas = db.scalars(
        select(EvaluacionDB).where(
            EvaluacionDB.vacante_id == vacante.id,
            EvaluacionDB.version_requisitos == vacante.version_requisitos,
        )
    ).all()

    # La evaluación más reciente de cada candidato (la fecha ISO en UTC se ordena como texto).
    vigentes: dict[str, EvaluacionDB] = {}
    for fila in filas:
        actual = vigentes.get(fila.candidato_id)
        if actual is None or _fecha(fila) > _fecha(actual):
            vigentes[fila.candidato_id] = fila

    resultados = []
    detalles = {}
    for candidato_id, fila in vigentes.items():
        candidato = db.get(CandidatoDB, candidato_id)
        evaluaciones = [EvaluacionRequisito.model_validate(e) for e in fila.resultado["evaluaciones"]]
        alertas = alertas_para_puntaje(candidato.alertas or []) if candidato else []
        resultado, desglose = calcular_con_desglose(
            evaluaciones, requisitos, candidato_id, alertas, peso_obligatorios
        )
        resultados.append(resultado)
        detalles[candidato_id] = DetalleRanking(
            puntaje_obligatorios=desglose.puntaje_obligatorios,
            puntaje_deseables=desglose.puntaje_deseables,
            cobertura=desglose.cobertura,
            motivos_confianza=desglose.motivos_confianza,
            categorias=desglose.categorias,
            citas_sin_verificar=desglose.citas_sin_verificar,
        )

    en_revision = db.scalars(
        select(CandidatoDB)
        .where(CandidatoDB.vacante_id == vacante.id, CandidatoDB.estado == "needs_review")
        .order_by(CandidatoDB.id)
    ).all()

    return RankingSalida(
        vacante_id=vacante.id,
        peso_obligatorios=peso_obligatorios,
        candidatos=ordenar_ranking(resultados),
        detalles=detalles,
        en_revision=[
            CandidatoEnRevision(candidato_id=c.id, alertas=c.alertas or [])
            for c in en_revision
        ],
    )


def _fecha(fila: EvaluacionDB) -> str:
    return fila.resultado.get("trazabilidad", {}).get("fecha_evaluacion", "")
