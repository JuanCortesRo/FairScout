"""POST /api/cvs: recibe hojas de vida y las guarda en disco.

Por ahora solo valida la extensión (.pdf/.docx), guarda el archivo en UPLOADS_DIR
y devuelve un id por archivo. El procesamiento (pipeline) se hará después.
"""
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config import settings
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
        (destino / f"{cv_id}{extension}").write_bytes(await archivo.read())
        subidos.append(CVSubido(id=cv_id, nombre_archivo=archivo.filename))
    return CargaCVsSalida(archivos=subidos)
