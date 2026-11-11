from app.schemas import EvaluacionRequisito, Requisito, ResultadoCandidato


def calcular_resultado(evaluaciones: list[EvaluacionRequisito], requisitos: list[Requisito]) -> ResultadoCandidato:
    """Pasos 7-8, solo código (nunca el LLM). Calcula puntaje (obligatorios 60% / deseables 40%),
    estado (cumple / cumple_parcialmente / no_cumple), confianza (alta / media / baja),
    recomendado_entrevista y motivo_estado según la sección 9.

    TODO: implementar.
    """
    raise NotImplementedError


def ordenar_ranking(resultados: list[ResultadoCandidato]) -> list[ResultadoCandidato]:
    """Paso 8. Ordena TODOS los candidatos (sin recortar a un top-N).

    TODO: implementar.
    """
    raise NotImplementedError
