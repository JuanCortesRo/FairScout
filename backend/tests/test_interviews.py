import anyio
import hashlib
from datetime import datetime, timedelta, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import db as db_module
from app.interview import agent
from app.models import CandidatoDB, EntrevistaDB, RequisitoDB, VacanteDB
from app.routers.interviews import _publica, hash_interview_token
from app.schemas import Ficha, Requisito


class _Message:
    stop_reason = "end_turn"

    def __init__(self, text):
        self.content = [type("Text", (), {"type": "text", "text": text})()]


class _Messages:
    def __init__(self, replies):
        self.replies = iter(replies)
        self.calls = 0

    async def create(self, **kwargs):
        self.calls += 1
        return next(self.replies)


class _Client:
    def __init__(self, replies):
        self.messages = _Messages(replies)


def _ficha():
    return Ficha(experiencias=[], formacion=[], certificaciones=[], idiomas=[],
                 habilidades_tecnicas=[], competencias_blandas=[])


def test_plan_reintenta_json_y_filtra_preguntas_protegidas(monkeypatch):
    invalid = _Message("no json")
    valid = _Message('{"preguntas":[' + ",".join(
        '{"id":"%s","tema":"Python","texto":"Cuéntame un proyecto con Python"}' % i
        for i in range(1, 6)
    ) + ',{"id":"P","tema":"edad","texto":"¿Qué edad tienes?"}]}')
    client = _Client([invalid, valid])
    monkeypatch.setattr(agent, "get_client", lambda: client)
    monkeypatch.setattr(agent, "cargar_prompt", lambda _: "system")

    preguntas = anyio.run(agent.generar_plan, _ficha(), [])

    assert len(preguntas) == 5
    assert all("edad" not in p.texto.lower() for p in preguntas)
    assert client.messages.calls == 2


def test_plan_fallback_mantiene_cinco_preguntas(monkeypatch):
    class Refused:
        stop_reason = "refusal"
        content = []

    monkeypatch.setattr(agent, "get_client", lambda: _Client([Refused()]))
    monkeypatch.setattr(agent, "cargar_prompt", lambda _: "system")
    preguntas = anyio.run(agent.generar_plan, _ficha(), [
        Requisito(id="R1", nombre="Python", tipo="obligatorio", categoria="tecnica"),
    ])
    assert 5 <= len(preguntas) <= 10


def test_init_db_crea_tabla_entrevistas(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'interview.db'}")
    monkeypatch.setattr(db_module, "engine", engine)
    db_module.init_db()
    assert "entrevistas" in __import__("sqlalchemy").inspect(engine).get_table_names()
    engine.dispose()


def test_token_hash_usa_sha256_y_no_guarda_el_token():
    token = "token-de-prueba"
    assert hash_interview_token(token) == hashlib.sha256(token.encode()).hexdigest()
    assert hash_interview_token(token) != token


def test_public_projection_redacta_evaluaciones_identidad_y_campos_internos():
    fila = EntrevistaDB(
        id="i1", candidato_id="candidate-secret", vacante_id="vacancy-secret",
        estado="en_curso", expira_at=datetime.now(timezone.utc) + timedelta(hours=1),
        plan=[{"id": "q1", "texto": "Pregunta"}],
        pregunta_actual={"id": "q1", "tema": "experiencia", "texto": "Pregunta",
                         "motivo": "interno"},
        mensajes=[{"evaluacion": {"score": 99}}],
        historial=[{"evaluacion": {"inconsistencias": ["privado"]}}],
        informe={"recomendacion": "avanzar"},
    )
    salida = _publica(fila).model_dump()
    assert set(salida) == {"estado", "expira_at", "vacante_titulo", "pregunta", "progreso"}
    assert "candidate-secret" not in str(salida)
    assert "evaluacion" not in str(salida)
    assert salida["pregunta"] == {"tema": "experiencia", "texto": "Pregunta"}
