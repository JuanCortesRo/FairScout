"""Anonimización determinista de líneas de CV antes de usar un LLM."""
from dataclasses import dataclass
import re
import unicodedata
from copy import deepcopy

from app.pipeline.datos_protegidos import RAICES_GENTILICIOS
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
# Palabras que nunca forman parte de un nombre de persona: títulos de sección, cargos y áreas.
# Evitan que el encabezado "HOJA DE VIDA" o el cargo "Ingeniero de sistemas" se borren como si fueran un nombre.
_PROFESSIONAL_WORDS = {
    "engineer", "developer", "designer", "manager", "director", "analyst",
    "software", "full", "stack", "backend", "frontend", "universidad",
    "university", "corporation", "company", "technologies", "technology",
    "experience", "summary", "skills", "education", "certifications",
    "experiencia", "resumen", "habilidades", "educacion", "formacion",
    "profesional", "laboral",
    # títulos de sección y del documento
    "hoja", "vida", "curriculum", "vitae", "cv", "resume", "perfil", "profile", "contacto", "contact",
    "objetivo", "objective", "referencias", "references", "datos", "personales", "personal", "informacion",
    "information", "about", "acerca", "sobre", "logros", "achievements", "idiomas", "languages", "proyectos",
    "projects", "cursos", "courses", "competencias", "aptitudes", "intereses", "interests", "work", "history",
    "professional", "qualifications", "accomplishments", "highlights", "career", "carrera", "estudios",
    # cargos y áreas (español e inglés)
    "ingeniero", "ingeniera", "desarrollador", "desarrolladora", "contador", "contadora", "analista",
    "gerente", "directora", "administrador", "administradora", "tecnico", "tecnica", "tecnologo",
    "tecnologa", "licenciado", "licenciada", "auxiliar", "asistente", "coordinador", "coordinadora", "jefe",
    "especialista", "consultor", "consultora", "abogado", "abogada", "docente", "profesor", "profesora",
    "medico", "medica", "enfermero", "enfermera", "disenador", "disenadora", "programador", "programadora",
    "arquitecto", "arquitecta", "economista", "psicologo", "psicologa", "practicante", "pasante",
    "estudiante", "lider", "sistemas", "publico", "publica", "contaduria", "finanzas", "ventas", "soporte",
    "accountant", "staff", "intern", "specialist", "consultant", "assistant", "associate", "coordinator",
    "supervisor", "officer", "clerk", "administrator", "technician", "representative", "executive", "lead",
    "head", "chief", "president", "vice", "accounting", "finance", "financial", "sales", "marketing",
    "operations", "project", "product", "data", "network", "systems", "support", "services", "service",
    "senior", "junior", "sr", "jr", "team", "office", "business", "customer", "human", "resources", "hr",
    "teacher", "nurse", "agent", "advisor", "auditor", "bookkeeper", "cashier", "controller", "owner",
    "partner", "member", "volunteer", "trainee", "student", "graduate", "general", "regional", "national",
}
_NAME_TOKEN = re.compile(r"^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[-'][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)?$")
_CONECTORES_NOMBRE = {"de", "del", "la", "las", "los", "y", "da", "dos", "van", "von"}
# Un encabezado suele escribirse "Nombre | correo | teléfono" o "Nombre - Cargo": se revisa cada segmento.
_SEPARADORES = re.compile(r"\s*(?:\||·|•|–|—|\s-\s|,|/)\s*")
_ZONA_ENCABEZADO = 6   # primeras líneas con texto donde suele estar el nombre
_GENTILICIO_SUELTO = re.compile(
    r"(?i)^(?:" + RAICES_GENTILICIOS + r")(?:o|a|os|as|e|es|ian|ean)?$"
)
_POSSIBLE_PERSONAL = (
    _EMAIL,
    _PHONE,
    _DOCUMENT,
    _DATE_OF_BIRTH,
)


@dataclass(frozen=True)
class Contacto:
    """Datos para contactar al candidato. Nunca van al LLM ni a la interfaz: solo al ranking exportado."""

    nombre: str | None = None
    correo: str | None = None
    telefono: str | None = None


@dataclass(frozen=True)
class ResultadoAnonimizacion:
    """Las líneas originales no forman parte del resultado; del texto personal solo se conserva el contacto."""

    lineas_anonimizadas: list[Linea]
    categorias: tuple[str, ...]
    alertas: tuple[str, ...]
    contacto: Contacto = Contacto()


def _reemplazar(
    texto: str, patron: re.Pattern[str], etiqueta: str, encontrados: set[str], valores: dict[str, str] | None = None
) -> str:
    def reemplazo(match: re.Match[str]) -> str:
        encontrados.add(etiqueta)
        if valores is not None:
            valores.setdefault(etiqueta, match.group(0).strip())
        return etiqueta

    return patron.sub(reemplazo, texto)


def _sin_acentos(texto: str) -> str:
    return "".join(
        caracter for caracter in unicodedata.normalize("NFKD", texto)
        if not unicodedata.combining(caracter)
    )


def _es_nombre(segmento: str, minusculas: bool = False) -> bool:
    """2 a 6 palabras con mayúscula inicial (admite "de", "la"...) y ninguna palabra de cargo o sección.

    `minusculas` acepta además un nombre escrito todo en minúsculas; solo se usa en el encabezado.
    """
    palabras = segmento.split()
    if not 2 <= len(palabras) <= 6:
        return False
    propias = [p for p in palabras if p.casefold() not in _CONECTORES_NOMBRE]
    if len(propias) < 2 or palabras[0].casefold() in _CONECTORES_NOMBRE:
        return False
    if any(not _NAME_TOKEN.fullmatch(p) for p in propias):
        return False
    # Cada palabra con mayúscula inicial, o todo en minúsculas ("maria fernanda lopez").
    if not (all(p[0].isupper() for p in propias) or (minusculas and segmento.islower())):
        return False
    # En un texto con minúsculas, una palabra corta toda en mayúsculas es una sigla ("Active TS"), no un nombre.
    if not segmento.isupper() and any(p.isupper() and len(p) <= 3 for p in propias):
        return False
    return not any(_sin_acentos(p).casefold() in _PROFESSIONAL_WORDS for p in palabras)


