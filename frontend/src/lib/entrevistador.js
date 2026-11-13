// Agente entrevistador simulado en el cliente (bonus, sección 13).
// Mismo contrato que tendrá el backend en cada turno:
//   { pregunta_siguiente, evaluacion_respuesta, inconsistencias, terminar }
// Reglas de IA responsable: nunca pregunta por edad, estado civil, hijos, nacionalidad, etc.
import { detectarDatoProtegido } from './protegidos';
import { aniosExperiencia } from './ficha';

// Pregunta según la categoría del requisito: sirve para cualquier vacante, no solo la de ejemplo.
function preguntaPara(req) {
  const n = `«${req.nombre}»`;
  switch (req.categoria) {
    case 'experiencia': return `Cuéntame tu experiencia relacionada con ${n}: ¿cuántos años y en qué proyectos?`;
    case 'idioma': return `Sobre ${n}: ¿cuál es tu nivel y en qué situaciones de trabajo lo has usado?`;
    case 'formacion': return `¿Cuál es tu formación académica y cómo se relaciona con ${n}?`;
    case 'certificacion': return `¿Tienes una certificación relacionada con ${n}? ¿Cuándo la obtuviste o la estás preparando?`;
    case 'blanda': return `Dame un ejemplo concreto en el que hayas demostrado ${n}.`;
    default: return `Cuéntame tu experiencia con ${n}: ¿qué hiciste concretamente y con qué resultado?`;
  }
}
const VACIAS = new Set(['con', 'para', 'del', 'las', 'los', 'una', 'uno', 'experiencia', 'años', 'superior', 'nivel', 'conocimiento', 'conocimientos', 'manejo', 'más', 'menos']);
const palabrasClave = (texto) => texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9+#.]+/).filter((w) => w.length >= 3 && !VACIAS.has(w) && !/^d+$/.test(w));
const GENERALES = [
  { id: 'G1', tema: 'Resolución de problemas', texto: 'Describe un problema técnico difícil que hayas resuelto recientemente. ¿Cómo lo abordaste?' },
  { id: 'G2', tema: 'Motivación', texto: '¿Qué te interesa de este cargo y qué te gustaría aportar al equipo?' },
];
const NIVELES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const PALABRAS_NIVEL = { básico: 'A2', basico: 'A2', intermedio: 'B1', 'intermedio alto': 'B2', avanzado: 'C1', fluido: 'C1', nativo: 'C2', bilingüe: 'C2' };
const NUMEROS = { uno: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

function numeroAnios(texto) {
  const t = texto.toLowerCase();
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(años|año|years)/);
  if (m) return Number(m[1].replace(',', '.'));
  for (const [w, n] of Object.entries(NUMEROS)) if (new RegExp(`\\b${w}\\s+(años|año)`).test(t)) return n;
  return null;
}
function nivelIngles(texto) {
  const m = texto.toUpperCase().match(/\b([ABC][12])\b/);
  if (m) return m[1];
  const t = texto.toLowerCase();
  const hit = Object.keys(PALABRAS_NIVEL).sort((a, b) => b.length - a.length).find((k) => t.includes(k));
  return hit ? PALABRAS_NIVEL[hit] : null;
}

/** Plan inicial: primero lo que falta verificar, luego brechas, luego una verificación de algo cumplido y preguntas generales. */
export function crearPlan(resultado) {
  const filas = resultado.detalle.filas.filter((f) => f.req.tipo !== 'descalificante');
  const item = (f, motivo) => ({ id: f.req.id, tema: f.req.nombre, categoria: f.req.categoria, texto: preguntaPara(f.req), motivo });
  const sinInfo = filas.filter((f) => f.ev.resultado === 'sin_informacion');
  const brechas = filas.filter((f) => ['parcial', 'no_cumple'].includes(f.ev.resultado));
  const cumplidos = filas.filter((f) => ['cumple', 'equivalente'].includes(f.ev.resultado));
  const plan = [
    ...sinInfo.map((f) => item(f, 'Sin información en el CV')),
    ...brechas.slice(0, 2).map((f) => item(f, 'Brecha a profundizar')),
    ...cumplidos.filter((f) => ['experiencia', 'idioma'].includes(f.req.categoria)).slice(0, 1).map((f) => item(f, 'Verificar lo que dice el CV')),
    ...GENERALES.map((g) => ({ ...g, motivo: 'Competencias generales' })),
  ];
  // Entre 5 y 8 preguntas planeadas (con repreguntas el total no pasa de 10).
  const unico = plan.filter((p, i) => plan.findIndex((x) => x.id === p.id) === i);
  while (unico.length < 5) {
    const extra = cumplidos.find((f) => !unico.some((u) => u.id === f.req.id));
    if (!extra) break;
    unico.splice(unico.length - 2, 0, item(extra, 'Verificar lo que dice el CV'));
  }
  return unico.slice(0, 8);
}

