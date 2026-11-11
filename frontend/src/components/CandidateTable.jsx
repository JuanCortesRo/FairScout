// Tabla de ranking basada en el estilo visual de la CandidateTable original.
// Campos según ResultadoCandidato.
function ScoreBadge({ score }) {
  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  const cls = clamped >= 80 ? 'badge-high' : clamped >= 60 ? 'badge-medium' : 'badge-low';
  return <span className={`badge ${cls}`}>{clamped}</span>;
}

// Color + ícono (no solo color, por accesibilidad; sección 19).
const ESTADO = {
  cumple: { texto: 'Cumple', icono: '✓', cls: 'badge-high' },
  cumple_parcialmente: { texto: 'Cumple parcialmente', icono: '~', cls: 'badge-medium' },
  no_cumple: { texto: 'No cumple', icono: '✗', cls: 'badge-low' },
};

const CONFIANZA = {
  alta: { texto: 'Alta', icono: '●●●' },
  media: { texto: 'Media', icono: '●●○' },
  baja: { texto: 'Baja', icono: '●○○' },
};

export default function CandidateTable({ candidatos, onSelect }) {
  if (!candidatos || candidatos.length === 0) {
    return <p className="py-10 text-center text-slate-500">Aún no hay candidatos evaluados. Carga CVs para empezar.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="candidate-table">
        <thead>
          <tr>
            <th>Posición</th>
            <th>Candidato</th>
            <th>Puntaje</th>
            <th>Estado</th>
            <th>Confianza</th>
            <th>Recomendado</th>
          </tr>
        </thead>
        <tbody>
          {candidatos.map((c, i) => {
            const estado = ESTADO[c.estado];
            const confianza = CONFIANZA[c.confianza];
            return (
              <tr key={c.candidato_id} className="candidate-row" onClick={() => onSelect?.(c)} title={c.motivo_estado}>
                <td><span className="candidate-rank">#{i + 1}</span></td>
                <td><span className="candidate-name">Candidato {c.candidato_id}</span></td>
                <td><ScoreBadge score={c.puntaje} /></td>
                <td><span className={`badge ${estado?.cls ?? ''}`}>{estado?.icono} {estado?.texto ?? c.estado}</span></td>
                <td><span className="text-indigo-500" aria-hidden="true">{confianza?.icono}</span> {confianza?.texto ?? c.confianza}</td>
                <td>{c.recomendado_entrevista ? <span className="skill-match">✓ Sí</span> : <span className="skill-nomatch">✗ No</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
