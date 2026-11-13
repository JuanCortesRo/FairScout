"""Evaluación de candidatos frente a una vacante confirmada: uno a uno o todos en lote.

Por candidato: evaluar (LLM) → verificar citas → calcular puntaje en código → guardar con trazabilidad.
"""
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.llm import LLMNoConfigurado
from app.mensajes import ERROR_INESPERADO, error_de_ia
from app.models import CandidatoDB, EvaluacionDB, VacanteDB
from app.pipeline.datos_protegidos import motivo_bloqueo
from app.pipeline.evaluate import RespuestaEvaluacionInvalida, evaluar
from app.pipeline.explain import explicar
from app.pipeline.scoring import alertas_para_puntaje, calcular_con_desglose
from app.pipeline.verify import verificar_citas
from app.schemas import (
    ErrorEvaluacion,
    EvaluacionEntrada,
    EvaluacionLoteSalida,
    EvaluacionSalida,
    Ficha,
    Linea,
    Requisito,
    TrazabilidadEvaluacion,
)

router = APIRouter(tags=["evaluations"])
log = logging.getLogger(__name__)


@router.post("/evaluations", response_model=EvaluacionSalida)
async def crear_evaluacion(
    entrada: EvaluacionEntrada,
    db: Session = Depends(get_db),
) -> EvaluacionSalida:
    candidato = db.get(CandidatoDB, entrada.candidato_id)
    vacante = db.get(VacanteDB, entrada.vacante_id)
    if candidato is None:
        raise HTTPException(status_code=404, detail="El candidato no existe.")
    if vacante is None:
        raise HTTPException(status_code=404, detail="La vacante no existe.")
    if candidato.vacante_id != vacante.id:
        raise HTTPException(status_code=409, detail="El CV no pertenece a esta vacante.")
    if candidato.estado != "processed":
        raise HTTPException(status_code=409, detail="El CV no está listo para evaluación.")
    requisitos = _requisitos_evaluables(vacante)

    try:
        resultado = await _evaluar_candidato(candidato, vacante, requisitos)
    except Exception as error:
        raise _error_http(error) from error
    _guardar(db, resultado)
    return resultado


@router.post("/vacantes/{vacante_id}/evaluar", response_model=EvaluacionLoteSalida)
async def evaluar_todos(
    vacante_id: str,
    reevaluar: bool = False,
    db: Session = Depends(get_db),
) -> EvaluacionLoteSalida:
    """Evalúa todos los CVs procesados de la vacante, con varias llamadas al LLM en paralelo.

    Por defecto omite a quien ya tiene una evaluación con la versión vigente de los requisitos
    (`reevaluar=true` los evalúa de nuevo). Un candidato que falla se reporta en `errores` y no detiene el lote.
    """
    vacante = db.get(VacanteDB, vacante_id)
    if vacante is None:
        raise HTTPException(status_code=404, detail="La vacante no existe.")
    requisitos = _requisitos_evaluables(vacante)

    candidatos = db.scalars(
        select(CandidatoDB)
        .where(CandidatoDB.vacante_id == vacante.id, CandidatoDB.estado == "processed")
        .order_by(CandidatoDB.id)
    ).all()
    ya_evaluados = set() if reevaluar else set(db.scalars(
        select(EvaluacionDB.candidato_id).where(
            EvaluacionDB.vacante_id == vacante.id,
            EvaluacionDB.version_requisitos == vacante.version_requisitos,
        )
    ).all())
    pendientes = [c for c in candidatos if c.id not in ya_evaluados]

    semaforo = asyncio.Semaphore(settings.EVALUACIONES_CONCURRENTES)
    errores: list[ErrorEvaluacion] = []

    async def procesar(candidato: CandidatoDB) -> None:
        async with semaforo:
            try:
                resultado = await _evaluar_candidato(candidato, vacante, requisitos)
            except Exception as error:  # un CV que falla no detiene el lote
                errores.append(ErrorEvaluacion(candidato_id=candidato.id, detalle=_error_http(error).detail))
                return
        # Se guarda apenas termina: si el lote se corta, lo evaluado no se pierde.
        _guardar(db, resultado)

    await asyncio.gather(*(procesar(c) for c in pendientes))
    errores.sort(key=lambda e: e.candidato_id)
    return EvaluacionLoteSalida(
        vacante_id=vacante.id,
        evaluados=len(pendientes) - len(errores),
        omitidos=len(candidatos) - len(pendientes),
        errores=errores,
    )


