"""POST /api/cvs: recibe hojas de vida, las guarda y extrae sus líneas.

Los PDF se procesan inmediatamente con PyMuPDF para conservar el texto y las
coordenadas de cada línea. Los DOCX se convierten primero con LibreOffice.
"""
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config import settings
from app.pipeline.document_processor import DocumentoNoProcesable, process_document
from app.schemas import CargaCVsSalida, CVSubido

router = APIRouter(tags=["cvs"])

EXTENSIONES_PERMITIDAS = {".pdf", ".docx"}


@router.post("/cvs", response_model=CargaCVsSalida)
async def subir_cvs(archivos: list[UploadFile] = File(...)) -> CargaCVsSalida:
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

        subidos.append(CVSubido(
            id=cv_id,
            nombre_archivo=archivo.filename,
            lineas=documento.lineas_anonimizadas,
            estado=documento.estado,
            alertas=[alerta.tipo for alerta in documento.alertas],
        ))
    return CargaCVsSalida(archivos=subidos)
