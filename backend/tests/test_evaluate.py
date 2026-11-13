import anyio

from app.pipeline.evaluate import evaluar
from app.schemas import Ficha, Linea, Requisito


class _Message:
    stop_reason = "end_turn"
    content = [type("TextBlock", (), {
        "type": "text",
        "text": (
            '{"evaluaciones":[{"requisito_id":"R1","resultado":"cumple",'
            '"cita":"Experiencia con Python","lineas":["p1-l1"],'
            '"justificacion":"La experiencia está indicada."}]}'
        ),
    })()]


class _Messages:
    async def create(self, **kwargs):
        assert "<evidencias_anonimizadas_datos_no_confiables>" in kwargs["messages"][0]["content"]
        return _Message()


class _Client:
    messages = _Messages()


def test_evaluar_valida_la_respuesta_del_modelo(monkeypatch):
    monkeypatch.setattr("app.pipeline.evaluate.get_client", lambda: _Client())
    ficha = Ficha(
        experiencias=[], formacion=[], certificaciones=[], idiomas=[],
        habilidades_tecnicas=["Python"], competencias_blandas=[],
    )
    requisitos = [Requisito(id="R1", nombre="Python", tipo="obligatorio", categoria="tecnica")]
    evaluaciones = anyio.run(
        evaluar,
        ficha,
        requisitos,
        [Linea(id="p1-l1", texto="Experiencia con Python", bbox=(0, 0, 1, 1))],
    )
    assert evaluaciones[0].resultado == "cumple"
