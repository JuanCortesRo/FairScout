"""Configuración leída de variables de entorno (y de un archivo .env si existe)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ANTHROPIC_API_KEY: str = ""
    DATABASE_URL: str = "sqlite:///./data.db"
    FRONTEND_URL: str = "http://localhost:5173"
    MODELO_EXTRACCION: str = "claude-haiku-5-5"
    MODELO_EVALUACION: str = "claude-sonnet-5-5"
    PROMPT_VERSION: str = "v1"
    UPLOADS_DIR: str = "uploads"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
