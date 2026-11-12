"""POST /api/cvs: recibe hojas de vida, las guarda y extrae sus líneas.

Los PDF se procesan inmediatamente con PyMuPDF para conservar el texto y las
coordenadas de cada línea. Los DOCX se convierten primero con LibreOffice.
"""
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
from app.models import CandidatoDB
from app.schemas import CargaCVsSalida, CVSubido

router = APIRouter(tags=["cvs"])

EXTENSIONES_PERMITIDAS = {".pdf", ".docx"}


def _tipos_de_alerta(documento) -> list[str]:
    """Tipos de alerta sin repetir; agrega "ocr" si alguna línea salió de OCR (baja la confianza del puntaje)."""
    tipos = [alerta.tipo for alerta in documento.alertas]
    if any(linea.origen == "ocr" for linea in documento.lineas_originales):
        tipos.append("ocr")
    return list(dict.fromkeys(tipos))


@router.post("/cvs", response_model=CargaCVsSalida)
async def subir_cvs(
    archivos: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
) -> CargaCVsSalida:
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
            ruta.unlink(missing_ok=True)
            subidos.append(CVSubido(
                id=cv_id,
                nombre_archivo=archivo.filename,
                estado="failed",
                alertas=[str(error)],
            ))
            continue

        alertas = _tipos_de_alerta(documento)
        subidos.append(CVSubido(
            id=cv_id,
            nombre_archivo=archivo.filename,
            lineas=documento.lineas_anonimizadas,
            estado=documento.estado,
            alertas=alertas,
        ))
        if documento.estado == "needs_review":
            continue
        try:
            ficha = limpiar_ficha(await extraer_ficha(documento.lineas_anonimizadas))
        except (APIError, LLMNoConfigurado, RespuestaLLMInvalida) as error:
            subidos[-1] = CVSubido(
                id=cv_id,
                nombre_archivo=archivo.filename,
                lineas=documento.lineas_anonimizadas,
                estado="failed",
                alertas=[f"extraccion_llm: {error}"],
            )
            continue
        subidos[-1] = CVSubido(
            id=cv_id,
            nombre_archivo=archivo.filename,
            lineas=documento.lineas_anonimizadas,
            ficha=ficha,
            estado=documento.estado,
            alertas=alertas,
        )
        db.merge(CandidatoDB(
            id=cv_id,
            documento_id=cv_id,
            nombre_archivo=archivo.filename,
            estado=documento.estado,
            ficha=ficha.model_dump(mode="json"),
            lineas_anonimizadas=[linea.model_dump(mode="json") for linea in documento.lineas_anonimizadas],
            lineas_originales=[linea.model_dump(mode="json") for linea in documento.lineas_originales],
            alertas=alertas,
        ))
        db.commit()
    return CargaCVsSalida(archivos=subidos)


@router.get("/cvs", response_model=CargaCVsSalida)
def listar_cvs(db: Session = Depends(get_db)) -> CargaCVsSalida:
    candidatos = db.query(CandidatoDB).order_by(CandidatoDB.id).all()
    return CargaCVsSalida(archivos=[
        CVSubido(
            id=candidato.id,
            nombre_archivo=candidato.nombre_archivo,
            lineas=candidato.lineas_anonimizadas,
            ficha=candidato.ficha,
            estado=candidato.estado,
            alertas=candidato.alertas or [],
        )
        for candidato in candidatos
    ])


@router.get("/candidatos/{candidato_id}", response_model=CVSubido)
def obtener_candidato(candidato_id: str, db: Session = Depends(get_db)) -> CVSubido:
    candidato = db.get(CandidatoDB, candidato_id)
    if candidato is None:
        raise HTTPException(status_code=404, detail="El candidato no existe.")
    return CVSubido(
        id=candidato.id,
        nombre_archivo=candidato.nombre_archivo,
        lineas=candidato.lineas_anonimizadas,
        ficha=candidato.ficha,
        estado=candidato.estado,
        alertas=candidato.alertas or [],
    )
