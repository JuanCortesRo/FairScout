"""POST /api/vacantes/{id}/cvs: recibe hojas de vida para una vacante, las guarda y extrae sus líneas.

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
from app.models import CandidatoDB, VacanteDB
from app.schemas import CargaCVsSalida, CVResumen, CVSubido, Ficha, ListaCVsSalida

router = APIRouter(tags=["cvs"])

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
        if not documento.puede_enviarse_al_llm:
            # Alerta crítica: no va al LLM, pero se guarda para que aparezca "en revisión" en el ranking.
            _guardar_candidato(db, cv_id, vacante_id, archivo.filename, documento, _FICHA_VACIA, alertas)
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
        if ficha.inconsistencia_fechas:
            alertas = list(dict.fromkeys([*alertas, "inconsistencia_fechas"]))
        subidos[-1] = CVSubido(
            id=cv_id,
            nombre_archivo=archivo.filename,
            lineas=documento.lineas_anonimizadas,
            ficha=ficha,
            estado=documento.estado,
            alertas=alertas,
        )
        _guardar_candidato(db, cv_id, vacante_id, archivo.filename, documento, ficha, alertas)
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


def _guardar_candidato(
    db: Session, cv_id: str, vacante_id: str, nombre_archivo: str, documento, ficha: Ficha, alertas: list[str]
) -> None:
    db.merge(CandidatoDB(
        id=cv_id,
        vacante_id=vacante_id,
        documento_id=cv_id,
        nombre_archivo=nombre_archivo,
        estado=documento.estado,
        ficha=ficha.model_dump(mode="json"),
        lineas_anonimizadas=[linea.model_dump(mode="json") for linea in documento.lineas_anonimizadas],
        lineas_originales=[linea.model_dump(mode="json") for linea in documento.lineas_originales],
        alertas=alertas,
    ))
    db.commit()


@router.get("/vacantes/{vacante_id}/cvs", response_model=ListaCVsSalida)
def listar_cvs(vacante_id: str, db: Session = Depends(get_db)) -> ListaCVsSalida:
    _vacante_o_404(db, vacante_id)
    candidatos = db.query(CandidatoDB).filter(CandidatoDB.vacante_id == vacante_id).order_by(
        CandidatoDB.fecha_creacion.desc().nulls_last(), CandidatoDB.id
    ).all()
    return ListaCVsSalida(archivos=[
        CVResumen(
            id=candidato.id,
            nombre_archivo=candidato.nombre_archivo,
            estado=candidato.estado,
            alertas=candidato.alertas or [],
            fecha_creacion=candidato.fecha_creacion,
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
        vacante_id=candidato.vacante_id,
        nombre_archivo=candidato.nombre_archivo,
        lineas=candidato.lineas_anonimizadas,
        ficha=candidato.ficha,
        estado=candidato.estado,
        alertas=candidato.alertas or [],
    )
