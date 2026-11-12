import anyio

from app.pipeline.extract import extraer_ficha
from app.schemas import Linea


class _Message:
    stop_reason = "end_turn"

    def __init__(self, text):
        self.content = [type("TextBlock", (), {"type": "text", "text": text})()]


class _Messages:
    async def create(self, **kwargs):
        assert "[p1-l1] Experiencia con Python" in kwargs["messages"][0]["content"]
        assert "correo@ejemplo.com" not in kwargs["messages"][0]["content"]
        return _Message(
            '{"experiencias":[{"cargo":"Backend","empresa":null,"inicio":null,'
            '"fin":null,"descripcion":"Python","lineas":["p1-l1"]}],'
            '"formacion":[],"certificaciones":[],"idiomas":[],"'
            'habilidades_tecnicas":["Python"],"competencias_blandas":[]}'
        )


class _Client:
    messages = _Messages()


def test_extraer_ficha_valida_json_y_evidencias(monkeypatch):
    monkeypatch.setattr("app.pipeline.extract.get_client", lambda: _Client())
    ficha = anyio.run(
        extraer_ficha,
        [Linea(id="p1-l1", texto="Experiencia con Python", bbox=(0, 0, 1, 1))],
    )
    assert ficha.experiencias[0].cargo == "Backend"
    assert ficha.experiencias[0].lineas == ["p1-l1"]
