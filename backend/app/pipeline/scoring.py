"""Pasos 7-8: puntaje, estado, confianza y recomendación. Solo código, nunca el LLM.

Es el espejo de `frontend/src/lib/scoring.js` (sección 9). **Si cambias una regla aquí, cámbiala también allá**
y regenera `tests/fixtures/casos_scoring.json` con `node frontend/scripts/casos_scoring.mjs`.
"""
import math
from collections.abc import Iterable
from dataclasses import dataclass, field

from app.schemas import EvaluacionRequisito, Requisito, ResultadoCandidato

VALOR_RESULTADO = {
    "cumple": 1.0,
    "equivalente": 0.8,
    "parcial": 0.5,
    "no_cumple": 0.0,
    "sin_informacion": 0.0,
}

UMBRAL_RECOMENDAR_PARCIAL = 60
PESO_OBLIGATORIOS = 60  # porcentaje; los deseables valen el resto

# Alertas del documento que afectan la confianza (las pasa el orquestador como texto).
ALERTA_OCR = "ocr"
ALERTA_FECHAS = "inconsistencia_fechas"
ALERTA_PROMPT_INJECTION = "prompt_injection"

ORDEN_ESTADO = {
    "cumple": 0,
    "cumple_parcialmente": 1,
    "pendiente_verificar": 2,
    "no_cumple": 3,
}

# Tipo de alerta del documento (suspicious_content / document_processor / cvs) → alerta que entiende el puntaje.
# El texto oculto cuenta como intento de manipulación (§20.1). Los demás tipos no afectan la confianza.
_ALERTA_DOCUMENTO_A_PUNTAJE = {
    "prompt_injection": ALERTA_PROMPT_INJECTION,
    "hidden_text": ALERTA_PROMPT_INJECTION,
    "ocr": ALERTA_OCR,
    "inconsistencia_fechas": ALERTA_FECHAS,
}


def alertas_para_puntaje(tipos: Iterable[str]) -> list[str]:
    """Convierte los tipos de alerta guardados con el CV en las alertas que usa `calcular_resultado`."""
    return list(dict.fromkeys(_ALERTA_DOCUMENTO_A_PUNTAJE[t] for t in tipos if t in _ALERTA_DOCUMENTO_A_PUNTAJE))


@dataclass
class Fila:
    req: Requisito
    ev: EvaluacionRequisito


@dataclass
class Desglose:
    """Detalle del cálculo para la vista de detalle y la auditoría (no forma parte de `ResultadoCandidato`)."""

    puntaje_obligatorios: float | None
    puntaje_deseables: float | None
    cobertura: float
    motivos_confianza: list[str]
    categorias: dict[str, float]
    citas_sin_verificar: int
    filas: list[Fila] = field(default_factory=list)


def _redondear(valor: float, decimales: int = 0) -> float:
    """Redondeo hacia arriba en el punto medio, igual que `Math.round` de JavaScript
    (el `round` de Python redondea al par: round(0.5) == 0)."""
    factor = 10**decimales
    return math.floor(valor * factor + 0.5) / factor


def _valor(fila: Fila) -> float:
    return VALOR_RESULTADO.get(fila.ev.resultado, 0.0)


def _promedio_ponderado(filas: list[Fila], peso_de) -> float | None:
    total = sum(peso_de(f) for f in filas)
    if not total:
        return None
    return sum(peso_de(f) * _valor(f) for f in filas) / total


def _sin_evaluar(requisito_id: str) -> EvaluacionRequisito:
    return EvaluacionRequisito(
        requisito_id=requisito_id,
        resultado="sin_informacion",
        cita=None,
        lineas=[],
        justificacion="No evaluado.",
        cita_verificada=False,
    )


