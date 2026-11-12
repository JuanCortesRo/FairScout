"""Modelos Pydantic: contrato con el frontend y con el LLM.

No cambiarla sin avisar. Al final van los modelos de entrada/salida de la API.
"""
from pydantic import BaseModel
from typing import Literal

class Linea(BaseModel):
    id: str                      # "p1-l3"
    texto: str
    bbox: tuple[float, float, float, float]

class Experiencia(BaseModel):
    cargo: str | None
    empresa: str | None
    inicio: str | None           # "AAAA-MM"
    fin: str | None              # "AAAA-MM" o "actual"
    descripcion: str | None
    lineas: list[str]

class Formacion(BaseModel):
    titulo: str | None
    institucion: str | None
    nivel: str | None            # técnico, pregrado, especialización, maestría…
    fin: str | None
    lineas: list[str]

class Idioma(BaseModel):
    idioma: str
    nivel: str | None            # A1…C2 o descripción
    lineas: list[str]

class Ficha(BaseModel):          # salida del LLM, llamada 1
    experiencias: list[Experiencia]
    formacion: list[Formacion]
    certificaciones: list[dict]
    idiomas: list[Idioma]
    habilidades_tecnicas: list[str]
    competencias_blandas: list[str]

class Requisito(BaseModel):
    id: str
    nombre: str
    tipo: Literal["obligatorio", "deseable", "descalificante"]
    categoria: str
    peso: float = 1.0            # solo aplica a deseables

class EvaluacionRequisito(BaseModel):  # salida del LLM, llamada 2
    requisito_id: str
    # obligatorio / deseable:
    #   "cumple" | "equivalente" | "parcial" | "no_cumple" | "sin_informacion"
    # descalificante:
    #   "presente" | "ausente" | "sin_informacion"
    resultado: str
    cita: str | None
    lineas: list[str]
    justificacion: str
    cita_verificada: bool = False      # lo llena Python en el paso 6

class ResultadoCandidato(BaseModel):   # calculado por Python, paso 7
    candidato_id: str
    puntaje: float                     # 0-100
    estado: Literal["cumple", "cumple_parcialmente", "no_cumple"]
    confianza: Literal["alta", "media", "baja"]
    recomendado_entrevista: bool
    motivo_estado: str                 # p. ej. "Falta obligatorio: inglés B2"


# ── Entrada/salida de la API (no forman parte de la sección 8) ──────────────
from pydantic import Field 


class VacanteEntrada(BaseModel):
    descripcion: str = Field(..., min_length=20, description="Texto libre de la descripción del cargo")


class VacanteSalida(BaseModel):
    titulo: str
    requisitos: list[Requisito]
    id: str | None = None


class CVSubido(BaseModel):
    id: str
    nombre_archivo: str


class CargaCVsSalida(BaseModel):
    archivos: list[CVSubido]


class RankingSalida(BaseModel):
    vacante_id: str | None = None
    candidatos: list[ResultadoCandidato]
