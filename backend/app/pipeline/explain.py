from app.schemas import EvaluacionRequisito, Ficha, ResultadoCandidato


async def explicar(resultado: ResultadoCandidato, evaluaciones: list[EvaluacionRequisito], ficha: Ficha) -> dict:
    """Paso 9 (LLM, llamada 3). A partir de resultados YA calculados, genera en español: fortalezas,
    brechas, aspectos por verificar y por qué se recomienda (o no) entrevistar.

    TODO: implementar.
    """
    raise NotImplementedError
