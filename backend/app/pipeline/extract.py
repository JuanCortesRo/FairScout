from app.schemas import Ficha, Linea


async def extraer_ficha(lineas: list[Linea]) -> Ficha:
    """Paso 3 (LLM, llamada 1, MODELO_EXTRACCION). Envía las líneas como "[p1-l3] texto", delimitadas
    como dato, y devuelve la Ficha con los ids de línea de cada dato. Si un dato no aparece en el CV,
    se deja vacío: nunca se infiere. Prompt en app/prompts/extraccion_v1.md.

    TODO: implementar.
    """
    raise NotImplementedError
