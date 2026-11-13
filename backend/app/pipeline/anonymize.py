"""Anonimización determinista de líneas de CV antes de usar un LLM."""
from dataclasses import dataclass
import re
import unicodedata
from copy import deepcopy

from app.schemas import Linea


_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
_PHONE = re.compile(
    r"(?<!\w)(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)"
    r"\d{3,4}[\s.-]?\d{3,4}(?!\w)"
)
_DOCUMENT = re.compile(
    r"(?i)\b(?:cc|c\.c\.|cédula|cedula|dni|documento|id)\s*[:#-]?\s*"
    r"(?=[A-Z0-9 .-]{4,24}\d)\S(?:[A-Z0-9 .-]{3,24}\S)?"
)
_DATE_OF_BIRTH = re.compile(
    r"(?i)\b(?:fecha\s+de\s+nacimiento|nacimiento|date\s+of\s+birth|dob)\s*[:#-]?\s*"
    r"(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:19|20)\d{2}[/-]\d{1,2}[/-]\d{1,2})"
)
# Solo números que son una edad. "N años" a secas NO se toca: casi siempre es experiencia ("5 años en Python",
# "10 years of experience", "amortized over 10 years") y borrarlo deja al evaluador sin evidencia.
_AGE = re.compile(
    r"(?i)\b(?:edad|age)\s*[:#-]?\s*\d{1,3}(?=\s*(?:años|anos|years?)?\b)|"
    r"\b\d{1,3}(?=\s*(?:años|anos|years?)\s+(?:de\s+edad|old|of\s+age)\b)|"
    r"(?<=tengo )\d{1,3}(?=\s*(?:años|anos)\b)|"
    r"(?<=, )(?:1[6-9]|[2-7]\d)(?=\s*(?:años|anos)\s*$)"   # encabezado tipo "Colombiana, 28 años"
)
_ADDRESS = re.compile(
    r"(?i)\b(?:dirección|direccion|address|domicilio)\s*[:#-]?\s*[^\n|;]{5,100}"
)
_NATIONALITY = re.compile(
    r"(?i)\b(?:nacionalidad|nationality)\s*[:#-]?\s*[A-Za-zÁÉÍÓÚáéíóúÑñ-]+"
)
_GENDER = re.compile(
    r"(?i)\b(?:(?:identidad\s+de\s+)?género|(?:identidad\s+de\s+)?genero|"
    r"gender|sexo|sex)\s*[:#-]?\s*"
    r"(?:mujer\s+trans|hombre\s+trans|mujer|hombre|masculin[oa]|femenin[oa]|"
    r"trans(?:género|genero)?|travesti|no\s*binari[oa]|non[- ]binary|"
    r"intersex(?:ual)?|queer)(?:\s*\([^)]*\))?"
)
_MARITAL = re.compile(
    r"(?i)\b(?:estado\s+civil|marital\s+status)\s*[:#-]?\s*[A-Za-zÁÉÍÓÚáéíóúÑñ-]+"
)
_PRONOUNS = re.compile(r"(?i)\b(?:he/him|she/her|they/them|él/ella|él|ella|elle)\b")
_INJECTION = re.compile(
    r"(?i)\b(?:ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?|"
    r"ignore\s+all\s+rules|system\s+prompt|reveal\s+your\s+instructions)\b"
)
_NAME_CONTEXT = re.compile(
    r"(?i)\b(?:mi nombre es|my name is|soy|i am|candidato|candidate|"
    r"nombre completo|nombres y apellidos|full name|applicant)\s*[:#-]?\s*(.+)$"
)
_NAME_LABEL = re.compile(
    r"(?i)^(?:nombre(?:\s+completo)?|nombres\s+y\s+apellidos|name|full\s+name|"
    r"candidate(?:\s+name)?|applicant)\s*[:#-]\s*(.+)$"
)
_PERSONAL_LABEL = re.compile(
    r"(?i)\b(?:información personal|informacion personal|datos personales|"
    r"contact information|personal information)\b"
)
_PROFESSIONAL_WORDS = {
    "engineer", "developer", "designer", "manager", "director", "analyst",
    "software", "full", "stack", "backend", "frontend", "universidad",
    "university", "corporation", "company", "technologies", "technology",
    "experience", "summary", "skills", "education", "certifications",
    "experiencia", "resumen", "habilidades", "educacion", "formacion",
    "profesional", "laboral",
}
_NAME_TOKEN = re.compile(r"^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[-'][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)?$")
_POSSIBLE_PERSONAL = (
    _EMAIL,
    _PHONE,
    _DOCUMENT,
    _DATE_OF_BIRTH,
)


