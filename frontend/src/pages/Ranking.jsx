import { useNavigate } from 'react-router-dom';
import Pagina from '../components/Pagina.jsx';
import CandidateTable from '../components/CandidateTable.jsx';

// TODO: reemplazar por GET /api/ranking cuando el pipeline esté listo.
const DATOS_EJEMPLO = [
  { candidato_id: '017', puntaje: 88, estado: 'cumple', confianza: 'alta', recomendado_entrevista: true,
    motivo_estado: 'Cumple todos los obligatorios' },
  { candidato_id: '004', puntaje: 74, estado: 'cumple_parcialmente', confianza: 'media', recomendado_entrevista: true,
    motivo_estado: 'Obligatorio sin información: nivel de inglés' },
  { candidato_id: '032', puntaje: 58, estado: 'cumple_parcialmente', confianza: 'baja', recomendado_entrevista: false,
    motivo_estado: 'Obligatorio parcial: experiencia en AWS (solo Azure)' },
  { candidato_id: '011', puntaje: 41, estado: 'no_cumple', confianza: 'alta', recomendado_entrevista: false,
    motivo_estado: 'Falta obligatorio: 3 o más años con Python' },
];

export default function Ranking() {
  const navigate = useNavigate();
  return (
    <Pagina titulo="Ranking de candidatos">
      <p className="mb-4 text-sm text-slate-500">Datos de ejemplo (aún no conectados al backend).</p>
      <CandidateTable candidatos={DATOS_EJEMPLO} onSelect={(c) => navigate(`/candidato/${c.candidato_id}`)} />
      <p className="mt-4 text-xs text-slate-500">
        Recomendación de apoyo. La decisión final es del equipo de selección. El puntaje no es probabilidad de éxito.
      </p>
    </Pagina>
  );
}