@router.get("/vacantes/{vacante_id}/evaluaciones", response_model=list[EvaluacionSalida])
def listar_evaluaciones(vacante_id: str, db: Session = Depends(get_db)) -> list[EvaluacionSalida]:
    """Evaluación vigente de cada candidato (versión actual de los requisitos, la más reciente).

    Es lo que usa la vista de detalle: resultado por requisito con su cita, explicación y trazabilidad.
    """
    vacante = db.get(VacanteDB, vacante_id)
    if vacante is None:
        raise HTTPException(status_code=404, detail="La vacante no existe.")
    filas = db.scalars(
        select(EvaluacionDB).where(
            EvaluacionDB.vacante_id == vacante.id,
            EvaluacionDB.version_requisitos == vacante.version_requisitos,
        )
    ).all()
    vigentes: dict[str, EvaluacionDB] = {}
    for fila in filas:
        actual = vigentes.get(fila.candidato_id)
        if actual is None or _fecha(fila) > _fecha(actual):
            vigentes[fila.candidato_id] = fila
    return [EvaluacionSalida.model_validate(f.resultado) for _, f in sorted(vigentes.items())]


@router.get(
    "/vacantes/{vacante_id}/candidatos/{candidato_id}/evaluacion",
    response_model=EvaluacionSalida,
)
def obtener_evaluacion(
    vacante_id: str,
    candidato_id: str,
    db: Session = Depends(get_db),
) -> EvaluacionSalida:
    vacante = db.get(VacanteDB, vacante_id)
    if vacante is None:
        raise HTTPException(status_code=404, detail="La vacante no existe.")
    filas = db.scalars(
        select(EvaluacionDB).where(
            EvaluacionDB.vacante_id == vacante_id,
            EvaluacionDB.candidato_id == candidato_id,
            EvaluacionDB.version_requisitos == vacante.version_requisitos,
        )
    ).all()
    if not filas:
        raise HTTPException(status_code=404, detail="El candidato aún no tiene una evaluación vigente.")
    fila = max(filas, key=_fecha)
    return EvaluacionSalida.model_validate(fila.resultado)


def _fecha(fila: EvaluacionDB) -> str:
    return fila.resultado.get("trazabilidad", {}).get("fecha_evaluacion", "")


def _requisitos_evaluables(vacante: VacanteDB) -> list[Requisito]:
    if not vacante.requisitos_confirmados:
        raise HTTPException(status_code=409, detail="Los requisitos de la vacante aún no están confirmados.")
    if not vacante.requisitos:
        raise HTTPException(status_code=422, detail="La vacante no tiene requisitos válidos.")
    requisitos = [
        Requisito(id=r.id, nombre=r.nombre, tipo=r.tipo, categoria=r.categoria, peso=r.peso)
        for r in vacante.requisitos
    ]
    # Defensa en profundidad: nunca se evalúa con un requisito protegido, aunque haya llegado a la base de datos.
    motivos = [m for m in map(motivo_bloqueo, requisitos) if m]
    if motivos:
        raise HTTPException(status_code=422, detail=" ".join(motivos))
    return requisitos


async def _evaluar_candidato(
    candidato: CandidatoDB,
    vacante: VacanteDB,
    requisitos: list[Requisito],
) -> EvaluacionSalida:
    ficha = Ficha.model_validate(candidato.ficha)
    lineas = [Linea.model_validate(linea) for linea in candidato.lineas_anonimizadas]
    evaluaciones = await evaluar(ficha, requisitos, lineas)
    evaluaciones = verificar_citas(evaluaciones, lineas)
    resultado_candidato, desglose = calcular_con_desglose(
        evaluaciones, requisitos, candidato.id, alertas_para_puntaje(candidato.alertas or [])
    )
    return EvaluacionSalida(
        evaluacion_id=f"EVAL-{uuid.uuid4().hex[:12]}",
        candidato_id=candidato.id,
        vacante_id=vacante.id,
        version_requisitos=vacante.version_requisitos,
        evaluaciones=evaluaciones,
        explicacion=explicar(evaluaciones, requisitos),
        trazabilidad=TrazabilidadEvaluacion(
            modelo=settings.MODELO_EVALUACION,
            version_prompt=settings.PROMPT_VERSION,
            fecha_evaluacion=datetime.now(timezone.utc).isoformat(),
            candidato_id=candidato.id,
            vacante_id=vacante.id,
            version_requisitos=vacante.version_requisitos,
        ),
        resultado=resultado_candidato,
        motivos_confianza=desglose.motivos_confianza,
    )


def _guardar(db: Session, resultado: EvaluacionSalida) -> None:
    db.add(EvaluacionDB(
        id=resultado.evaluacion_id,
        candidato_id=resultado.candidato_id,
        vacante_id=resultado.vacante_id,
        version_requisitos=resultado.version_requisitos,
        resultado=json.loads(resultado.model_dump_json()),
    ))
    db.commit()


def _error_http(error: Exception) -> HTTPException:
    """Traduce los errores de la evaluación a HTTP con mensajes en español."""
    if isinstance(error, (LLMNoConfigurado, anthropic.APIError, RespuestaEvaluacionInvalida)):
        return error_de_ia(error, "evaluar este CV")
    if isinstance(error, (ValidationError, ValueError)):
        log.warning("Datos guardados del candidato inválidos: %r", error)
        return HTTPException(status_code=422, detail="No se pudieron leer los datos de este CV. Vuelve a subirlo.")
    log.exception("Error inesperado al evaluar")
    return HTTPException(status_code=500, detail=ERROR_INESPERADO)
