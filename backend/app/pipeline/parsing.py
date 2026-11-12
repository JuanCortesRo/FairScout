from pathlib import Path

import pymupdf

from app.schemas import Linea


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
