"""POST /api/vacantes/{id}/cvs: recibe hojas de vida para una vacante, las guarda y extrae sus líneas.

Los PDF se procesan inmediatamente con PyMuPDF para conservar el texto y las
coordenadas de cada línea. Los DOCX se convierten primero con LibreOffice.
"""
import logging
import uuid
from pathlib import Path

from anthropic import APIError
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.pipeline.document_processor import DocumentoNoProcesable, process_document
from app.pipeline.extract import RespuestaLLMInvalida, extraer_ficha
from app.pipeline.postprocess import limpiar_ficha
from app.llm import LLMNoConfigurado
from app.models import CandidatoDB, ContactoCandidatoDB, VacanteDB
from app.pipeline.anonymize import Contacto
from app.pipeline.duplicados import CVExistente, buscar_coincidencias, relaciones, texto_comparable
from app.schemas import CargaCVsSalida, CVResumen, CVSubido, Ficha, ListaCVsSalida

router = APIRouter(tags=["cvs"])
log = logging.getLogger(__name__)

EXTENSIONES_PERMITIDAS = {".pdf", ".docx"}


def _tipos_de_alerta(documento) -> list[str]:
    """Tipos de alerta sin repetir; agrega "ocr" si alguna línea salió de OCR (baja la confianza del puntaje)."""
    tipos = [alerta.tipo for alerta in documento.alertas]
    if any(linea.origen == "ocr" for linea in documento.lineas_originales):
        tipos.append("ocr")
    return list(dict.fromkeys(tipos))


@router.post("/vacantes/{vacante_id}/cvs", response_model=CargaCVsSalida)
async def subir_cvs(
    vacante_id: str,
    archivos: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
) -> CargaCVsSalida:
    """Procesa los archivos de la vacante y persiste solo texto anonimizado y contacto separado.

    El original se elimina tras el procesamiento; documentos con alertas críticas quedan para revisión
    y no se envían a extracción.
    """
    _vacante_o_404(db, vacante_id)
    invalidos = [a.filename for a in archivos if Path(a.filename or "").suffix.lower() not in EXTENSIONES_PERMITIDAS]
    if invalidos:
        raise HTTPException(
            status_code=400,
            detail=f"Solo se aceptan archivos .pdf o .docx. Archivos rechazados: {', '.join(map(str, invalidos))}",
        )

    destino = Path(settings.UPLOADS_DIR)
    destino.mkdir(parents=True, exist_ok=True)

    subidos: list[CVSubido] = []
    for archivo in archivos:
        cv_id = uuid.uuid4().hex
        extension = Path(archivo.filename).suffix.lower()
        ruta = destino / f"{cv_id}{extension}"
        ruta.write_bytes(await archivo.read())

        try:
            documento = process_document(ruta, cv_id)
        except DocumentoNoProcesable as error:
            subidos.append(CVSubido(id=cv_id, estado="failed", alertas=[str(error)]))
            continue
        finally:
            # El archivo original (con nombre, foto y datos de contacto) no se conserva: basta el texto anonimizado.
            ruta.unlink(missing_ok=True)

        # Antes de la IA: el mismo CV no se vuelve a procesar; otra versión o el mismo contacto solo se marcan.
        coincidencias = buscar_coincidencias(
            texto_comparable(documento.lineas_anonimizadas), documento.contacto, _cvs_de_la_vacante(db, vacante_id)
        )
        if coincidencias.duplicado_de:
            subidos.append(CVSubido(id=cv_id, estado="duplicado", duplicado_de=coincidencias.duplicado_de))
            continue
        similares = coincidencias.similares

        alertas = _tipos_de_alerta(documento)
        subidos.append(CVSubido(
            id=cv_id,
            lineas=documento.lineas_anonimizadas,
            estado=documento.estado,
            alertas=_con_similares(alertas, similares),
            similares=similares,
        ))
        if not documento.puede_enviarse_al_llm:
            # Alerta crítica: no va al LLM, pero se guarda para que aparezca "en revisión" en el ranking.
            _guardar_candidato(db, cv_id, vacante_id, documento, _FICHA_VACIA, alertas, similares)
            continue
        try:
            ficha = limpiar_ficha(await extraer_ficha(documento.lineas_anonimizadas))
        except (APIError, LLMNoConfigurado, RespuestaLLMInvalida) as error:
            log.warning("La IA no pudo extraer la ficha del CV %s: %r", cv_id, error)
            subidos[-1] = CVSubido(
                id=cv_id,
                lineas=documento.lineas_anonimizadas,
                estado="failed",
                alertas=["extraccion_llm"],   # el frontend lo muestra como "La IA no pudo leer este CV"
            )
            continue
        if ficha.inconsistencia_fechas:
            alertas = list(dict.fromkeys([*alertas, "inconsistencia_fechas"]))
        subidos[-1] = CVSubido(
            id=cv_id,
            lineas=documento.lineas_anonimizadas,
            ficha=ficha,
            estado=documento.estado,
            alertas=_con_similares(alertas, similares),
            similares=similares,
        )
        _guardar_candidato(db, cv_id, vacante_id, documento, ficha, alertas, similares)
    return CargaCVsSalida(archivos=subidos)


