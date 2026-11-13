"""POST /api/vacantes: convierte una descripción de cargo en requisitos tipificados."""
import logging
import uuid

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.llm import LLMNoConfigurado
from app.models import RequisitoDB, VacanteDB
from app.pipeline.datos_protegidos import motivo_bloqueo, separar_requisitos
from app.pipeline.requirements import RespuestaLLMInvalida, proponer_requisitos
from app.schemas import RequisitoBloqueado, VacanteActualizacion, VacanteEntrada, VacanteSalida

router = APIRouter(tags=["vacantes"])
log = logging.getLogger(__name__)


@router.post("/vacantes", response_model=VacanteSalida)
async def crear_vacante(
    entrada: VacanteEntrada,
    db: Session = Depends(get_db),
) -> VacanteSalida:
    try:
        propuesta = await proponer_requisitos(entrada.descripcion)
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
        raise HTTPException(
            status_code=502,
            detail=f"El servicio del modelo respondió con error ({e.status_code}). "
                   "Verifica el ID del modelo y los permisos de la API key.",
        )

    # Aunque el prompt lo prohíbe, si el LLM propone un requisito con un dato protegido se descarta aquí.
    requisitos, bloqueados = separar_requisitos(propuesta.requisitos)

    vacante_id = uuid.uuid4().hex
    vacante = VacanteDB(
        id=vacante_id,
        titulo=propuesta.titulo,
        descripcion=entrada.descripcion,
        requisitos_confirmados=False,
        requisitos=[
            RequisitoDB(
                id=requisito.id,
                nombre=requisito.nombre,
                tipo=requisito.tipo,
                categoria=requisito.categoria,
                peso=requisito.peso,
            )
            for requisito in requisitos
        ],
    )
    db.add(vacante)
    db.commit()

    return VacanteSalida(
        id=vacante_id,
        titulo=propuesta.titulo,
        requisitos=requisitos,
        requisitos_bloqueados=[RequisitoBloqueado(requisito=r, motivo=m) for r, m in bloqueados],
    )


@router.put("/vacantes/{vacante_id}", response_model=VacanteSalida)
def actualizar_vacante(
    vacante_id: str,
    entrada: VacanteActualizacion,
    db: Session = Depends(get_db),
) -> VacanteSalida:
    vacante = db.get(VacanteDB, vacante_id)
    if vacante is None:
        raise HTTPException(status_code=404, detail="La vacante no existe.")
    motivos = [m for m in map(motivo_bloqueo, entrada.requisitos) if m]
    if motivos:
        raise HTTPException(status_code=422, detail=" ".join(motivos))

    vacante.titulo = entrada.titulo
    vacante.descripcion = entrada.descripcion
    vacante.requisitos_confirmados = True
    vacante.version_requisitos += 1
    vacante.requisitos = [
        RequisitoDB(
            id=requisito.id,
            nombre=requisito.nombre,
            tipo=requisito.tipo,
            categoria=requisito.categoria,
            peso=requisito.peso,
        )
        for requisito in entrada.requisitos
    ]
    db.commit()

    return VacanteSalida(
        id=vacante.id,
        titulo=vacante.titulo,
        requisitos=entrada.requisitos,
    )
