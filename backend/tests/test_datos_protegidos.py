import pytest

from app.pipeline.datos_protegidos import detectar_dato_protegido, motivo_bloqueo, separar_requisitos
from app.schemas import Requisito

BLOQUEADOS = [
    ("Menor de 35 años", "edad"),
    ("Edad entre 25 y 40 años", "edad"),
    ("Entre 25 y 35 años", "edad"),
    ("Mayor de edad", "edad"),
    ("Persona joven y dinámica", "edad"),
    ("Under 30 years", "edad"),
    ("Nacido después de 1990", "edad"),
    ("Sexo masculino", "genero"),
    ("Preferiblemente mujer", "genero"),
    ("Señorita para recepción", "genero"),
    ("Male candidates only", "genero"),
    ("Nacionalidad colombiana", "nacionalidad"),
    ("Ser colombiano", "nacionalidad"),
    ("Candidatos venezolanos abstenerse", "nacionalidad"),
    ("Nativo de Medellín", "nacionalidad"),
    ("Soltero sin hijos", "estado_civil"),
    ("Estado civil: casada", "estado_civil"),
    ("Hoja de vida con foto", "apariencia_o_foto"),
    ("Buena presencia", "apariencia_o_foto"),
    ("Estatura mínima 1,70 m", "apariencia_o_foto"),
    ("Residir en el barrio Chapinero", "direccion_o_residencia"),
    ("Que viva en el sur de Bogotá", "direccion_o_residencia"),
    ("Estrato 3 o superior", "direccion_o_residencia"),
    ("Ser católico practicante", "religion"),
    ("No estar embarazada", "embarazo"),
    ("Orientación sexual heterosexual", "orientacion_sexual"),
]

PERMITIDOS = [
    "3 o más años de experiencia con Python",
    "Mayor de 10 años de experiencia en el sector",
    "Mínimo 15 años en desarrollo backend",
    "Más de 20 años liderando equipos",
    "Inglés nativo o C2",
    "Español nativo",
    "Dirección de proyectos ágiles",
    "Experiencia en el extranjero",
    "Conocimiento de la normativa tributaria colombiana",
    "Atención al ciudadano",
    "Fotografía de producto",
    "Single sign-on (SSO) con OAuth",
    "Single page applications con React",
    "Certificación AWS Solutions Architect",
    "Experiencia exclusivamente en Azure",
    "Disponibilidad para viajar",
    "Trabajo presencial en Bogotá",
    "Licencia de conducción categoría B1",
    "Tarjeta profesional vigente",
    "Manejo de personal a cargo",
    "Gestión de la relación con el cliente",
]


@pytest.mark.parametrize("texto,categoria", BLOQUEADOS)
def test_bloquea_requisitos_con_datos_protegidos(texto, categoria):
    assert detectar_dato_protegido(texto) == categoria


@pytest.mark.parametrize("texto", PERMITIDOS)
def test_no_bloquea_requisitos_legitimos(texto):
    assert detectar_dato_protegido(texto) is None


def _req(id_, nombre, tipo="obligatorio"):
    return Requisito(id=id_, nombre=nombre, tipo=tipo, categoria="otro")


def test_motivo_explica_que_corregir():
    motivo = motivo_bloqueo(_req("R3", "Menor de 35 años"))
    assert motivo == (
        "El requisito R3 «Menor de 35 años» usa un dato protegido (edad). "
        "No puede usarse como criterio de selección: elimínalo o reformúlalo."
    )
    assert motivo_bloqueo(_req("R1", "Python")) is None


def test_separar_requisitos_aplica_a_cualquier_tipo():
    validos, bloqueados = separar_requisitos([
        _req("R1", "Python"),
        _req("R2", "Ser colombiano", "descalificante"),
        _req("R3", "Buena presencia", "deseable"),
    ])
    assert [r.id for r in validos] == ["R1"]
    assert [r.id for r, _ in bloqueados] == ["R2", "R3"]
