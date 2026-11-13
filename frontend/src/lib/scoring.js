// Espejo en el cliente de las reglas de la sección 9 (scoring.py).
// Permite recalcular al instante cuando el reclutador cambia los pesos, sin volver a llamar al LLM.

export const VALOR_RESULTADO = {
  cumple: 1,
  equivalente: 0.8,
  parcial: 0.5,
  no_cumple: 0,
  sin_informacion: 0,
};

// Tipo de alerta del documento → alerta que entiende el puntaje (espejo de alertas_para_puntaje en scoring.py).
const ALERTA_DOCUMENTO_A_PUNTAJE = {
  prompt_injection: 'prompt_injection',
  hidden_text: 'prompt_injection',
  ocr: 'ocr',
  inconsistencia_fechas: 'inconsistencia_fechas',
};

export function alertasParaPuntaje(tipos = []) {
  return [...new Set(tipos.map((t) => ALERTA_DOCUMENTO_A_PUNTAJE[t]).filter(Boolean))];
}

const UMBRAL_RECOMENDAR_PARCIAL = 60;

function promedioPonderado(items, pesoDe) {
  const total = items.reduce((s, it) => s + pesoDe(it), 0);
  if (!total) return null;
  return items.reduce((s, it) => s + pesoDe(it) * (VALOR_RESULTADO[it.ev.resultado] ?? 0), 0) / total;
}

/**
 * @param candidato { candidato_id, evaluaciones: EvaluacionRequisito[], alertas: string[] }
 * @param requisitos Requisito[]
 * @param pesos { obligatorios: number (0-100) } — los deseables valen el resto
 * @returns ResultadoCandidato + desglose
 */
export function calcularResultado(candidato, requisitos, pesos) {
  const porId = Object.fromEntries(candidato.evaluaciones.map((e) => [e.requisito_id, e]));
  const filas = requisitos
    .map((r) => ({ req: r, ev: porId[r.id] ?? { requisito_id: r.id, resultado: 'sin_informacion', cita: null, lineas: [], justificacion: 'No evaluado.', cita_verificada: false } }));

  const oblig = filas.filter((f) => f.req.tipo === 'obligatorio');
  const deseab = filas.filter((f) => f.req.tipo === 'deseable');
  const descal = filas.filter((f) => f.req.tipo === 'descalificante');

  // 9.1 Puntaje
  const sO = promedioPonderado(oblig, () => 1);
  const sD = promedioPonderado(deseab, (f) => f.req.peso ?? 1);
  const wO = pesos.obligatorios / 100;
  let puntaje;
  if (sO == null && sD == null) puntaje = 0;
  else if (sO == null) puntaje = sD * 100;
  else if (sD == null) puntaje = sO * 100;
  else puntaje = (wO * sO + (1 - wO) * sD) * 100;
  puntaje = Math.round(puntaje * 10) / 10;

  // 9.2 Estado
  const descalPresente = descal.filter((f) => f.ev.resultado === 'presente');
  const obligNo = oblig.filter((f) => f.ev.resultado === 'no_cumple');
  const obligOk = oblig.every((f) => ['cumple', 'equivalente'].includes(f.ev.resultado));
  const obligSinInfo = oblig.filter((f) => f.ev.resultado === 'sin_informacion');
  const obligParciales = oblig.filter((f) => f.ev.resultado === 'parcial');

  let estado;
  let motivo_estado;
  if (descalPresente.length) {
    estado = 'no_cumple';
    motivo_estado = `Descalificante presente: ${descalPresente[0].req.nombre}`;
  } else if (obligNo.length) {
    estado = 'no_cumple';
    motivo_estado = `Falta obligatorio: ${obligNo[0].req.nombre}`;
  } else if (obligSinInfo.length) {
    estado = 'pendiente_verificar';
    motivo_estado = `Obligatorio sin información: ${obligSinInfo[0].req.nombre}`;
  } else if (obligOk) {
    estado = 'cumple';
    motivo_estado = 'Cumple todos los obligatorios y no tiene descalificantes presentes';
  } else {
    estado = 'cumple_parcialmente';
    motivo_estado = `Obligatorio parcial: ${obligParciales[0].req.nombre}`;
  }

  // 9.3 Confianza
  const evaluables = [...oblig, ...deseab];
  const sinInfo = evaluables.filter((f) => f.ev.resultado === 'sin_informacion').length;
  const cobertura = evaluables.length ? 1 - sinInfo / evaluables.length : 0;
  const conCita = filas.filter((f) => f.ev.cita);
  const citasSinVerificar = conCita.filter((f) => !f.ev.cita_verificada);
  const obligSinVerificar = citasSinVerificar.filter((f) => f.req.tipo === 'obligatorio');
  const alertas = alertasParaPuntaje(candidato.alertas ?? []);
  const totalObligParciales = obligParciales.length;

  const motivosConfianza = [];
  if (cobertura < 0.8) motivosConfianza.push(`Cobertura de información del ${Math.round(cobertura * 100)}%`);
  if (citasSinVerificar.length) motivosConfianza.push(`${citasSinVerificar.length} cita(s) no encontradas en el CV`);
  if (alertas.includes('ocr')) motivosConfianza.push('El documento necesitó OCR');
  if (alertas.includes('inconsistencia_fechas')) motivosConfianza.push('Fechas inconsistentes en la experiencia');
  if (alertas.includes('prompt_injection')) motivosConfianza.push('Se detectó texto que intenta manipular la evaluación');
  if (totalObligParciales >= 2) motivosConfianza.push('Varios obligatorios con resultado parcial');

  let confianza;
  if (cobertura < 0.5 || obligSinVerificar.length || alertas.includes('prompt_injection')) confianza = 'baja';
  else if (cobertura >= 0.8 && !citasSinVerificar.length && !alertas.some((a) => ['ocr', 'inconsistencia_fechas'].includes(a)) && totalObligParciales < 2) confianza = 'alta';
  else confianza = 'media';
  if (!motivosConfianza.length) motivosConfianza.push('Buena cobertura y todas las citas verificadas');

  // 9.4 Recomendación
  const dudaSoloPorInfo = obligSinInfo.length > 0 && obligParciales.length === 0;
  const recomendado_entrevista = estado === 'cumple'
    || (estado === 'pendiente_verificar' && puntaje >= UMBRAL_RECOMENDAR_PARCIAL && dudaSoloPorInfo);

  // Desglose por categoría (barras del ranking)
  const porCategoria = {};
  for (const f of evaluables) {
    const c = f.req.categoria;
    porCategoria[c] ??= { suma: 0, n: 0 };
    porCategoria[c].suma += VALOR_RESULTADO[f.ev.resultado] ?? 0;
    porCategoria[c].n += 1;
  }
  const categorias = Object.fromEntries(Object.entries(porCategoria).map(([k, v]) => [k, v.suma / v.n]));

  return {
    candidato_id: candidato.candidato_id,
    puntaje,
    estado,
    confianza,
    recomendado_entrevista,
    motivo_estado,
    detalle: {
      filas,
      puntajeObligatorios: sO,
      puntajeDeseables: sD,
      cobertura,
      motivosConfianza,
      categorias,
      citasSinVerificar: citasSinVerificar.length,
    },
  };
}

