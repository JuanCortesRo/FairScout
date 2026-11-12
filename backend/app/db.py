"""Conexión a la base de datos con SQLAlchemy.

Por defecto usa SQLite local (sqlite:///./data.db). En docker compose se usa Postgres
mediante DATABASE_URL=postgresql+psycopg://...
"""
from collections.abc import Iterator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

_connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(settings.DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Clase base para los modelos ORM (aún no hay tablas definidas)."""


def get_db() -> Iterator[Session]:
    """Dependencia de FastAPI que entrega una sesión y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Crea las tablas declaradas por los modelos de la aplicación."""
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrar_columnas_existentes()


def _migrar_columnas_existentes() -> None:
    """Añade columnas nuevas a una SQLite/Postgres existente sin borrar datos."""
    columnas_nuevas = {
        "vacantes": {
            "requisitos_confirmados": "BOOLEAN NOT NULL DEFAULT FALSE",
            "version_requisitos": "INTEGER NOT NULL DEFAULT 1",
        },
    }
    inspector = inspect(engine)
    with engine.begin() as conexion:
        for tabla, columnas in columnas_nuevas.items():
            existentes = {columna["name"] for columna in inspector.get_columns(tabla)}
            for nombre, definicion in columnas.items():
                if nombre not in existentes:
                    conexion.execute(text(f"ALTER TABLE {tabla} ADD COLUMN {nombre} {definicion}"))
