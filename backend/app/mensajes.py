"""Mensajes de error para el usuario: sin términos técnicos (API, modelo, JSON, llaves...).

El detalle técnico de cada error se escribe en el log del servidor; al usuario solo le llega qué pasó y qué hacer.
"""
import logging

import anthropic
from fastapi import HTTPException

from app.llm import LLMNoConfigurado

log = logging.getLogger(__name__)

IA_NO_DISPONIBLE = "El servicio de IA no está disponible en este momento. Intenta más tarde."
IA_OCUPADA = "La IA está muy ocupada. Intenta de nuevo en un momento."
ERROR_INESPERADO = "Ocurrió un error inesperado. Intenta de nuevo."
ARCHIVO_ILEGIBLE = "No pudimos leer este archivo. Prueba subirlo en PDF."
PDF_ILEGIBLE = "No pudimos abrir este PDF. Puede estar dañado o protegido con contraseña."


def error_de_ia(error: Exception, accion: str) -> HTTPException:
    """Traduce un error al llamar a la IA. `accion` completa la frase "La IA no pudo ...", p. ej. "evaluar este CV"."""
    if isinstance(error, (LLMNoConfigurado, anthropic.AuthenticationError, anthropic.PermissionDeniedError,
                          anthropic.NotFoundError)):
        log.error("La IA no está disponible al %s: %r", accion, error)
        return HTTPException(status_code=503, detail=IA_NO_DISPONIBLE)
    if isinstance(error, anthropic.RateLimitError) or (
        isinstance(error, anthropic.APIStatusError) and error.status_code == 529
    ):
        log.warning("Límite de uso de la IA al %s: %r", accion, error)
        return HTTPException(status_code=429, detail=IA_OCUPADA)
    if isinstance(error, (anthropic.APIConnectionError, anthropic.APIStatusError)):
        log.error("Falló la conexión con la IA al %s: %r", accion, error)
        return HTTPException(status_code=502, detail=IA_NO_DISPONIBLE)
    log.warning("La IA no pudo %s: %r", accion, error)
    return HTTPException(status_code=502, detail=f"La IA no pudo {accion}. Intenta de nuevo.")
