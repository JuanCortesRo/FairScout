from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, inspect, select, text

import app.db as db_module
from app.main import app
from app.models import CandidatoDB, EntrevistaDB, EvaluacionDB, VacanteDB


def test_init_db_crea_tablas_de_vacantes_y_requisitos(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'schema.db'}")
    monkeypatch.setattr(db_module, "engine", engine)

    db_module.init_db()

    assert {"vacantes", "requisitos", "candidatos", "evaluaciones"} <= set(inspect(engine).get_table_names())
    engine.dispose()


def test_init_db_migra_columnas_de_una_base_existente(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as conexion:
        conexion.execute(text(
            "CREATE TABLE vacantes (id VARCHAR(32) PRIMARY KEY, titulo VARCHAR(300) NOT NULL, "
            "descripcion TEXT NOT NULL)"
        ))
    monkeypatch.setattr(db_module, "engine", engine)

    db_module.init_db()

    columnas = {columna["name"] for columna in inspect(engine).get_columns("vacantes")}
    assert {"requisitos_confirmados", "version_requisitos", "fecha_creacion"} <= columnas
    engine.dispose()


def test_init_db_agrega_alertas_a_candidatos_existentes(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy_candidatos.db'}")
    with engine.begin() as conexion:
        conexion.execute(text(
            "CREATE TABLE candidatos (id VARCHAR(32) PRIMARY KEY, documento_id VARCHAR(32) NOT NULL, "
            "nombre_archivo VARCHAR(300) NOT NULL, estado VARCHAR(30) NOT NULL, ficha JSON NOT NULL, "
            "lineas_anonimizadas JSON NOT NULL, lineas_originales JSON NOT NULL)"
        ))
        conexion.execute(text(
            "INSERT INTO candidatos VALUES ('C1', 'C1', 'cv.pdf', 'processed', '{}', '[]', '[]')"
        ))
    monkeypatch.setattr(db_module, "engine", engine)

    db_module.init_db()

    with engine.connect() as conexion:
        assert conexion.execute(text("SELECT alertas FROM candidatos WHERE id = 'C1'")).scalar() == "[]"
    columnas = {columna["name"] for columna in inspect(engine).get_columns("candidatos")}
    assert "fecha_creacion" in columnas
    # El texto original y el nombre del archivo eran datos personales: se eliminan de las bases existentes.
    assert not {"lineas_originales", "nombre_archivo"} & columnas
    engine.dispose()


def _vacante(vacante_id: str, fecha: datetime | None = None) -> VacanteDB:
    return VacanteDB(id=vacante_id, titulo=vacante_id, descripcion="Descripción de prueba del cargo", fecha_creacion=fecha)


def _candidato(candidato_id: str) -> CandidatoDB:
    return CandidatoDB(
        id=candidato_id, documento_id=candidato_id, estado="processed",
        ficha={}, lineas_anonimizadas=[], alertas=[],
    )


def _poblar(db) -> None:
    db.add_all([_vacante("V1"), _vacante("V2"), _candidato("C1"), _candidato("C2")])
    db.flush()
    db.add_all([
        EvaluacionDB(id="E1", candidato_id="C1", vacante_id="V1", version_requisitos=1, resultado={}),
        EvaluacionDB(id="E2", candidato_id="C2", vacante_id="V2", version_requisitos=1, resultado={}),
        EntrevistaDB(id="I1", candidato_id="C1", vacante_id="V1"),
    ])
    db.commit()


def _ids(db, modelo) -> set[str]:
    return set(db.scalars(select(modelo.id)))


def test_borrar_una_vacante_borra_sus_evaluaciones_y_entrevistas(bd_aislada):
    with bd_aislada() as db:
        _poblar(db)
        db.delete(db.get(VacanteDB, "V1"))
        db.commit()

        assert _ids(db, EvaluacionDB) == {"E2"}
        assert _ids(db, EntrevistaDB) == set()
        assert _ids(db, CandidatoDB) == {"C1", "C2"}


def test_borrar_un_candidato_borra_sus_evaluaciones_y_entrevistas(bd_aislada):
    with bd_aislada() as db:
        _poblar(db)
        db.delete(db.get(CandidatoDB, "C1"))
        db.commit()

        assert _ids(db, EvaluacionDB) == {"E2"}
        assert db.scalar(select(func.count()).select_from(EntrevistaDB)) == 0


def test_las_filas_nuevas_guardan_fecha_de_creacion(bd_aislada):
    with bd_aislada() as db:
        _poblar(db)
        assert db.get(VacanteDB, "V1").fecha_creacion is not None
        assert db.get(CandidatoDB, "C1").fecha_creacion is not None
        assert db.get(EvaluacionDB, "E1").fecha_creacion is not None


def test_listar_vacantes_muestra_primero_la_mas_reciente(bd_aislada):
    with bd_aislada() as db:
        db.add_all([
            _vacante("antigua", datetime(2026, 11, 10, tzinfo=timezone.utc)),
            _vacante("reciente", datetime(2026, 11, 12, tzinfo=timezone.utc)),
        ])
        db.commit()
        # Una fila creada antes de existir la columna queda sin fecha: va al final.
        db.execute(text("INSERT INTO vacantes (id, titulo, descripcion, requisitos_confirmados, version_requisitos) "
                        "VALUES ('sin_fecha', 'x', 'Descripción de prueba del cargo', 0, 1)"))
        db.commit()

    with TestClient(app) as client:
        vacantes = client.get("/api/vacantes").json()

    assert [v["id"] for v in vacantes] == ["reciente", "antigua", "sin_fecha"]
    assert vacantes[0]["fecha_creacion"].startswith("2026-11-12")