@dataclass(frozen=True)
class ResultadoAnonimizacion:
    """Resultado seguro: las líneas originales no forman parte del resultado."""

    lineas_anonimizadas: list[Linea]
    categorias: tuple[str, ...]
    alertas: tuple[str, ...]


def _reemplazar(texto: str, patron: re.Pattern[str], etiqueta: str, encontrados: set[str]) -> str:
    def reemplazo(match: re.Match[str]) -> str:
        encontrados.add(etiqueta)
        return etiqueta

    return patron.sub(reemplazo, texto)


def _sin_acentos(texto: str) -> str:
    return "".join(
        caracter for caracter in unicodedata.normalize("NFKD", texto)
        if not unicodedata.combining(caracter)
    )


def _parece_nombre(texto: str, posicion: int, contexto_personal: bool) -> bool:
    limpio = " ".join(texto.strip().split())
    palabras = limpio.replace("·", " ").split()
    if not 2 <= len(palabras) <= 5 or any(not _NAME_TOKEN.fullmatch(palabra) for palabra in palabras):
        return False
    normalizado = _sin_acentos(limpio).casefold()
    if any(palabra in _PROFESSIONAL_WORDS for palabra in normalizado.split()):
        return False
    # A name-like line is only anonymized without a label near the CV header
    # or inside an explicitly personal-information block.
    return contexto_personal or posicion < 3


def _anonimizar_texto(
    texto: str,
    encontrados: set[str],
    alertas: list[str],
    posicion: int,
    contexto_personal: bool,
) -> str:
    if not texto:
        return texto

    if _INJECTION.search(texto):
        alertas.append("posible_prompt_injection")

    texto = _reemplazar(texto, _DOCUMENT, "[DOCUMENTO]", encontrados)
    texto = _reemplazar(texto, _DATE_OF_BIRTH, "[FECHA_NACIMIENTO]", encontrados)
    texto = _reemplazar(texto, _AGE, "[EDAD]", encontrados)
    texto = _reemplazar(texto, _ADDRESS, "[DIRECCION]", encontrados)
    texto = _reemplazar(texto, _NATIONALITY, "[NACIONALIDAD]", encontrados)
    texto = _reemplazar(texto, _GENDER, "[GENERO]", encontrados)
    texto = _reemplazar(texto, _MARITAL, "[ESTADO_CIVIL]", encontrados)
    texto = _reemplazar(texto, _PRONOUNS, "[PRONOMBRES]", encontrados)
    texto = _reemplazar(texto, _EMAIL, "[CORREO]", encontrados)
    texto = _reemplazar(texto, _PHONE, "[TELEFONO]", encontrados)

    nombre = _NAME_LABEL.match(texto.strip())
    contexto_nombre = _NAME_CONTEXT.search(texto.strip())
    if nombre:
        inicio = texto.find(nombre.group(1))
        texto = texto[:inicio] + "[NOMBRE]"
        encontrados.add("[NOMBRE]")
    elif contexto_nombre:
        inicio = texto.find(contexto_nombre.group(1))
        texto = texto[:inicio] + "[NOMBRE]"
        encontrados.add("[NOMBRE]")
    elif _parece_nombre(texto, posicion, contexto_personal):
        texto = "[NOMBRE]"
        encontrados.add("[NOMBRE]")
    return texto


def anonimizar_con_metadatos(lineas: list[Linea]) -> ResultadoAnonimizacion:
    """Anonimiza líneas y devuelve solo la versión segura más metadatos."""
    anonimizadas: list[Linea] = []
    categorias: set[str] = set()
    alertas: list[str] = []
    contexto_personal_restante = 0
    for posicion, linea in enumerate(lineas):
        if not isinstance(linea, Linea) or not linea.id or linea.texto is None:
            raise ValueError("Cada línea debe tener id y texto válido.")
        if _PERSONAL_LABEL.search(linea.texto):
            contexto_personal_restante = 3
        contexto_personal = contexto_personal_restante > 0
        texto = _anonimizar_texto(linea.texto, categorias, alertas, posicion, contexto_personal)
        if contexto_personal_restante:
            contexto_personal_restante -= 1
        anonimizadas.append(linea.model_copy(update={"texto": texto}))
    fugas = any(patron.search(linea.texto) for linea in anonimizadas for patron in _POSSIBLE_PERSONAL)
    if fugas:
        alertas.append("posible_fuga_personal")
    return ResultadoAnonimizacion(anonimizadas, tuple(sorted(categorias)), tuple(sorted(set(alertas))))


def anonimizar(lineas: list[Linea]) -> list[Linea]:
    """Paso 2: devuelve líneas anonimizadas conservando IDs y coordenadas."""
    return anonimizar_con_metadatos(deepcopy(lineas)).lineas_anonimizadas