const ORDEN_ESTADO = { cumple: 0, cumple_parcialmente: 1, pendiente_verificar: 2, no_cumple: 3 };

/** Ranking de todos los candidatos: primero por estado, luego por puntaje. */
export function rankear(candidatos, requisitos, pesos) {
  return candidatos
    .map((c) => ({ candidato: c, resultado: calcularResultado(c, requisitos, pesos) }))
    .sort((a, b) =>
      ORDEN_ESTADO[a.resultado.estado] - ORDEN_ESTADO[b.resultado.estado]
      || b.resultado.puntaje - a.resultado.puntaje
      || a.candidato.candidato_id.localeCompare(b.candidato.candidato_id))
    .map((x, i) => ({ ...x, posicion: i + 1 }));
}

/** Texto explicativo derivado (llamada 3 del LLM en el backend; aquí se arma con plantillas). */
export function explicar(resultado) {
  const { filas } = resultado.detalle;
  const fortalezas = filas
    .filter((f) => f.req.tipo !== 'descalificante' && ['cumple', 'equivalente'].includes(f.ev.resultado))
    .map((f) => ({ req: f.req, texto: f.ev.justificacion }));
  const brechas = filas
    .filter((f) => f.req.tipo !== 'descalificante' && ['parcial', 'no_cumple'].includes(f.ev.resultado))
    .map((f) => ({ req: f.req, texto: f.ev.justificacion }));
  const porVerificar = filas
    .filter((f) => f.ev.resultado === 'sin_informacion' || (f.ev.cita && !f.ev.cita_verificada))
    .map((f) => ({ req: f.req, texto: f.ev.resultado === 'sin_informacion' ? 'El CV no menciona este punto. Conviene preguntarlo en la entrevista.' : 'La cita propuesta no se encontró textualmente en el CV.' }));
  return { fortalezas, brechas, porVerificar };
}
