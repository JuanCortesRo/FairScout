import { useState } from 'react';
import { Download, FileSpreadsheet, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alerta, Modal } from '@/components/ui/kit';
import { exportarRanking } from '@/api';
import { useApp } from '@/store';
import { cn } from '@/lib/utils';

function descargar(archivo, nombre) {
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Opcion({ activa, onClick, children }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
      activa ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/60')}>
      <input type="radio" checked={activa} onChange={onClick} className="accent-primary" />
      {children}
    </label>
  );
}

/** Botón "Exportar" del ranking: descarga un .xlsx con el top N (o todos) y sus datos de contacto. */
export default function ExportarRanking({ etiqueta = 'Exportar' }) {
  const { vacante, ranking, pesos, enDemo, registrar, notificar } = useApp();
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState('todos');
  const [top, setTop] = useState(10);
  const [exportando, setExportando] = useState(false);
  const total = ranking.length;
  const cantidad = modo === 'todos' ? total : Math.min(Math.max(1, Number(top) || 1), total);

  const exportar = async () => {
    setExportando(true);
    try {
      const { archivo, nombre } = await exportarRanking(vacante.id, {
        top: modo === 'todos' ? null : cantidad,
        pesoObligatorios: pesos.obligatorios,
      });
      descargar(archivo, nombre);
      registrar('Ranking exportado', `${modo === 'todos' ? 'Todos' : `Top ${cantidad}`} (${cantidad} candidatos) con datos de contacto`);
      notificar('Ranking exportado. El archivo contiene datos personales.', 'ok');
      setAbierto(false);
    } catch (e) {
      notificar(`No se pudo exportar: ${e.message}`, 'error');
    } finally {
      setExportando(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="lg" onClick={() => setAbierto(true)} disabled={!total || enDemo}
        title={enDemo ? 'La exportación necesita el servidor: los datos de ejemplo no tienen contacto.' : undefined}>
        <Download /> {etiqueta}
      </Button>
      <Modal abierto={abierto} onClose={() => !exportando && setAbierto(false)} titulo="Exportar ranking"
        pie={(
          <>
            <Button variant="ghost" onClick={() => setAbierto(false)} disabled={exportando}>Cancelar</Button>
            <Button onClick={exportar} disabled={exportando}>
              {exportando ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Descargar .xlsx
            </Button>
          </>
        )}>
        <div className="space-y-3">
          <p className="text-muted-foreground">¿Qué candidatos quieres incluir? Se exportan en el orden del ranking, con el peso actual de los obligatorios.</p>
          <Opcion activa={modo === 'todos'} onClick={() => setModo('todos')}>
            <span>Todos <span className="text-muted-foreground">({total})</span></span>
          </Opcion>
          <Opcion activa={modo === 'top'} onClick={() => setModo('top')}>
            <span className="flex flex-wrap items-center gap-2">
              Solo los primeros
              <input type="number" min={1} max={total} value={top}
                onFocus={() => setModo('top')}
                onChange={(e) => { setTop(e.target.value); setModo('top'); }}
                className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm tabular-nums focus:border-ring focus:outline-none" />
              <span className="text-muted-foreground">de {total}</span>
            </span>
          </Opcion>
          <Alerta tipo="warn" icono={ShieldAlert} titulo="El archivo incluye datos personales">
            Nombre, correo y teléfono de {cantidad} candidato(s). Compártelo solo con quienes participan en la selección.
          </Alerta>
        </div>
      </Modal>
    </>
  );
}
