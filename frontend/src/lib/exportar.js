import { CONFIANZAS, ESTADOS } from './constantes';

/** Descarga el ranking como CSV (UTF-8 con BOM para que Excel respete las tildes). */
export function exportarRankingCSV(ranking, requisitos, nombreVisible, vacante) {
  const cab = ['posicion', 'candidato', 'puntaje', 'estado', 'confianza', 'recomendado_entrevista', 'motivo_estado', ...requisitos.map((r) => `${r.id} ${r.nombre}`)];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const filas = ranking.map(({ candidato, resultado, posicion }) => [
    posicion,
    nombreVisible(candidato),
    resultado.puntaje,
    ESTADOS[resultado.estado].texto,
    CONFIANZAS[resultado.confianza].texto,
    resultado.recomendado_entrevista ? 'Sí' : 'No',
    resultado.motivo_estado,
    ...resultado.detalle.filas.map((f) => f.ev.resultado),
  ]);
  const csv = [cab, ...filas].map((f) => f.map(esc).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ranking_${(vacante?.titulo ?? 'vacante').toLowerCase().replace(/[^a-z0-9]+/gi, '_')}_v${vacante?.version ?? 1}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
