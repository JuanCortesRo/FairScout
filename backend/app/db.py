"""Conexión a la base de datos con SQLAlchemy.

Por defecto usa SQLite local (sqlite:///./data.db). En docker compose se usa Postgres
mediante DATABASE_URL=postgresql+psycopg://...
"""
from collections.abc import Iterator

from sqlalchemy import create_engine
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