/** Evalúa una respuesta y la compara con la ficha del CV. */
export function evaluarRespuesta(pregunta, respuesta, candidato) {
  const r = respuesta.trim();
  const inconsistencias = [];
  const notas = [];
  let calificacion = r.length > 120 ? 'solida' : r.length > 40 ? 'aceptable' : 'debil';
  let comentario = calificacion === 'debil' ? 'Respuesta breve, sin ejemplos concretos.' : calificacion === 'solida' ? 'Respuesta detallada y con contexto.' : 'Respuesta adecuada.';
  let verificado = false;

  const protegido = detectarDatoProtegido(r);
  if (protegido) notas.push(`La respuesta menciona un dato protegido (${protegido}). Se ignoró y no influye en la evaluación.`);

  if (pregunta.categoria === 'experiencia') {
    const n = numeroAnios(r);
    const total = aniosExperiencia(candidato.ficha);
    if (n != null) {
      verificado = true;
      // Más años en un tema que los de toda la experiencia del CV es una contradicción.
      if (n > total + 1.5) {
        inconsistencias.push(`El CV suma ${total} años de experiencia en total; en la entrevista dijo ${n} sobre «${pregunta.tema}».`);
        comentario = 'Los años que menciona no coinciden con el CV.';
        calificacion = 'debil';
      } else comentario = `Menciona ${n} años, coherente con el CV (${total} años en total).`;
    }
  }
  if (pregunta.categoria === 'idioma') {
    const n = nivelIngles(r);
    const claves = palabrasClave(pregunta.tema);
    const idioma = candidato.ficha.idiomas.find((i) => claves.some((k) => palabrasClave(i.idioma).includes(k)))
      ?? candidato.ficha.idiomas.find((i) => !/nativ/i.test(i.nivel ?? ''));
    const cv = idioma?.nivel && NIVELES.includes(idioma.nivel) ? idioma.nivel : null;
    if (n) {
      verificado = true;
      if (cv && Math.abs(NIVELES.indexOf(n) - NIVELES.indexOf(cv)) >= 2) {
        inconsistencias.push(`El CV declara nivel ${cv}; en la entrevista dijo ${n}.`);
        comentario = 'El nivel declarado no coincide con el del CV.';
        calificacion = 'debil';
      } else {
        comentario = cv ? `Confirma nivel ${n}, coherente con el CV.` : `Declara nivel ${n}. El CV no lo mencionaba: queda verificado en entrevista.`;
        if (calificacion === 'debil') calificacion = 'aceptable';
      }
    }
  }
  if (pregunta.categoria === 'tecnica' || pregunta.categoria === 'certificacion') {
    const claves = palabrasClave(pregunta.tema);
    const dichas = palabrasClave(r);
    if (claves.some((k) => dichas.includes(k))) {
      verificado = true;
      comentario = 'Menciona experiencia concreta con lo que pide el requisito.';
      if (calificacion === 'debil') calificacion = 'aceptable';
    }
  }
  return { calificacion, comentario, inconsistencias, notas, verificado };
}

/** Decide el siguiente turno. */
export function siguienteTurno(estado) {
  const { plan, indice, turnos, repreguntas } = estado;
  const ultima = turnos[turnos.length - 1];
  const totalPreguntas = turnos.length;
  // Repregunta dinámica si la respuesta fue débil (máximo 2 en la entrevista)
  if (ultima && ultima.evaluacion.calificacion === 'debil' && !ultima.esRepregunta && repreguntas < 2 && totalPreguntas < 10 && ultima.evaluacion.inconsistencias.length === 0) {
    return { tipo: 'pregunta', pregunta: { ...ultima.pregunta, texto: '¿Podrías darme un ejemplo concreto, con el proyecto, tu rol y el resultado?', esRepregunta: true } };
  }
  if (indice >= plan.length || totalPreguntas >= 10) return { tipo: 'terminar' };
  return { tipo: 'pregunta', pregunta: plan[indice] };
}

export function resumir(estado, resultado) {
  const { turnos } = estado;
  const inconsistencias = turnos.flatMap((t) => t.evaluacion.inconsistencias);
  const buenas = turnos.filter((t) => t.evaluacion.calificacion !== 'debil').length;
  const ratio = turnos.length ? buenas / turnos.length : 0;
  const verificados = [...new Set(turnos.filter((t) => t.evaluacion.verificado).map((t) => t.pregunta.tema))];
  const avanzar = resultado.estado !== 'no_cumple' && inconsistencias.length === 0 && ratio >= 0.6;
  let confianza = resultado.confianza;
  if (inconsistencias.length) confianza = 'baja';
  else if (verificados.length && confianza === 'baja') confianza = 'media';
  else if (verificados.length && confianza === 'media') confianza = 'alta';
  const justificacion = avanzar
    ? `Respondió con solidez ${buenas} de ${turnos.length} preguntas${verificados.length ? ` y verificó: ${verificados.join(', ')}` : ''}. No se detectaron contradicciones con el CV.`
    : inconsistencias.length
      ? `Se detectaron ${inconsistencias.length} contradicción(es) con el CV que conviene aclarar antes de avanzar.`
      : resultado.estado === 'no_cumple'
        ? 'La evaluación del CV ya indicaba que no cumple un requisito obligatorio.'
        : `Solo ${buenas} de ${turnos.length} respuestas fueron suficientes.`;
  return { avanzar, inconsistencias, confianza, justificacion, verificados, buenas, total: turnos.length };
}
