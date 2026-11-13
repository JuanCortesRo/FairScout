"""Configuración leída de variables de entorno (y de un archivo .env si existe)."""
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración validada que se carga desde el entorno y `.env`."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ANTHROPIC_API_KEY: str = ""
    DATABASE_URL: str = "sqlite:///./data.db"
    FRONTEND_URL: str = "http://localhost:5173"
    MODELO_EXTRACCION: str = "claude-haiku-5-5"
    MODELO_EVALUACION: str = "claude-haiku-5-5"
    PROMPT_VERSION: str = "v1"
    LLM_TIMEOUT_SECONDS: float = 60.0
    UPLOADS_DIR: str = "uploads"
    LIBREOFFICE_PATH: str = ""
    EVALUACIONES_CONCURRENTES: int = 5   # llamadas al LLM en paralelo al evaluar un lote

    @model_validator(mode="after")
    def validar_modelos(self) -> "Settings":
        """Impide que un campo de modelo se use accidentalmente para almacenar una API key."""
        for nombre in ("MODELO_EXTRACCION", "MODELO_EVALUACION"):
            valor = getattr(self, nombre)
            if valor.startswith("sk-"):
                raise ValueError(f"{nombre} debe contener un ID de modelo, no una API key.")
        return self


@lru_cache
def get_settings() -> Settings:
    """Construye la configuración una sola vez para reutilizarla en toda la aplicación."""
    return Settings()


settings = get_settings()
