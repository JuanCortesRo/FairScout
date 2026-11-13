"""Paso 9: explicación del resultado para el reclutador. Solo código, a partir de resultados YA calculados.

Se arma con plantillas (no con el LLM) para que siempre sea coherente con el puntaje y las citas verificadas, y
para no gastar una tercera llamada por CV. Es el espejo de `explicar` en frontend/src/lib/scoring.js.
"""
from app.schemas import EvaluacionRequisito, ExplicacionEvaluacion, Requisito

SIN_INFORMACION = "El CV no menciona este punto. Conviene preguntarlo en la entrevista."
CITA_NO_VERIFICADA = "La cita propuesta no se encontró textualmente en el CV."


def explicar(evaluaciones: list[EvaluacionRequisito], requisitos: list[Requisito]) -> ExplicacionEvaluacion:
    """Fortalezas, brechas y aspectos por verificar, cada uno como "<requisito>: <motivo>".

    - Fortaleza: requisito cumplido o equivalente con cita verificada.
    - Brecha: requisito parcial o no cumplido, o descalificante presente.
    - Por verificar: sin información, o una cita que no se encontró en el CV (aunque el LLM diga que cumple).
    """
    por_id = {e.requisito_id: e for e in evaluaciones}
    fortalezas: list[str] = []
    brechas: list[str] = []
    por_verificar: list[str] = []

    for requisito in requisitos:
        ev = por_id.get(requisito.id)
        if ev is None or ev.resultado == "sin_informacion":
            por_verificar.append(f"{requisito.nombre}: {SIN_INFORMACION}")
        elif ev.cita and not ev.cita_verificada:
            por_verificar.append(f"{requisito.nombre}: {CITA_NO_VERIFICADA}")
        elif requisito.tipo == "descalificante":
            if ev.resultado == "presente":
                brechas.append(f"{requisito.nombre} (descalificante): {ev.justificacion}")
        elif ev.resultado in ("cumple", "equivalente"):
            fortalezas.append(f"{requisito.nombre}: {ev.justificacion}")
        elif ev.resultado in ("parcial", "no_cumple"):
            brechas.append(f"{requisito.nombre}: {ev.justificacion}")

    return ExplicacionEvaluacion(fortalezas=fortalezas, brechas=brechas, aspectos_por_verificar=por_verificar)
