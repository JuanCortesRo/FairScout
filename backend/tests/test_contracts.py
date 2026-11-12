from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas import (
    Candidato,
    Competencia,
    ExperienciaLaboral,
    PerfilProfesional,
    PonderacionRequisitos,
    RequisitoContrato,
    RequisitosVacante,
    ValidacionCandidato,
    Vacante,
    calcular_experiencia_total,
)


def evidencia() -> list[str]:
    return ["p1-l1"]


def test_vacante_json_round_trip():
    vacante = Vacante(
        vacante_id="VAC-001",
        titulo="Backend Developer",
        descripcion="Construir APIs.",
        idioma_descripcion="es",
        fecha_creacion=date(2026, 11, 11),
    )
    recuperada = Vacante.model_validate_json(vacante.model_dump_json())
    assert recuperada.vacante_id == "VAC-001"


def test_vacante_rechaza_modalidad_invalida():
    with pytest.raises(ValidationError):
        Vacante(
            vacante_id="VAC-001", titulo="x", descripcion="y",
            idioma_descripcion="es", fecha_creacion=date.today(), modalidad="hibrido",
        )


def test_requisitos_validan_ids_peso_y_confirmacion():
    requisito = RequisitoContrato(
        requisito_id="REQ-001", nombre="Python", descripcion="Experiencia.",
        tipo="obligatorio", categoria="tecnica",
    )
    contrato = RequisitosVacante(
        vacante_id="VAC-001", version=1, requisitos=[requisito],
        estado="confirmado", confirmado_por_reclutador=True,
    )
    assert contrato.ponderacion.obligatorios == 60
    with pytest.raises(ValidationError):
        RequisitosVacante(
            vacante_id="VAC-001", version=1,
            requisitos=[requisito, requisito],
        )
    with pytest.raises(ValidationError):
        PonderacionRequisitos(obligatorios=50, deseables=40)


def test_requisito_descalificante_no_tiene_peso():
    with pytest.raises(ValidationError):
        RequisitoContrato(
            requisito_id="REQ-001", nombre="x", descripcion="y",
            tipo="descalificante", categoria="otro", peso=1,
        )


def test_candidato_y_experiencia_total_no_cuentan_solapamientos():
    experiencias = [
        ExperienciaLaboral(
            cargo="Backend", empresa="A", fecha_inicio="2020-01", fecha_fin="2022-01",
            evidencias=evidencia(),
        ),
        ExperienciaLaboral(
            cargo="Consultor", empresa="B", fecha_inicio="2021-01", fecha_fin="2023-01",
            evidencias=evidencia(),
        ),
    ]
    total, inconsistencias = calcular_experiencia_total(experiencias)
    assert total == 3.0
    assert inconsistencias == []

    candidato = Candidato(
        candidato_id="CAN-001", documento_id="DOC-001", idioma_cv="es",
        perfil_profesional=PerfilProfesional(resumen="Backend developer"),
        experiencia_laboral=experiencias, competencias_tecnicas=[
            Competencia(nombre="Python", categoria="lenguaje", evidencias=evidencia()),
        ],
        validacion=ValidacionCandidato(datos_normalizados=True, evidencias_conservadas=True),
    )
    assert candidato.model_validate_json(candidato.model_dump_json()).candidato_id == "CAN-001"


def test_experiencia_rechaza_fecha_invalida():
    with pytest.raises(ValidationError):
        ExperienciaLaboral(
            cargo="Backend", empresa="A", fecha_inicio="2024-13",
            fecha_fin="2025-01", evidencias=evidencia(),
        )
