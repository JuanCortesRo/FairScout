"""Detección local de instrucciones no confiables y texto visualmente anómalo."""
from dataclasses import dataclass
import re

import pymupdf


_PATTERNS = (
    (re.compile(r"(?i)\bignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?\b"), "high"),
    (re.compile(r"(?i)\b(?:ignora|ignore)\s+(?:todas\s+las\s+)?instrucciones\b"), "high"),
    (re.compile(r"(?i)\b(?:reveal|reveal\s+your|revela)\s+(?:the\s+)?(?:system|hidden)\s+(?:prompt|instructions?)\b"), "high"),
    (re.compile(r"(?i)\b(?:rank|score|puntúa|califica|recomienda)\b.{0,80}\b(?:first|100|primero|máximo|siempre)\b"), "high"),
    (re.compile(r"(?i)\b(?:do not|don't|no)\s+evaluate\s+(?:other|the\s+other)\s+candidates?\b"), "medium"),
)


@dataclass(frozen=True)
class AlertaSeguridad:
    tipo: str
    severidad: str
    pagina: int
    linea_id: str | None
    descripcion: str
    accion: str


def detect_prompt_injection(text: str, pagina: int = 0, linea_id: str | None = None) -> list[AlertaSeguridad]:
    """Busca patrones conocidos de instrucciones manipuladoras y los marca como contenido no confiable."""
    alertas: list[AlertaSeguridad] = []
    for patron, severidad in _PATTERNS:
        if patron.search(text):
            alertas.append(AlertaSeguridad(
                tipo="prompt_injection",
                severidad=severidad,
                pagina=pagina,
                linea_id=linea_id,
                descripcion="Se detectó texto que intenta modificar instrucciones o resultados.",
                accion="marcar_como_contenido_no_confiable",
            ))
            break
    return alertas


def analizar_spans(pagina: pymupdf.Page, numero_pagina: int) -> list[AlertaSeguridad]:
    """Marca spans muy pequeños o fuera de la página sin tratarlo como prueba concluyente."""
    alertas: list[AlertaSeguridad] = []
    altura_pagina = pagina.rect.height
    for bloque in pagina.get_text("dict").get("blocks", []):
        if bloque.get("type") != 0:
            continue
        for linea in bloque.get("lines", []):
            for span in linea.get("spans", []):
                texto = span.get("text", "").strip()
                bbox = span.get("bbox", (0, 0, 0, 0))
                fuera = bbox[2] < 0 or bbox[0] > pagina.rect.width or bbox[3] < 0 or bbox[1] > altura_pagina
                pequeno = span.get("size", 0) < 4 and len(texto) > 3
                if fuera or pequeno:
                    alertas.append(AlertaSeguridad(
                        tipo="hidden_text",
                        severidad="low",
                        pagina=numero_pagina,
                        linea_id=None,
                        descripcion="Se detectó texto con propiedades visuales inusuales; requiere revisión.",
                        accion="marcar_como_contenido_no_confiable",
                    ))
                    break
            if alertas and alertas[-1].pagina == numero_pagina:
                break
    return alertas


def analizar_texto_y_pdf(textos: list[tuple[int, str, str | None]], pdf_path: str) -> list[AlertaSeguridad]:
    """Combina alertas del texto extraído con anomalías visuales halladas en cada página del PDF."""
    alertas: list[AlertaSeguridad] = []
    for pagina, texto, linea_id in textos:
        alertas.extend(detect_prompt_injection(texto, pagina, linea_id))
    with pymupdf.open(pdf_path) as documento:
        for numero, pagina in enumerate(documento, start=1):
            alertas.extend(analizar_spans(pagina, numero))
    return alertas
