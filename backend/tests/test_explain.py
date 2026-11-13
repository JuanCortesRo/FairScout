from app.pipeline.explain import CITA_NO_VERIFICADA, SIN_INFORMACION, explicar
from app.schemas import EvaluacionRequisito, Requisito


def _req(id_, nombre, tipo="obligatorio"):
    return Requisito(id=id_, nombre=nombre, tipo=tipo, categoria="tecnica")


def _ev(id_, resultado, verificada=True, cita="cita"):
    return EvaluacionRequisito(
        requisito_id=id_, resultado=resultado, cita=None if resultado == "sin_informacion" else cita,
        lineas=[] if resultado == "sin_informacion" else ["p1-l1"], justificacion=f"Motivo {id_}.",
        cita_verificada=verificada,
    )


def test_clasifica_cada_requisito_segun_su_resultado_ya_verificado():
    requisitos = [
        _req("R1", "Python"), _req("R2", "Bases de datos relacionales"), _req("R3", "AWS"),
        _req("R4", "Inglés B2", "deseable"), _req("R5", "Docker", "deseable"),
        _req("R6", "Kubernetes", "deseable"), _req("R7", "Solo Azure", "descalificante"),
        _req("R8", "Sin tarjeta profesional", "descalificante"),
    ]
    evaluaciones = [
        _ev("R1", "cumple"), _ev("R2", "equivalente"), _ev("R3", "parcial"),
        _ev("R4", "sin_informacion"), _ev("R5", "cumple", verificada=False), _ev("R6", "no_cumple"),
        _ev("R7", "ausente"), _ev("R8", "presente"),
    ]

    explicacion = explicar(evaluaciones, requisitos)

    assert explicacion.fortalezas == ["Python: Motivo R1.", "Bases de datos relacionales: Motivo R2."]
    assert explicacion.brechas == [
        "AWS: Motivo R3.", "Kubernetes: Motivo R6.", "Sin tarjeta profesional (descalificante): Motivo R8.",
    ]
    assert explicacion.aspectos_por_verificar == [
        f"Inglés B2: {SIN_INFORMACION}", f"Docker: {CITA_NO_VERIFICADA}",
    ]


def test_requisito_sin_evaluacion_queda_por_verificar():
    explicacion = explicar([], [_req("R1", "Python")])
    assert explicacion.aspectos_por_verificar == [f"Python: {SIN_INFORMACION}"]
    assert explicacion.fortalezas == explicacion.brechas == []
