# API HTTP

La API tiene prefijo `/api` y no requiere versión de ruta. En local, FastAPI publica OpenAPI y Swagger UI en <http://localhost:8000/docs> y ReDoc en <http://localhost:8000/redoc>. Los ejemplos asumen que la aplicación corre en `http://localhost:8000`.

## Vacantes

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Estado básico del servicio (`{"status":"ok"}`). |
| `GET` | `/api/vacantes` | Lista vacantes ordenadas por fecha. |
| `GET` | `/api/vacantes/{vacante_id}` | Devuelve vacante, requisitos, versión y confirmación. |
| `POST` | `/api/vacantes` | Propone requisitos con IA y crea un borrador. |
| `PUT` | `/api/vacantes/{vacante_id}` | Confirma o actualiza título, descripción y requisitos. |
| `DELETE` | `/api/vacantes/{vacante_id}` | Elimina la vacante y los datos relacionados (204). |

Crear borrador:

```http
POST /api/vacantes
Content-Type: application/json

{"descripcion":"Buscamos una persona desarrolladora backend con experiencia en Python y PostgreSQL..."}
```

Confirmar requisitos:

```http
PUT /api/vacantes/{vacante_id}
Content-Type: application/json

{
  "titulo": "Desarrollador Backend",
  "descripcion": "Descripción del cargo...",
  "requisitos": [
    {"id":"R1","nombre":"Experiencia con Python","tipo":"obligatorio","categoria":"tecnica","peso":1},
    {"id":"R2","nombre":"Experiencia con Docker","tipo":"deseable","categoria":"tecnica","peso":1.5}
  ]
}
```

Tipos aceptados: `obligatorio`, `deseable`, `descalificante`. Para la creación se requiere una descripción de al menos 20 caracteres. Criterios protegidos producen `422`.

Ejemplo de respuesta (se han abreviado algunos campos):

```json
{
  "id": "ID_DE_VACANTE",
  "titulo": "Desarrollador Backend",
  "requisitos": [
    {"id":"R1","nombre":"Experiencia con Python","tipo":"obligatorio","categoria":"tecnica","peso":1}
  ],
  "version_requisitos": 1,
  "requisitos_confirmados": false
}
```

## CVs y evaluaciones

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/vacantes/{vacante_id}/cvs` | Carga uno o varios PDF/DOCX como `multipart/form-data`, campo repetido `archivos`. |
| `GET` | `/api/vacantes/{vacante_id}/cvs` | Lista metadatos, alertas y similares; no devuelve líneas completas. |
| `GET` | `/api/candidatos/{candidato_id}` | Obtiene ficha y líneas anonimizadas para el detalle. |
| `DELETE` | `/api/candidatos/{candidato_id}` | Elimina candidato y datos dependientes (204). |
| `POST` | `/api/evaluations` | Evalúa un CV frente a una vacante confirmada. |
| `POST` | `/api/vacantes/{vacante_id}/evaluar` | Evalúa candidatos listos en lote. Parámetro `reevaluar=true` fuerza evaluación nueva. |
| `GET` | `/api/vacantes/{vacante_id}/evaluaciones` | Lista la evaluación vigente más reciente por candidato. |
| `GET` | `/api/vacantes/{vacante_id}/candidatos/{candidato_id}/evaluacion` | Obtiene una evaluación vigente individual. |
| `GET` | `/api/ranking?vacante_id={id}` | Devuelve resultados, desglose y candidatos en revisión. |

Ejemplo de carga:

```powershell
curl.exe -X POST "http://localhost:8000/api/vacantes/ID/cvs" `
  -F "archivos=@C:\CVs\perfil.pdf" `
  -F "archivos=@C:\CVs\perfil.docx"
```

`GET /api/ranking` acepta `peso_obligatorios` entre 0 y 100 (predeterminado 60); los deseables toman el porcentaje restante. Requiere `vacante_id` para obtener candidatos. El ranking contiene `candidatos`, `detalles` por candidato y `en_revision`.

Evaluar un candidato individual:

```http
POST /api/evaluations
Content-Type: application/json

{"candidato_id":"ID_DE_CANDIDATO","vacante_id":"ID_DE_VACANTE"}
```

Evaluar el lote omitiendo candidatos con una evaluación vigente:

```http
POST /api/vacantes/ID_DE_VACANTE/evaluar
```

Para forzar reevaluación, usa `POST /api/vacantes/ID_DE_VACANTE/evaluar?reevaluar=true`.

Ejemplo reducido de respuesta:

```json
{
  "vacante_id": "ID_DE_VACANTE",
  "peso_obligatorios": 60,
  "candidatos": [
    {
      "candidato_id": "ID_DE_CANDIDATO",
      "puntaje": 75,
      "estado": "pendiente_verificar",
      "confianza": "media",
      "recomendado_entrevista": false,
      "motivo_estado": "Obligatorio sin información: Inglés B2"
    }
  ],
  "detalles": {},
  "en_revision": []
}
```

Los valores posibles de `estado` son `cumple`, `cumple_parcialmente`, `pendiente_verificar` y `no_cumple`; `confianza` puede ser `alta`, `media` o `baja`.

## Exportación

`GET /api/vacantes/{vacante_id}/exportar` entrega un archivo XLSX. Parámetros opcionales:

- `top`: entero desde 1; limita cuántos candidatos incluir.
- `peso_obligatorios`: entre 0 y 100, predeterminado 60.

El libro incluye información de contacto cuando existe; el endpoint registra la exportación.

## Entrevistas

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/entrevistas` | Inicia una entrevista interna con `{ "candidato_id": "...", "vacante_id": "..." }`. |
| `GET` | `/api/entrevistas/{entrevista_id}` | Recupera la sesión interna. |
| `POST` | `/api/entrevistas/{entrevista_id}/respuestas` | Envía una respuesta interna (`respuesta`). |
| `POST` | `/api/entrevistas/{entrevista_id}/finalizar` | Finaliza la sesión. |
| `POST` | `/api/entrevistas/{entrevista_id}/reiniciar` | Reinicia la sesión. |
| `POST` | `/api/vacantes/{vacante_id}/candidatos/{candidato_id}/entrevista` | Genera invitación pública de 72 horas. |
| `GET` | `/api/vacantes/{vacante_id}/entrevistas` | Lista sesiones/invitaciones de la vacante. |
| `POST` | `/api/entrevistas/{entrevista_id}/revocar` | Revoca una invitación. |
| `GET` | `/api/publico/entrevistas/{token}` | Consulta la invitación pública. |
| `POST` | `/api/publico/entrevistas/{token}/iniciar` | Inicia tras aceptar consentimiento. |
| `POST` | `/api/publico/entrevistas/{token}/responder` | Envía una respuesta pública (`texto`). |

Los tokens de invitación son credenciales de acceso: no los registres en logs ni los compartas públicamente.

## Errores comunes

| Código | Significado habitual |
|---|---|
| `400` | Archivo no admitido o solicitud incorrecta. |
| `404` | No existe la vacante, candidato o entrevista indicada. |
| `409` | Estado incompatible: requisitos sin confirmar, CV no listo o perteneciente a otra vacante. |
| `422` | Datos inválidos o requisito protegido. |
| `429` | Límite del servicio del modelo. |
| `502` / `503` | Falla de proveedor, conexión o configuración de IA. |

Las respuestas de error contienen `detail`. La API administrativa no incluye autenticación; limita su exposición a redes de confianza.
