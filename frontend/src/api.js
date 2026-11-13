// Cliente del backend. Por defecto usa rutas relativas (/api/...), que Caddy y el proxy de Vite redirigen.
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export class ErrorConexion extends Error {}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, options);
  } catch {
    throw new ErrorConexion('No se pudo conectar con el servidor.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detalle = data?.detail;
    const texto = typeof detalle === 'string'
      ? detalle
      : Array.isArray(detalle) ? detalle.map((d) => d.msg).join('. ') : null;
    throw new Error(texto || `El servidor respondió con un error (${response.status}).`);
  }
  return data;
}

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function salud() {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 2500);
  try {
    const r = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
    if (!r.ok) return false;
    const data = await r.json().catch(() => null);
    return data?.status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Propone requisitos con el LLM y crea la vacante (sin confirmar). */
export const crearVacante = (descripcion) => request('/vacantes', json('POST', { descripcion }));

/** Confirma los requisitos editados: crea una nueva versión de la vacante. */
export const actualizarVacante = (id, vacante) => request(`/vacantes/${id}`, json('PUT', vacante));

/** Sube CVs: se leen, se anonimizan y se extrae su ficha. */
export function subirCVs(archivos) {
  const form = new FormData();
  archivos.forEach((a) => form.append('archivos', a));
  return request('/cvs', { method: 'POST', body: form });
}

/** Todos los CVs guardados (procesados y en revisión). */
export const listarCVs = () => request('/cvs');

/** Evalúa en lote los CVs procesados que aún no tienen evaluación con la versión vigente. */
export const evaluarLote = (vacanteId, reevaluar = false) =>
  request(`/vacantes/${vacanteId}/evaluar${reevaluar ? '?reevaluar=true' : ''}`, { method: 'POST' });

/** Evaluación vigente de cada candidato: resultado por requisito, citas, explicación y trazabilidad. */
export const listarEvaluaciones = (vacanteId) => request(`/vacantes/${vacanteId}/evaluaciones`);
