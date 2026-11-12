"""POST /api/evaluations calcula el puntaje en código y GET /api/ranking ordena a todos los candidatos."""
import app.main as main_module
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.main import app
from app.models import CandidatoDB, RequisitoDB, VacanteDB
from app.pipeline.scoring import alertas_para_puntaje
from app.schemas import EvaluacionRequisito, ExplicacionEvaluacion

LINEAS = [
    {"id": "p1-l1", "texto": "5 años desarrollando con Python y Django", "bbox": [0, 0, 1, 1]},
    {"id": "p1-l2", "texto": "3 años administrando Azure", "bbox": [0, 0, 1, 1]},
    {"id": "p1-l3", "texto": "Inglés avanzado C1", "bbox": [0, 0, 1, 1]},
]
FICHA = {
    "experiencias": [], "formacion": [], "certificaciones": [], "idiomas": [],
    "habilidades_tecnicas": ["Python"], "competencias_blandas": [],
}
REQUISITOS = [
    ("R1", "Python", "obligatorio", "tecnica"),
    ("R2", "AWS", "obligatorio", "tecnica"),
    ("R3", "Inglés B2", "deseable", "idioma"),
]


def _ev(requisito_id, resultado, cita=None, linea=None):
    return EvaluacionRequisito(
        requisito_id=requisito_id,
        resultado=resultado,
        cita=cita,
        lineas=[linea] if linea else [],
        justificacion=f"Justificación de {requisito_id}",
    )


# Lo que "devuelve el LLM" para cada candidato. La cita de C3 no existe en el CV.
RESPUESTAS = {
    "C1": [_ev("R1", "cumple", "Python y Django", "p1-l1"), _ev("R2", "cumple", "AWS", "p1-l2"),
           _ev("R3", "cumple", "Inglés avanzado C1", "p1-l3")],
    "C2": [_ev("R1", "cumple", "Python y Django", "p1-l1"), _ev("R2", "no_cumple", "administrando Azure", "p1-l2"),
           _ev("R3", "cumple", "Inglés avanzado C1", "p1-l3")],
    "C3": [_ev("R1", "cumple", "Python y Django", "p1-l1"), _ev("R2", "sin_informacion"),
           _ev("R3", "cumple", "Inglés avanzado C1", "p1-l3")],
}


@pytest.fixture
def session_factory(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        db.add(VacanteDB(
            id="V1", titulo="Backend", descripcion="Vacante de prueba", requisitos_confirmados=True,
            requisitos=[RequisitoDB(id=i, nombre=n, tipo=t, categoria=c, peso=1.0) for i, n, t, c in REQUISITOS],
        ))
        for cid, alertas in (("C1", []), ("C2", []), ("C3", ["hidden_text"])):
            db.add(CandidatoDB(
                id=cid, documento_id=cid, nombre_archivo=f"{cid}.pdf", estado="processed",
                ficha=FICHA, lineas_anonimizadas=LINEAS, lineas_originales=LINEAS, alertas=alertas,
            ))
        db.commit()
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

    async def evaluar_falso(ficha, requisitos, lineas):
        return RESPUESTAS[evaluar_falso.candidato], ExplicacionEvaluacion()

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(main_module, "init_db", lambda: None)
    monkeypatch.setattr("app.routers.evaluations.evaluar", evaluar_falso)
    with TestClient(main_module.app) as test_client:
        test_client.evaluar_falso = evaluar_falso
        yield test_client
    app.dependency_overrides.pop(get_db, None)


def _evaluar(client, candidato_id):
    client.evaluar_falso.candidato = candidato_id
    respuesta = client.post("/api/evaluations", json={"candidato_id": candidato_id, "vacante_id": "V1"})
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def test_evaluacion_devuelve_puntaje_calculado_en_codigo(client):
    cuerpo = _evaluar(client, "C1")

    assert cuerpo["resultado"] == {
        "candidato_id": "C1",
        "puntaje": 100.0,
        "estado": "cumple",
        "confianza": "baja",  # la cita "AWS" no está en p1-l2 (dice Azure): obligatorio sin verificar
        "recomendado_entrevista": True,
        "motivo_estado": "Cumple todos los obligatorios y supera el umbral de puntaje",
    }
    assert "1 cita(s) no encontradas en el CV" in cuerpo["motivos_confianza"]


def test_ranking_ordena_a_todos_por_estado_y_puntaje(client):
    for cid in ("C2", "C3", "C1"):
        _evaluar(client, cid)

    cuerpo = client.get("/api/ranking", params={"vacante_id": "V1"}).json()

    assert [c["candidato_id"] for c in cuerpo["candidatos"]] == ["C1", "C3", "C2"]
    estados = {c["candidato_id"]: c["estado"] for c in cuerpo["candidatos"]}
    assert estados == {"C1": "cumple", "C3": "cumple_parcialmente", "C2": "no_cumple"}
    c3 = next(c for c in cuerpo["candidatos"] if c["candidato_id"] == "C3")
    assert c3["confianza"] == "baja"  # texto oculto cuenta como intento de manipulación
    assert c3["motivo_estado"] == "Obligatorio sin información: AWS"


def test_ranking_recalcula_con_otro_peso_sin_llamar_al_llm(client):
    _evaluar(client, "C3")
    client.evaluar_falso.candidato = None  # si el ranking llamara al LLM, fallaría con KeyError

    con_60 = client.get("/api/ranking", params={"vacante_id": "V1"}).json()["candidatos"][0]
    con_80 = client.get("/api/ranking", params={"vacante_id": "V1", "peso_obligatorios": 80}).json()

    assert con_60["puntaje"] == 70.0   # 0.6 * 0.5 + 0.4 * 1
    assert con_80["candidatos"][0]["puntaje"] == 60.0   # 0.8 * 0.5 + 0.2 * 1
    assert con_80["peso_obligatorios"] == 80


def test_ranking_usa_la_evaluacion_mas_reciente_e_ignora_versiones_viejas(client, session_factory):
    _evaluar(client, "C2")
    RESPUESTAS["C2"], original = RESPUESTAS["C1"], RESPUESTAS["C2"]
    try:
        _evaluar(client, "C2")
    finally:
        RESPUESTAS["C2"] = original

    candidatos = client.get("/api/ranking", params={"vacante_id": "V1"}).json()["candidatos"]
    assert [(c["candidato_id"], c["estado"]) for c in candidatos] == [("C2", "cumple")]

    with session_factory() as db:
        db.get(VacanteDB, "V1").version_requisitos += 1
        db.commit()
    assert client.get("/api/ranking", params={"vacante_id": "V1"}).json()["candidatos"] == []


def test_ranking_valida_vacante_y_peso(client):
    assert client.get("/api/ranking").json()["candidatos"] == []
    assert client.get("/api/ranking", params={"vacante_id": "NO"}).status_code == 404
    assert client.get("/api/ranking", params={"vacante_id": "V1", "peso_obligatorios": 120}).status_code == 422


def test_alertas_para_puntaje():
    tipos = ["fotografia_o_imagen", "hidden_text", "prompt_injection", "ocr"]
    assert alertas_para_puntaje(tipos) == ["prompt_injection", "ocr"]
