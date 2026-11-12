from app.pipeline.postprocess import limpiar_ficha
from app.schemas import Experiencia, Ficha, Idioma


def test_limpiar_ficha_normaliza_fechas_idiomas_y_habilidades():
    ficha = Ficha(
        experiencias=[Experiencia(
            cargo="Backend", empresa="Acme", inicio="Feb 2025", fin="actual",
            descripcion=None, lineas=["p1-l1"],
        )],
        formacion=[], certificaciones=[],
        idiomas=[Idioma(idioma="Inglés", nivel="b2", lineas=["p1-l2"])],
        habilidades_tecnicas=["Python", " python "],
        competencias_blandas=[],
    )

    resultado = limpiar_ficha(ficha)

    assert resultado.experiencias[0].inicio == "2025-02"
    assert resultado.idiomas[0].nivel == "B2"
    assert resultado.habilidades_tecnicas == ["Python"]
