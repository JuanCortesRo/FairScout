// URL base del backend. Por defecto rutas relativas (/api/...).
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, options);
  } catch {
    throw new Error('No se pudo conectar con el backend. ¿Está en ejecución?');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.detail && typeof data.detail === 'string'
      ? data.detail
      : `Error del servidor (${response.status}).`);
  }
  return data;
}

export function crearVacante(descripcion) {
  return request('/vacantes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descripcion }),
  });
}
