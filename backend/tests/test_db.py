from sqlalchemy import create_engine, inspect, text

import app.db as db_module


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
    assert {"requisitos_confirmados", "version_requisitos"} <= columnas
    engine.dispose()
