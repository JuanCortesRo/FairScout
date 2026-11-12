import pymupdf

from app.pipeline.parsing import extraer_lineas


def test_extraer_lineas_devuelve_texto_ids_y_coordenadas(tmp_path):
    ruta = tmp_path / "cv.pdf"
    documento = pymupdf.open()
    pagina_uno = documento.new_page()
    pagina_uno.insert_text((72, 72), "Desarrollador backend")
    pagina_uno.insert_text((72, 90), "Python y APIs")
    pagina_dos = documento.new_page()
    pagina_dos.insert_text((72, 72), "Experiencia profesional")
    documento.save(ruta)
    documento.close()

    lineas = extraer_lineas(ruta)

    assert [linea.id for linea in lineas] == ["p1-l1", "p1-l2", "p2-l1"]
    assert [linea.texto for linea in lineas] == [
        "Desarrollador backend",
        "Python y APIs",
        "Experiencia profesional",
    ]
    assert all(len(linea.bbox) == 4 for linea in lineas)
    assert all(all(isinstance(valor, float) for valor in linea.bbox) for linea in lineas)
    assert lineas[0].bbox[1] < lineas[1].bbox[1]


def test_extraer_lineas_omite_paginas_vacias(tmp_path):
    ruta = tmp_path / "cv_vacio.pdf"
    documento = pymupdf.open()
    documento.new_page()
    documento.save(ruta)
    documento.close()

    assert extraer_lineas(ruta) == []
