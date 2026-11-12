from pathlib import Path
import shutil
import subprocess

import pymupdf

from app.schemas import Linea


class LibreOfficeNoEncontrado(Exception):
    """LibreOffice no está instalado o no se configuró su ejecutable."""


class ConversionDocxError(Exception):
    """LibreOffice no pudo convertir el documento DOCX."""


def convertir_docx_a_pdf(
    ruta: str | Path,
    directorio_salida: str | Path,
    ejecutable: str | None = None,
) -> Path:
    """Convierte un DOCX a PDF usando LibreOffice en modo headless."""
    ruta = Path(ruta)
    directorio_salida = Path(directorio_salida)
    ejecutable = ejecutable or shutil.which("libreoffice") or shutil.which("soffice")
    if not ejecutable:
        candidatos = (
            Path(r"C:\Program Files\LibreOffice\program\soffice.exe"),
            Path(r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"),
        )
        ejecutable = next((str(candidato) for candidato in candidatos if candidato.exists()), None)
    if not ejecutable:
        raise LibreOfficeNoEncontrado

    directorio_salida.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            [
                ejecutable,
                "--headless",
                "--nologo",
                "--nodefault",
                "--nofirststartwizard",
                "--convert-to",
                "pdf",
                "--outdir",
                str(directorio_salida),
                str(ruta),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise ConversionDocxError(f"No se pudo convertir {ruta.name} a PDF.") from error

    pdf = directorio_salida / f"{ruta.stem}.pdf"
    if not pdf.is_file():
        raise ConversionDocxError(f"LibreOffice no generó el PDF para {ruta.name}.")
    return pdf


def extraer_lineas(ruta: str | Path) -> list[Linea]:
    """Lee un PDF y devuelve cada línea no vacía con su página y coordenadas.

    Los documentos DOCX deben convertirse a PDF antes de llamar esta función.
    Los errores de apertura o lectura se propagan para que el llamador informe
    el problema del archivo.
    """
    lineas: list[Linea] = []
    with pymupdf.open(str(ruta)) as documento:
        for numero_pagina, pagina in enumerate(documento, start=1):
            numero_linea = 0
            bloques = pagina.get_text("dict", sort=True)["blocks"]
            for bloque in bloques:
                if bloque.get("type") != 0:
                    continue
                for linea_pdf in bloque.get("lines", []):
                    texto = "".join(
                        span["text"] for span in linea_pdf.get("spans", [])
                    ).strip()
                    if not texto:
                        continue

                    numero_linea += 1
                    bbox = tuple(float(coordenada) for coordenada in linea_pdf["bbox"])
                    lineas.append(
                        Linea(
                            id=f"p{numero_pagina}-l{numero_linea}",
                            texto=texto,
                            bbox=bbox,
                        )
                    )

    return lineas
