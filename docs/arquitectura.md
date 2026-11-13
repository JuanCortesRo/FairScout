# Arquitectura y flujo de datos

## Componentes

```text
Navegador (React / Vite)
        │ /api
        ▼
FastAPI ─── Anthropic API
   │
   ├── SQLAlchemy ── SQLite local / PostgreSQL en Compose
   ├── PyMuPDF ── Tesseract OCR
   └── LibreOffice (conversión DOCX a PDF)

Producción: Caddy sirve el build estático y hace reverse proxy de /api al backend.
```

El [diagrama SVG](arquitecturaFairScout.svg) presenta la arquitectura visualmente. El frontend centraliza solicitudes HTTP en `frontend/src/api.js` y estado de aplicación en `frontend/src/store.jsx`. Las rutas de FastAPI se montan bajo `/api`; los esquemas Pydantic definen los contratos.

## Ciclo de una vacante

1. `POST /api/vacantes` recibe una descripción, solicita requisitos al modelo, filtra criterios protegidos y guarda un borrador.
2. La persona revisa y confirma los requisitos con `PUT /api/vacantes/{id}`.
3. Cada cambio al contenido evaluable crea una nueva versión. El orden, título, descripción y pesos no alteran por sí mismos la versión de evaluación.
4. Los pesos se aplican al recalcular puntajes en código, sin otra llamada al modelo.

## Pipeline de un CV

1. El endpoint de carga verifica la vacante y extensión del archivo.
2. DOCX se convierte temporalmente a PDF; PyMuPDF extrae texto y coordenadas. Las páginas con poco texto pasan por OCR con Tesseract.
3. Se detectan señales sospechosas y datos personales; se conserva el contacto en una tabla separada y se anonimizan las líneas para la IA.
4. Las alertas críticas bloquean la extracción automática y dejan el CV en revisión.
5. Las coincidencias de contenido o contacto se comprueban dentro de la vacante.
6. El modelo extrae una ficha; el backend normaliza fechas, habilidades, idiomas y años totales de experiencia.
7. El endpoint de evaluación llama al modelo por candidato, verifica que las citas correspondan con el texto, calcula resultado en código y guarda trazabilidad.
8. El ranking selecciona la evaluación vigente por candidato y versión de requisitos; cambiar pesos solo recalcula el resultado.

La carga procesa los documentos dentro de la solicitud, secuencialmente por lote. La evaluación en lote usa concurrencia limitada por `EVALUACIONES_CONCURRENTES` y guarda cada resultado conforme termina.

## Persistencia

| Entidad | Datos principales | Relación |
|---|---|---|
| `vacantes` / `requisitos` | Descripción, estado de confirmación, versión y requisitos. | Una vacante tiene varios requisitos. |
| `candidatos` | Identificador, vacante, ficha, líneas anonimizadas y alertas. | Pertenece a una vacante. |
| `contactos_candidato` | Nombre, correo y teléfono separados de la ficha. | Se elimina junto con el candidato. |
| `evaluaciones` | Resultados por requisito, explicación y trazabilidad. | Relacionada con candidato, vacante y versión. |
| `entrevistas` | Estado, plan, mensajes, historial e informe. | Relacionada con candidato y vacante. |
| `exportaciones` | Fecha, candidatos y parámetros del XLSX creado. | Relacionada con la vacante. |

El archivo original del CV se procesa temporalmente y se elimina al terminar; no se guarda en la base. Se persisten texto anonimizado y contacto separado. PostgreSQL, cargas temporales de Compose y datos de Caddy viven en volúmenes distintos.

## Cálculo de ranking

El cálculo está duplicado intencionalmente en `backend/app/pipeline/scoring.py` y `frontend/src/lib/scoring.js` para la demo y los ajustes de pesos. El backend es la fuente de verdad en modo conectado. Los casos compartidos se generan mediante `frontend/scripts/casos_scoring.mjs` y `backend/tests/fixtures/casos_scoring.json`; cualquier cambio debe modificar ambas implementaciones y volver a generar los fixtures.
