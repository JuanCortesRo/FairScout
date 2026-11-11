from pathlib import Path

from app.schemas import Linea


def extraer_lineas(ruta: str | Path) -> list[Linea]:
    """Paso 1. Lee el CV con PyMuPDF y devuelve sus líneas con id ("p1-l3"), texto y bbox.

    - DOCX: convertir antes a PDF con `soffice --headless --convert-to pdf` y usar el mismo flujo.
    - Página casi sin texto → escaneada → OCR (opcional).
    - Detectar texto invisible (blanco o tamaño mínimo) para la defensa contra prompt injection.

    TODO: implementar.
    """
    raise NotImplementedError
