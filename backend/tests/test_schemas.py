import pytest
from pydantic import ValidationError

from app.schemas import (
    EvaluacionRequisito,
    Experiencia,
    Ficha,
    Idioma,
    Linea,
    RankingSalida,
    Requisito,
    ResultadoCandidato,
    VacanteSalida,
)


def test_linea():
    linea = Linea(id="p1-l3", texto="Backend Developer, Acme Inc.", bbox=(72.0, 100.5, 300.0, 112.0))
    assert linea.bbox[0] == 72.0


def test_ficha_valida():
    ficha = Ficha(
        experiencias=[Experiencia(cargo="Backend Developer", empresa=None, inicio="2020-01", fin="actual",
                                  descripcion=None, lineas=["p1-l3", "p1-l4"])],
        formacion=[],
        certificaciones=[{"nombre": "AWS Solutions Architect", "lineas": ["p2-l1"]}],
        idiomas=[Idioma(idioma="Inglés", nivel="B2", lineas=["p2-l5"])],
        habilidades_tecnicas=["Python", "AWS"],
        competencias_blandas=["Trabajo en equipo"],
    )
    assert ficha.experiencias[0].fin == "actual"


def test_vacante_valida():
    vacante = VacanteSalida.model_validate({
        "titulo": "Desarrollador backend",
        "requisitos": [
            {"id": "R1", "nombre": "3 o más años con Python", "tipo": "obligatorio", "categoria": "experiencia"},
            {"id": "R2", "nombre": "Certificación AWS", "tipo": "deseable", "categoria": "certificacion", "peso": 2},
        ],
    })
    assert vacante.requisitos[0].peso == 1.0
    assert vacante.requisitos[1].peso == 2.0


def test_requisito_con_tipo_invalido_falla():
    with pytest.raises(ValidationError):
        Requisito(id="R1", nombre="x", tipo="opcional", categoria="tecnica")


def test_evaluacion_y_resultado():
    ev = EvaluacionRequisito(requisito_id="R1", resultado="cumple", cita="Python 2020-2024",
                             lineas=["p1-l7"], justificacion="Cuatro años con Python.")
    assert ev.cita_verificada is False
    resultado = ResultadoCandidato(candidato_id="017", puntaje=82.5, estado="cumple", confianza="alta",
                                   recomendado_entrevista=True, motivo_estado="Cumple todos los obligatorios")
    assert RankingSalida(candidatos=[resultado]).candidatos[0].estado == "cumple"


def test_resultado_con_estado_invalido_falla():
    with pytest.raises(ValidationError):
        ResultadoCandidato(candidato_id="1", puntaje=50, estado="apto", confianza="alta",
                           recomendado_entrevista=True, motivo_estado="x")
