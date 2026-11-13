"""Orquestador seguro para PDF/DOCX antes de la extracción mediante LLM."""
from dataclasses import dataclass
import logging
import hashlib
from pathlib import Path
from tempfile import TemporaryDirectory

import pymupdf

from app.config import settings
from app.mensajes import ARCHIVO_ILEGIBLE, PDF_ILEGIBLE
from app.pipeline.anonymize import Contacto, anonimizar_con_metadatos
from app.pipeline.parsing import (
    ConversionDocxError,
    LibreOfficeNoEncontrado,
    convertir_docx_a_pdf,
)
from app.pipeline.suspicious_content import AlertaSeguridad, analizar_texto_y_pdf
from app.schemas import Linea


class DocumentoNoProcesable(Exception):
    """El documento no puede continuar hacia el LLM."""


log = logging.getLogger(__name__)

@dataclass(frozen=True)
class PaginaDocumento:
    pagina: int
    tipo: str
    requiere_ocr: bool
    ocr_aplicado: bool
    confianza_ocr: float | None


@dataclass(frozen=True)
class DocumentoProcesado:
    documento_id: str
    archivo_original: str
    formato_original: str
    hash_sha256: str
    estado: str
    es_legible: bool
    paginas: list[PaginaDocumento]
    lineas_originales: list[Linea]
    lineas_anonimizadas: list[Linea]
    alertas: list[AlertaSeguridad]
    categorias_anonimizadas: tuple[str, ...]
    puede_enviarse_al_llm: bool
    contacto: Contacto = Contacto()


def _extraer_ocr(pagina: pymupdf.Page, numero: int) -> tuple[list[Linea], float]:
    """Reconoce texto de una página escaneada y devuelve líneas con coordenadas y confianza media."""
    try:
        import pytesseract
        from PIL import Image
    except ImportError as error:
        log.error("El OCR no está disponible: %r", error)
        raise DocumentoNoProcesable("No pudimos leer este documento escaneado. Prueba con una versión con texto.") from error

    pixmap = pagina.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
    imagen = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    datos = pytesseract.image_to_data(imagen, lang="spa+eng", output_type=pytesseract.Output.DICT)
    por_linea: dict[tuple[int, int, int], list[tuple[str, tuple[float, float, float, float], int]]] = {}
    for i, texto in enumerate(datos["text"]):
        texto = texto.strip()
        if not texto:
            continue
        clave = (datos["block_num"][i], datos["par_num"][i], datos["line_num"][i])
        escala_x = pagina.rect.width / pixmap.width
        escala_y = pagina.rect.height / pixmap.height
        bbox = (
            datos["left"][i] * escala_x,
            datos["top"][i] * escala_y,
            (datos["left"][i] + datos["width"][i]) * escala_x,
            (datos["top"][i] + datos["height"][i]) * escala_y,
        )
        por_linea.setdefault(clave, []).append((texto, bbox, int(datos["conf"][i])))
    lineas: list[Linea] = []
    confianzas: list[int] = []
    for indice, palabras in enumerate(por_linea.values(), start=1):
        lineas.append(Linea(
            id=f"p{numero}-l{indice}",
            texto=" ".join(palabra[0] for palabra in palabras),
            bbox=(
                min(palabra[1][0] for palabra in palabras),
                min(palabra[1][1] for palabra in palabras),
                max(palabra[1][2] for palabra in palabras),
                max(palabra[1][3] for palabra in palabras),
            ),
            origen="ocr",
        ))
        confianzas.extend(palabra[2] for palabra in palabras if palabra[2] >= 0)
    return lineas, sum(confianzas) / len(confianzas) if confianzas else 0.0


def _lineas_digital(pagina: pymupdf.Page, numero: int) -> list[Linea]:
    resultado: list[Linea] = []
    contador = 0
    for bloque in pagina.get_text("dict", sort=True)["blocks"]:
        if bloque.get("type") != 0:
            continue
        for linea_pdf in bloque.get("lines", []):
            texto = "".join(span["text"] for span in linea_pdf.get("spans", [])).strip()
            if texto:
                contador += 1
                resultado.append(Linea(
                    id=f"p{numero}-l{contador}",
                    texto=texto,
                    bbox=tuple(float(valor) for valor in linea_pdf["bbox"]),
                ))
    return resultado


