# AI Talent Scout

Herramienta de apoyo a la selección de personal: a partir de la descripción de un cargo, extrae requisitos
(obligatorios, deseables y descalificantes), procesa hojas de vida en PDF/DOCX de forma anonimizada y genera un
ranking explicable de candidatos con citas verificables al CV.

## Estructura

```
backend/            API FastAPI (Python 3.12)
  app/
    main.py         App, CORS y routers
    config.py       Variables de entorno (pydantic-settings)
    db.py           SQLAlchemy (SQLite en local, Postgres en Docker)
    schemas.py      Modelos Pydantic compartidos
    llm.py          Cliente de Anthropic y utilidades
    routers/        health, vacantes, cvs, ranking  (todos bajo /api)
    pipeline/       requirements (vacante) y parsing → anonymize → extract → postprocess → evaluate → verify → scoring → explain
    interview/      Bonus: agente entrevistador
    prompts/        Prompts versionados (.md), nunca dentro del código
  tests/            pytest
frontend/           Vite + React + Tailwind + shadcn/ui
  src/pages/        NuevaVacante, CargaCVs, Ranking, DetalleCandidato, Comparador, Auditoria, Entrevista
  Caddyfile         Sirve el build y redirige /api al backend
data/               cvs/, vacantes/, set_dorado/
docs/               Documento base del proyecto
docker-compose.yml  db (postgres:16) + backend + web (Caddy)
.github/workflows/  CI (pytest + build) y despliegue en runner self-hosted
```

## Correr en local

**Backend** (requiere Python 3.12):

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # y pon tu ANTHROPIC_API_KEY
uvicorn app.main:app --reload # http://localhost:8000/api/health
pytest                        # pruebas
```

**Frontend** (requiere Node 20+):

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173 (redirige /api a localhost:8000)
```

**Todo con Docker:**

```bash
cp .env.example .env          # completa ANTHROPIC_API_KEY, POSTGRES_PASSWORD y DATABASE_URL
docker compose up --build     # http://localhost
```

**Despliegue:** cada push a `main` corre las pruebas y, si pasan, el runner propio del servidor ejecuta
`docker compose -p talentscout up -d --build` usando `~/talentscout.env` (creado una sola vez a mano en el servidor).

## Variables de entorno

| Variable | Dónde | Descripción |
|---|---|---|
| `ANTHROPIC_API_KEY` | backend | Llave de la API de Anthropic |
| `DATABASE_URL` | backend | Por defecto `sqlite:///./data.db`; en Docker `postgresql+psycopg://usuario:clave@db:5432/bd` |
| `FRONTEND_URL` | backend | Origen permitido por CORS |
| `MODELO_EXTRACCION` | backend | Modelo para requisitos y extracción (por defecto `claude-haiku-5-5`) |
| `MODELO_EVALUACION` | backend | Modelo para la evaluación (por defecto `claude-sonnet-5-5`) |
| `PROMPT_VERSION` | backend | Versión de prompts a cargar desde `app/prompts/` (por defecto `v1`) |
| `UPLOADS_DIR` | backend | Carpeta donde se guardan los CVs subidos (por defecto `uploads`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | compose | Credenciales de la base de datos |
| `DOMAIN` | compose | `:80` para HTTP o `<ip-con-guiones>.sslip.io` para HTTPS automático |
| `VITE_API_BASE` | frontend | URL del backend; vacío = rutas relativas `/api` |

Nunca subas archivos `.env`, llaves `.pem` ni credenciales: usa los `.env.example` como plantilla.
