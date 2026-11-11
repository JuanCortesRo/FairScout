"""POST /api/vacantes: convierte una descripción de cargo en requisitos tipificados."""
import logging

import anthropic
from fastapi import APIRouter, HTTPException

from app.llm import LLMNoConfigurado
from app.pipeline.requirements import RespuestaLLMInvalida, proponer_requisitos
from app.schemas import VacanteEntrada, VacanteSalida

router = APIRouter(tags=["vacantes"])
log = logging.getLogger(__name__)


@router.post("/vacantes", response_model=VacanteSalida)
async def crear_vacante(entrada: VacanteEntrada) -> VacanteSalida:
    try:
        return await proponer_requisitos(entrada.descripcion)
    except LLMNoConfigurado as e:
        raise HTTPException(status_code=503, detail=str(e))
    except RespuestaLLMInvalida as e:
        raise HTTPException(status_code=502, detail=str(e))
    except anthropic.AuthenticationError:
        raise HTTPException(status_code=503, detail="La llave de Anthropic no es válida. Revisa ANTHROPIC_API_KEY.")
    except anthropic.RateLimitError:
        raise HTTPException(status_code=429, detail="Se superó el límite de uso del modelo. Intenta de nuevo en un momento.")
    except anthropic.APIConnectionError:
        raise HTTPException(status_code=502, detail="No fue posible conectarse con el servicio del modelo.")
    except anthropic.APIStatusError as e:
        log.error("Error de la API de Anthropic: %s", e.status_code)
        raise HTTPException(status_code=502, detail=f"El servicio del modelo respondió con error ({e.status_code}).")
