"""Generación segura de turnos de entrevista con Anthropic."""
import json
import logging
import re
import unicodedata
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.config import settings
from app.llm import cargar_prompt, extract_json, get_client, texto_de_respuesta
from app.pipeline.datos_protegidos import detectar_dato_protegido
from app.schemas import Candidato, EvaluacionRequisito, Ficha, Requisito

log = logging.getLogger(__name__)

MIN_PREGUNTAS = 5
MAX_PREGUNTAS = 8
MAX_CHARS_PREGUNTA = 400
MAX_CHARS_RESPUESTA = 4000
MIN_CHARS_RESPUESTA = 30
MAX_TURNOS_EN_PROMPT = 6
MAX_CHARS_PERFIL = 3000
# El reto pide entrevistas de 5 a 10 preguntas (incluye repreguntas).
MIN_TURNOS = 5
MAX_TURNOS = 10

_CALIFICACIONES = {
    "solida": "solida", "fuerte": "solida", "excelente": "solida", "alta": "solida",
    "aceptable": "aceptable", "regular": "aceptable", "media": "aceptable",
    "suficiente": "aceptable", "buena": "aceptable",
    "debil": "debil", "baja": "debil", "insuficiente": "debil", "pobre": "debil",
}

_ETIQUETAS = re.compile(
    r"</?\s*(datos_no_confiables|respuesta_no_confiable|historial|pregunta|perfil_candidato"
    r"|criterio_exito|evidencia_cv)\s*>", re.I
)

_PALABRAS_VETADAS = re.compile(
    r"\b(cuentame de ti|fortalezas|debilidades|donde te ves|"
    r"edad|estado civil|hijos|nacionalidad|religion|embarazo|"
    r"orientacion sexual|salud|discapacidad)\b",
    re.IGNORECASE,
)

# Preguntas de respaldo: específicas, con criterio de éxito explícito.
_GENERICAS: list[tuple[str, str, str]] = [
    ("Resolución de problemas",
     "Describe un problema profesional difícil que hayas resuelto. Indica la situación, "
     "qué hiciste tú y el resultado medible.",
     "Menciona situación, acción personal y resultado medible; no basta con describir el problema."),
    ("Trabajo bajo presión",
     "Cuéntame un caso en el que tuviste que decidir con información incompleta o poco tiempo. "
     "¿Qué decidiste, por qué y qué pasó?",
     "Describe la decisión, el contexto de presión y la consecuencia observable."),
    ("Gestión de errores",
     "Describe un error profesional que hayas cometido. ¿Cómo lo detectaste, qué corregiste "
     "y qué cambiaste después?",
     "Reconoce el error, explica la corrección y el aprendizaje aplicado."),
    ("Colaboración",
     "Cuéntame una situación en la que dependieras de otra área o equipo para lograr un objetivo. "
     "¿Cómo coordinaste y qué resultado obtuviste?",
     "Menciona la coordinación concreta con otra área y el resultado conjunto."),
    ("Aprendizaje aplicado",
     "¿Qué habilidad aprendiste en los últimos dos años y cómo la aplicaste en un proyecto real?",
     "Conecta el aprendizaje con una aplicación concreta y su efecto medible."),
    ("Comunicación técnica",
     "Describe una ocasión en la que tuviste que explicar un tema técnico a alguien sin ese "
     "conocimiento. ¿Cómo lo hiciste y qué resultado lograste?",
     "Menciona la adaptación del mensaje, el público y el resultado de la comunicación."),
]


def _normalizar(texto: str) -> str:
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"[^a-z0-9]+", " ", sin_tildes).strip()


class PreguntaEntrevista(BaseModel):
    id: str
    tema: str = Field(min_length=3)
    categoria: str = "general"
    texto: str = Field(min_length=25, max_length=MAX_CHARS_PREGUNTA)
    motivo: str = Field(default="Verificar competencias del cargo", min_length=5)
    requisito_id: str | None = None
    evidencia_cv: str | None = None
    criterio_exito: str = Field(default="", max_length=500)
    es_repregunta: bool = False

    @field_validator("id", mode="before")
    @classmethod
    def _id_a_texto(cls, v: Any) -> Any:
        return str(v).strip() if isinstance(v, (int, str)) and not isinstance(v, bool) else v

    @field_validator("tema", "texto", "motivo", "criterio_exito", "evidencia_cv",
                     "requisito_id", mode="before")
    @classmethod
    def _compactar(cls, v: Any) -> Any:
        if v is None:
            return None
        return " ".join(v.split()) if isinstance(v, str) else v


