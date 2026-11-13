"""scoring.py debe dar exactamente lo mismo que frontend/src/lib/scoring.js.

Los casos y la salida esperada los genera `node frontend/scripts/casos_scoring.mjs` ejecutando scoring.js.
"""
import json
from pathlib import Path

import pytest

from app.pipeline.scoring import calcular_con_desglose, calcular_resultado, ordenar_ranking
from app.schemas import EvaluacionRequisito, Requisito

DATOS = json.loads((Path(__file__).parent / "fixtures" / "casos_scoring.json").read_text(encoding="utf-8"))


def _entrada(caso):
    requisitos = [Requisito(**r) for r in caso["requisitos"]]
    evaluaciones = [EvaluacionRequisito(**e) for e in caso["evaluaciones"]]
    return evaluaciones, requisitos


@pytest.mark.parametrize("caso", DATOS["casos"], ids=lambda c: c["nombre"])
def test_igual_que_scoring_js(caso):
    evaluaciones, requisitos = _entrada(caso)
    resultado, desglose = calcular_con_desglose(
        evaluaciones,
        requisitos,
        caso["esperado"]["candidato_id"],
        caso["alertas"],
        caso["peso_obligatorios"],
    )

    assert resultado.model_dump() == pytest.approx(caso["esperado"])
    assert desglose.cobertura == pytest.approx(caso["desglose"]["cobertura"])
    assert desglose.motivos_confianza == caso["desglose"]["motivos_confianza"]
    assert desglose.categorias == pytest.approx(caso["desglose"]["categorias"])
    assert desglose.citas_sin_verificar == caso["desglose"]["citas_sin_verificar"]


def test_ranking_igual_que_scoring_js():
    requisitos = [Requisito(**r) for r in DATOS["ranking_requisitos"]]
    resultados = [
        calcular_resultado(
            [EvaluacionRequisito(**e) for e in c["evaluaciones"]], requisitos, c["candidato_id"], c["alertas"]
        )
        for c in DATOS["ranking_candidatos"]
    ]

    ordenados = ordenar_ranking(resultados)

    assert [r.candidato_id for r in ordenados] == DATOS["ranking_esperado"]
    assert len(ordenados) == len(resultados)  # no recorta a un top-N


def test_equivalente_vale_0_8_y_sigue_cumpliendo():
    """§7: equivalente solo si es real y defendible (PostgreSQL para "bases de datos relacionales";
    Azure NO es equivalente de AWS). Vale 0,8, no 1, y no saca al candidato de "cumple"."""
    requisitos = [Requisito(id="o1", nombre="Bases de datos relacionales", tipo="obligatorio", categoria="tecnica")]
    ev = EvaluacionRequisito(
        requisito_id="o1",
        resultado="equivalente",
        cita="3 años administrando PostgreSQL",
        lineas=["p1-l4"],
        justificacion="PostgreSQL es una base de datos relacional.",
        cita_verificada=True,
    )

    resultado = calcular_resultado([ev], requisitos, "cand-1")

    assert resultado.puntaje == 80
    assert resultado.estado == "cumple"


def test_sin_informacion_obligatoria_queda_pendiente_aunque_otro_sea_parcial():
    requisitos = [
        Requisito(id="o1", nombre="Python", tipo="obligatorio", categoria="tecnica"),
        Requisito(id="o2", nombre="SQL", tipo="obligatorio", categoria="tecnica"),
    ]
    evaluaciones = [
        EvaluacionRequisito(
            requisito_id="o1", resultado="parcial", cita="Conocimientos básicos",
            lineas=["p1-l1"], justificacion="Evidencia parcial.", cita_verificada=True,
        ),
        EvaluacionRequisito(
            requisito_id="o2", resultado="sin_informacion", cita=None,
            lineas=[], justificacion="No se menciona.", cita_verificada=False,
        ),
    ]

    resultado = calcular_resultado(evaluaciones, requisitos, "cand-1")

    assert resultado.estado == "pendiente_verificar"


def test_incumplimiento_explicito_prevalece_sobre_informacion_faltante():
    requisitos = [
        Requisito(id="o1", nombre="Python", tipo="obligatorio", categoria="tecnica"),
        Requisito(id="o2", nombre="SQL", tipo="obligatorio", categoria="tecnica"),
    ]
    evaluaciones = [
        EvaluacionRequisito(
            requisito_id="o1", resultado="no_cumple", cita="No tiene experiencia con Python",
            lineas=["p1-l1"], justificacion="El CV contradice el requisito.", cita_verificada=True,
        ),
        EvaluacionRequisito(
            requisito_id="o2", resultado="sin_informacion", cita=None,
            lineas=[], justificacion="No se menciona.", cita_verificada=False,
        ),
    ]

    resultado = calcular_resultado(evaluaciones, requisitos, "cand-1")

    assert resultado.estado == "no_cumple"


def test_cumplir_obligatorios_no_depende_de_los_deseables():
    requisitos = [
        Requisito(id="o1", nombre="Python", tipo="obligatorio", categoria="tecnica"),
        Requisito(id="d1", nombre="Docker", tipo="deseable", categoria="tecnica"),
    ]
    evaluaciones = [
        EvaluacionRequisito(
            requisito_id="o1", resultado="cumple", cita="Experiencia con Python",
            lineas=["p1-l1"], justificacion="Cumple el requisito.", cita_verificada=True,
        ),
        EvaluacionRequisito(
            requisito_id="d1", resultado="no_cumple", cita="No ha usado Docker",
            lineas=["p1-l2"], justificacion="No cumple el deseable.", cita_verificada=True,
        ),
    ]

    resultado = calcular_resultado(evaluaciones, requisitos, "cand-1")

    assert resultado.puntaje == 60
    assert resultado.estado == "cumple"
