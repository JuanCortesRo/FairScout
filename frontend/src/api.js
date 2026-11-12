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
    throw new Error(typeof detalle === 'string' ? detalle : `El servidor respondió con un error (${response.status}).`);
  }
  return data;
}

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

export function crearVacante(descripcion) {
  return request('/vacantes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descripcion }),
  });
}

export function actualizarVacante(id, vacante) {
  return request(`/vacantes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vacante),
  });
}

export function subirCVs(archivos) {
  const form = new FormData();
  archivos.forEach((a) => form.append('archivos', a));
  return request('/cvs', { method: 'POST', body: form });
}

export function obtenerRanking(vacanteId, pesoObligatorios = 60) {
  const params = new URLSearchParams({ vacante_id: vacanteId, peso_obligatorios: String(pesoObligatorios) });
  return request(`/ranking?${params.toString()}`);
}

export function obtenerCandidato(candidatoId) {
  return request(`/candidatos/${encodeURIComponent(candidatoId)}`);
}

export function obtenerEvaluacion(candidatoId, vacanteId) {
  const params = new URLSearchParams({ vacante_id: vacanteId });
  return request(`/evaluations/${encodeURIComponent(candidatoId)}?${params.toString()}`);
}

export function borrarVacante(vacanteId) {
  return request(`/vacantes/${encodeURIComponent(vacanteId)}`, { method: 'DELETE' });
}
