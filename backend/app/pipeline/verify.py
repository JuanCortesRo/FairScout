from app.schemas import EvaluacionRequisito, Linea


def verificar_citas(evaluaciones: list[EvaluacionRequisito], lineas: list[Linea]) -> list[EvaluacionRequisito]:
    """Paso 6. Comprueba con rapidfuzz que cada cita exista en las líneas indicadas del CV
    y llena `cita_verificada`. Una cita no encontrada no es error: baja la confianza.

    TODO: implementar.
    """
    raise NotImplementedError
