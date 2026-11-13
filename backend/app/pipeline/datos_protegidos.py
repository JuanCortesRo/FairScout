"""Bloqueo de requisitos basados en datos protegidos (secciones 6.1 y 12). Solo código, nunca el LLM.

El reto exige no usar edad, género, foto, estado civil, dirección ni nacionalidad como criterio. Un requisito
como "menor de 35 años" o "de nacionalidad colombiana" se marca y no se usa, aunque lo proponga el LLM o lo
escriba el reclutador. Las reglas priorizan no bloquear requisitos legítimos ("mayor de 10 años de experiencia",
"Dirección de proyectos", "Español nativo").
"""
import re
import unicodedata

from app.schemas import Requisito

# "N años" que NO hablan de edad: experiencia, trayectoria, "en el sector", "con Python", etc.
_NO_ES_EDAD = r"(?!\s+(?:de\s+)?(?:experiencia|trayectoria|antigüedad|antiguedad|en|con|trabajando|como|liderando|desarrollando|of\s+experience|experience|in|with))"

# Raíces de gentilicios, ya sin tildes ni ñ (el texto se normaliza antes de comparar).
_GENTILICIOS = (
    "colombian|venezolan|peruan|ecuatorian|mexican|argentin|chilen|bolivian|uruguay|paraguay|cuban|"
    "dominican|panamen|costarricens|honduren|guatemaltec|salvadoren|nicaraguens|brasilen|estadounidens"
)
# Un gentilicio solo es nacionalidad si describe a la persona ("ser colombiano"), no al mercado o la norma
# ("normativa tributaria colombiana").
_PERSONA_DE_NACIONALIDAD = (
    r"\b(?:ser|candidat[oa]s?|personas?|profesional(?:es)?|ciudadan[oa]s?|de\s+origen)\s+"
    r"(?:" + _GENTILICIOS + r")(?:o|a|os|as|e|es)?\b"
)

# (categoría, patrón). Se aplica al texto en minúsculas y sin tildes, salvo donde la tilde importa (ñ).
_REGLAS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("edad", re.compile(
        r"\bedad\b|\bjoven(?:es)?\b|\byears?\s+old\b|\bage[ds]?\b|"
        r"\b(?:menor|mayor|maximo|minimo|hasta|under|over)(?:es)?\s+(?:de\s+)?\d{2}\s+(?:anos|years)\b" + _NO_ES_EDAD + "|"
        r"\bentre\s+\d{2}\s+y\s+\d{2}\s+anos\b" + _NO_ES_EDAD + "|"
        r"\bnacid[oa]s?\s+(?:en|entre|despues|antes)\s+(?:de\s+)?(?:19|20)\d{2}\b"
    )),
    ("genero", re.compile(
        r"\b(?:sexo|genero|gender|hombres?|mujer(?:es)?|varon(?:es)?|masculino|femenino|male|female|"
        r"caballeros?|damas?|senoritas?)\b"
    )),
    ("nacionalidad", re.compile(
        r"\bnacionalidad\b|\bnationality\b|\bnativ[oa]s?\s+de\b|\bnacid[oa]s?\s+en\b|\bciudadania\b|"
        + _PERSONA_DE_NACIONALIDAD
    )),
    ("estado_civil", re.compile(
        r"\bestado\s+civil\b|\bmarital\b|\bsolter[oa]s?\b|\bcasad[oa]s?\b|\bdivorciad[oa]s?\b|\bviud[oa]s?\b|"
        r"\bunion\s+libre\b|\b(?:con|sin)\s+hij[oa]s\b|\bmarried\b"
    )),
    ("apariencia_o_foto", re.compile(
        r"\b(?:hoja\s+de\s+vida|cv|curriculum|resume)\s+con\s+foto(?:grafia)?\b|\bfoto(?:grafia)?\s+reciente\b|"
        r"\badjunt\w*\s+(?:una\s+)?foto|\bwith\s+(?:a\s+)?photo\b|\bbuena\s+presencia\b|\bapariencia\s+fisica\b|"
        r"\bestatura\b|\batractiv[oa]s?\b|\bcontextura\b"
    )),
    ("direccion_o_residencia", re.compile(
        r"\bdireccion\s+de\s+(?:residencia|domicilio|vivienda)\b|\bdomicilio\b|\bbarrio\b|\bestrato\b|"
        r"\b(?:resid(?:a|ir|ente|entes|encia)|viva|vivan|vivir)\s+en\b"
    )),
    ("religion", re.compile(r"\breligi(?:on|osa|oso)\b|\bcatolic[oa]s?\b|\bcristian[oa]s?\b|\bevangelic[oa]s?\b")),
    ("origen_etnico", re.compile(r"\braza\b|\betnia\b|\betnic[oa]\b|\bcolor\s+de\s+piel\b")),
    ("embarazo", re.compile(r"\bembaraz(?:o|ada|adas)\b|\bpregnan(?:t|cy)\b")),
    ("orientacion_sexual", re.compile(r"\borientacion\s+sexual\b|\bheterosexual\b|\bhomosexual\b")),
)

ETIQUETAS = {
    "edad": "edad",
    "genero": "género",
    "nacionalidad": "nacionalidad",
    "estado_civil": "estado civil o hijos",
    "apariencia_o_foto": "foto o apariencia física",
    "direccion_o_residencia": "dirección o lugar de residencia",
    "religion": "religión",
    "origen_etnico": "origen étnico",
    "embarazo": "embarazo",
    "orientacion_sexual": "orientación sexual",
}


def _normalizar(texto: str) -> str:
    """Minúsculas y sin tildes; la ñ se convierte en n para que "años" y "anos" coincidan."""
    sin_tildes = unicodedata.normalize("NFKD", texto.casefold())
    return "".join(c for c in sin_tildes if not unicodedata.combining(c))


def detectar_dato_protegido(texto: str) -> str | None:
    """Devuelve la categoría protegida que usa el texto (p. ej. "edad") o None si no usa ninguna."""
    normalizado = _normalizar(texto)
    for categoria, patron in _REGLAS:
        if patron.search(normalizado):
            return categoria
    return None


def motivo_bloqueo(requisito: Requisito) -> str | None:
    """Mensaje para el reclutador si el requisito usa un dato protegido; None si es válido."""
    categoria = detectar_dato_protegido(requisito.nombre)
    if categoria is None:
        return None
    return (
        f"El requisito {requisito.id} «{requisito.nombre}» usa un dato protegido ({ETIQUETAS[categoria]}). "
        "No puede usarse como criterio de selección: elimínalo o reformúlalo."
    )


def separar_requisitos(requisitos: list[Requisito]) -> tuple[list[Requisito], list[tuple[Requisito, str]]]:
    """Separa los requisitos válidos de los bloqueados (con su motivo)."""
    validos: list[Requisito] = []
    bloqueados: list[tuple[Requisito, str]] = []
    for requisito in requisitos:
        motivo = motivo_bloqueo(requisito)
        if motivo:
            bloqueados.append((requisito, motivo))
        else:
            validos.append(requisito)
    return validos, bloqueados
