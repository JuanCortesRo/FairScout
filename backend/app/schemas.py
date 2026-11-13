"""Modelos Pydantic: contratos con el frontend, el LLM y persistencia.

No cambiarla sin avisar. Al final van los modelos de entrada/salida de la API.
"""
from datetime import date
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

class Linea(BaseModel):
    id: str                      # "p1-l3"
    texto: str
    bbox: tuple[float, float, float, float]
    origen: Literal["digital", "ocr"] = "digital"

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


class ExplicacionEvaluacion(BaseModel):
    fortalezas: list[str] = Field(default_factory=list)
    brechas: list[str] = Field(default_factory=list)
    aspectos_por_verificar: list[str] = Field(default_factory=list)


class TrazabilidadEvaluacion(BaseModel):
    modelo: str
    version_prompt: str
    fecha_evaluacion: str
    candidato_id: str
    vacante_id: str
    version_requisitos: int


class EvaluacionSalida(BaseModel):
    evaluacion_id: str
    candidato_id: str
    vacante_id: str
    version_requisitos: int = Field(ge=1)
    evaluaciones: list[EvaluacionRequisito]
    explicacion: ExplicacionEvaluacion
    trazabilidad: TrazabilidadEvaluacion
    # Calculado en código por pipeline/scoring.py, nunca por el LLM.
    resultado: "ResultadoCandidato"
    motivos_confianza: list[str] = Field(default_factory=list)

class ResultadoCandidato(BaseModel):   # calculado por Python, paso 7
    candidato_id: str
    puntaje: float                     # 0-100
    estado: Literal["cumple", "cumple_parcialmente", "no_cumple"]
    confianza: Literal["alta", "media", "baja"]
    recomendado_entrevista: bool
    motivo_estado: str                 # p. ej. "Falta obligatorio: inglés B2"


# ── Entrada/salida de la API (no forman parte de la sección 8) ──────────────
class VacanteEntrada(BaseModel):
    descripcion: str = Field(..., min_length=20, description="Texto libre de la descripción del cargo")


class VacanteActualizacion(BaseModel):
    titulo: str = Field(..., min_length=1, max_length=300)
    descripcion: str = Field(..., min_length=20)
    requisitos: list[Requisito]


class RequisitoBloqueado(BaseModel):
    requisito: Requisito
    motivo: str


class VacanteSalida(BaseModel):
    titulo: str
    requisitos: list[Requisito]
    id: str | None = None
    # Propuestos por el LLM pero descartados por usar un dato protegido (edad, género, nacionalidad...).
    requisitos_bloqueados: list[RequisitoBloqueado] = []


class CVSubido(BaseModel):
    id: str
    nombre_archivo: str
    lineas: list[Linea] = []
    ficha: Ficha | None = None
    estado: Literal["processed", "needs_review", "failed"] = "processed"
    alertas: list[str] = []


class CargaCVsSalida(BaseModel):
    archivos: list[CVSubido]


class EvaluacionEntrada(BaseModel):
    candidato_id: str = Field(..., min_length=1)
    vacante_id: str = Field(..., min_length=1)


class ErrorEvaluacion(BaseModel):
    candidato_id: str
    detalle: str


class EvaluacionLoteSalida(BaseModel):
    vacante_id: str
    evaluados: int
    omitidos: int                      # ya tenían evaluación con la versión vigente de los requisitos
    errores: list[ErrorEvaluacion] = []


class CandidatoEnRevision(BaseModel):
    """CV que no se envió al LLM por una alerta crítica (prompt injection, posible dato personal)."""
    candidato_id: str
    nombre_archivo: str
    alertas: list[str]


class RankingSalida(BaseModel):
    vacante_id: str | None = None
    peso_obligatorios: float = 60      # % del puntaje para obligatorios; los deseables valen el resto
    candidatos: list[ResultadoCandidato]   # todos, ordenados por estado y puntaje (sin top-N)
    en_revision: list[CandidatoEnRevision] = []   # fuera del ranking: requieren revisión humana


# Contratos versionados de vacancy.json, requirements.json y candidate.json.
_YEAR_MONTH = re.compile(r"^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$")
_EVIDENCE_ID = re.compile(r"^p\d+-l\d+$")
_EMAIL = re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b")
_PHONE = re.compile(r"(?<!\w)(?:\+\d{1,3}[\s.-]?)?(?:\d[\s.-]?){7,14}\d(?!\w)")


