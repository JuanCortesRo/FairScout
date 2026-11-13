# Desarrollo y pruebas

## Entorno local

Usa Python 3.12, Node.js 22, LibreOffice y Tesseract (idiomas español e inglés). Los pasos de instalación y ejecución están en el [README principal](../README.md).

## Suite del backend

Desde `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Las pruebas reemplazan la base de datos por SQLite temporal mediante `backend/tests/conftest.py`; no deben operar sobre `data.db` ni sobre una base de producción. Muchos tests simulan las respuestas de IA, así que no requieren gastar llamadas reales.

Para ejecutar un subconjunto:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_scoring.py tests/test_ranking.py -q
```

## Frontend y paridad del puntaje

Desde `frontend/`:

```powershell
npm ci
npm run build
```

No hay un script de pruebas unitarias frontend configurado actualmente. La paridad del cálculo frontend/backend se comprueba así:

```powershell
# Desde la raíz del repositorio
node frontend/scripts/casos_scoring.mjs

# Luego, desde backend/
.\.venv\Scripts\python.exe -m pytest tests/test_scoring.py -q
```

El generador actualiza `backend/tests/fixtures/casos_scoring.json` desde `frontend/src/lib/scoring.js`; revisa el diff generado antes de incluirlo. Al cambiar una regla, actualiza ambos scorers y agrega casos de información faltante, cumplimiento parcial, incumplimiento y descalificantes.

## CI

`.github/workflows/deploy.yml` ejecuta pytest, `npm ci`, el build del frontend y builds de Docker en Pull Requests y pushes a `main`. El despliegue de producción solo corre después de aprobar esas verificaciones y cuando el evento corresponde a `main`.

## Checklist para Pull Requests

- [ ] Cambios de contrato reflejados en esquemas, API y frontend.
- [ ] Pruebas para cambios de comportamiento, incluyendo casos límite.
- [ ] Ambas implementaciones de scoring sincronizadas si cambia una regla.
- [ ] `pytest -q`, `npm run build` y `git diff --check` pasan.
- [ ] Sin `.env`, claves, CVs reales ni datos personales en el diff.
- [ ] Documentación funcional/técnica actualizada si cambia el flujo.
