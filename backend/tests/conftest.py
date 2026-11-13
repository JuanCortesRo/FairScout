import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.main as main_module
import app.models  # noqa: F401
from app.db import Base, get_db
from app.main import app


@pytest.fixture(autouse=True)
def bd_aislada(tmp_path_factory, monkeypatch):
    """Ningún test toca la base real (data.db): cada uno usa una SQLite temporal."""
    engine = create_engine(
        f"sqlite:///{tmp_path_factory.mktemp('bd') / 'tests.db'}", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(bind=engine)
    sesiones = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def get_db_de_prueba():
        db = sesiones()
        try:
            yield db
        finally:
            db.close()

    monkeypatch.setattr(main_module, "init_db", lambda: None)
    app.dependency_overrides[get_db] = get_db_de_prueba
    yield sesiones
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()
