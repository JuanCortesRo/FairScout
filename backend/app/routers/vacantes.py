"""POST /api/vacantes: convierte una descripción de cargo en requisitos tipificados."""
import logging
import uuid

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.llm import LLMNoConfigurado
from app.mensajes import error_de_ia
from app.models import RequisitoDB, VacanteDB
from app.pipeline.datos_protegidos import motivo_bloqueo, separar_requisitos
from app.pipeline.requirements import RespuestaLLMInvalida, proponer_requisitos
from app.schemas import RequisitoBloqueado, VacanteActualizacion, VacanteEntrada, VacanteSalida

router = APIRouter(tags=["vacantes"])
log = logging.getLogger(__name__)


def _salida(vacante: VacanteDB) -> VacanteSalida:
    return VacanteSalida(
        id=vacante.id,
        titulo=vacante.titulo,
        descripcion=vacante.descripcion,
        requisitos=[
            {
                "id": requisito.id,
                "nombre": requisito.nombre,
                "tipo": requisito.tipo,
                "categoria": requisito.categoria,
                "peso": requisito.peso,
            }
            for requisito in vacante.requisitos
        ],
        version_requisitos=vacante.version_requisitos,
        requisitos_confirmados=vacante.requisitos_confirmados,
        fecha_creacion=vacante.fecha_creacion,
    )


@router.get("/vacantes", response_model=list[VacanteSalida])
def listar_vacantes(db: Session = Depends(get_db)) -> list[VacanteSalida]:
    vacantes = db.scalars(
        select(VacanteDB).order_by(VacanteDB.fecha_creacion.desc().nulls_last(), VacanteDB.id)
    ).all()
    return [_salida(vacante) for vacante in vacantes]


@router.get("/vacantes/{vacante_id}", response_model=VacanteSalida)
def obtener_vacante(vacante_id: str, db: Session = Depends(get_db)) -> VacanteSalida:
    vacante = db.get(VacanteDB, vacante_id)
    if vacante is None:
        raise HTTPException(status_code=404, detail="La vacante no existe.")
    return _salida(vacante)


@router.delete("/vacantes/{vacante_id}", status_code=204)
def eliminar_vacante(vacante_id: str, db: Session = Depends(get_db)) -> None:
    """Borra la vacante con sus requisitos, CVs, evaluaciones y entrevistas (llaves foráneas en cascada)."""
    vacante = db.get(VacanteDB, vacante_id)
    if vacante is None:
        raise HTTPException(status_code=404, detail="La vacante no existe.")
    db.delete(vacante)
    db.commit()


@router.post("/vacantes", response_model=VacanteSalida)
async def crear_vacante(
    entrada: VacanteEntrada,
    db: Session = Depends(get_db),
) -> VacanteSalida:
    try:
        propuesta = await proponer_requisitos(entrada.descripcion)
    except RespuestaLLMInvalida as e:
        # Sus mensajes ya están escritos para el reclutador (p. ej. "intenta con una descripción más corta").
        raise HTTPException(status_code=502, detail=str(e))
    except (LLMNoConfigurado, anthropic.APIError) as e:
        raise error_de_ia(e, "proponer los requisitos") from e

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
        descripcion=entrada.descripcion,
        requisitos=requisitos,
        version_requisitos=vacante.version_requisitos,
        requisitos_confirmados=vacante.requisitos_confirmados,
        fecha_creacion=vacante.fecha_creacion,
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
    # La primera confirmación del borrador es la versión 1; cada edición posterior crea una versión nueva
    # (y deja sin vigencia las evaluaciones hechas con la anterior).
    if vacante.requisitos_confirmados:
        vacante.version_requisitos += 1
    vacante.requisitos_confirmados = True
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
        descripcion=vacante.descripcion,
        requisitos=entrada.requisitos,
        version_requisitos=vacante.version_requisitos,
        requisitos_confirmados=vacante.requisitos_confirmados,
        fecha_creacion=vacante.fecha_creacion,
    )
