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
        db.flush()  # la vacante debe existir antes que los candidatos que la referencian
        # V2 es otra vacante con sus propios CVs: nunca deben aparecer ni evaluarse en V1.
        db.add(VacanteDB(
            id="V2", titulo="Frontend", descripcion="Otra vacante de prueba", requisitos_confirmados=True,
            requisitos=[RequisitoDB(id=i, nombre=n, tipo=t, categoria=c, peso=1.0) for i, n, t, c in REQUISITOS],
        ))
        db.flush()
        candidatos = (
            ("C1", "V1", "processed", []), ("C2", "V1", "processed", []),
            ("C3", "V1", "processed", ["hidden_text"]), ("C4", "V1", "needs_review", ["prompt_injection"]),
            ("C8", "V2", "needs_review", ["prompt_injection"]), ("C9", "V2", "processed", []),
        )
        for cid, vacante_id, estado, alertas in candidatos:
            db.add(CandidatoDB(
                id=cid, vacante_id=vacante_id, documento_id=cid, estado=estado,
                ficha=_ficha(cid), lineas_anonimizadas=LINEAS, alertas=alertas,
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
        "motivo_estado": "Cumple todos los obligatorios y no tiene descalificantes presentes",
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
    assert estados == {"C1": "cumple", "C3": "pendiente_verificar", "C2": "no_cumple"}
    c3 = next(c for c in cuerpo["candidatos"] if c["candidato_id"] == "C3")
    assert c3["confianza"] == "baja"  # texto oculto cuenta como intento de manipulación
    assert c3["motivo_estado"] == "Obligatorio sin información: AWS"
    assert c3["recomendado_entrevista"] is True
    assert cuerpo["detalles"]["C3"]["puntaje_obligatorios"] == 0.5
    assert cuerpo["detalles"]["C3"]["categorias"] == {"tecnica": 0.5, "idioma": 1.0}


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
        {"candidato_id": "C4", "alertas": ["prompt_injection"]}
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
        {"candidato_id": "C2", "detalle": "La IA no pudo evaluar este CV. Intenta de nuevo."}
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


def test_listar_evaluaciones_devuelve_la_vigente_de_cada_candidato(client, session_factory):
    _evaluar(client, "C1")
    _evaluar(client, "C2")
    _evaluar(client, "C2")

    cuerpo = client.get("/api/vacantes/V1/evaluaciones").json()

    assert [e["candidato_id"] for e in cuerpo] == ["C1", "C2"]
    c1 = cuerpo[0]
    assert [e["requisito_id"] for e in c1["evaluaciones"]] == ["R1", "R2", "R3"]
    assert c1["evaluaciones"][0]["cita_verificada"] is True
    assert c1["trazabilidad"]["version_requisitos"] == 1

    with session_factory() as db:
        db.get(VacanteDB, "V1").version_requisitos += 1
        db.commit()
    assert client.get("/api/vacantes/V1/evaluaciones").json() == []
    assert client.get("/api/vacantes/NO/evaluaciones").status_code == 404


def test_obtener_evaluacion_individual_devuelve_solo_la_vigente(client, session_factory):
    _evaluar(client, "C1")
    endpoint = "/api/vacantes/V1/candidatos/C1/evaluacion"

    assert client.get(endpoint).json()["candidato_id"] == "C1"
    assert client.get("/api/vacantes/V1/candidatos/C4/evaluacion").status_code == 404
    assert client.get("/api/vacantes/NO/candidatos/C1/evaluacion").status_code == 404

    with session_factory() as db:
        db.get(VacanteDB, "V1").version_requisitos += 1
        db.commit()
    assert client.get(endpoint).status_code == 404


def test_no_se_evalua_un_cv_de_otra_vacante(client):
    respuesta = client.post("/api/evaluations", json={"candidato_id": "C9", "vacante_id": "V1"})

    assert respuesta.status_code == 409
    assert respuesta.json()["detail"] == "El CV no pertenece a esta vacante."
    assert client.llamadas == []


def test_borrar_una_vacante_borra_sus_cvs_y_evaluaciones_pero_no_los_de_otra(client, session_factory):
    client.post("/api/vacantes/V1/evaluar")

    assert client.delete("/api/vacantes/V1").status_code == 204
    assert client.get("/api/vacantes/V1").status_code == 404
    assert client.delete("/api/vacantes/V1").status_code == 404
    with session_factory() as db:
        assert {c.id for c in db.query(CandidatoDB)} == {"C8", "C9"}
    assert [v["id"] for v in client.get("/api/vacantes").json()] == ["V2"]


def test_entrevista_exige_que_el_cv_sea_de_la_vacante(client, monkeypatch):
    from app.interview.agent import PreguntaEntrevista

    async def plan_falso(ficha, requisitos):
        return [PreguntaEntrevista(id=f"P{i}", tema="Python", texto=f"Pregunta de prueba número {i}") for i in range(5)]
    monkeypatch.setattr("app.routers.interviews.generar_plan", plan_falso)

    propia = client.post("/api/entrevistas", json={"candidato_id": "C1", "vacante_id": "V1"})
    ajena = client.post("/api/entrevistas", json={"candidato_id": "C9", "vacante_id": "V1"})
    invitacion_ajena = client.post("/api/vacantes/V1/candidatos/C9/entrevista")

    assert propia.status_code == 200
    assert propia.json()["pregunta"]["id"] == "P0"
    assert ajena.status_code == 409
    assert invitacion_ajena.status_code == 409


def _libro_exportado(respuesta):
    import io

    from openpyxl import load_workbook
    return load_workbook(io.BytesIO(respuesta.content))


def test_exportar_el_ranking_en_xlsx_con_el_contacto_y_registra_la_exportacion(client, session_factory):
    from app.models import ContactoCandidatoDB, ExportacionDB

    client.post("/api/vacantes/V1/evaluar")
    with session_factory() as db:
        db.add(ContactoCandidatoDB(candidato_id="C1", nombre="Laura Gómez", correo="laura@example.com", telefono="310 555 1234"))
        db.commit()

    respuesta = client.get("/api/vacantes/V1/exportar")

    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument.spreadsheetml")
    assert 'filename="ranking_backend_' in respuesta.headers["content-disposition"]
    libro = _libro_exportado(respuesta)
    assert libro.sheetnames == ["Ranking", "Evidencia", "Información"]
    filas = list(libro["Ranking"].iter_rows(min_row=2, values_only=True))
    assert [f[1] for f in filas] == ["Candidato C1", "Candidato C3", "Candidato C2"]   # mismo orden que el ranking
    assert filas[0][2:5] == ("Laura Gómez", "laura@example.com", "310 555 1234")
    assert filas[1][2:5] == (None, None, None)
    assert libro["Evidencia"].max_row == 1 + 3 * len(REQUISITOS)
    assert "datos personales" in libro["Información"]["B6"].value
    # El contacto solo sale en el archivo: el ranking de la API no lo trae.
    assert "Laura" not in client.get("/api/ranking", params={"vacante_id": "V1"}).text
    with session_factory() as db:
        exportacion = db.query(ExportacionDB).one()
        assert (exportacion.vacante_id, exportacion.top, exportacion.candidatos) == ("V1", None, ["C1", "C3", "C2"])


def test_exportar_solo_el_top_n(client, session_factory):
    from app.models import ExportacionDB

    client.post("/api/vacantes/V1/evaluar")

    libro = _libro_exportado(client.get("/api/vacantes/V1/exportar", params={"top": 1}))

    assert [f[1] for f in libro["Ranking"].iter_rows(min_row=2, values_only=True)] == ["Candidato C1"]
    with session_factory() as db:
        assert db.query(ExportacionDB).one().top == 1


def test_exportar_sin_evaluados_o_vacante_inexistente(client):
    assert client.get("/api/vacantes/V1/exportar").status_code == 409
    assert client.get("/api/vacantes/NO/exportar").status_code == 404
    assert client.get("/api/vacantes/V1/exportar", params={"top": 0}).status_code == 422


def test_confirmar_los_requisitos_sin_cambios_no_vuelve_a_llamar_a_la_ia(client):
    client.post("/api/vacantes/V1/evaluar")
    llamadas = len(client.llamadas)
    requisitos = [{"id": i, "nombre": n, "tipo": t, "categoria": c, "peso": 2.0} for i, n, t, c in REQUISITOS]

    actualizada = client.put("/api/vacantes/V1", json={
        "titulo": "Backend", "descripcion": "Vacante de prueba con otra descripción", "requisitos": requisitos,
    }).json()
    lote = client.post("/api/vacantes/V1/evaluar").json()

    assert actualizada["version_requisitos"] == 1
    assert (lote["evaluados"], lote["omitidos"]) == (0, 3)
    assert len(client.llamadas) == llamadas