_FICHA_VACIA = Ficha(
    experiencias=[], formacion=[], certificaciones=[], idiomas=[],
    habilidades_tecnicas=[], competencias_blandas=[],
)


def _vacante_o_404(db: Session, vacante_id: str) -> VacanteDB:
    vacante = db.get(VacanteDB, vacante_id)
    if vacante is None:
        raise HTTPException(status_code=404, detail="La vacante no existe.")
    return vacante


def _cvs_de_la_vacante(db: Session, vacante_id: str) -> list[CVExistente]:
    """Prepara el texto y contacto de los candidatos existentes para comprobar duplicados."""
    candidatos = db.query(CandidatoDB).filter(CandidatoDB.vacante_id == vacante_id).all()
    contactos = {
        c.candidato_id: Contacto(nombre=c.nombre, correo=c.correo, telefono=c.telefono)
        for c in db.query(ContactoCandidatoDB).filter(
            ContactoCandidatoDB.candidato_id.in_([c.id for c in candidatos])
        )
    }
    return [CVExistente(c.id, texto_comparable(c.lineas_anonimizadas), contactos.get(c.id)) for c in candidatos]


def _con_similares(alertas: list[str], similares: list) -> list[str]:
    """La alerta "posible_duplicado" se deriva al responder: desaparece sola si el otro CV se borra."""
    return [*alertas, "posible_duplicado"] if similares else alertas


def _guardar_candidato(
    db: Session, cv_id: str, vacante_id: str, documento, ficha: Ficha, alertas: list[str], similares: list[dict]
) -> None:
    """Guarda la ficha y las líneas anónimas; mantiene el contacto en su tabla aislada."""
    db.merge(CandidatoDB(
        id=cv_id,
        vacante_id=vacante_id,
        documento_id=cv_id,
        estado=documento.estado,
        ficha=ficha.model_dump(mode="json"),
        lineas_anonimizadas=[linea.model_dump(mode="json") for linea in documento.lineas_anonimizadas],
        alertas=alertas,
        similares=similares,
    ))
    db.flush()  # el contacto referencia al candidato
    contacto = documento.contacto
    if contacto.nombre or contacto.correo or contacto.telefono:
        db.merge(ContactoCandidatoDB(
            candidato_id=cv_id, nombre=contacto.nombre, correo=contacto.correo, telefono=contacto.telefono,
        ))
    db.commit()


@router.get("/vacantes/{vacante_id}/cvs", response_model=ListaCVsSalida)
def listar_cvs(vacante_id: str, db: Session = Depends(get_db)) -> ListaCVsSalida:
    """Lista metadatos de CV y calcula relaciones similares vigentes entre candidatos."""
    _vacante_o_404(db, vacante_id)
    candidatos = db.query(CandidatoDB).filter(CandidatoDB.vacante_id == vacante_id).order_by(
        CandidatoDB.fecha_creacion.desc().nulls_last(), CandidatoDB.id
    ).all()
    similares = relaciones(candidatos)
    return ListaCVsSalida(archivos=[
        CVResumen(
            id=candidato.id,
            estado=candidato.estado,
            alertas=_con_similares(candidato.alertas or [], similares[candidato.id]),
            similares=similares[candidato.id],
            fecha_creacion=candidato.fecha_creacion,
        )
        for candidato in candidatos
    ])


@router.delete("/candidatos/{candidato_id}", status_code=204)
def eliminar_candidato(candidato_id: str, db: Session = Depends(get_db)) -> None:
    """Borra el CV con su contacto, evaluaciones y entrevistas (llaves foráneas en cascada)."""
    candidato = db.get(CandidatoDB, candidato_id)
    if candidato is None:
        raise HTTPException(status_code=404, detail="El candidato no existe.")
    db.delete(candidato)
    db.commit()


@router.get("/candidatos/{candidato_id}", response_model=CVSubido)
def obtener_candidato(candidato_id: str, db: Session = Depends(get_db)) -> CVSubido:
    candidato = db.get(CandidatoDB, candidato_id)
    if candidato is None:
        raise HTTPException(status_code=404, detail="El candidato no existe.")
    de_la_vacante = db.query(CandidatoDB).filter(CandidatoDB.vacante_id == candidato.vacante_id).all()
    similares = relaciones(de_la_vacante).get(candidato.id, [])
    return CVSubido(
        id=candidato.id,
        vacante_id=candidato.vacante_id,
        lineas=candidato.lineas_anonimizadas,
        ficha=candidato.ficha,
        estado=candidato.estado,
        alertas=_con_similares(candidato.alertas or [], similares),
        similares=similares,
    )