class ContratoBase(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Vacante(ContratoBase):
    vacante_id: str = Field(..., min_length=1)
    titulo: str = Field(..., min_length=1)
    empresa: str | None = None
    descripcion: str = Field(..., min_length=1)
    ubicacion: str | None = None
    modalidad: Literal["presencial", "híbrido", "remoto"] | None = None
    nivel: Literal["trainee", "junior", "semi_senior", "senior", "lead"] | None = None
    idioma_descripcion: str = Field(..., min_length=2, max_length=10)
    estado: Literal["activa", "pausada", "cerrada"] = "activa"
    fecha_creacion: date
    version_requisitos: int = Field(default=1, ge=1)

    @model_validator(mode="after")
    def validar_texto(self) -> "Vacante":
        if not self.titulo.strip() or not self.descripcion.strip():
            raise ValueError("titulo y descripcion no pueden estar vacíos")
        return self


class CriteriosEvaluacion(ContratoBase):
    tecnologia: str | None = None
    tecnologias_equivalentes: list[str] = Field(default_factory=list)
    minimo_anios: float | None = Field(default=None, ge=0)
    nivel_idioma: Literal["A1", "A2", "B1", "B2", "C1", "C2"] | None = None
    formacion: str | None = None
    certificacion: str | None = None
    condicion: str | None = None


class PonderacionRequisitos(ContratoBase):
    obligatorios: float = Field(default=60, ge=0, le=100)
    deseables: float = Field(default=40, ge=0, le=100)

    @model_validator(mode="after")
    def suma_cien(self) -> "PonderacionRequisitos":
        if self.obligatorios + self.deseables != 100:
            raise ValueError("las ponderaciones deben sumar 100")
        return self


class RequisitoContrato(ContratoBase):
    requisito_id: str = Field(..., min_length=1)
    nombre: str = Field(..., min_length=1)
    descripcion: str = Field(..., min_length=1)
    tipo: Literal["obligatorio", "deseable", "descalificante"]
    categoria: str = Field(..., min_length=1)
    peso: float | None = Field(default=1, gt=0)
    criterios_evaluacion: CriteriosEvaluacion = Field(default_factory=CriteriosEvaluacion)

    @model_validator(mode="after")
    def validar_peso(self) -> "RequisitoContrato":
        if self.tipo == "descalificante" and self.peso is not None:
            raise ValueError("un requisito descalificante no puede tener peso")
        return self


class RequisitosVacante(ContratoBase):
    vacante_id: str = Field(..., min_length=1)
    version: int = Field(..., ge=1)
    estado: Literal["pendiente", "confirmado", "archivado"] = "pendiente"
    requisitos: list[RequisitoContrato]
    ponderacion: PonderacionRequisitos = Field(default_factory=PonderacionRequisitos)
    confirmado_por_reclutador: bool = False

    @model_validator(mode="after")
    def validar_requisitos(self) -> "RequisitosVacante":
        ids = [requisito.requisito_id for requisito in self.requisitos]
        if len(ids) != len(set(ids)):
            raise ValueError("los requisito_id deben ser únicos")
        if self.estado == "confirmado" and not self.confirmado_por_reclutador:
            raise ValueError("los requisitos confirmados requieren confirmación del reclutador")
        return self


def _evidencias_validas(evidencias: list[str]) -> bool:
    return bool(evidencias) and all(_EVIDENCE_ID.fullmatch(evidencia) for evidencia in evidencias)


class Tecnologia(ContratoBase):
    nombre: str = Field(..., min_length=1)
    evidencias: list[str]

    @model_validator(mode="after")
    def validar_evidencias(self) -> "Tecnologia":
        if not _evidencias_validas(self.evidencias):
            raise ValueError("las evidencias deben usar el formato pN-lN")
        return self


class CargoActual(ContratoBase):
    valor: str = Field(..., min_length=1)
    evidencias: list[str]


class PerfilProfesional(ContratoBase):
    resumen: str = Field(..., min_length=1)
    cargo_actual: CargoActual | None = None


class ExperienciaLaboral(ContratoBase):
    cargo: str = Field(..., min_length=1)
    empresa: str = Field(..., min_length=1)
    fecha_inicio: str
    fecha_fin: str | None = None
    es_actual: bool = False
    descripcion: str | None = None
    tecnologias: list[Tecnologia] = Field(default_factory=list)
    evidencias: list[str]

    @model_validator(mode="after")
    def validar_fechas(self) -> "ExperienciaLaboral":
        if not _YEAR_MONTH.fullmatch(self.fecha_inicio):
            raise ValueError("fecha_inicio debe tener formato AAAA-MM")
        if self.es_actual and self.fecha_fin not in (None, "actual"):
            raise ValueError("una experiencia actual debe terminar en actual")
        if self.fecha_fin not in (None, "actual") and not _YEAR_MONTH.fullmatch(self.fecha_fin):
            raise ValueError("fecha_fin debe tener formato AAAA-MM o actual")
        return self


class FormacionAcademica(ContratoBase):
    titulo: str = Field(..., min_length=1)
    institucion: str = Field(..., min_length=1)
    fecha_inicio: str | None = None
    fecha_fin: str | None = None
    estado: Literal["en_curso", "finalizada", "incompleta"]
    evidencias: list[str]


class Certificacion(ContratoBase):
    nombre: str = Field(..., min_length=1)
    entidad: str = Field(..., min_length=1)
    fecha: str | None = None
    evidencias: list[str]


class IdiomaContrato(ContratoBase):
    idioma: str = Field(..., min_length=1)
    nivel: Literal["A1", "A2", "B1", "B2", "C1", "C2"] | None = None
    evidencias: list[str]


class Competencia(ContratoBase):
    nombre: str = Field(..., min_length=1)
    categoria: str = Field(..., min_length=1)
    evidencias: list[str]


class Inconsistencia(ContratoBase):
    tipo: str = Field(..., min_length=1)
    descripcion: str = Field(..., min_length=1)
    evidencias: list[str] = Field(default_factory=list)


class ValidacionCandidato(ContratoBase):
    datos_normalizados: bool
    evidencias_conservadas: bool


class Candidato(ContratoBase):
    candidato_id: str = Field(..., min_length=1)
    documento_id: str = Field(..., min_length=1)
    version_esquema: str = "1.0"
    idioma_cv: str = Field(..., min_length=2, max_length=10)
    perfil_profesional: PerfilProfesional
    experiencia_laboral: list[ExperienciaLaboral] = Field(default_factory=list)
    formacion_academica: list[FormacionAcademica] = Field(default_factory=list)
    certificaciones: list[Certificacion] = Field(default_factory=list)
    idiomas: list[IdiomaContrato] = Field(default_factory=list)
    competencias_tecnicas: list[Competencia] = Field(default_factory=list)
    competencias_blandas: list[Competencia] = Field(default_factory=list)
    experiencia_total_anios: float = Field(default=0, ge=0)
    inconsistencias: list[Inconsistencia] = Field(default_factory=list)
    validacion: ValidacionCandidato

    @model_validator(mode="after")
    def rechazar_datos_personales(self) -> "Candidato":
        valores = str(self.model_dump())
        if _EMAIL.search(valores) or _PHONE.search(valores):
            raise ValueError("candidate.json no puede contener correo ni teléfono")
        return self


def calcular_experiencia_total(experiencias: list[ExperienciaLaboral]) -> tuple[float, list[Inconsistencia]]:
    """Calcula años de periodos laborales unidos y reporta fechas inconsistentes."""
    periodos: list[tuple[int, int]] = []
    inconsistencias: list[Inconsistencia] = []
    for experiencia in experiencias:
        inicio = int(experiencia.fecha_inicio[:4]) * 12 + int(experiencia.fecha_inicio[5:])
        fin_texto = experiencia.fecha_fin
        if fin_texto in (None, "actual"):
            fin = date.today().year * 12 + date.today().month
        else:
            fin = int(fin_texto[:4]) * 12 + int(fin_texto[5:])
        if fin < inicio:
            inconsistencias.append(Inconsistencia(
                tipo="fecha_invalida",
                descripcion="El periodo laboral termina antes de comenzar.",
                evidencias=experiencia.evidencias,
            ))
            continue
        periodos.append((inicio, fin))
    periodos.sort()
    unidos: list[list[int]] = []
    for inicio, fin in periodos:
        if unidos and inicio <= unidos[-1][1]:
            unidos[-1][1] = max(unidos[-1][1], fin)
        else:
            unidos.append([inicio, fin])
    meses = sum(fin - inicio for inicio, fin in unidos)
    return round(meses / 12, 2), inconsistencias