def _anonimizar_segmentos(texto: str, encontrados: set[str], valores: dict[str, str], con_gentilicios: bool) -> str:
    """Reemplaza, dentro de una línea, solo los segmentos que son un nombre (o una nacionalidad suelta)."""
    partes = _SEPARADORES.split(texto)
    separadores = _SEPARADORES.findall(texto)
    for i, parte in enumerate(partes):
        limpio = " ".join(parte.split())
        # En minúsculas solo cuenta si es la línea completa: un trozo entre comas suele ser parte de una oración.
        if _es_nombre(limpio, minusculas=len(partes) == 1):
            valores.setdefault("[NOMBRE]", limpio)
            encontrados.add("[NOMBRE]")
            partes[i] = "[NOMBRE]"
        elif con_gentilicios and _GENTILICIO_SUELTO.match(_sin_acentos(limpio)):
            encontrados.add("[NACIONALIDAD]")
            partes[i] = "[NACIONALIDAD]"
    return "".join(parte + (separadores[i] if i < len(separadores) else "") for i, parte in enumerate(partes))


def _anonimizar_texto(
    texto: str,
    encontrados: set[str],
    alertas: list[str],
    en_encabezado: bool,
    contexto_personal: bool,
    valores: dict[str, str],
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
    texto = _reemplazar(texto, _EMAIL, "[CORREO]", encontrados, valores)
    texto = _reemplazar(texto, _PHONE, "[TELEFONO]", encontrados, valores)

    etiqueta = _NAME_LABEL.match(texto.strip())
    contexto = _NAME_CONTEXT.search(texto.strip())
    # "Nombre: X" siempre es un nombre; tras "soy", "candidate"... solo si lo que sigue tiene forma de nombre
    # ("Graduating Ph.D. candidate with a research focus" es evidencia, no un nombre).
    valor_contexto = contexto.group(1).strip(" .,:;") if contexto else ""
    if etiqueta or (contexto and _es_nombre(valor_contexto)):
        valor = etiqueta.group(1) if etiqueta else valor_contexto
        inicio = texto.find(valor)
        valores.setdefault("[NOMBRE]", " ".join(valor.split()))
        texto = texto[:inicio] + "[NOMBRE]" + (texto[inicio + len(valor):] if not etiqueta else "")
        encontrados.add("[NOMBRE]")
        return texto

    # Un encabezado con el nombre es corto ("Juan Pérez | correo | teléfono"); las líneas largas del inicio
    # suelen ser listas de habilidades con productos en mayúscula ("MS Word, Great Plains") que no son nombres.
    palabras = len(texto.split())
    con_contacto = "[CORREO]" in texto or "[TELEFONO]" in texto
    corta = ";" not in texto and palabras <= 10
    if ((en_encabezado or contexto_personal) and corta) or (con_contacto and palabras <= 16):
        texto = _anonimizar_segmentos(texto, encontrados, valores, con_gentilicios=en_encabezado or contexto_personal)
    return texto


def anonimizar_con_metadatos(lineas: list[Linea]) -> ResultadoAnonimizacion:
    """Anonimiza líneas y devuelve solo la versión segura más metadatos."""
    anonimizadas: list[Linea] = []
    categorias: set[str] = set()
    alertas: list[str] = []
    valores: dict[str, str] = {}
    contexto_personal_restante = 0
    lineas_con_texto = 0
    for linea in lineas:
        if not isinstance(linea, Linea) or not linea.id or linea.texto is None:
            raise ValueError("Cada línea debe tener id y texto válido.")
        if _PERSONAL_LABEL.search(linea.texto):
            contexto_personal_restante = 3
        contexto_personal = contexto_personal_restante > 0
        en_encabezado = bool(linea.texto.strip()) and lineas_con_texto < _ZONA_ENCABEZADO
        lineas_con_texto += bool(linea.texto.strip())
        texto = _anonimizar_texto(linea.texto, categorias, alertas, en_encabezado, contexto_personal, valores)
        if contexto_personal_restante:
            contexto_personal_restante -= 1
        anonimizadas.append(linea.model_copy(update={"texto": texto}))

    # El nombre detectado en el encabezado también se borra donde vuelva a aparecer (firma, pie de página...).
    if nombre := valores.get("[NOMBRE]"):
        repetido = re.compile(r"\s+".join(map(re.escape, nombre.split())), re.I)
        anonimizadas = [l.model_copy(update={"texto": repetido.sub("[NOMBRE]", l.texto)}) for l in anonimizadas]

    fugas = any(patron.search(linea.texto) for linea in anonimizadas for patron in _POSSIBLE_PERSONAL)
    if fugas:
        alertas.append("posible_fuga_personal")
    contacto = Contacto(
        nombre=valores.get("[NOMBRE]"), correo=valores.get("[CORREO]"), telefono=valores.get("[TELEFONO]")
    )
    return ResultadoAnonimizacion(anonimizadas, tuple(sorted(categorias)), tuple(sorted(set(alertas))), contacto)


def anonimizar(lineas: list[Linea]) -> list[Linea]:
    """Paso 2: devuelve líneas anonimizadas conservando IDs y coordenadas."""
    return anonimizar_con_metadatos(deepcopy(lineas)).lineas_anonimizadas
