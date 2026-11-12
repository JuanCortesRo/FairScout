from pathlib import Path

import pymupdf
from fastapi.testclient import TestClient

from app.main import app


def _pdf_bytes() -> bytes:
    documento = pymupdf.open()
    pagina = documento.new_page()
    pagina.insert_text((72, 72), "Experiencia con Python")
    contenido = documento.tobytes()
    documento.close()
    return contenido


def test_subir_pdf_extrae_lineas_y_coordenadas(tmp_path, monkeypatch):
    monkeypatch.setattr("app.routers.cvs.settings.UPLOADS_DIR", str(tmp_path))

    with TestClient(app) as client:
        respuesta = client.post(
            "/api/cvs",
            files={"archivos": ("cv.pdf", _pdf_bytes(), "application/pdf")},
        )

    assert respuesta.status_code == 200
    archivo = respuesta.json()["archivos"][0]
    assert archivo["lineas"][0]["id"] == "p1-l1"
    assert archivo["lineas"][0]["texto"] == "Experiencia con Python"
    assert len(archivo["lineas"][0]["bbox"]) == 4
    assert (tmp_path / f"{archivo['id']}.pdf").exists()


def test_subir_pdf_invalido_devuelve_error(tmp_path, monkeypatch):
    monkeypatch.setattr("app.routers.cvs.settings.UPLOADS_DIR", str(tmp_path))

    with TestClient(app) as client:
        respuesta = client.post(
            "/api/cvs",
            files={"archivos": ("cv.pdf", b"no es un PDF", "application/pdf")},
        )

    assert respuesta.status_code == 200
    assert respuesta.json()["archivos"][0]["estado"] == "failed"
    assert list(tmp_path.iterdir()) == []


def test_subir_docx_convierte_a_pdf_y_extrae_lineas(tmp_path, monkeypatch):
    monkeypatch.setattr("app.routers.cvs.settings.UPLOADS_DIR", str(tmp_path))

    def convertir_falso(ruta, directorio_salida, ejecutable=None):
        pdf = Path(directorio_salida) / "cv.pdf"
        pdf.write_bytes(_pdf_bytes())
        return pdf

    monkeypatch.setattr("app.pipeline.document_processor.convertir_docx_a_pdf", convertir_falso)
    with TestClient(app) as client:
        respuesta = client.post(
            "/api/cvs",
            files={"archivos": ("cv.docx", b"contenido docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        )

    assert respuesta.status_code == 200
    archivo = respuesta.json()["archivos"][0]
    assert archivo["lineas"][0]["texto"] == "Experiencia con Python"
    assert (tmp_path / f"{archivo['id']}.docx").exists()
    assert not list(tmp_path.glob("*.pdf"))
