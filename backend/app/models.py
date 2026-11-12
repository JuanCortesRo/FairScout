"""Modelos SQLAlchemy para vacantes, candidatos y evaluaciones."""
from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class VacanteDB(Base):
    __tablename__ = "vacantes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    titulo: Mapped[str] = mapped_column(String(300), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    requisitos_confirmados: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    version_requisitos: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
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
    documento_id: Mapped[str] = mapped_column(String(32), nullable=False)
    nombre_archivo: Mapped[str] = mapped_column(String(300), nullable=False)
    estado: Mapped[str] = mapped_column(String(30), nullable=False)
    ficha: Mapped[dict] = mapped_column(JSON, nullable=False)
    lineas_anonimizadas: Mapped[list] = mapped_column(JSON, nullable=False)
    lineas_originales: Mapped[list] = mapped_column(JSON, nullable=False)
    # Tipos de alerta del documento ("prompt_injection", "hidden_text", "ocr", ...). Bajan la confianza del puntaje.
    alertas: Mapped[list] = mapped_column(JSON, nullable=False, default=list)


class EvaluacionDB(Base):
    __tablename__ = "evaluaciones"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    candidato_id: Mapped[str] = mapped_column(String(32), nullable=False)
    vacante_id: Mapped[str] = mapped_column(String(32), nullable=False)
    version_requisitos: Mapped[int] = mapped_column(Integer, nullable=False)
    resultado: Mapped[dict] = mapped_column(JSON, nullable=False)
