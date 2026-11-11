// Referencia visual conservada del proyecto original. Se adaptará en la página DetalleCandidato.
function ScoreBadge({ score }) {
  const clamped = Math.min(100, Math.max(0, score));
  const cls = clamped >= 80 ? 'badge-high' : clamped >= 60 ? 'badge-medium' : 'badge-low';
  return <span className={`badge ${cls}`}>{clamped}</span>;
}

function SkillIcon({ status }) {
  if (status === 'MATCH') return <span className="skill-match">✓</span>;
  if (status === 'NO_MATCH') return <span className="skill-nomatch">✗</span>;
  return <span className="skill-partial">~</span>;
}

export default function CandidateDetail({ candidate, onBack }) {
  const items = candidate.items || [];

  return (
    <div>
      <button className="btn-back" onClick={onBack}>← Volver a la lista</button>

      <div className="detail-header">
        <div>
          <h2>{candidate.name}</h2>
        </div>
      </div>

      <div className="score-summary">
        <div className="score-summary-item">
          <span className="score-summary-label">Puntaje</span>
          <ScoreBadge score={candidate.score} />
        </div>
      </div>

      <div className="detail-panel">
        <h3>Requisitos</h3>
        <table className="skills-match-table">
          <tbody>
            {items.map((s, i) => (
              <tr key={i}>
                <td style={{ width: '24px' }}><SkillIcon status={s.status} /></td>
                <td style={{ fontWeight: 500 }}>{s.label}</td>
                <td className="skill-evidence-cell">{s.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
