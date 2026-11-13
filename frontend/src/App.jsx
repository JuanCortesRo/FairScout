import { Navigate, Route, Routes, Link } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import NuevaVacante from './pages/NuevaVacante.jsx';
import CargaCVs from './pages/CargaCVs.jsx';
import Ranking from './pages/Ranking.jsx';
import DetalleCandidato from './pages/DetalleCandidato.jsx';
import Comparador from './pages/Comparador.jsx';
import Auditoria from './pages/Auditoria.jsx';
import Entrevista from './pages/Entrevista.jsx';
import EntrevistaPublica from './pages/EntrevistaPublica.jsx';
import { EstadoVacio } from './components/ui/kit.jsx';
import { buttonVariants } from './components/ui/button.jsx';
import { Compass } from 'lucide-react';

export default function App() {
  return (
    <Routes>
      <Route path="entrevista/:token" element={<EntrevistaPublica />} />
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/vacante" replace />} />
        <Route path="vacante" element={<NuevaVacante />} />
        <Route path="cvs" element={<CargaCVs />} />
        <Route path="ranking" element={<Ranking />} />
        <Route path="candidato/:id" element={<DetalleCandidato />} />
        <Route path="comparador" element={<Comparador />} />
        <Route path="entrevista" element={<Entrevista />} />
        <Route path="auditoria" element={<Auditoria />} />
        <Route path="*" element={(
          <EstadoVacio icono={Compass} titulo="Página no encontrada" descripcion="La dirección no existe. Vuelve al inicio del flujo.">
            <Link to="/vacante" className={buttonVariants({ size: 'lg' })}>Ir a la vacante</Link>
          </EstadoVacio>
        )} />
      </Route>
    </Routes>
  );
}
