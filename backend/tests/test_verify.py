from app.pipeline.verify import verificar_citas
from app.schemas import EvaluacionRequisito, Linea


def _evaluacion(**cambios):
    valores = {
        "requisito_id": "R1",
        "resultado": "cumple",
        "cita": "Experiencia con Python",
        "lineas": ["p1-l1"],
        "justificacion": "La evidencia lo demuestra.",
    }
    valores.update(cambios)
    return EvaluacionRequisito(**valores)


def test_verificar_cita_existente():
    resultado = verificar_citas(
        [_evaluacion()],
        [Linea(id="p1-l1", texto="Experiencia con Python durante 3 años.", bbox=(0, 0, 1, 1))],
    )
    assert resultado[0].cita_verificada is True


def test_verificar_rechaza_linea_inexistente():
    resultado = verificar_citas(
        [_evaluacion(lineas=["p1-l9"])],
        [Linea(id="p1-l1", texto="Experiencia con Python.", bbox=(0, 0, 1, 1))],
    )
    assert resultado[0].cita_verificada is False


def test_verificar_no_acepta_dato_personal():
    resultado = verificar_citas(
        [_evaluacion(cita="ana@example.com")],
        [Linea(id="p1-l1", texto="ana@example.com", bbox=(0, 0, 1, 1))],
    )
    assert resultado[0].cita_verificada is False


def test_sin_informacion_conserva_cita_vacia():
    resultado = verificar_citas(
        [_evaluacion(resultado="sin_informacion", cita=None, lineas=[])],
        [],
    )
    assert resultado[0].cita_verificada is False
