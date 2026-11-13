"""Cliente de Anthropic y utilidades para trabajar con respuestas del LLM."""
import json
import re
from functools import lru_cache
from pathlib import Path

from anthropic import AsyncAnthropic

from app.config import settings

PROMPTS_DIR = Path(__file__).parent / "prompts"


class LLMNoConfigurado(RuntimeError):
    """No hay ANTHROPIC_API_KEY configurada."""


@lru_cache
def get_client() -> AsyncAnthropic:
    """Devuelve el cliente asíncrono compartido; falla pronto si falta la clave."""
    if not settings.ANTHROPIC_API_KEY:
        raise LLMNoConfigurado("Falta configurar ANTHROPIC_API_KEY en el archivo .env del backend.")
    return AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=settings.LLM_TIMEOUT_SECONDS)


def cargar_prompt(nombre: str, version: str | None = None) -> str:
    """Lee app/prompts/<nombre>_<version>.md (versión por defecto: PROMPT_VERSION)."""
    version = version or settings.PROMPT_VERSION
    return (PROMPTS_DIR / f"{nombre}_{version}.md").read_text(encoding="utf-8")


def texto_de_respuesta(message) -> str:
    """Concatena los bloques de texto de una respuesta de messages.create."""
    return "".join(b.text for b in message.content if b.type == "text")


# Conservado del main.py original.
def extract_json(raw_text: str) -> dict:
    """Extrae un objeto JSON de texto plano, un bloque cercado o texto envolvente."""
    text = raw_text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    fence_match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', text, re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1))
        except json.JSONDecodeError:
            pass
    start, end = text.find('{'), text.rfind('}')
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end+1])
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Cannot extract JSON. First 200 chars: {text[:200]}")
