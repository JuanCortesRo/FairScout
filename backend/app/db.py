"""Conexión a la base de datos con SQLAlchemy.

Por defecto usa SQLite local (sqlite:///./data.db). En docker compose se usa Postgres
mediante DATABASE_URL=postgresql+psycopg://...
"""
from collections.abc import Iterator

from sqlalchemy import Engine, create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

_connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(settings.DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@event.listens_for(Engine, "connect")
def _activar_llaves_foraneas_sqlite(conexion_dbapi, _registro) -> None:
    # SQLite ignora las llaves foráneas (y el ON DELETE CASCADE) si no se activan en cada conexión.
    if type(conexion_dbapi).__module__.startswith("sqlite3"):
        cursor = conexion_dbapi.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


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
            "fecha_creacion": "TIMESTAMP WITH TIME ZONE",
        },
        "candidatos": {
            "alertas": "JSON NOT NULL DEFAULT '[]'",
            "vacante_id": "VARCHAR(32)",
            "fecha_creacion": "TIMESTAMP WITH TIME ZONE",
        },
        "evaluaciones": {
            "fecha_creacion": "TIMESTAMP WITH TIME ZONE",
        },
        "entrevistas": {
            "token_hash": "VARCHAR(64)",
            "expira_at": "TIMESTAMP",
            "consent_at": "TIMESTAMP",
            "started_at": "TIMESTAMP",
            "finished_at": "TIMESTAMP",
            "revoked_at": "TIMESTAMP",
        },
    }
    # Datos personales que ya no se guardan: se eliminan también de las bases existentes.
    columnas_eliminadas = {"candidatos": ("lineas_originales", "nombre_archivo")}
    inspector = inspect(engine)
    with engine.begin() as conexion:
        for tabla, columnas in columnas_nuevas.items():
            existentes = {columna["name"] for columna in inspector.get_columns(tabla)}
            for nombre, definicion in columnas.items():
                if nombre not in existentes:
                    conexion.execute(text(f"ALTER TABLE {tabla} ADD COLUMN {nombre} {definicion}"))
        for tabla, columnas in columnas_eliminadas.items():
            existentes = {columna["name"] for columna in inspector.get_columns(tabla)}
            for nombre in columnas:
                if nombre in existentes:
                    conexion.execute(text(f"ALTER TABLE {tabla} DROP COLUMN {nombre}"))
        if "entrevistas" in inspector.get_table_names():
            conexion.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_entrevistas_token_hash "
                "ON entrevistas(token_hash)"
            ))
