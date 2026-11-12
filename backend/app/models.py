"""Modelos SQLAlchemy para vacantes y sus requisitos."""
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class VacanteDB(Base):
    __tablename__ = "vacantes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    titulo: Mapped[str] = mapped_column(String(300), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
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
