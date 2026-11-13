"""Modelos SQLAlchemy para vacantes, candidatos y evaluaciones."""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _fecha_creacion() -> Mapped[datetime | None]:
    # Nullable solo por las filas creadas antes de existir la columna.
    return mapped_column(DateTime(timezone=True), nullable=True, default=_ahora)


class VacanteDB(Base):
    __tablename__ = "vacantes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    titulo: Mapped[str] = mapped_column(String(300), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    requisitos_confirmados: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    version_requisitos: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    fecha_creacion: Mapped[datetime | None] = _fecha_creacion()
    requisitos: Mapped[list["RequisitoDB"]] = relationship(
        back_populates="vacante",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class RequisitoDB(Base):
    __tablename__ = "requisitos"

    vacante_id: Mapped[str] = mapped_column(
        ForeignKey("vacantes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    nombre: Mapped[str] = mapped_column(String(500), nullable=False)
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    categoria: Mapped[str] = mapped_column(String(50), nullable=False)
    peso: Mapped[float] = mapped_column(nullable=False, default=1.0)

    vacante: Mapped[VacanteDB] = relationship(back_populates="requisitos")


class CandidatoDB(Base):
    __tablename__ = "candidatos"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    # Nullable solo por los CVs subidos antes de que existieran varias vacantes (no aparecen en ninguna).
    vacante_id: Mapped[str | None] = mapped_column(
        ForeignKey("vacantes.id", ondelete="CASCADE"), nullable=True, index=True
    )
    documento_id: Mapped[str] = mapped_column(String(32), nullable=False)
    estado: Mapped[str] = mapped_column(String(30), nullable=False)
    ficha: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Del CV solo se guarda el texto anonimizado: ni el archivo, ni su nombre, ni las líneas originales.
    lineas_anonimizadas: Mapped[list] = mapped_column(JSON, nullable=False)
    # Tipos de alerta del documento ("prompt_injection", "hidden_text", "ocr", ...). Bajan la confianza del puntaje.
    alertas: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # CVs de la misma vacante que parecen otra versión de este o del mismo candidato (ver pipeline/duplicados.py).
    similares: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    fecha_creacion: Mapped[datetime | None] = _fecha_creacion()


class ContactoCandidatoDB(Base):
    """Datos de contacto, separados de la evaluación. Ningún endpoint los devuelve: solo el ranking exportado."""

    __tablename__ = "contactos_candidato"

    candidato_id: Mapped[str] = mapped_column(
        ForeignKey("candidatos.id", ondelete="CASCADE"), primary_key=True
    )
    nombre: Mapped[str | None] = mapped_column(String(200), nullable=True)
    correo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(50), nullable=True)


class EvaluacionDB(Base):
    __tablename__ = "evaluaciones"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    candidato_id: Mapped[str] = mapped_column(
        ForeignKey("candidatos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vacante_id: Mapped[str] = mapped_column(
        ForeignKey("vacantes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_requisitos: Mapped[int] = mapped_column(Integer, nullable=False)
    resultado: Mapped[dict] = mapped_column(JSON, nullable=False)
    fecha_creacion: Mapped[datetime | None] = _fecha_creacion()


class ExportacionDB(Base):
    """Registro de cada ranking exportado: el archivo lleva datos de contacto y sale del sistema."""

    __tablename__ = "exportaciones"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    vacante_id: Mapped[str] = mapped_column(
        ForeignKey("vacantes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_ahora)
    top: Mapped[int | None] = mapped_column(Integer, nullable=True)       # None = todos
    peso_obligatorios: Mapped[float] = mapped_column(nullable=False)
    candidatos: Mapped[list] = mapped_column(JSON, nullable=False, default=list)   # ids incluidos, en orden


class EntrevistaDB(Base):
    """Estado durable de una entrevista (el contenido no guarda datos originales del CV)."""

    __tablename__ = "entrevistas"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    candidato_id: Mapped[str] = mapped_column(
        ForeignKey("candidatos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vacante_id: Mapped[str] = mapped_column(
        ForeignKey("vacantes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    estado: Mapped[str] = mapped_column(String(30), nullable=False, default="en_curso")
    token_hash: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    expira_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consent_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    plan: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    mensajes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    historial: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    pregunta_actual: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    informe: Mapped[dict | None] = mapped_column(JSON, nullable=True)
