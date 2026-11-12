"""Anonimización determinista de líneas de CV antes de usar un LLM."""
from dataclasses import dataclass
import re
from copy import deepcopy

from app.schemas import Linea


_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
_PHONE = re.compile(
    r"(?<!\w)(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)"
    r"\d{3,4}[\s.-]?\d{3,4}(?!\w)"
)
_DOCUMENT = re.compile(
    r"(?i)\b(?:cc|c\.c\.|cédula|cedula|dni|documento|id)\s*[:#-]?\s*"
    r"[A-Z0-9][A-Z0-9 .-]{4,24}"
)
_DATE_OF_BIRTH = re.compile(
    r"(?i)\b(?:fecha\s+de\s+nacimiento|nacimiento|date\s+of\s+birth|dob)\s*[:#-]?\s*"
    r"(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:19|20)\d{2}[/-]\d{1,2}[/-]\d{1,2})"
)
_AGE = re.compile(
    r"(?i)\b(?:edad|age)\s*[:#-]?\s*\d{1,3}(?=\s*(?:años|anos|years?)?\b)|"
    r"\b\d{1,3}(?=\s*(?:años|anos|years?)\b)"
)
_ADDRESS = re.compile(
    r"(?i)\b(?:dirección|direccion|address|domicilio)\s*[:#-]?\s*[^\n|;]{5,100}"
)
_NATIONALITY = re.compile(
    r"(?i)\b(?:nacionalidad|nationality)\s*[:#-]?\s*[A-Za-zÁÉÍÓÚáéíóúÑñ-]+"
)
_GENDER = re.compile(
    r"(?i)\b(?:género|genero|gender|sexo|sex)\s*[:#-]?\s*[A-Za-zÁÉÍÓÚáéíóúÑñ-]+"
)
_MARITAL = re.compile(
    r"(?i)\b(?:estado\s+civil|marital\s+status)\s*[:#-]?\s*[A-Za-zÁÉÍÓÚáéíóúÑñ-]+"
)
_PRONOUNS = re.compile(r"(?i)\b(?:he/him|she/her|they/them|él/ella|él|ella|elle)\b")
_INJECTION = re.compile(
    r"(?i)\b(?:ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?|"
    r"ignore\s+all\s+rules|system\s+prompt|reveal\s+your\s+instructions)\b"
)

_NAME_LABEL = re.compile(
    r"(?i)^(?:nombre(?:\s+completo)?|name|full\s+name)\s*[:#-]\s*(.+)$"
)
_NAME_WORDS = re.compile(r"^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}$")


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


def _anonimizar_texto(texto: str, encontrados: set[str], alertas: list[str]) -> str:
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
    if nombre:
        inicio = texto.find(nombre.group(1))
        texto = texto[:inicio] + "[NOMBRE]"
        encontrados.add("[NOMBRE]")
    elif _NAME_WORDS.fullmatch(texto.strip()):
        texto = "[NOMBRE]"
        encontrados.add("[NOMBRE]")
    return texto


def anonimizar_con_metadatos(lineas: list[Linea]) -> ResultadoAnonimizacion:
    """Anonimiza líneas y devuelve solo la versión segura más metadatos."""
    anonimizadas: list[Linea] = []
    categorias: set[str] = set()
    alertas: list[str] = []
    for linea in lineas:
        if not isinstance(linea, Linea) or not linea.id or linea.texto is None:
            raise ValueError("Cada línea debe tener id y texto válido.")
        texto = _anonimizar_texto(linea.texto, categorias, alertas)
        anonimizadas.append(linea.model_copy(update={"texto": texto}))
    return ResultadoAnonimizacion(anonimizadas, tuple(sorted(categorias)), tuple(sorted(set(alertas))))


def anonimizar(lineas: list[Linea]) -> list[Linea]:
    """Paso 2: devuelve líneas anonimizadas conservando IDs y coordenadas."""
    return anonimizar_con_metadatos(deepcopy(lineas)).lineas_anonimizadas
