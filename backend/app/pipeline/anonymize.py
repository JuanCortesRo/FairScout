from app.schemas import Linea


def anonimizar(lineas: list[Linea]) -> list[Linea]:
    """Paso 2. Enmascara datos personales con Presidio + regex ([NOMBRE], [CORREO], [DIRECCION],
    [NACIONALIDAD]…), incluidos indicios indirectos (año de grado del colegio, pronombres, ciudad de origen).
    Conserva los ids de línea para que las citas sigan siendo válidas. Ver sección 12.

    TODO: implementar.
    """
    raise NotImplementedError
