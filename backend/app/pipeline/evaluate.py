from app.schemas import EvaluacionRequisito, Ficha, Requisito


async def evaluar(ficha: Ficha, requisitos: list[Requisito]) -> list[EvaluacionRequisito]:
    """Paso 5 (LLM, llamada 2, MODELO_EVALUACION). Evalúa cada requisito con resultado, cita, líneas y
    justificación. Razona por significado, no por palabras clave: tecnología parecida ≠ misma (AWS ≠ Azure).
    Few-shot con 3-5 ejemplos. Ver secciones 7 y 8. Prompt en app/prompts/evaluacion_v1.md.

    TODO: implementar.
    """
    raise NotImplementedError
