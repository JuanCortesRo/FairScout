import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, CalendarDays, FolderOpen, ListChecks, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, EstadoVacio, Modal, PageHeader, Pill } from '@/components/ui/kit';
import { useApp } from '@/store';
import { cn } from '@/lib/utils';

const formatoFecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

function fecha(valor) {
  if (!valor) return 'Sin fecha';
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? 'Sin fecha' : formatoFecha.format(d);
}

export default function Vacantes() {
  const { vacantes, vacante, backend, enDemo, abrirVacante, nuevaVacante, eliminarVacante, refrescar, cargandoServidor } = useApp();
  const navigate = useNavigate();
  const [porEliminar, setPorEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => {
    if (backend === 'conectado' && !enDemo) refrescar();
  }, [backend, enDemo, refrescar]);

  const crear = () => {
    nuevaVacante();
    navigate('/vacante');
  };

  const abrir = (v) => {
    abrirVacante(v);
    navigate(v.requisitos_confirmados ? '/cvs' : '/vacante');
  };

  const confirmarEliminar = async () => {
    setEliminando(true);
    const ok = await eliminarVacante(porEliminar);
    setEliminando(false);
    if (ok) setPorEliminar(null);
  };

  const acciones = <Button size="lg" onClick={crear} disabled={backend !== 'conectado'}><Plus /> Nueva vacante</Button>;

  return (
    <>
      <PageHeader
        titulo="Vacantes"
        descripcion="Cada vacante tiene sus propios requisitos, CVs, ranking y entrevistas. Abre una para continuar su proceso."
        acciones={acciones}
      />

      {backend !== 'conectado' ? (
        <Card>
          <EstadoVacio icono={Briefcase} titulo="El servidor no está disponible"
            descripcion="Las vacantes se guardan en el backend. Inícialo para verlas o crear una nueva." />
        </Card>
      ) : cargandoServidor && !vacantes.length ? (
        <Card className="flex items-center justify-center gap-2 py-14 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando vacantes…
        </Card>
      ) : !vacantes.length ? (
        <Card>
          <EstadoVacio icono={Briefcase} titulo="Aún no hay vacantes"
            descripcion="Crea la primera: pega la descripción del cargo y la IA propone los requisitos.">
            {acciones}
          </EstadoVacio>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {vacantes.map((v) => {
            const activa = !enDemo && vacante?.id === v.id;
            return (
              <Card key={v.id} className={cn('flex flex-col p-5', activa && 'ring-2 ring-primary/40')}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 font-semibold leading-snug">{v.titulo}</h3>
                  {activa && <Pill className="bg-primary/10 text-primary ring-primary/20">Abierta</Pill>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {v.requisitos_confirmados
                    ? <Pill className="bg-ok-soft text-ok ring-ok/20">Requisitos v{v.version_requisitos}</Pill>
                    : <Pill className="bg-warn-soft text-warn ring-warn/20">Borrador: requisitos sin confirmar</Pill>}
                  <span className="inline-flex items-center gap-1"><ListChecks className="size-3.5" /> {v.requisitos.length} requisitos</span>
                  <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" /> {fecha(v.fecha_creacion)}</span>
                </div>
                <div className="mt-5 flex items-center justify-between gap-2 pt-1">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-bad" onClick={() => setPorEliminar(v)}>
                    <Trash2 /> Eliminar
                  </Button>
                  <Button onClick={() => abrir(v)}><FolderOpen /> {activa ? 'Continuar' : 'Abrir'}</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal abierto={!!porEliminar} onClose={() => !eliminando && setPorEliminar(null)} titulo="¿Eliminar la vacante?"
        pie={(
          <>
            <Button variant="ghost" onClick={() => setPorEliminar(null)} disabled={eliminando}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarEliminar} disabled={eliminando}>
              {eliminando ? <Loader2 className="animate-spin" /> : <Trash2 />} Eliminar
            </Button>
          </>
        )}>
        Se borran del servidor <b>{porEliminar?.titulo}</b>, sus requisitos, los CVs cargados, sus evaluaciones y entrevistas.
        No se puede deshacer.
      </Modal>
    </>
  );
}
