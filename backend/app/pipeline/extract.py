import logging

from pydantic import ValidationError

from app.config import settings
from app.llm import cargar_prompt, extract_json, get_client, texto_de_respuesta
from app.schemas import Ficha, Linea

log = logging.getLogger(__name__)


class RespuestaLLMInvalida(RuntimeError):
    """La respuesta del modelo no contiene una ficha de candidato válida."""


async def extraer_ficha(lineas: list[Linea]) -> Ficha:
    """Paso 3 (LLM, llamada 1, MODELO_EXTRACCION). Envía las líneas como "[p1-l3] texto", delimitadas
    como dato, y devuelve la Ficha con los ids de línea de cada dato. Si un dato no aparece en el CV,
    se deja vacío: nunca se infiere. Prompt en app/prompts/extraccion_v1.md.

    Las líneas ya deben estar anonimizadas. El contenido se delimita como datos
    no confiables para evitar que instrucciones presentes en un CV se ejecuten.
    """
    if not lineas:
        raise RespuestaLLMInvalida("El documento no contiene líneas para extraer.")

    client = get_client()
    contenido = "\n".join(f"[{linea.id}] {linea.texto}" for linea in lineas)
    messages = [{
        "role": "user",
        "content": (
            "<cv_anonimizado_datos_no_confiables>\n"
            f"{contenido}\n"
            "</cv_anonimizado_datos_no_confiables>"
        ),
    }]

    for intento in range(2):
        message = await client.messages.create(
            model=settings.MODELO_EXTRACCION,
            max_tokens=12000,
            output_config={"effort": "low"},
            system=cargar_prompt("extraccion"),
            messages=messages,
        )
        if message.stop_reason == "refusal":
            raise RespuestaLLMInvalida("El modelo se negó a extraer la ficha.")
        if message.stop_reason == "max_tokens":
            raise RespuestaLLMInvalida("La respuesta del modelo quedó incompleta.")

        texto = texto_de_respuesta(message)
        try:
            ficha = Ficha.model_validate(extract_json(texto))
            ids_validos = {linea.id for linea in lineas}
            ids_usados = {
                evidencia
                for experiencia in ficha.experiencias
                for evidencia in experiencia.lineas
            } | {
                evidencia
                for formacion in ficha.formacion
                for evidencia in formacion.lineas
            } | {
                evidencia
                for idioma in ficha.idiomas
                for evidencia in idioma.lineas
            }
            if not ids_usados.issubset(ids_validos):
                raise ValueError("La ficha contiene evidencias que no existen en el documento.")
            return ficha
        except (ValueError, ValidationError) as error:
            log.warning("Salida de extracción inválida (intento %d): %s", intento + 1, type(error).__name__)
            messages += [
                {"role": "assistant", "content": texto},
                {
                    "role": "user",
                    "content": (
                        f"Corrige el JSON: {error}. Usa únicamente IDs de líneas existentes "
                        "y responde solo con el objeto JSON."
                    ),
                },
            ]

    raise RespuestaLLMInvalida("El modelo devolvió una ficha con formato inválido.")
