# Despliegue y operación

## Docker Compose local

Desde la raíz:

```powershell
Copy-Item .env.example .env
```

Completa las credenciales de PostgreSQL y el proveedor de IA. `DATABASE_URL` debe apuntar al host de Compose `db`, no a `localhost`; usa el formato `postgresql+psycopg://USUARIO:CLAVE@db:5432/BASE`. Luego:

```powershell
docker compose up --build -d
docker compose ps
```

Aplicación: <http://localhost>. Salud del backend: <http://localhost/api/health>.

Para observar la salida:

```powershell
docker compose logs -f backend
docker compose logs -f web
docker compose logs -f db
```

Detener los contenedores sin borrar datos:

```powershell
docker compose down
```

Los datos de PostgreSQL, archivos temporales de carga y datos de Caddy usan volúmenes. No elimines volúmenes si necesitas conservar la información. No incluyas `.env` en Git.

## Arquitectura de producción

Caddy sirve el bundle estático y enruta `/api/*` al backend. Compose ejecuta PostgreSQL, backend y web; la base de datos y cargas usan almacenamiento persistente.

La configuración de Caddy acepta `DOMAIN=:80` para HTTP. Para HTTPS requiere un hostname público resoluble, por ejemplo un nombre `sslip.io` asociado con la IP del servidor, y conectividad entrante a 80/443 para validar el certificado.

## Despliegue continuo

El workflow de GitHub Actions:

1. En PR y push a `main`, instala dependencias, ejecuta tests/build y construye imágenes.
2. En push a `main` (o ejecución manual sobre `main`), el job `deploy` corre en un runner self-hosted.
3. El runner copia `~/talentscout.env` a `.env`, ejecuta `docker compose -p talentscout up -d --build --remove-orphans` y verifica la salud del backend dentro del contenedor.

Antes de habilitar el runner:

- Guarda la configuración del servidor en `~/talentscout.env`, fuera del repositorio y con permisos restrictivos.
- Usa un repositorio privado y protege `main`; el runner tiene acceso al servidor y no debe ejecutar contribuciones no confiables.
- Mantén copias de seguridad de PostgreSQL y define restauración; los volúmenes no sustituyen un backup.
- Limita el acceso a la API administrativa. No hay autenticación de usuario integrada.

## Diagnóstico rápido

| Síntoma | Revisión |
|---|---|
| La API no responde | `docker compose ps`, logs del backend y `GET /api/health`. |
| Backend no conecta a PostgreSQL | Valida `DATABASE_URL`, usuario/clave y estado saludable de `db`. Dentro de Compose, el host es `db`. |
| Frontend no puede llamar a la API | Revisa que Caddy esté activo y que las rutas `/api` se enruten a `backend:8000`. |
| DOCX no se procesa | Comprueba LibreOffice instalado en la imagen o disponible localmente. |
| PDF escaneado no se procesa | Comprueba Tesseract y los paquetes de idioma español e inglés. |
| IA no responde | Verifica `ANTHROPIC_API_KEY`, IDs de modelo, permisos, límites y logs; no registres ni compartas la clave. |
| HTTPS no se obtiene | Comprueba DNS público, `DOMAIN`, puertos 80/443 y logs de Caddy. |

## Configuración

Consulta la lista completa de variables en el [README](../README.md#configuración) y los detalles de pipeline en [arquitectura](arquitectura.md).
