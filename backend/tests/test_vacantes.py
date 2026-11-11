"""Prueba POST /api/vacantes con un cliente de Anthropic simulado (no llama a la API real)."""
import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.pipeline import requirements

client = TestClient(app)
DESCRIPCION = {"descripcion": "Buscamos desarrollador Python con 3 años de experiencia e inglés B2."}

VALIDA = {"titulo": "Desarrollador Python", "requisitos": [
    {"id": "R1", "nombre": "3 o más años con Python", "tipo": "obligatorio", "categoria": "experiencia", "peso": 1.0}]}
INVALIDA = {"titulo": "X", "requisitos": [{"id": "R1", "nombre": "algo", "tipo": "opcional", "categoria": "tecnica"}]}


def _cliente_falso(*textos: str):
    """Devuelve los textos en orden, uno por llamada; registra cuántas llamadas hubo."""
    llamadas = []

    async def create(**kwargs):
        llamadas.append(kwargs)
        texto = textos[min(len(llamadas), len(textos)) - 1]
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=texto)])

    return SimpleNamespace(messages=SimpleNamespace(create=create)), llamadas


def test_vacante_ok(monkeypatch):
    falso, llamadas = _cliente_falso("```json\n" + json.dumps(VALIDA) + "\n```")
    monkeypatch.setattr(requirements, "get_client", lambda: falso)
    r = client.post("/api/vacantes", json=DESCRIPCION)
    assert r.status_code == 200
    assert r.json()["requisitos"][0]["tipo"] == "obligatorio"
    assert len(llamadas) == 1


def test_vacante_reintenta_una_vez(monkeypatch):
    falso, llamadas = _cliente_falso(json.dumps(INVALIDA), json.dumps(VALIDA))
    monkeypatch.setattr(requirements, "get_client", lambda: falso)
    r = client.post("/api/vacantes", json=DESCRIPCION)
    assert r.status_code == 200
    assert len(llamadas) == 2


def test_vacante_salida_invalida(monkeypatch):
    falso, llamadas = _cliente_falso(json.dumps(INVALIDA))
    monkeypatch.setattr(requirements, "get_client", lambda: falso)
    r = client.post("/api/vacantes", json=DESCRIPCION)
    assert r.status_code == 502
    assert "formato inválido" in r.json()["detail"]
    assert len(llamadas) == 2


def test_vacante_descripcion_corta():
    assert client.post("/api/vacantes", json={"descripcion": "corta"}).status_code == 422
