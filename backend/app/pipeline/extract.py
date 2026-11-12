import logging
import re
from datetime import datetime, timezone

from pydantic import ValidationError

from app.config import settings
from app.llm import cargar_prompt, extract_json, get_client, texto_de_respuesta
from app.pipeline.anonymize import anonimizar_con_metadatos
from app.schemas import Ficha, Linea

log = logging.getLogger(__name__)
_LINE_ID = re.compile(r"^p\d+-l\d+$")


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

    ids = [linea.id for linea in lineas]
    if any(not _LINE_ID.fullmatch(linea_id) for linea_id in ids):
        raise RespuestaLLMInvalida("Las líneas no tienen identificadores de trazabilidad válidos.")
    if len(ids) != len(set(ids)):
        raise RespuestaLLMInvalida("El documento contiene identificadores de línea duplicados.")

    verificacion = anonimizar_con_metadatos(lineas)
    if any(
        original.texto != anonimo.texto
        for original, anonimo in zip(lineas, verificacion.lineas_anonimizadas)
    ) or "posible_fuga_personal" in verificacion.alertas:
        raise RespuestaLLMInvalida(
            "El documento no superó la verificación de anonimización y no se enviará al modelo."
        )

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

    log.info(
        "Iniciando extracción: modelo=%s prompt=%s fecha=%s lineas=%d",
        settings.MODELO_EXTRACCION,
        settings.PROMPT_VERSION,
        datetime.now(timezone.utc).isoformat(),
        len(lineas),
    )
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
        if message.stop_reason != "end_turn":
            raise RespuestaLLMInvalida(
                f"La respuesta del modelo quedó incompleta (stop_reason={message.stop_reason})."
            )

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
            if any(not _LINE_ID.fullmatch(evidencia) for evidencia in ids_usados):
                raise ValueError("La ficha contiene evidencias con formato inválido.")
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