def calcular_con_desglose(
    evaluaciones: list[EvaluacionRequisito],
    requisitos: list[Requisito],
    candidato_id: str,
    alertas: Iterable[str] = (),
    peso_obligatorios: float = PESO_OBLIGATORIOS,
) -> tuple[ResultadoCandidato, Desglose]:
    """Igual que `calcular_resultado`, pero devuelve además el desglose del cálculo."""
    por_id = {e.requisito_id: e for e in evaluaciones}
    filas = [Fila(r, por_id.get(r.id) or _sin_evaluar(r.id)) for r in requisitos]
    alertas = list(alertas)

    oblig = [f for f in filas if f.req.tipo == "obligatorio"]
    deseab = [f for f in filas if f.req.tipo == "deseable"]
    descal = [f for f in filas if f.req.tipo == "descalificante"]

    # 9.1 Puntaje. Los obligatorios pesan todos igual; en los deseables cuenta el peso de cada uno.
    s_o = _promedio_ponderado(oblig, lambda f: 1)
    s_d = _promedio_ponderado(deseab, lambda f: f.req.peso if f.req.peso is not None else 1)
    w_o = peso_obligatorios / 100
    if s_o is None and s_d is None:
        puntaje = 0.0
    elif s_o is None:
        puntaje = s_d * 100
    elif s_d is None:
        puntaje = s_o * 100
    else:
        puntaje = (w_o * s_o + (1 - w_o) * s_d) * 100
    puntaje = _redondear(puntaje, 1)

    # 9.2 Estado
    descal_presente = [f for f in descal if f.ev.resultado == "presente"]
    oblig_no = [f for f in oblig if f.ev.resultado == "no_cumple"]
    oblig_ok = all(f.ev.resultado in ("cumple", "equivalente") for f in oblig)
    oblig_sin_info = [f for f in oblig if f.ev.resultado == "sin_informacion"]
    oblig_parciales = [f for f in oblig if f.ev.resultado == "parcial"]

    if descal_presente:
        estado = "no_cumple"
        motivo_estado = f"Descalificante presente: {descal_presente[0].req.nombre}"
    elif oblig_no:
        estado = "no_cumple"
        motivo_estado = f"Falta obligatorio: {oblig_no[0].req.nombre}"
    elif oblig_sin_info:
        estado = "pendiente_verificar"
        motivo_estado = f"Obligatorio sin información: {oblig_sin_info[0].req.nombre}"
    elif oblig_ok:
        estado = "cumple"
        motivo_estado = "Cumple todos los obligatorios y no tiene descalificantes presentes"
    else:
        estado = "cumple_parcialmente"
        motivo_estado = f"Obligatorio parcial: {oblig_parciales[0].req.nombre}"

    # 9.3 Confianza
    evaluables = oblig + deseab
    sin_info = sum(1 for f in evaluables if f.ev.resultado == "sin_informacion")
    cobertura = 1 - sin_info / len(evaluables) if evaluables else 0.0
    citas_sin_verificar = [f for f in filas if f.ev.cita and not f.ev.cita_verificada]
    oblig_sin_verificar = [f for f in citas_sin_verificar if f.req.tipo == "obligatorio"]
    total_oblig_parciales = len(oblig_parciales)

    motivos_confianza: list[str] = []
    if cobertura < 0.8:
        motivos_confianza.append(f"Cobertura de información del {int(_redondear(cobertura * 100))}%")
    if citas_sin_verificar:
        motivos_confianza.append(f"{len(citas_sin_verificar)} cita(s) no encontradas en el CV")
    if ALERTA_OCR in alertas:
        motivos_confianza.append("El documento necesitó OCR")
    if ALERTA_FECHAS in alertas:
        motivos_confianza.append("Fechas inconsistentes en la experiencia")
    if ALERTA_PROMPT_INJECTION in alertas:
        motivos_confianza.append("Se detectó texto que intenta manipular la evaluación")
    if total_oblig_parciales >= 2:
        motivos_confianza.append("Varios obligatorios con resultado parcial")

    if cobertura < 0.5 or oblig_sin_verificar or ALERTA_PROMPT_INJECTION in alertas:
        confianza = "baja"
    elif (
        cobertura >= 0.8
        and not citas_sin_verificar
        and not any(a in (ALERTA_OCR, ALERTA_FECHAS) for a in alertas)
        and total_oblig_parciales < 2
    ):
        confianza = "alta"
    else:
        confianza = "media"
    if not motivos_confianza:
        motivos_confianza.append("Buena cobertura y todas las citas verificadas")

    # 9.4 Recomendación: un parcial se recomienda si las dudas son solo por falta de información.
    duda_solo_por_info = bool(oblig_sin_info) and not oblig_parciales
    recomendado = estado == "cumple" or (
        estado == "pendiente_verificar"
        and puntaje >= UMBRAL_RECOMENDAR_PARCIAL
        and duda_solo_por_info
    )

    # Desglose por categoría (barras del ranking)
    por_categoria: dict[str, list[float]] = {}
    for f in evaluables:
        por_categoria.setdefault(f.req.categoria, []).append(_valor(f))
    categorias = {c: sum(v) / len(v) for c, v in por_categoria.items()}

    resultado = ResultadoCandidato(
        candidato_id=candidato_id,
        puntaje=puntaje,
        estado=estado,
        confianza=confianza,
        recomendado_entrevista=recomendado,
        motivo_estado=motivo_estado,
    )
    desglose = Desglose(
        puntaje_obligatorios=s_o,
        puntaje_deseables=s_d,
        cobertura=cobertura,
        motivos_confianza=motivos_confianza,
        categorias=categorias,
        citas_sin_verificar=len(citas_sin_verificar),
        filas=filas,
    )
    return resultado, desglose


def calcular_resultado(
    evaluaciones: list[EvaluacionRequisito],
    requisitos: list[Requisito],
    candidato_id: str,
    alertas: Iterable[str] = (),
    peso_obligatorios: float = PESO_OBLIGATORIOS,
) -> ResultadoCandidato:
    """Pasos 7-8. Calcula puntaje (obligatorios 60% / deseables 40% por defecto), estado, confianza,
    recomendado_entrevista y motivo_estado según la sección 9.

    `alertas` son las del documento que bajan la confianza: "ocr", "inconsistencia_fechas", "prompt_injection".
    Un requisito sin evaluación cuenta como "sin_informacion".
    """
    return calcular_con_desglose(evaluaciones, requisitos, candidato_id, alertas, peso_obligatorios)[0]


def ordenar_ranking(resultados: list[ResultadoCandidato]) -> list[ResultadoCandidato]:
    """Paso 8. Ordena TODOS los candidatos (sin recortar a un top-N): primero por estado,
    luego por puntaje descendente y, en empate, por candidato_id."""
    return sorted(resultados, key=lambda r: (ORDEN_ESTADO[r.estado], -r.puntaje, r.candidato_id))
