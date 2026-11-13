// Utilidades sobre la ficha del candidato (salida de extract.py + postprocess.py).

const aMes = (texto, hoy) => {
  if (texto === 'actual') return hoy.getFullYear() * 12 + hoy.getMonth();
  const m = /^(\d{4})-(\d{2})$/.exec(texto ?? '');
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
};

/** Años de experiencia uniendo periodos solapados (dos trabajos a la vez no cuentan doble). */
export function aniosExperiencia(ficha, hoy = new Date()) {
  if (ficha?.anios_experiencia != null) return ficha.anios_experiencia;
  const periodos = (ficha?.experiencias ?? [])
    .map((e) => [aMes(e.inicio, hoy), aMes(e.fin ?? 'actual', hoy)])
    .filter(([i, f]) => i != null && f != null && f >= i)
    .sort((a, b) => a[0] - b[0]);
  let meses = 0;
  let actual = null;
  for (const [i, f] of periodos) {
    if (actual && i <= actual[1]) actual[1] = Math.max(actual[1], f);
    else { if (actual) meses += actual[1] - actual[0]; actual = [i, f]; }
  }
  if (actual) meses += actual[1] - actual[0];
  return Math.round((meses / 12) * 10) / 10;
}

/** "5 años y 7 meses": más claro para el reclutador que 5,58 y sin redondear hacia un requisito que no cumple. */
export function formatearExperiencia(anios) {
  if (anios == null) return '—';
  const total = Math.round(anios * 12);
  const a = Math.floor(total / 12);
  const m = total % 12;
  const textoA = a === 1 ? '1 año' : `${a} años`;
  const textoM = m === 1 ? '1 mes' : `${m} meses`;
  if (!a && !m) return 'Sin experiencia registrada';
  if (!m) return textoA;
  if (!a) return textoM;
  return `${textoA} y ${textoM}`;
}

/** Texto visible de una certificación (el LLM la devuelve como objeto libre). */
export const nombreCertificacion = (c) =>
  typeof c === 'string' ? c : c?.nombre ?? c?.titulo ?? c?.name ?? Object.values(c ?? {}).find((v) => typeof v === 'string') ?? 'Certificación';
