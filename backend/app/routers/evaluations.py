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
from app.models import CandidatoDB, EvaluacionDB, VacanteDB
from app.pipeline.evaluate import RespuestaEvaluacionInvalida, evaluar
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
    """Evalúa todos los CVs procesados contra la vacante, con varias llamadas al LLM en paralelo.

    Por defecto omite a quien ya tiene una evaluación con la versión vigente de los requisitos
    (`reevaluar=true` los evalúa de nuevo). Un candidato que falla se reporta en `errores` y no detiene el lote.
    """
    vacante = db.get(VacanteDB, vacante_id)
    if vacante is None:
        raise HTTPException(status_code=404, detail="La vacante no existe.")
    requisitos = _requisitos_evaluables(vacante)

    candidatos = db.scalars(
        select(CandidatoDB).where(CandidatoDB.estado == "processed").order_by(CandidatoDB.id)
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


def _requisitos_evaluables(vacante: VacanteDB) -> list[Requisito]:
    if not vacante.requisitos_confirmados:
        raise HTTPException(status_code=409, detail="Los requisitos de la vacante aún no están confirmados.")
    if not vacante.requisitos:
        raise HTTPException(status_code=422, detail="La vacante no tiene requisitos válidos.")
    return [
        Requisito(id=r.id, nombre=r.nombre, tipo=r.tipo, categoria=r.categoria, peso=r.peso)
        for r in vacante.requisitos
    ]


async def _evaluar_candidato(
    candidato: CandidatoDB,
    vacante: VacanteDB,
    requisitos: list[Requisito],
) -> EvaluacionSalida:
    ficha = Ficha.model_validate(candidato.ficha)
    lineas = [Linea.model_validate(linea) for linea in candidato.lineas_anonimizadas]
    evaluaciones, explicacion = await evaluar(ficha, requisitos, lineas)
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
        explicacion=explicacion,
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
    if isinstance(error, (ValidationError, ValueError)):
        return HTTPException(status_code=422, detail=f"Datos del candidato inválidos: {error}")
    if isinstance(error, LLMNoConfigurado):
        return HTTPException(status_code=503, detail=str(error))
    if isinstance(error, RespuestaEvaluacionInvalida):
        return HTTPException(status_code=502, detail=str(error))
    if isinstance(error, anthropic.AuthenticationError):
        return HTTPException(status_code=503, detail="La llave de Anthropic no es válida.")
    if isinstance(error, anthropic.RateLimitError):
        return HTTPException(status_code=429, detail="Se superó el límite de uso del modelo.")
    if isinstance(error, anthropic.APIConnectionError):
        return HTTPException(status_code=502, detail="No fue posible conectarse con Anthropic.")
    if isinstance(error, anthropic.APIStatusError):
        log.error("Error de Anthropic al evaluar: %s", error.status_code)
        return HTTPException(status_code=502, detail="El servicio del modelo no pudo evaluar el candidato.")
    log.exception("Error inesperado al evaluar")
    return HTTPException(status_code=500, detail="Error inesperado al evaluar el candidato.")
