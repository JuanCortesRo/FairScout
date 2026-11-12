from sqlalchemy import create_engine, inspect

import app.db as db_module


def test_init_db_crea_tablas_de_vacantes_y_requisitos(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'schema.db'}")
    monkeypatch.setattr(db_module, "engine", engine)

    db_module.init_db()

    assert {"vacantes", "requisitos"} <= set(inspect(engine).get_table_names())
    engine.dispose()
