import re
import unicodedata

from rapidfuzz.fuzz import ratio

from app.schemas import EvaluacionRequisito, Linea

_EMAIL = re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b")
_PHONE = re.compile(r"(?<!\w)(?:\+\d{1,3}[\s.-]?)?(?:\d[\s.-]?){7,14}\d(?!\w)")


def _normalizar(texto: str) -> str:
    texto = unicodedata.normalize("NFKC", texto).casefold()
    return " ".join(texto.split())


def _cita_coincide(cita: str, texto: str) -> bool:
    cita_normalizada = _normalizar(cita)
    texto_normalizado = _normalizar(texto)
    if not cita_normalizada or cita_normalizada in texto_normalizado:
        return bool(cita_normalizada)
    tokens = [token for token in re.findall(r"\w+", cita_normalizada) if len(token) > 2]
    compartidos = sum(token in texto_normalizado for token in tokens)
    return len(tokens) >= 2 and compartidos / len(tokens) >= 0.8 and ratio(cita_normalizada, texto_normalizado) >= 75


def verificar_citas(evaluaciones: list[EvaluacionRequisito], lineas: list[Linea]) -> list[EvaluacionRequisito]:
    """Paso 6. Comprueba con rapidfuzz que cada cita exista en las líneas indicadas del CV
    y llena `cita_verificada`. Una cita no encontrada no es error: baja la confianza.
    """
    por_id = {linea.id: linea.texto for linea in lineas}
    verificadas: list[EvaluacionRequisito] = []
    for evaluacion in evaluaciones:
        if not evaluacion.cita or not evaluacion.lineas:
            verificadas.append(evaluacion.model_copy(update={"cita_verificada": False}))
            continue
        textos = [por_id[linea_id] for linea_id in evaluacion.lineas if linea_id in por_id]
        protegida = bool(_EMAIL.search(evaluacion.cita) or _PHONE.search(evaluacion.cita))
        valida = (
            len(textos) == len(evaluacion.lineas)
            and not protegida
            and _cita_coincide(evaluacion.cita, " ".join(textos))
        )
        verificadas.append(evaluacion.model_copy(update={"cita_verificada": valida}))
    return verificadas
