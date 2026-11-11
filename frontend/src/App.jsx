import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import NuevaVacante from './pages/NuevaVacante.jsx';
import CargaCVs from './pages/CargaCVs.jsx';
import Ranking from './pages/Ranking.jsx';
import DetalleCandidato from './pages/DetalleCandidato.jsx';
import Comparador from './pages/Comparador.jsx';
import Auditoria from './pages/Auditoria.jsx';
import Entrevista from './pages/Entrevista.jsx';

const RUTAS = [
  { path: '/vacante', label: 'Nueva vacante', element: <NuevaVacante /> },
  { path: '/cvs', label: 'Carga de CVs', element: <CargaCVs /> },
  { path: '/ranking', label: 'Ranking', element: <Ranking /> },
  { path: '/candidato', label: 'Detalle', element: <DetalleCandidato /> },
  { path: '/comparador', label: 'Comparador', element: <Comparador /> },
  { path: '/auditoria', label: 'Auditoría', element: <Auditoria /> },
  { path: '/entrevista', label: 'Entrevista', element: <Entrevista /> },
];

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <h1 className="text-xl font-bold">AI Talent Scout</h1>
          <nav className="mt-3 flex flex-wrap gap-1">
            {RUTAS.map((r) => (
              <NavLink
                key={r.path}
                to={r.path}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-white/25 font-semibold' : 'hover:bg-white/15'}`
                }
              >
                {r.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/vacante" replace />} />
          {RUTAS.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
          <Route path="/candidato/:id" element={<DetalleCandidato />} />
          <Route path="*" element={<p>Página no encontrada.</p>} />
        </Routes>
      </main>
    </div>
  );
}
