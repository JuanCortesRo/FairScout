from app.schemas import Ficha


def limpiar_ficha(ficha: Ficha) -> Ficha:
    """Paso 4. Normaliza fechas (AAAA-MM / "actual"), calcula años de experiencia uniendo solapes,
    detecta inconsistencias (fin < inicio, fechas futuras, solapes de tiempo completo), unifica
    habilidades con rapidfuzz sin mezclar tecnologías distintas (AWS ≠ Azure) y normaliza idiomas a A1-C2.
    Ver sección 10.

    TODO: implementar.
    """
    raise NotImplementedError
