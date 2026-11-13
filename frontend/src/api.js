// Cliente del backend. Por defecto usa rutas relativas (/api/...), que Caddy y el proxy de Vite redirigen.
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export class ErrorConexion extends Error {}
export class ErrorAPI extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Centraliza fetch, normaliza errores de red/API y devuelve el cuerpo JSON. */
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, options);
  } catch {
    throw new ErrorConexion('No pudimos conectarnos. Intenta de nuevo en unos minutos.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detalle = data?.detail;
    // Los errores de validación automáticos vienen en inglés y con nombres de campos: se resumen.
    const texto = typeof detalle === 'string' ? detalle : Array.isArray(detalle) ? 'Revisa los datos ingresados.' : null;
    throw new ErrorAPI(texto || 'Ocurrió un error inesperado. Intenta de nuevo.', response.status);
  }
  return data;
}

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Comprueba disponibilidad con un límite corto para no bloquear el inicio de la interfaz. */
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

/** Vacantes guardadas en el servidor, con sus requisitos y versión vigente. */
export const listarVacantes = () => request('/vacantes');
export const obtenerVacante = (id) => request(`/vacantes/${id}`);

/** Borra la vacante junto con sus CVs, evaluaciones y entrevistas. */
export const eliminarVacante = (id) => request(`/vacantes/${id}`, { method: 'DELETE' });

/** Sube CVs a una vacante: se leen, se anonimizan y se extrae su ficha. */
export function subirCVs(vacanteId, archivos) {
  const form = new FormData();
  archivos.forEach((a) => form.append('archivos', a));
  return request(`/vacantes/${vacanteId}/cvs`, { method: 'POST', body: form });
}

/** Metadatos de los CVs de una vacante; el documento completo se pide al abrir su detalle. */
export const listarCVs = (vacanteId) => request(`/vacantes/${vacanteId}/cvs`);
export const obtenerCandidato = (id) => request(`/candidatos/${id}`);

/** Borra el CV con sus datos de contacto, evaluaciones y entrevistas. */
export const eliminarCandidato = (id) => request(`/candidatos/${id}`, { method: 'DELETE' });

/** Evalúa en lote los CVs procesados que aún no tienen evaluación con la versión vigente. */
export const evaluarLote = (vacanteId, reevaluar = false) =>
  request(`/vacantes/${vacanteId}/evaluar${reevaluar ? '?reevaluar=true' : ''}`, { method: 'POST' });

/** Ranking calculado por el backend para el peso de obligatorios seleccionado. */
export const obtenerRanking = (vacanteId, pesoObligatorios = 60) => {
  const params = new URLSearchParams({
    vacante_id: vacanteId,
    peso_obligatorios: String(pesoObligatorios),
  });
  return request(`/ranking?${params}`);
};

/** Ranking en .xlsx con los datos de contacto (solo existen en este archivo). Devuelve el archivo y su nombre. */
export async function exportarRanking(vacanteId, { top = null, pesoObligatorios = 60 } = {}) {
  const params = new URLSearchParams({ peso_obligatorios: String(pesoObligatorios) });
  if (top) params.set('top', String(top));
  let response;
  try {
    response = await fetch(`${API_BASE}/api/vacantes/${vacanteId}/exportar?${params}`);
  } catch {
    throw new ErrorConexion('No pudimos conectarnos. Intenta de nuevo en unos minutos.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const detalle = typeof data?.detail === 'string' ? data.detail : 'Ocurrió un error inesperado. Intenta de nuevo.';
    throw new ErrorAPI(detalle, response.status);
  }
  const nombre = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'ranking.xlsx';
  return { archivo: await response.blob(), nombre };
}

/** Evaluación vigente de cada candidato: resultado por requisito, citas, explicación y trazabilidad. */
export const listarEvaluaciones = (vacanteId) => request(`/vacantes/${vacanteId}/evaluaciones`);
export const obtenerEvaluacion = (vacanteId, candidatoId) =>
  request(`/vacantes/${vacanteId}/candidatos/${candidatoId}/evaluacion`);

/** Entrevistas persistidas y generadas por el agente del backend. */
export const crearEntrevista = (candidatoId, vacanteId) =>
  request('/entrevistas', json('POST', { candidato_id: candidatoId, vacante_id: vacanteId }));
export const obtenerEntrevista = (entrevistaId) => request(`/entrevistas/${entrevistaId}`);
export const responderEntrevista = (entrevistaId, respuesta) =>
  request(`/entrevistas/${entrevistaId}/respuestas`, json('POST', { respuesta }));
export const finalizarEntrevista = (entrevistaId) =>
  request(`/entrevistas/${entrevistaId}/finalizar`, { method: 'POST' });
export const reiniciarEntrevista = (entrevistaId) =>
  request(`/entrevistas/${entrevistaId}/reiniciar`, { method: 'POST' });

/** Invitaciones públicas: nunca devuelven evaluaciones ni recomendaciones. */
export const crearInvitacionEntrevista = (vacanteId, candidatoId) =>
  request(`/vacantes/${vacanteId}/candidatos/${candidatoId}/entrevista`, { method: 'POST' });
export const listarInvitacionesEntrevista = (vacanteId) =>
  request(`/vacantes/${vacanteId}/entrevistas`);
export const revocarInvitacionEntrevista = (entrevistaId) =>
  request(`/entrevistas/${entrevistaId}/revocar`, { method: 'POST' });
export const consultarEntrevistaPublica = (token) =>
  request(`/publico/entrevistas/${encodeURIComponent(token)}`);
export const iniciarEntrevistaPublica = (token, aceptaPrivacidad) =>
  request(`/publico/entrevistas/${encodeURIComponent(token)}/iniciar`, json('POST', { consentimiento: aceptaPrivacidad }));
export const responderEntrevistaPublica = (token, texto) =>
  request(`/publico/entrevistas/${encodeURIComponent(token)}/responder`, json('POST', { texto }));
