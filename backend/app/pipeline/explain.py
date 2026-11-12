from app.schemas import EvaluacionRequisito, Ficha, ResultadoCandidato


async def explicar(resultado: ResultadoCandidato, evaluaciones: list[EvaluacionRequisito], ficha: Ficha) -> dict:
    """Paso 9 (LLM, llamada 3). A partir de resultados YA calculados, genera en español: fortalezas,
    brechas, aspectos por verificar y por qué se recomienda (o no) entrevistar.
    """

    fortalezas = [
        evaluacion.justificacion
        for evaluacion in evaluaciones
        if evaluacion.resultado in {"cumple", "equivalente"} and evaluacion.cita_verificada
    ]
    brechas = [
        evaluacion.justificacion
        for evaluacion in evaluaciones
        if evaluacion.resultado in {"parcial", "no_cumple", "presente"}
    ]
    aspectos = [
        evaluacion.justificacion
        for evaluacion in evaluaciones
        if evaluacion.resultado == "sin_informacion" or (evaluacion.cita and not evaluacion.cita_verificada)
    ]
    return {
        "fortalezas": fortalezas,
        "brechas": brechas,
        "aspectos_por_verificar": aspectos,
        "motivo_estado": resultado.motivo_estado,
    }
