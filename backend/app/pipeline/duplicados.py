"""CVs repetidos dentro de una vacante. Se compara el contenido, no el archivo: un PDF reexportado o pasado de
DOCX a PDF cambia de bytes pero no de texto.

- Mismo texto (anonimizado y normalizado): es el mismo CV y no se vuelve a procesar.
- Texto muy parecido (≥ UMBRAL_SIMILITUD %): probablemente otra versión del mismo CV (una línea o una skill más).
- Mismo correo o teléfono: el mismo candidato, aunque el CV sea distinto.
Los dos últimos solo se marcan: una versión nueva puede ser justo la que el reclutador quiere conservar.

Medido con 47 CVs reales distintos: el par más parecido llega a 46 %; una versión con una skill más, a 99,6 %.
"""
import re
from dataclasses import dataclass, field

from rapidfuzz import fuzz

from app.pipeline.anonymize import Contacto

UMBRAL_SIMILITUD = 90


@dataclass(frozen=True)
class CVExistente:
    candidato_id: str
    texto: str
    contacto: Contacto | None


@dataclass
class Coincidencias:
    duplicado_de: str | None = None
    similares: list[dict] = field(default_factory=list)   # {candidato_id, motivo: "texto"|"contacto", similitud}


def texto_comparable(lineas) -> str:
    """Texto del CV en minúsculas y sin espacios repetidos; acepta Linea o dicts guardados en la base."""
    textos = (linea["texto"] if isinstance(linea, dict) else linea.texto for linea in lineas)
    return " ".join(" ".join(texto.casefold().split()) for texto in textos if texto.strip())


def _telefono(valor: str | None) -> str | None:
    digitos = re.sub(r"\D", "", valor or "")
    return digitos[-10:] if len(digitos) >= 7 else None   # sin el indicativo del país


def _mismo_contacto(a: Contacto | None, b: Contacto | None) -> bool:
    if not a or not b:
        return False
    if a.correo and b.correo and a.correo.casefold() == b.correo.casefold():
        return True
    return bool(_telefono(a.telefono) and _telefono(a.telefono) == _telefono(b.telefono))


def buscar_coincidencias(texto: str, contacto: Contacto, existentes: list[CVExistente]) -> Coincidencias:
    resultado = Coincidencias()
    for cv in existentes:
        if texto == cv.texto:
            resultado.duplicado_de = cv.candidato_id
            return resultado
        similitud = round(fuzz.ratio(texto, cv.texto))
        if similitud >= UMBRAL_SIMILITUD:
            resultado.similares.append({"candidato_id": cv.candidato_id, "motivo": "texto", "similitud": similitud})
        elif _mismo_contacto(contacto, cv.contacto):
            resultado.similares.append({"candidato_id": cv.candidato_id, "motivo": "contacto", "similitud": None})
    return resultado


def relaciones(candidatos) -> dict[str, list[dict]]:
    """Similares de cada candidato en ambos sentidos, solo entre los que siguen existiendo (si uno se borra,
    el aviso desaparece). `candidatos` son filas con `id` y `similares` de la misma vacante."""
    ids = {c.id for c in candidatos}
    salida: dict[str, list[dict]] = {c.id: [] for c in candidatos}
    for c in candidatos:
        for s in c.similares or []:
            otro = s["candidato_id"]
            if otro not in ids:
                continue
            salida[c.id].append(s)
            salida[otro].append({**s, "candidato_id": c.id})
    return salida
