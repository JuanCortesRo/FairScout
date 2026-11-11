import { useState } from 'react';
import Pagina from '../components/Pagina.jsx';
import { Button } from '@/components/ui/button';
import { crearVacante } from '../api.js';

const ESTILO_TIPO = {
  obligatorio: 'badge badge-low',
  deseable: 'badge badge-medium',
  descalificante: 'badge bg-slate-800 text-white',
};

export default function NuevaVacante() {
  const [descripcion, setDescripcion] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [vacante, setVacante] = useState(null);

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setVacante(null);
    setCargando(true);
    try {
      setVacante(await crearVacante(descripcion));
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <Pagina titulo="Nueva vacante">
      <form onSubmit={enviar} className="flex flex-col gap-3">
        <label htmlFor="descripcion" className="font-medium">Descripción del cargo</label>
        <textarea
          id="descripcion"
          rows={10}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Pega aquí la descripción completa del cargo…"
          className="rounded-lg border-2 border-slate-200 p-3 focus:border-indigo-500 focus:outline-none"
        />
        <Button type="submit" className="self-start" disabled={cargando || descripcion.trim().length < 20}>
          {cargando ? 'Extrayendo requisitos…' : 'Extraer requisitos'}
        </Button>
        {descripcion.trim().length > 0 && descripcion.trim().length < 20 && (
          <p className="text-sm text-slate-500">La descripción debe tener al menos 20 caracteres.</p>
        )}
      </form>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{error}</div>}

      {vacante && (
        <div className="mt-6">
          <h3 className="mb-3 text-lg font-semibold">Requisitos de: {vacante.titulo}</h3>
          <div className="overflow-x-auto">
            <table className="candidate-table">
              <thead>
                <tr><th>Id</th><th>Requisito</th><th>Tipo</th><th>Categoría</th><th>Peso</th></tr>
              </thead>
              <tbody>
                {vacante.requisitos.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-semibold text-indigo-600">{r.id}</td>
                    <td className="px-3 py-2">{r.nombre}</td>
                    <td className="px-3 py-2"><span className={ESTILO_TIPO[r.tipo]}>{r.tipo}</span></td>
                    <td className="px-3 py-2 text-slate-500">{r.categoria}</td>
                    <td className="px-3 py-2 text-slate-500">{r.tipo === 'deseable' ? r.peso : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Pagina>
  );
}
