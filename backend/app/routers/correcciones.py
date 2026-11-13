"""Correcciones humanas del resultado de un requisito (la IA propone, la persona decide).

Una corrección reemplaza el resultado de la IA para un candidato y un requisito en la versión vigente de los
requisitos. Puede venir del reclutador (origen "manual") o de aceptar lo que verificó la entrevista (origen
"entrevista", con la frase del candidato como evidencia). El ranking y la exportación las aplican al calcular.
"""
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CandidatoDB, CorreccionDB, VacanteDB

router = APIRouter(tags=["correcciones"])

RESULTADOS_POR_TIPO = {
    "obligatorio": {"cumple", "equivalente", "parcial", "no_cumple", "sin_informacion"},
    "deseable": {"cumple", "equivalente", "parcial", "no_cumple", "sin_informacion"},
    "descalificante": {"presente", "ausente", "sin_informacion"},
}


class CorreccionEntrada(BaseModel):
    resultado: str
    resultado_ia: str | None = None
    motivo: str = Field(default="", max_length=500)
    origen: Literal["manual", "entrevista"] = "manual"
    entrevista_id: str | None = None
    evidencia: str | None = Field(default=None, max_length=600)


class CorreccionSalida(CorreccionEntrada):
    candidato_id: str
    requisito_id: str
    version_requisitos: int
    fecha: str


def _salida(c: CorreccionDB) -> CorreccionSalida:
    return CorreccionSalida(
        candidato_id=c.candidato_id, requisito_id=c.requisito_id, version_requisitos=c.version_requisitos,
        resultado=c.resultado, resultado_ia=c.resultado_ia, motivo=c.motivo, origen=c.origen,
        entrevista_id=c.entrevista_id, evidencia=c.evidencia, fecha=c.fecha.isoformat(),
    )


def correcciones_vigentes(db: Session, vacante: VacanteDB) -> dict[str, dict[str, CorreccionDB]]:
    """{candidato_id: {requisito_id: corrección}} para la versión vigente de los requisitos."""
    filas = db.scalars(select(CorreccionDB).where(
        CorreccionDB.vacante_id == vacante.id,
        CorreccionDB.version_requisitos == vacante.version_requisitos,
    )).all()
    resultado: dict[str, dict[str, CorreccionDB]] = {}
    for c in filas:
        resultado.setdefault(c.candidato_id, {})[c.requisito_id] = c
    return resultado


def _buscar(db: Session, vacante_id: str, candidato_id: str, requisito_id: str):
    vacante = db.get(VacanteDB, vacante_id)
    if vacante is None:
        raise HTTPException(status_code=404, detail="La vacante no existe.")
    candidato = db.get(CandidatoDB, candidato_id)
    if candidato is None or candidato.vacante_id != vacante.id:
        raise HTTPException(status_code=404, detail="El candidato no pertenece a esta vacante.")
    requisito = next((r for r in vacante.requisitos if r.id == requisito_id), None)
    if requisito is None:
        raise HTTPException(status_code=404, detail="El requisito no existe en esta vacante.")
    existente = db.scalars(select(CorreccionDB).where(
        CorreccionDB.candidato_id == candidato_id, CorreccionDB.requisito_id == requisito_id,
        CorreccionDB.version_requisitos == vacante.version_requisitos,
    )).first()
    return vacante, requisito, existente


@router.get("/vacantes/{vacante_id}/correcciones", response_model=list[CorreccionSalida])
def listar_correcciones(vacante_id: str, db: Session = Depends(get_db)) -> list[CorreccionSalida]:
    vacante = db.get(VacanteDB, vacante_id)
    if vacante is None:
        raise HTTPException(status_code=404, detail="La vacante no existe.")
    return [_salida(c) for propias in correcciones_vigentes(db, vacante).values() for c in propias.values()]


@router.put("/vacantes/{vacante_id}/candidatos/{candidato_id}/correcciones/{requisito_id}",
            response_model=CorreccionSalida)
def guardar_correccion(vacante_id: str, candidato_id: str, requisito_id: str, entrada: CorreccionEntrada,
                       db: Session = Depends(get_db)) -> CorreccionSalida:
    vacante, requisito, existente = _buscar(db, vacante_id, candidato_id, requisito_id)
    if entrada.resultado not in RESULTADOS_POR_TIPO.get(requisito.tipo, set()):
        raise HTTPException(status_code=422, detail="Ese resultado no aplica a este tipo de requisito.")
    fila = existente or CorreccionDB(
        id=uuid.uuid4().hex, vacante_id=vacante.id, candidato_id=candidato_id, requisito_id=requisito_id,
        version_requisitos=vacante.version_requisitos,
    )
    fila.resultado = entrada.resultado
    # Se conserva el resultado original de la IA aunque la corrección se edite varias veces.
    fila.resultado_ia = existente.resultado_ia if existente else entrada.resultado_ia
    fila.motivo = entrada.motivo.strip()
    fila.origen = entrada.origen
    fila.entrevista_id = entrada.entrevista_id
    fila.evidencia = entrada.evidencia
    if existente is None:
        db.add(fila)
    db.commit()
    db.refresh(fila)
    return _salida(fila)


@router.delete("/vacantes/{vacante_id}/candidatos/{candidato_id}/correcciones/{requisito_id}", status_code=204)
def borrar_correccion(vacante_id: str, candidato_id: str, requisito_id: str,
                      db: Session = Depends(get_db)) -> Response:
    _, _, existente = _buscar(db, vacante_id, candidato_id, requisito_id)
    if existente is not None:
        db.delete(existente)
        db.commit()
    return Response(status_code=204)
