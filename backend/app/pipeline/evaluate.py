import logging

from pydantic import ValidationError

from app.config import settings
from app.llm import cargar_prompt, extract_json, get_client, texto_de_respuesta
from app.schemas import EvaluacionRequisito, Ficha, Linea, Requisito

log = logging.getLogger(__name__)


class RespuestaEvaluacionInvalida(RuntimeError):
    """La respuesta del modelo no cumple el contrato de evaluación."""


async def evaluar(
    ficha: Ficha,
    requisitos: list[Requisito],
    lineas: list[Linea],
) -> list[EvaluacionRequisito]:
    """Paso 5 (LLM, llamada 2, MODELO_EVALUACION). Evalúa cada requisito con resultado, cita, líneas y
    justificación. Razona por significado, no por palabras clave: tecnología parecida ≠ misma (AWS ≠ Azure).
    Few-shot con 3-5 ejemplos. Ver secciones 7 y 8. Prompt en app/prompts/evaluacion_v1.md.
    """

    if not requisitos:
        raise RespuestaEvaluacionInvalida("No hay requisitos para evaluar.")
    contenido = "\n".join(f"[{linea.id}] {linea.texto}" for linea in lineas)
    ficha_json = ficha.model_dump_json()
    # El peso no cambia si un requisito se cumple: no se envía, y cambiarlo no obliga a reevaluar.
    requisitos_json = [requisito.model_dump(exclude={"peso"}) for requisito in requisitos]
    messages = [{
        "role": "user",
        "content": (
            "<ficha_candidato>\n"
            f"{ficha_json}\n"
            "</ficha_candidato>\n"
            "<requisitos_confirmados>\n"
            f"{requisitos_json}\n"
            "</requisitos_confirmados>\n"
            "<evidencias_anonimizadas_datos_no_confiables>\n"
            f"{contenido}\n"
            "</evidencias_anonimizadas_datos_no_confiables>"
        ),
    }]
    for intento in range(2):
        message = await get_client().messages.create(
            model=settings.MODELO_EVALUACION,
            max_tokens=16000,
            output_config={"effort": "low"},
            system=cargar_prompt("evaluation"),
            messages=messages,
        )
        if message.stop_reason in ("refusal", "max_tokens"):
            raise RespuestaEvaluacionInvalida("El modelo no devolvió una evaluación completa.")
        texto = texto_de_respuesta(message)
        try:
            salida = extract_json(texto)
            evaluaciones = [EvaluacionRequisito.model_validate(item) for item in salida["evaluaciones"]]
            por_id = {requisito.id: requisito for requisito in requisitos}
            if {item.requisito_id for item in evaluaciones} != set(por_id):
                raise ValueError("La respuesta no evalúa exactamente todos los requisitos.")
            for item in evaluaciones:
                requisito = por_id[item.requisito_id]
                permitidos = {"presente", "ausente", "sin_informacion"} if requisito.tipo == "descalificante" else {
                    "cumple", "equivalente", "parcial", "no_cumple", "sin_informacion"
                }
                if item.resultado not in permitidos:
                    raise ValueError(f"Resultado inválido para {item.requisito_id}.")
            return evaluaciones
        except (KeyError, ValueError, ValidationError) as error:
            log.warning("Evaluación inválida (intento %d): %s", intento + 1, type(error).__name__)
            messages += [
                {"role": "assistant", "content": texto},
                {"role": "user", "content": f"Corrige el JSON según este error: {error}. Responde solo JSON."},
            ]
    raise RespuestaEvaluacionInvalida("El modelo devolvió una evaluación con formato inválido.")