def process_document(file_path: str | Path, documento_id: str | None = None) -> DocumentoProcesado:
    """Procesa un PDF/DOCX: extrae texto, detecta alertas y anonimiza.

    Devuelve metadatos y texto anonimizado; las alertas críticas bloquean el envío al LLM.
    """
    ruta = Path(file_path)
    if not ruta.is_file() or ruta.stat().st_size == 0:
        raise DocumentoNoProcesable("El documento no existe o está vacío.")
    extension = ruta.suffix.lower()
    if extension not in {".pdf", ".docx"}:
        raise DocumentoNoProcesable("Formato no permitido.")
    documento_id = documento_id or hashlib.sha256(ruta.read_bytes()).hexdigest()[:32]
    sha256 = hashlib.sha256(ruta.read_bytes()).hexdigest()

    with TemporaryDirectory(prefix=f"{documento_id}-") as temporal:
        pdf = ruta
        if extension == ".docx":
            try:
                pdf = convertir_docx_a_pdf(ruta, temporal, settings.LIBREOFFICE_PATH or None)
            except (LibreOfficeNoEncontrado, ConversionDocxError) as error:
                log.error("No se pudo convertir el DOCX %s: %r", ruta.name, error)
                raise DocumentoNoProcesable(ARCHIVO_ILEGIBLE) from error

        try:
            documento = pymupdf.open(str(pdf))
        except (OSError, pymupdf.FileDataError) as error:
            raise DocumentoNoProcesable(PDF_ILEGIBLE) from error

        lineas: list[Linea] = []
        paginas: list[PaginaDocumento] = []
        tiene_imagen = False
        try:
            for numero, pagina in enumerate(documento, start=1):
                tiene_imagen = tiene_imagen or bool(pagina.get_images(full=True))
                digitales = _lineas_digital(pagina, numero)
                caracteres = sum(len(linea.texto) for linea in digitales)
                if caracteres >= 20:
                    lineas.extend(digitales)
                    paginas.append(PaginaDocumento(numero, "digital", False, False, None))
                    continue
                ocr, confianza = _extraer_ocr(pagina, numero)
                lineas.extend(ocr)
                paginas.append(PaginaDocumento(numero, "scanned" if ocr else "empty", True, True, confianza))
        finally:
            documento.close()

        if not lineas:
            raise DocumentoNoProcesable("documento_sin_texto_legible")
        alertas = analizar_texto_y_pdf(
            [(int(linea.id.split("-")[0][1:]), linea.texto, linea.id) for linea in lineas],
            str(pdf),
        )
        anonimizado = anonimizar_con_metadatos(lineas)
        if tiene_imagen:
            alertas.append(AlertaSeguridad(
                tipo="fotografia_o_imagen",
                severidad="low",
                pagina=0,
                linea_id=None,
                descripcion="El documento contiene una imagen que no se envía al LLM.",
                accion="registrar_sin_usar_para_evaluacion",
            ))
        if "posible_fuga_personal" in anonimizado.alertas:
            alertas.append(AlertaSeguridad(
                tipo="posible_fuga_personal",
                severidad="high",
                pagina=0,
                linea_id=None,
                descripcion="La verificación posterior detectó un posible dato personal sin anonimizar.",
                accion="bloquear_envio_al_llm",
            ))
        criticas = [alerta for alerta in alertas if alerta.severidad == "high"]
        return DocumentoProcesado(
            documento_id=documento_id,
            archivo_original=ruta.name,
            formato_original=extension[1:],
            hash_sha256=sha256,
            estado="needs_review" if criticas else "processed",
            es_legible=True,
            paginas=paginas,
            lineas_originales=lineas,
            lineas_anonimizadas=anonimizado.lineas_anonimizadas,
            alertas=alertas,
            categorias_anonimizadas=anonimizado.categorias,
            puede_enviarse_al_llm=not criticas,
            contacto=anonimizado.contacto,
        )
