// Agente entrevistador simulado en el cliente (bonus, sección 13).
// Mismo contrato que tendrá el backend en cada turno:
//   { pregunta_siguiente, evaluacion_respuesta, inconsistencias, terminar }
// Reglas de IA responsable: nunca pregunta por edad, estado civil, hijos, nacionalidad, etc.
import { detectarDatoProtegido } from './protegidos';

const PREGUNTAS = {
  R1: '¿Cuántos años has trabajado con Python y en qué tipo de proyectos lo has usado?',
  R2: 'Cuéntame tu experiencia con AWS: ¿qué servicios has usado y para qué?',
  R3: '¿Cuál es tu nivel de inglés y en qué situaciones de trabajo lo has usado?',
  R4: '¿Cuál es tu formación académica y cómo se relaciona con el desarrollo de software?',
  R5: '¿Tienes alguna certificación en nube o estás preparando alguna?',
  R6: '¿Cómo has usado Docker y Kubernetes en tus proyectos?',
  R7: '¿Qué experiencia tienes con PostgreSQL u otras bases de datos relacionales?',
  R8: '¿Has liderado equipos? ¿De cuántas personas y qué fue lo más difícil?',
};
const GENERALES = [
  { id: 'G1', tema: 'Resolución de problemas', texto: 'Describe un problema técnico difícil que hayas resuelto recientemente. ¿Cómo lo abordaste?' },
  { id: 'G2', tema: 'Motivación', texto: '¿Qué te interesa de este cargo y del trabajo en un equipo de plataforma?' },
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
  const filas = resultado.detalle.filas.filter((f) => f.req.tipo !== 'descalificante' && PREGUNTAS[f.req.id]);
  const sinInfo = filas.filter((f) => f.ev.resultado === 'sin_informacion');
  const brechas = filas.filter((f) => ['parcial', 'no_cumple'].includes(f.ev.resultado));
  const cumplidos = filas.filter((f) => ['cumple', 'equivalente'].includes(f.ev.resultado));
  const plan = [
    ...sinInfo.map((f) => ({ id: f.req.id, tema: f.req.nombre, texto: PREGUNTAS[f.req.id], motivo: 'Sin información en el CV' })),
    ...brechas.slice(0, 2).map((f) => ({ id: f.req.id, tema: f.req.nombre, texto: PREGUNTAS[f.req.id], motivo: 'Brecha a profundizar' })),
    ...cumplidos.filter((f) => f.req.id === 'R1' || f.req.id === 'R3').slice(0, 1).map((f) => ({ id: f.req.id, tema: f.req.nombre, texto: PREGUNTAS[f.req.id], motivo: 'Verificar lo que dice el CV' })),
    ...GENERALES.map((g) => ({ ...g, motivo: 'Competencias generales' })),
  ];
  // Entre 5 y 8 preguntas planeadas (con repreguntas el total no pasa de 10).
  const unico = plan.filter((p, i) => plan.findIndex((x) => x.id === p.id) === i);
  while (unico.length < 5) {
    const extra = cumplidos.find((f) => !unico.some((u) => u.id === f.req.id));
    if (!extra) break;
    unico.splice(unico.length - 2, 0, { id: extra.req.id, tema: extra.req.nombre, texto: PREGUNTAS[extra.req.id], motivo: 'Verificar lo que dice el CV' });
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

  if (pregunta.id === 'R1') {
    const n = numeroAnios(r);
    const cv = candidato.ficha.anios_python;
    if (n != null) {
      verificado = true;
      if (Math.abs(n - cv) >= 2) {
        inconsistencias.push(`El CV indica ${cv} años con Python; en la entrevista dijo ${n}.`);
        comentario = 'Los años que menciona no coinciden con el CV.';
        calificacion = 'debil';
      } else comentario = `Confirma ${n} años con Python, coherente con el CV (${cv}).`;
    }
  }
  if (pregunta.id === 'R3') {
    const n = nivelIngles(r);
    const cv = candidato.ficha.idiomas.find((i) => i.idioma === 'Inglés')?.nivel;
    if (n) {
      verificado = true;
      if (cv && Math.abs(NIVELES.indexOf(n) - NIVELES.indexOf(cv)) >= 2) {
        inconsistencias.push(`El CV declara inglés ${cv}; en la entrevista dijo ${n}.`);
        comentario = 'El nivel declarado no coincide con el del CV.';
        calificacion = 'debil';
      } else {
        comentario = cv ? `Confirma inglés ${n}, coherente con el CV.` : `Declara inglés ${n}. El CV no lo mencionaba: queda verificado en entrevista.`;
        if (NIVELES.indexOf(n) >= NIVELES.indexOf('B2') && calificacion === 'debil') calificacion = 'aceptable';
      }
    }
  }
  if (pregunta.id === 'R2') {
    const t = r.toLowerCase();
    const aws = /\b(aws|ec2|s3|lambda|rds|ecs|cloudformation|dynamodb)\b/.test(t);
    const otra = /\b(azure|gcp|google cloud)\b/.test(t);
    if (aws) { verificado = true; comentario = 'Menciona servicios concretos de AWS.'; if (calificacion === 'debil') calificacion = 'aceptable'; }
    else if (otra) comentario = 'Describe experiencia en otra nube; la brecha con AWS se mantiene.';
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