class EvaluacionTurno(BaseModel):
    calificacion: Literal["solida", "aceptable", "debil"] = "aceptable"
    comentario: str = ""
    evidencia_respuesta: str = ""
    cumple_criterio: bool = False
    inconsistencias: list[str] = Field(default_factory=list)
    notas: list[str] = Field(default_factory=list)
    verificado: bool = False

    @field_validator("calificacion", mode="before")
    @classmethod
    def _sinonimos(cls, v: Any) -> Any:
        return _CALIFICACIONES.get(_normalizar(v), v) if isinstance(v, str) else v

    @field_validator("comentario", "evidencia_respuesta", mode="before")
    @classmethod
    def _texto_corto(cls, v: Any) -> Any:
        if v is None:
            return ""
        return v[:600] if isinstance(v, str) else v

    @field_validator("inconsistencias", "notas", mode="before")
    @classmethod
    def _lista_de_texto(cls, v: Any) -> Any:
        if v is None:
            return []
        if isinstance(v, str):
            return [v] if v.strip() else []
        if isinstance(v, list):
            return [str(x) for x in v if x not in (None, "")]
        return v

    @field_validator("cumple_criterio", "verificado", mode="before")
    @classmethod
    def _a_bool(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip().lower() in {"true", "si", "sí", "1"}
        return v


class RespuestaAgenteInvalida(RuntimeError):
    """La respuesta no cumple el contrato JSON del entrevistador."""


# --------------------------------------------------------------------------- utilidades

def _permitida(pregunta: PreguntaEntrevista) -> bool:
    """Rechaza preguntas que mencionen un dato protegido, aunque las genere el modelo."""
    return detectar_dato_protegido(f"{pregunta.tema} {pregunta.texto}") is None


def _es_unica(pregunta: PreguntaEntrevista) -> bool:
    """Una sola pregunta: rechaza «¿A? ¿B?» y similares."""
    return pregunta.texto.count("¿") <= 1 and pregunta.texto.count("?") <= 1


def _calidad(pregunta: PreguntaEntrevista) -> bool:
    """Rechaza preguntas genéricas, demasiado cortas o sin anclaje."""
    if _PALABRAS_VETADAS.search(_normalizar(pregunta.texto)):
        return False
    if len(pregunta.texto.split()) < 8:
        return False
    # Toda pregunta debe apuntar a un requisito o citar evidencia del CV,
    # salvo las de respaldo que traen criterio de éxito explícito.
    if not pregunta.requisito_id and not pregunta.evidencia_cv:
        return bool(pregunta.criterio_exito.strip())
    return True


def _neutralizar(texto: str) -> str:
    """Evita que el candidato cierre o abra los delimitadores del prompt."""
    return _ETIQUETAS.sub("[etiqueta eliminada]", texto)


def _a_json(valor: Any) -> str:
    return json.dumps(valor, ensure_ascii=False, default=str)


def _a_bool(valor: Any) -> bool:
    if isinstance(valor, str):
        return valor.strip().lower() in {"true", "si", "sí", "1"}
    return bool(valor)


def _id_libre(base: str, usados: set[str]) -> str:
    n = 1
    while f"{base}{n}" in usados:
        n += 1
    return f"{base}{n}"


def _filtrar_plan(preguntas: list[PreguntaEntrevista]) -> list[PreguntaEntrevista]:
    """Quita preguntas protegidas, compuestas, flojas o repetidas."""
    textos: set[str] = set()
    ids: set[str] = set()
    salida: list[PreguntaEntrevista] = []
    for p in preguntas:
        if not (_permitida(p) and _es_unica(p) and _calidad(p)):
            continue
        clave = _normalizar(p.texto)
        if clave in textos:
            continue
        textos.add(clave)
        if p.id in ids:
            p = p.model_copy(update={"id": _id_libre("P", ids)})
        ids.add(p.id)
        salida.append(p)
    return salida


def _parsear_preguntas(items: Any) -> list[PreguntaEntrevista]:
    """Valida cada pregunta por separado: una mala no tumba todo el plan."""
    if not isinstance(items, list):
        return []
    preguntas = []
    for item in items:
        try:
            preguntas.append(PreguntaEntrevista.model_validate(item))
        except ValidationError as error:
            log.warning("Pregunta descartada por formato inválido: %s", error.errors()[:1])
    return preguntas


def _pregunta_requisito(requisito: Requisito) -> PreguntaEntrevista:
    nombre = " ".join(requisito.nombre.split())[:120]
    return PreguntaEntrevista(
        id=requisito.id, tema=nombre, categoria=requisito.categoria,
        texto=(f"Describe un caso concreto en el que hayas aplicado «{nombre}». "
               "Indica la situación, qué hiciste tú y el resultado medible."),
        motivo=f"Verificar experiencia real en {nombre}.",
        requisito_id=requisito.id,
        criterio_exito=("Menciona situación, acción personal y resultado medible; "
                        "no basta con decir que lo conoce."),
    )


def _cubre(pregunta: PreguntaEntrevista, requisito: Requisito) -> bool:
    if pregunta.requisito_id == requisito.id or pregunta.id == requisito.id:
        return True
    nombre = _normalizar(requisito.nombre)
    return bool(nombre) and nombre in _normalizar(f"{pregunta.tema} {pregunta.texto}")


def _fallback(requisitos: list[Requisito]) -> list[PreguntaEntrevista]:
    """Plan determinista: requisitos obligatorios primero, 5 a 8 preguntas."""
    generales = [
        PreguntaEntrevista(
            id=f"G{i}", tema=tema, texto=texto,
            motivo=f"Explorar {tema.lower()} con un caso real.",
            criterio_exito=criterio,
        )
        for i, (tema, texto, criterio) in enumerate(_GENERICAS, 1)
    ]
    ordenados = sorted(requisitos, key=lambda r: r.tipo != "obligatorio")
    de_requisitos = [_pregunta_requisito(r) for r in ordenados[:MAX_PREGUNTAS - 2]]
    candidatas = generales[:1] + de_requisitos + generales[1:]
    return _filtrar_plan(candidatas)[:MAX_PREGUNTAS]


def _completar_plan(preguntas: list[PreguntaEntrevista],
                    requisitos: list[Requisito]) -> list[PreguntaEntrevista]:
    """Garantiza cobertura de requisitos obligatorios y entre 5 y 8 preguntas."""
    faltantes = [r for r in requisitos
                 if r.tipo == "obligatorio" and not any(_cubre(p, r) for p in preguntas)]
    extra = [_pregunta_requisito(r) for r in faltantes]
    base = preguntas[:max(MAX_PREGUNTAS - len(extra), 0)]
    plan = _filtrar_plan(base + extra)[:MAX_PREGUNTAS]
    if len(plan) < MIN_PREGUNTAS:
        for respaldo in _fallback(requisitos):
            plan = _filtrar_plan(plan + [respaldo])
            if len(plan) >= MIN_PREGUNTAS:
                break
    return plan[:MAX_PREGUNTAS]


# --------------------------------------------------------------------------- LLM

def _sistema() -> str:
    """Reglas del entrevistador, versionadas en app/prompts/entrevista_<PROMPT_VERSION>.md."""
    return cargar_prompt("entrevista")

async def _json(messages: list[dict[str, str]], system: str) -> dict[str, Any]:
    for intento in range(2):
        response = await get_client().messages.create(
            model=settings.MODELO_EVALUACION, max_tokens=5000,
            output_config={"effort": "low"}, system=system, messages=messages,
        )
        if response.stop_reason in ("refusal", "max_tokens", "tool_use"):
            raise RespuestaAgenteInvalida("El modelo no devolvió un turno completo.")
        texto = texto_de_respuesta(response)
        try:
            data = extract_json(texto)
            if not isinstance(data, dict):
                raise ValueError("La respuesta JSON debe ser un objeto.")
            return data
        except (ValueError, ValidationError) as error:
            log.warning("JSON de entrevista inválido (intento %d): %s", intento + 1, error)
            messages.extend([
                {"role": "assistant", "content": texto},
                {"role": "user", "content": f"Corrige solo el JSON. Error: {error}"},
            ])
    raise RespuestaAgenteInvalida("El modelo devolvió JSON inválido.")


async def generar_plan(candidato: Candidato, requisitos: list[Requisito],
                       historial: list[dict[str, Any]] | None = None
                       ) -> list[PreguntaEntrevista]:
    contenido = {
        "candidato_anonimizado": candidato.model_dump(mode="json"),
        "requisitos_confirmados": [r.model_dump() for r in requisitos],
        "historial": historial or [],
    }
    try:
        data = await _json(
            [{"role": "user", "content": (
                "<datos_no_confiables>\n" + _neutralizar(_a_json(contenido)) +
                f"\n</datos_no_confiables>\nGenera entre {MIN_PREGUNTAS} y {MAX_PREGUNTAS} "
                "preguntas JSON, distintas entre sí, cubriendo primero los requisitos obligatorios. "
                "Cada pregunta debe incluir requisito_id o evidencia_cv, y criterio_exito."
            )}],
            _sistema(),
        )
    except (RespuestaAgenteInvalida, ValueError):
        log.warning("Plan de entrevista con respaldo determinista.")
        return _fallback(requisitos)
    preguntas = _filtrar_plan(_parsear_preguntas(data.get("preguntas")))
    return _completar_plan(preguntas, requisitos)


# --------------------------------------------------------------------------- turnos

def _es_respuesta_vacia(respuesta: str) -> bool:
    return len(" ".join(respuesta.split())) < MIN_CHARS_RESPUESTA


def _turno_sin_contenido(pregunta: PreguntaEntrevista
                         ) -> tuple[EvaluacionTurno, PreguntaEntrevista | None, bool]:
    """Respuesta vacía o muy corta: no gasta una llamada al modelo."""
    evaluacion = EvaluacionTurno(
        calificacion="debil", comentario="Respuesta demasiado breve para evaluar.",
        notas=["Respuesta vacía o muy corta; no se consultó al modelo."],
    )
    if pregunta.es_repregunta:
        return evaluacion, None, False
    repregunta = PreguntaEntrevista(
        id=f"{pregunta.id}-R", tema=pregunta.tema, categoria=pregunta.categoria,
        texto="¿Podrías darme un ejemplo concreto y real, con lo que hiciste tú y el resultado?",
        motivo="Respuesta insuficiente; pedir un ejemplo concreto",
        criterio_exito="Menciona un caso real, la acción personal y el resultado observable.",
        es_repregunta=True,
    )
    return evaluacion, repregunta, False


def _sanear_evaluacion(evaluacion: EvaluacionTurno) -> None:
    """La salida del modelo tampoco puede apoyarse en datos protegidos."""
    if detectar_dato_protegido(evaluacion.comentario) is not None:
        evaluacion.comentario = "Comentario omitido por contener un dato protegido."
        evaluacion.notas.append("El comentario del evaluador mencionaba un dato protegido.")
    limpias = [x for x in evaluacion.inconsistencias if detectar_dato_protegido(x) is None]
    if len(limpias) != len(evaluacion.inconsistencias):
        evaluacion.notas.append("Se descartó una inconsistencia basada en un dato protegido.")
        evaluacion.inconsistencias = limpias
    # Sin cita textual no se otorga «sólida».
    if evaluacion.calificacion == "solida" and not evaluacion.evidencia_respuesta.strip():
        evaluacion.calificacion = "aceptable"
        evaluacion.notas.append("Sin cita textual no se otorga 'sólida'.")


def _textos_previos(pregunta: PreguntaEntrevista, historial: list[dict[str, Any]]) -> set[str]:
    textos = {_normalizar(pregunta.texto)}
    for h in historial:
        previa = h.get("pregunta") if isinstance(h, dict) else None
        if isinstance(previa, dict):
            previa = previa.get("texto")
        if isinstance(previa, str):
            textos.add(_normalizar(previa))
    return textos


def _validar_siguiente(crudo: Any, actual: PreguntaEntrevista,
                       historial: list[dict[str, Any]]) -> PreguntaEntrevista | None:
    if not isinstance(crudo, dict):
        return None
    try:
        siguiente = PreguntaEntrevista.model_validate(crudo)
    except ValidationError as error:
        log.warning("pregunta_siguiente descartada: %s", error.errors()[:1])
        return None
    if not (_permitida(siguiente) and _es_unica(siguiente) and _calidad(siguiente)):
        return None
    if _normalizar(siguiente.texto) in _textos_previos(actual, historial):
        return None
    if siguiente.es_repregunta and actual.es_repregunta:
        return None  # máximo una repregunta por pregunta
    return siguiente


def _perfil_para_prompt(candidato: Candidato | None) -> str:
    """CV anonimizado en JSON compacto, para contrastar las respuestas."""
    if candidato is None:
        return "{}"
    return _neutralizar(_a_json(candidato.model_dump(mode="json")))[:MAX_CHARS_PERFIL]


def _aplicar_limites(contestadas: int, evaluacion: EvaluacionTurno,
                     siguiente: PreguntaEntrevista | None, terminar: bool
                     ) -> tuple[EvaluacionTurno, PreguntaEntrevista | None, bool]:
    """La entrevista dura entre MIN_TURNOS y MAX_TURNOS respuestas."""
    if contestadas >= MAX_TURNOS:
        return evaluacion, None, True
    if contestadas < MIN_TURNOS:
        terminar = False
    return evaluacion, siguiente, terminar


async def evaluar_respuesta(candidato: Candidato | None, pregunta: PreguntaEntrevista,
                            respuesta: str, historial: list[dict[str, Any]]
                            ) -> tuple[EvaluacionTurno, PreguntaEntrevista | None, bool]:
    """`historial` son los turnos previos; la respuesta actual aún no está incluida."""
    contestadas = len(historial) + 1
    respuesta = (respuesta or "").strip()
    if _es_respuesta_vacia(respuesta):
        return _aplicar_limites(contestadas, *_turno_sin_contenido(pregunta))

    protegido = detectar_dato_protegido(respuesta) is not None
    aviso = ("\nLa respuesta menciona un dato protegido: ignóralo, no lo uses para evaluar "
             "ni preguntes sobre él." if protegido else "")
    criterio = pregunta.criterio_exito or "No especificado; evalúa evidencia concreta."
    data = await _json(
        [{"role": "user", "content": (
            "<perfil_candidato>\n" + _perfil_para_prompt(candidato) +
            "\n</perfil_candidato>\n<pregunta>\n" + pregunta.model_dump_json() +
            "\n</pregunta>\n<criterio_exito>\n" + criterio +
            "\n</criterio_exito>\n<respuesta_no_confiable>\n" +
            _neutralizar(respuesta)[:MAX_CHARS_RESPUESTA] +
            "\n</respuesta_no_confiable>\n<historial>\n" +
            _neutralizar(_a_json(historial[-MAX_TURNOS_EN_PROMPT:])) +
            "\n</historial>\nEvalúa contra el criterio_exito, contrasta con el perfil y el "
            "historial, cita textualmente la evidencia de la respuesta y genera la siguiente "
            "pregunta o null." + aviso
        )}],
        _sistema(),
    )
    if "evaluacion_respuesta" not in data:
        raise RespuestaAgenteInvalida("Falta evaluacion_respuesta en el JSON.")
    try:
        evaluacion = EvaluacionTurno.model_validate(data["evaluacion_respuesta"])
    except ValidationError as error:
        raise RespuestaAgenteInvalida(f"Evaluación inválida: {error}") from error
    _sanear_evaluacion(evaluacion)
    if protegido:
        evaluacion.notas.append("La respuesta contiene un dato protegido; se ignoró para la decisión.")
    siguiente = _validar_siguiente(data.get("pregunta_siguiente"), pregunta, historial)
    return _aplicar_limites(contestadas, evaluacion, siguiente, _a_bool(data.get("terminar", False)))


def construir_informe(historial: list[dict[str, Any]]) -> dict[str, Any]:
    evaluaciones = [h.get("evaluacion") or {} for h in historial]
    inconsistencias = [x for e in evaluaciones for x in e.get("inconsistencias", [])]
    con_evidencia = sum(bool((e.get("evidencia_respuesta") or "").strip()) for e in evaluaciones)
    cumplen = sum(bool(e.get("cumple_criterio")) for e in evaluaciones)
    buenas = sum(e.get("calificacion") in ("aceptable", "solida") for e in evaluaciones)
    debiles = sum(e.get("calificacion") == "debil" for e in evaluaciones)
    total = len(evaluaciones)
    return {
        "inconsistencias": inconsistencias,
        "respuestas_suficientes": buenas,
        "respuestas_debiles": debiles,
        "con_evidencia_textual": con_evidencia,
        "cumplen_criterio": cumplen,
        "total_respuestas": total,
        "recomendacion": (
            "avanzar" if total >= MIN_TURNOS and not inconsistencias
            and buenas / total >= 0.6
            and con_evidencia / total >= 0.5
            else "revisar"
        ),
    }


async def siguiente_turno(ficha: Ficha, evaluaciones: list[EvaluacionRequisito],
                          historial: list[dict[str, Any]]) -> dict[str, Any]:
    """Compatibilidad con el contrato inicial del bonus."""
    requisitos = [
        Requisito(id=e.requisito_id, nombre=e.requisito_id, tipo="deseable", categoria="general")
        for e in evaluaciones
    ]
    plan = await generar_plan(ficha, requisitos, historial=historial)
    indice = len(historial)
    pregunta = plan[indice] if indice < len(plan) and indice < MAX_TURNOS else None
    return {
        "pregunta_siguiente": pregunta.model_dump() if pregunta else None,
        "evaluacion_respuesta": None,
        "inconsistencias": [],
        "terminar": pregunta is None and indice >= MIN_TURNOS,
    }
