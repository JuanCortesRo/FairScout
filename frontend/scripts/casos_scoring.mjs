// Genera backend/tests/fixtures/casos_scoring.json: casos de entrada + la salida de lib/scoring.js.
// El test del backend (test_scoring.py) comprueba que scoring.py da exactamente lo mismo.
// Uso, desde la raíz del repo:  node frontend/scripts/casos_scoring.mjs
import { writeFileSync } from 'node:fs';
import { calcularResultado, rankear } from '../src/lib/scoring.js';

const R = (id, tipo, categoria = 'tecnica', peso = 1, nombre = id) => ({ id, nombre, tipo, categoria, peso });
const E = (requisito_id, resultado, { cita = 'texto citado', verificada = true } = {}) => ({
  requisito_id,
  resultado,
  cita: resultado === 'sin_informacion' ? null : cita,
  lineas: resultado === 'sin_informacion' ? [] : ['p1-l1'],
  justificacion: `Justificación de ${requisito_id}`,
  cita_verificada: resultado === 'sin_informacion' ? false : verificada,
});

const REQS = [
  R('o1', 'obligatorio', 'tecnica', 1, 'AWS'),
  R('o2', 'obligatorio', 'idioma', 1, 'Inglés B2'),
  R('d1', 'deseable', 'tecnica', 2, 'Docker'),
  R('d2', 'deseable', 'blanda', 1, 'Liderazgo'),
  R('x1', 'descalificante', 'otro', 1, 'Sin disponibilidad'),
];
const todoCumple = [E('o1', 'cumple'), E('o2', 'cumple'), E('d1', 'cumple'), E('d2', 'cumple'), E('x1', 'ausente')];
const con = (cambios) => todoCumple.map((e) => cambios[e.requisito_id] ?? e);

const casos = [
  ['todo_cumple', REQS, todoCumple],
  ['equivalente_aws_azure', REQS, con({ o1: E('o1', 'equivalente') })],
  ['descalificante_presente', REQS, con({ x1: E('x1', 'presente') })],
  ['obligatorio_no_cumple', REQS, con({ o1: E('o1', 'no_cumple') })],
  ['obligatorio_sin_informacion', REQS, con({ o2: E('o2', 'sin_informacion') })],
  ['obligatorio_parcial', REQS, con({ o2: E('o2', 'parcial') })],
  ['dos_obligatorios_parciales', REQS, con({ o1: E('o1', 'parcial'), o2: E('o2', 'parcial') })],
  ['bajo_umbral_sin_dudas', REQS, con({ o1: E('o1', 'equivalente'), o2: E('o2', 'equivalente'), d1: E('d1', 'no_cumple'), d2: E('d2', 'no_cumple') })],
  ['cita_obligatorio_no_verificada', REQS, con({ o1: E('o1', 'cumple', { verificada: false }) })],
  ['cita_deseable_no_verificada', REQS, con({ d2: E('d2', 'cumple', { verificada: false }) })],
  ['poca_cobertura', REQS, con({ o2: E('o2', 'sin_informacion'), d1: E('d1', 'sin_informacion'), d2: E('d2', 'sin_informacion') })],
  ['requisito_sin_evaluar', REQS, todoCumple.filter((e) => e.requisito_id !== 'd1')],
  ['resultado_desconocido', REQS, con({ d2: { ...E('d2', 'cumple'), resultado: 'quizas' } })],
  ['solo_deseables', REQS.filter((r) => r.tipo === 'deseable'), [E('d1', 'parcial'), E('d2', 'cumple')]],
  ['solo_obligatorios', REQS.filter((r) => r.tipo === 'obligatorio'), [E('o1', 'cumple'), E('o2', 'parcial')]],
  ['sin_requisitos', [], []],
  ['redondeo_punto_medio', [R('o1', 'obligatorio'), R('o2', 'obligatorio'), R('d1', 'deseable')], [E('o1', 'cumple'), E('o2', 'parcial'), E('d1', 'equivalente')]],
];

const alertasPorCaso = {
  todo_cumple_ocr: ['ocr'],
  todo_cumple_fechas: ['inconsistencia_fechas'],
  todo_cumple_injection: ['prompt_injection'],
};
for (const nombre of Object.keys(alertasPorCaso)) casos.push([nombre, REQS, todoCumple]);

const salida = [];
for (const pesoObligatorios of [60, 80]) {
  for (const [nombre, requisitos, evaluaciones] of casos) {
    const candidato = { candidato_id: `cand-${nombre}`, evaluaciones, alertas: alertasPorCaso[nombre] ?? [] };
    const r = calcularResultado(candidato, requisitos, { obligatorios: pesoObligatorios });
    salida.push({
      nombre: `${nombre}@${pesoObligatorios}`,
      peso_obligatorios: pesoObligatorios,
      requisitos,
      evaluaciones,
      alertas: candidato.alertas,
      esperado: {
        candidato_id: r.candidato_id,
        puntaje: r.puntaje,
        estado: r.estado,
        confianza: r.confianza,
        recomendado_entrevista: r.recomendado_entrevista,
        motivo_estado: r.motivo_estado,
      },
      desglose: {
        cobertura: r.detalle.cobertura,
        motivos_confianza: r.detalle.motivosConfianza,
        categorias: r.detalle.categorias,
        citas_sin_verificar: r.detalle.citasSinVerificar,
      },
    });
  }
}

// Orden del ranking con todos los casos a 60/40
const candidatos = casos.map(([nombre, , evaluaciones]) => ({ candidato_id: `cand-${nombre}`, evaluaciones, alertas: alertasPorCaso[nombre] ?? [] }));
const ranking = rankear(candidatos, REQS, { obligatorios: 60 }).map((x) => x.candidato.candidato_id);

const destino = new URL('../../backend/tests/fixtures/casos_scoring.json', import.meta.url);
writeFileSync(destino, JSON.stringify({ casos: salida, ranking_requisitos: REQS, ranking_candidatos: candidatos, ranking_esperado: ranking }, null, 2) + '\n');
console.log(`${salida.length} casos escritos en ${destino.pathname}`);
