"""LLM: descripción de la vacante → lista de requisitos tipificados (sección 6.1).

Flujo heredado del antiguo /api/parse-jd (prompt "responde solo JSON" + extract_json),
ahora con validación Pydantic y un reintento con el error en el mensaje (sección 20.2).
"""
import logging
import re

from pydantic import ValidationError

from app.config import settings
from app.llm import cargar_prompt, extract_json, get_client, texto_de_respuesta
from app.schemas import VacanteSalida

log = logging.getLogger(__name__)

_DATOS_PROTEGIDOS = (
    "edad",
    "sexo",
    "género",
    "genero",
    "nacionalidad",
    "nacimiento",
    "fecha de nacimiento",
    "estado civil",
    "tipo de sangre",
    "dirección",
    "direccion",
    "domicilio",
    "foto",
    "fotografia",
    "dni",
    "cedula",
    "pasaporte",
    "documento de identidad",
    "religion",
    "religión",
    "salud",
    "discapacidad",
    "orientacion sexual",
    "orientación sexual",
)


class RespuestaLLMInvalida(RuntimeError):
    """El LLM no devolvió requisitos válidos (o la respuesta fue truncada / rechazada)."""


def _normalizar_texto(texto: str) -> str:
    return re.sub(r"[\s_\-]+", " ", texto.lower()).strip()


def _contiene_datos_protegidos(texto: str) -> bool:
    texto_normalizado = _normalizar_texto(texto)
    return any(patron in texto_normalizado for patron in _DATOS_PROTEGIDOS)


def _validar_trabajo_protegido(propuesta: VacanteSalida) -> None:
    if _contiene_datos_protegidos(propuesta.titulo):
        raise RespuestaLLMInvalida("Los requisitos propuestos usan datos protegidos o sensibles y no pueden usarse.")
    for requisito in propuesta.requisitos:
        texto = f"{requisito.nombre} {requisito.categoria}"
        if _contiene_datos_protegidos(texto):
            raise RespuestaLLMInvalida(
                "Se bloqueó un requisito por incluir datos protegidos (edad, género, nacionalidad, dirección, etc.)."
            )


async def proponer_requisitos(descripcion: str) -> VacanteSalida:
    """Pide al LLM los requisitos de la vacante y los valida con Pydantic."""
    client = get_client()
    messages = [{
        "role": "user",
        "content": f"<descripcion_cargo>\n{descripcion}\n</descripcion_cargo>",
    }]

    for intento in range(2):
        message = await client.messages.create(
            model=settings.MODELO_EXTRACCION,
            max_tokens=16000,
            output_config={"effort": "low"},
            system=cargar_prompt("requisitos"),
            messages=messages,
        )
        if message.stop_reason == "refusal":
            raise RespuestaLLMInvalida("El modelo se negó a procesar esta descripción.")
        if message.stop_reason == "max_tokens":
            raise RespuestaLLMInvalida("La respuesta del modelo quedó incompleta. Intenta con una descripción más corta.")

        texto = texto_de_respuesta(message)
        try:
            propuesta = VacanteSalida.model_validate(extract_json(texto))
            _validar_trabajo_protegido(propuesta)
            return propuesta
        except RespuestaLLMInvalida:
            raise
        except (ValueError, ValidationError) as e:
            log.warning("Salida inválida del LLM (intento %d): %s", intento + 1, type(e).__name__)
            messages += [
                {"role": "assistant", "content": texto},
                {"role": "user", "content": f"Tu respuesta no cumple el formato pedido: {e}. "
                                            "Responde de nuevo solo con el objeto JSON corregido."},
            ]

    raise RespuestaLLMInvalida("El modelo devolvió requisitos con un formato inválido. Intenta de nuevo.")
