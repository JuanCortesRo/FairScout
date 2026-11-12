"""Evaluación individual de un candidato frente a una vacante confirmada."""
import json
import logging
import uuid
from datetime import datetime, timezone

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.llm import LLMNoConfigurado
from app.models import CandidatoDB, EvaluacionDB, VacanteDB
from app.pipeline.evaluate import RespuestaEvaluacionInvalida, evaluar
from app.pipeline.scoring import alertas_para_puntaje, calcular_con_desglose
from app.pipeline.verify import verificar_citas
from app.schemas import (
    EvaluacionEntrada,
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
    if not vacante.requisitos_confirmados:
        raise HTTPException(status_code=409, detail="Los requisitos de la vacante aún no están confirmados.")
    if not vacante.requisitos:
        raise HTTPException(status_code=422, detail="La vacante no tiene requisitos válidos.")

    try:
        ficha = Ficha.model_validate(candidato.ficha)
        lineas = [Linea.model_validate(linea) for linea in candidato.lineas_anonimizadas]
        requisitos = [Requisito.model_validate({
            "id": requisito.id,
            "nombre": requisito.nombre,
            "tipo": requisito.tipo,
            "categoria": requisito.categoria,
            "peso": requisito.peso,
        }) for requisito in vacante.requisitos]
        evaluaciones, explicacion = await evaluar(ficha, requisitos, lineas)
        evaluaciones = verificar_citas(evaluaciones, lineas)
        resultado_candidato, desglose = calcular_con_desglose(
            evaluaciones, requisitos, candidato.id, alertas_para_puntaje(candidato.alertas or [])
        )
    except (ValidationError, ValueError) as error:
        raise HTTPException(status_code=422, detail=f"Datos del candidato inválidos: {error}") from error
    except LLMNoConfigurado as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except RespuestaEvaluacionInvalida as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except anthropic.AuthenticationError as error:
        raise HTTPException(status_code=503, detail="La llave de Anthropic no es válida.") from error
    except anthropic.RateLimitError as error:
        raise HTTPException(status_code=429, detail="Se superó el límite de uso del modelo.") from error
    except anthropic.APIConnectionError as error:
        raise HTTPException(status_code=502, detail="No fue posible conectarse con Anthropic.") from error
    except anthropic.APIStatusError as error:
        log.error("Error de Anthropic al evaluar: %s", error.status_code)
        raise HTTPException(status_code=502, detail="El servicio del modelo no pudo evaluar el candidato.") from error

    ahora = datetime.now(timezone.utc).isoformat()
    resultado = EvaluacionSalida(
        evaluacion_id=f"EVAL-{uuid.uuid4().hex[:12]}",
        candidato_id=candidato.id,
        vacante_id=vacante.id,
        version_requisitos=vacante.version_requisitos,
        evaluaciones=evaluaciones,
        explicacion=explicacion,
        trazabilidad=TrazabilidadEvaluacion(
            modelo=settings.MODELO_EVALUACION,
            version_prompt=settings.PROMPT_VERSION,
            fecha_evaluacion=ahora,
            candidato_id=candidato.id,
            vacante_id=vacante.id,
            version_requisitos=vacante.version_requisitos,
        ),
        resultado=resultado_candidato,
        motivos_confianza=desglose.motivos_confianza,
    )
    db.add(EvaluacionDB(
        id=resultado.evaluacion_id,
        candidato_id=candidato.id,
        vacante_id=vacante.id,
        version_requisitos=vacante.version_requisitos,
        resultado=json.loads(resultado.model_dump_json()),
    ))
    db.commit()
    return resultado
