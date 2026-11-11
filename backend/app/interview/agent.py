""" agente entrevistador """
from app.schemas import EvaluacionRequisito, Ficha


async def siguiente_turno(ficha: Ficha, evaluaciones: list[EvaluacionRequisito], historial: list[dict]) -> dict:
    """Recibe la ficha, la evaluación (brechas y aspectos por verificar) y el historial de la entrevista;
    devuelve un JSON {pregunta_siguiente, evaluacion_respuesta, inconsistencias, terminar}.
    Entre 5 y 10 preguntas, una a la vez. Nunca pregunta por datos protegidos.

    TODO: implementar (día 3, solo si el MVP está estable).
    """
    raise NotImplementedError
