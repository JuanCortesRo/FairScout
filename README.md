# FairScout

FairScout es una herramienta de apoyo a la selección: convierte una descripción de cargo en requisitos revisables, procesa CVs anonimizados y presenta un ranking explicable con evidencia del documento. La IA propone y analiza; el puntaje se calcula con reglas explícitas y la decisión final corresponde a una persona.

## Primeros pasos

### Requisitos

- Python 3.12.
- Node.js 22.
- LibreOffice para convertir archivos `.docx`.
- Tesseract OCR con los idiomas español e inglés para CVs escaneados.
- Una clave de Anthropic para crear vacantes, extraer fichas, evaluar CVs y realizar entrevistas con IA.

La imagen Docker del backend instala LibreOffice y Tesseract. En Windows, instala esos programas por separado y asegúrate de que `soffice` y `tesseract` estén disponibles en `PATH`.

### Ejecución local en Windows

En una terminal PowerShell, configura e inicia el backend:

```powershell
cd "C:\ruta\FairScout\backend"
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edita `backend/.env` y agrega tu `ANTHROPIC_API_KEY`. El ejemplo usa SQLite local (`sqlite:///./data.db`).

```powershell
python -m uvicorn app.main:app --reload
```

En otra terminal, inicia el frontend:

```powershell
cd "C:\ruta\FairScout\frontend"
npm ci
npm run dev
```

Abre <http://localhost:5173>. La documentación interactiva de la API (Swagger UI) está en <http://localhost:8000/docs>. El servidor Vite redirige `/api` a `localhost:8000`.

### Ejecución con Docker Compose

Desde la raíz del repositorio:

```powershell
Copy-Item .env.example .env
```

Completa los valores de `.env` con credenciales propias y una URL de PostgreSQL que apunte al servicio `db`; nunca uses las credenciales de ejemplo en un entorno real.

```powershell
docker compose up --build
```

La aplicación queda en <http://localhost> y la API en <http://localhost/api>. Docker Compose guarda PostgreSQL, cargas procesadas y datos de Caddy en volúmenes persistentes.

## Flujo de uso

1. Crea una vacante a partir de una descripción.
2. Revisa y confirma los requisitos propuestos; la IA puede proponer requisitos protegidos que se bloquean.
3. Carga archivos PDF o DOCX en esa vacante.
4. Revisa el ranking; las evaluaciones se procesan por lotes y los errores se muestran por candidato.
5. Abre un candidato para consultar requisitos, citas, justificaciones y confianza; compara perfiles o exporta el ranking.
6. Si corresponde, inicia una entrevista interna o genera una invitación pública con consentimiento.

Consulta la [guía de uso](docs/guia-de-uso.md) para el significado de estados y recomendaciones.

## Documentación

La documentación oficial del proyecto está en la carpeta [`docs/`](docs/README.md); este README solo resume cómo empezar. Si algo de este archivo no coincide con `docs/`, prevalece `docs/`.

La API también se documenta sola con **Swagger UI**: con el backend corriendo en local, abre <http://localhost:8000/docs> para ver y probar cada endpoint (ReDoc en <http://localhost:8000/redoc> y el esquema OpenAPI en <http://localhost:8000/openapi.json>). Con Docker Compose, Caddy solo expone `/api/*`, así que Swagger no queda publicado; úsalo desde la ejecución local.

- [Índice de documentación](docs/README.md)
- [Guía de uso](docs/guia-de-uso.md)
- [Arquitectura y flujo de datos](docs/arquitectura.md)
- [API HTTP](docs/api.md)
- [Desarrollo y pruebas](docs/desarrollo-y-pruebas.md)
- [Despliegue y operación](docs/despliegue.md)
- [Privacidad, seguridad y uso responsable](docs/privacidad-y-uso-responsable.md)
- [Diagrama de arquitectura](docs/arquitecturaFairScout.svg)

## Estructura del repositorio

```text
backend/app/       API FastAPI, persistencia, pipeline y entrevistas
backend/tests/     Pruebas pytest y fixtures de paridad de puntaje
frontend/src/      Aplicación React, vistas, cliente API y modo demo
frontend/scripts/  Generación de casos compartidos de scoring
data/              Directorios reservados para datasets locales
docs/              Guías funcionales, técnicas y operativas
.github/workflows/ CI y despliegue en runner self-hosted
docker-compose.yml PostgreSQL, backend y frontend/Caddy
```

## Configuración

El backend carga su configuración desde variables de entorno o `backend/.env`. Docker Compose carga el `.env` de la raíz. Las variables principales son:

| Variable | Uso | Valor predeterminado local |
|---|---|---|
| `ANTHROPIC_API_KEY` | Credencial del proveedor de IA. | Vacía; necesaria para funciones de IA. |
| `DATABASE_URL` | Conexión SQLAlchemy. | `sqlite:///./data.db` |
| `FRONTEND_URL` | Origen del frontend y URL base de invitaciones. | `http://localhost:5173` |
| `MODELO_EXTRACCION` | Modelo para proponer requisitos y extraer fichas. | `claude-haiku-5-5` |
| `MODELO_EVALUACION` | Modelo para evaluación y entrevista. | `claude-haiku-5-5` |
| `PROMPT_VERSION` | Versión de prompts en `backend/app/prompts/`. | `v1` |
| `LLM_TIMEOUT_SECONDS` | Tiempo máximo por solicitud al proveedor. | `60` |
| `EVALUACIONES_CONCURRENTES` | Máximo de evaluaciones simultáneas en un lote. | `5` |
| `UPLOADS_DIR` | Directorio temporal usado al procesar documentos. | `uploads` |
| `LIBREOFFICE_PATH` | Ruta opcional a LibreOffice si no está en `PATH`. | Vacía |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Credenciales de PostgreSQL en Compose. | Definidas en `.env.example`; cámbialas. |
| `DOMAIN` | Host de Caddy: `:80` o dominio público. | `:80` |

`VITE_API_BASE` es una variable de compilación del frontend; vacía usa rutas relativas `/api`. No incluyas claves ni datos personales en commits, issues o logs.

## Estado actual y limitaciones

- El puntaje, estado, recomendación y orden se calculan en código en backend y frontend. Las implementaciones se mantienen sincronizadas con fixtures de paridad.
- El modo demo usa datos estáticos del frontend y no representa resultados de una ejecución real.
- Las correcciones humanas se guardan en el servidor y se aplican al ranking y a la exportación. El registro de actividad de la vista de auditoría sigue siendo estado de interfaz; no equivale a una bitácora persistente.
- La API administrativa no implementa autenticación de usuarios. No la expongas directamente a Internet sin controles de acceso en la infraestructura.
- La entrevista interna y las invitaciones públicas usan el agente del backend; la entrevista no toma decisiones de contratación.

Más detalles en [privacidad y uso responsable](docs/privacidad-y-uso-responsable.md) y [despliegue](docs/despliegue.md).
