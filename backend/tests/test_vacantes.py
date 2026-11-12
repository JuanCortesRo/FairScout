"""Prueba POST /api/vacantes con un cliente de Anthropic simulado (no llama a la API real)."""
import json
from types import SimpleNamespace

import app.main as main_module
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.main import app
from app.models import VacanteDB
from app.pipeline import requirements

DESCRIPCION = {"descripcion": "Buscamos desarrollador Python con 3 años de experiencia e inglés B2."}

VALIDA = {"titulo": "Desarrollador Python", "requisitos": [
    {"id": "R1", "nombre": "3 o más años con Python", "tipo": "obligatorio", "categoria": "experiencia", "peso": 1.0}]}
INVALIDA = {"titulo": "X", "requisitos": [{"id": "R1", "nombre": "algo", "tipo": "opcional", "categoria": "tecnica"}]}


@pytest.fixture
def session_factory(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    yield factory
    engine.dispose()


@pytest.fixture
def client(session_factory, monkeypatch):
    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(main_module, "init_db", lambda: None)
    with TestClient(main_module.app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)


def _cliente_falso(*textos: str):
    """Devuelve los textos en orden, uno por llamada; registra cuántas llamadas hubo."""
    llamadas = []

    async def create(**kwargs):
        llamadas.append(kwargs)
        texto = textos[min(len(llamadas), len(textos)) - 1]
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=texto)])

    return SimpleNamespace(messages=SimpleNamespace(create=create)), llamadas


def test_vacante_ok(monkeypatch, client, session_factory):
    falso, llamadas = _cliente_falso("```json\n" + json.dumps(VALIDA) + "\n```")
    monkeypatch.setattr(requirements, "get_client", lambda: falso)
    r = client.post("/api/vacantes", json=DESCRIPCION)
    assert r.status_code == 200
    assert r.json()["requisitos"][0]["tipo"] == "obligatorio"
    assert r.json()["id"]
    assert len(llamadas) == 1

    with session_factory() as db:
        vacante = db.get(VacanteDB, r.json()["id"])
        assert vacante is not None
        assert vacante.descripcion == DESCRIPCION["descripcion"]
        assert vacante.titulo == VALIDA["titulo"]
        assert len(vacante.requisitos) == 1
        assert vacante.requisitos[0].id == "R1"
        assert vacante.requisitos[0].tipo == "obligatorio"


def test_vacante_reintenta_una_vez(monkeypatch, client):
    falso, llamadas = _cliente_falso(json.dumps(INVALIDA), json.dumps(VALIDA))
    monkeypatch.setattr(requirements, "get_client", lambda: falso)
    r = client.post("/api/vacantes", json=DESCRIPCION)
    assert r.status_code == 200
    assert len(llamadas) == 2


def test_vacante_salida_invalida(monkeypatch, client, session_factory):
    falso, llamadas = _cliente_falso(json.dumps(INVALIDA))
    monkeypatch.setattr(requirements, "get_client", lambda: falso)
    r = client.post("/api/vacantes", json=DESCRIPCION)
    assert r.status_code == 502
    assert "formato inválido" in r.json()["detail"]
    assert len(llamadas) == 2
    with session_factory() as db:
        assert db.scalars(select(VacanteDB)).all() == []


def test_vacante_descripcion_corta(client):
    assert client.post("/api/vacantes", json={"descripcion": "corta"}).status_code == 422
