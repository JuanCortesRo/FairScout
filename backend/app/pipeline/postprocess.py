import re
from datetime import date

from rapidfuzz import fuzz

from app.schemas import ExperienciaLaboral, Ficha, calcular_experiencia_total

_MESES = {
    "ene": "01", "jan": "01", "feb": "02", "mar": "03", "abr": "04", "apr": "04",
    "may": "05", "jun": "06", "jul": "07", "ago": "08", "aug": "08", "sep": "09",
    "oct": "10", "nov": "11", "dic": "12", "dec": "12",
}
_FECHA = re.compile(r"^(?P<mes>[A-Za-zÁÉÍÓÚáéíóú]{3,9})[\s/-]+(?P<anio>(?:19|20)\d{2})$", re.I)
_ANO_MES = re.compile(r"^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$")


def _normalizar_fecha(valor: str | None) -> str | None:
    if valor is None or valor == "actual":
        return valor
    valor = valor.strip()
    if _ANO_MES.fullmatch(valor):
        return valor
    if re.fullmatch(r"(?:19|20)\d{2}", valor):
        return f"{valor}-01"
    coincidencia = _FECHA.fullmatch(valor)
    if coincidencia:
        mes = _MESES.get(coincidencia.group("mes")[:3].lower())
        anio = coincidencia.group("anio")
        if mes and len(anio) == 4:
            return f"{anio}-{mes}"
    return None


def _deduplicar(valores: list[str]) -> list[str]:
    resultado: list[str] = []
    for valor in valores:
        limpio = valor.strip()
        if not limpio:
            continue
        if not any(fuzz.ratio(limpio.casefold(), existente.casefold()) >= 96 for existente in resultado):
            resultado.append(limpio)
    return resultado


def limpiar_ficha(ficha: Ficha) -> Ficha:
    """Paso 4. Normaliza fechas (AAAA-MM / "actual"), calcula años de experiencia uniendo solapes,
    detecta inconsistencias (fin < inicio, fechas futuras, solapes de tiempo completo), unifica
    habilidades con rapidfuzz sin mezclar tecnologías distintas (AWS ≠ Azure) y normaliza idiomas a A1-C2.
    Ver sección 10.
    """

    experiencias = [
        experiencia.model_copy(update={
            "inicio": _normalizar_fecha(experiencia.inicio),
            "fin": _normalizar_fecha(experiencia.fin),
        })
        for experiencia in ficha.experiencias
    ]
    formacion = [
        estudio.model_copy(update={"fin": _normalizar_fecha(estudio.fin)})
        for estudio in ficha.formacion
    ]
    idiomas = [
        idioma.model_copy(update={
            "idioma": idioma.idioma.strip(),
            "nivel": idioma.nivel.upper() if idioma.nivel and re.fullmatch(r"[a-cA-C][1-2]", idioma.nivel.strip()) else idioma.nivel,
        })
        for idioma in ficha.idiomas
    ]
    hoy = date.today()
    mes_actual = f"{hoy.year:04d}-{hoy.month:02d}"
    experiencias_calculables = []
    fechas_inconsistentes = False
    for experiencia in experiencias:
        inicio = experiencia.inicio
        fin = experiencia.fin
        if inicio is None:
            continue
        if inicio > mes_actual:
            fechas_inconsistentes = True
            continue
        if fin not in (None, "actual") and fin > mes_actual:
            fechas_inconsistentes = True
            fin = mes_actual
        if fin not in (None, "actual") and fin < inicio:
            fechas_inconsistentes = True
        experiencias_calculables.append(ExperienciaLaboral(
            cargo=experiencia.cargo or "Experiencia",
            empresa=experiencia.empresa or "No especificada",
            fecha_inicio=inicio,
            fecha_fin=fin,
            es_actual=fin == "actual",
            descripcion=experiencia.descripcion,
            evidencias=experiencia.lineas,
        ))
    anios_experiencia, errores_fecha = calcular_experiencia_total(experiencias_calculables)
    return ficha.model_copy(update={
        "experiencias": experiencias,
        "formacion": formacion,
        "idiomas": idiomas,
        "habilidades_tecnicas": _deduplicar(ficha.habilidades_tecnicas),
        "competencias_blandas": _deduplicar(ficha.competencias_blandas),
        "anios_experiencia": anios_experiencia,
        "inconsistencia_fechas": fechas_inconsistentes or bool(errores_fecha),
    })
