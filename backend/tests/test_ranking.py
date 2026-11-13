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
from app.pipeline.evaluate import RespuestaEvaluacionInvalida
from app.schemas import EvaluacionRequisito

LINEAS = [
    {"id": "p1-l1", "texto": "5 años desarrollando con Python y Django", "bbox": [0, 0, 1, 1]},
    {"id": "p1-l2", "texto": "3 años administrando Azure", "bbox": [0, 0, 1, 1]},
    {"id": "p1-l3", "texto": "Inglés avanzado C1", "bbox": [0, 0, 1, 1]},
]
def _ficha(candidato_id):
    # El evaluador falso reconoce al candidato por su única habilidad.
    return {
        "experiencias": [], "formacion": [], "certificaciones": [], "idiomas": [],
        "habilidades_tecnicas": [candidato_id], "competencias_blandas": [],
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


FALLAN: set[str] = set()


@pytest.fixture(autouse=True)
def _sin_fallas():
    FALLAN.clear()
    yield
    FALLAN.clear()


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
        candidatos = (
            ("C1", "processed", []), ("C2", "processed", []), ("C3", "processed", ["hidden_text"]),
            ("C4", "needs_review", ["prompt_injection"]),
        )
        for cid, estado, alertas in candidatos:
            db.add(CandidatoDB(
                id=cid, documento_id=cid, nombre_archivo=f"{cid}.pdf", estado=estado,
                ficha=_ficha(cid), lineas_anonimizadas=LINEAS, lineas_originales=LINEAS, alertas=alertas,
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

    llamadas = []

    async def evaluar_falso(ficha, requisitos, lineas):
        candidato_id = ficha.habilidades_tecnicas[0]
        llamadas.append(candidato_id)
        if candidato_id in FALLAN:
            raise RespuestaEvaluacionInvalida("El modelo devolvió una evaluación con formato inválido.")
        return RESPUESTAS[candidato_id]

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(main_module, "init_db", lambda: None)
    monkeypatch.setattr("app.routers.evaluations.evaluar", evaluar_falso)
    with TestClient(main_module.app) as test_client:
        test_client.llamadas = llamadas
        yield test_client
    app.dependency_overrides.pop(get_db, None)


def _evaluar(client, candidato_id):
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
    # La explicación se arma en código después del puntaje: la cita falsa de AWS queda "por verificar".
    assert cuerpo["explicacion"]["fortalezas"] == ["Python: Justificación de R1", "Inglés B2: Justificación de R3"]
    assert cuerpo["explicacion"]["aspectos_por_verificar"] == [
        "AWS: La cita propuesta no se encontró textualmente en el CV."
    ]


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
    llamadas_antes = len(client.llamadas)

    con_60 = client.get("/api/ranking", params={"vacante_id": "V1"}).json()["candidatos"][0]
    con_80 = client.get("/api/ranking", params={"vacante_id": "V1", "peso_obligatorios": 80}).json()

    assert con_60["puntaje"] == 70.0   # 0.6 * 0.5 + 0.4 * 1
    assert con_80["candidatos"][0]["puntaje"] == 60.0   # 0.8 * 0.5 + 0.2 * 1
    assert con_80["peso_obligatorios"] == 80
    assert len(client.llamadas) == llamadas_antes


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


def test_lote_evalua_todos_los_procesados_y_no_los_que_estan_en_revision(client):
    cuerpo = client.post("/api/vacantes/V1/evaluar").json()

    assert cuerpo == {"vacante_id": "V1", "evaluados": 3, "omitidos": 0, "errores": []}
    assert sorted(client.llamadas) == ["C1", "C2", "C3"]   # C4 (prompt injection) nunca llega al LLM
    ranking = client.get("/api/ranking", params={"vacante_id": "V1"}).json()
    assert [c["candidato_id"] for c in ranking["candidatos"]] == ["C1", "C3", "C2"]
    assert ranking["en_revision"] == [
        {"candidato_id": "C4", "nombre_archivo": "C4.pdf", "alertas": ["prompt_injection"]}
    ]


def test_lote_omite_a_los_ya_evaluados_salvo_que_se_pida_reevaluar(client):
    _evaluar(client, "C1")

    cuerpo = client.post("/api/vacantes/V1/evaluar").json()
    assert (cuerpo["evaluados"], cuerpo["omitidos"]) == (2, 1)

    cuerpo = client.post("/api/vacantes/V1/evaluar", params={"reevaluar": True}).json()
    assert (cuerpo["evaluados"], cuerpo["omitidos"]) == (3, 0)


def test_lote_un_candidato_que_falla_no_detiene_el_resto(client):
    FALLAN.add("C2")

    cuerpo = client.post("/api/vacantes/V1/evaluar").json()

    assert cuerpo["evaluados"] == 2
    assert cuerpo["errores"] == [
        {"candidato_id": "C2", "detalle": "El modelo devolvió una evaluación con formato inválido."}
    ]
    ranking = client.get("/api/ranking", params={"vacante_id": "V1"}).json()
    assert [c["candidato_id"] for c in ranking["candidatos"]] == ["C1", "C3"]


def test_lote_exige_requisitos_confirmados(client, session_factory):
    with session_factory() as db:
        db.get(VacanteDB, "V1").requisitos_confirmados = False
        db.commit()

    assert client.post("/api/vacantes/V1/evaluar").status_code == 409
    assert client.post("/api/vacantes/NO/evaluar").status_code == 404
    assert client.llamadas == []


def test_no_se_evalua_con_un_requisito_protegido_guardado(client, session_factory):
    with session_factory() as db:
        vacante = db.get(VacanteDB, "V1")
        vacante.requisitos.append(
            RequisitoDB(id="R9", nombre="Sexo masculino", tipo="obligatorio", categoria="otro", peso=1.0)
        )
        db.commit()

    r = client.post("/api/vacantes/V1/evaluar")

    assert r.status_code == 422
    assert "dato protegido (género)" in r.json()["detail"]
    assert client.llamadas == []
