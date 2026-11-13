import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  UploadCloud, FileText, CircleCheck, CircleX, Loader2, RotateCw, Trash2, Copy, ArrowRight, Briefcase, Rocket, Clock, Zap,
  TriangleAlert, FileType, ShieldAlert, CloudOff, Sparkles,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, PageHeader, EstadoVacio, Pestanas, Alerta, Pill, Modal } from '@/components/ui/kit';
import { useApp } from '@/store';
import { ALERTAS, ESTADOS_ARCHIVO } from '@/lib/constantes';
import { cn } from '@/lib/utils';

const EN_PROCESO = ['pendiente', 'procesando'];
const PROBLEMAS = ['error', 'duplicado', 'revision'];

function tamanoLegible(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function IconoEstado({ estado }) {
  if (estado === 'listo') return <CircleCheck className="size-5 text-ok" />;
  if (estado === 'error') return <CircleX className="size-5 text-bad" />;
  if (estado === 'revision') return <ShieldAlert className="size-5 text-warn" />;
  if (estado === 'duplicado') return <Copy className="size-5 text-warn" />;
  if (estado === 'pendiente') return <Clock className="size-5 text-muted-foreground" />;
  return <Loader2 className="size-5 animate-spin text-primary" />;
}

function FilaArchivo({ a, onReintentar, onQuitar, onEliminar, onVer }) {
  const procesando = EN_PROCESO.includes(a.estado);
  return (
    <li className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
      <IconoEstado estado={a.estado} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{a.nombre}</p>
          {a.nombre.includes('.') && (
            <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
              {a.nombre.split('.').pop()}
            </span>
          )}
        </div>
        <p className={cn('text-xs', a.estado === 'error' ? 'text-bad' : ['duplicado', 'revision'].includes(a.estado) ? 'text-warn' : 'text-muted-foreground')}>
          {a.error ?? `${ESTADOS_ARCHIVO[a.estado] ?? a.estado}${a.tamano != null ? ` · ${tamanoLegible(a.tamano)}` : ''}`}
        </p>
        {a.alertas?.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {a.alertas.map((alerta) => (
              <Pill key={alerta} className={cn(ALERTAS[alerta]?.clase ?? 'bg-muted ring-border')} title={ALERTAS[alerta]?.texto ?? alerta}>
                {ALERTAS[alerta]?.corto ?? alerta}
              </Pill>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {['listo', 'revision'].includes(a.estado) && a.candidato_id && <Button variant="ghost" size="sm" onClick={onVer}>Ver <ArrowRight /></Button>}
        {a.estado === 'error' && a.reintentable !== false && <Button variant="outline" size="sm" onClick={onReintentar}><RotateCw /> Reintentar</Button>}
        {!procesando && (onEliminar ? (
          <button onClick={onEliminar} className="rounded-md p-1.5 text-muted-foreground hover:bg-bad-soft hover:text-bad" aria-label={`Eliminar ${a.nombre}`} title="Eliminar el CV del servidor">
            <Trash2 className="size-4" />
          </button>
        ) : (
          <button onClick={onQuitar} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Quitar ${a.nombre} de la lista`}>
            <Trash2 className="size-4" />
          </button>
        ))}
      </div>
    </li>
  );
}

export default function CargaCVs() {
  const {
    vacante, archivos, agregarArchivos, reintentar, quitarArchivo, eliminarCandidato, cargarDemo, lote, notificar, backend, enDemo, evaluando, pendientes, ranking,
  } = useApp();
  const navigate = useNavigate();
  const input = useRef(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [rechazados, setRechazados] = useState([]);
  const [filtro, setFiltro] = useState('todos');
  const [porEliminar, setPorEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const conteo = useMemo(() => ({
    total: archivos.length,
    listos: archivos.filter((a) => a.estado === 'listo').length,
    problemas: archivos.filter((a) => PROBLEMAS.includes(a.estado)).length,
    proceso: archivos.filter((a) => EN_PROCESO.includes(a.estado)).length,
  }), [archivos]);

  if (!vacante) {
    return (
      <>
        <PageHeader paso="Paso 2 de 3" titulo="Carga de CVs" />
        <Card>
          <EstadoVacio icono={Briefcase} titulo="Primero define la vacante"
            descripcion="Los CVs se evalúan contra los requisitos confirmados.">
            <Link to="/vacante" className={buttonVariants({ size: 'lg' })}>Crear vacante</Link>
            {backend !== 'conectado' && <Button variant="outline" size="lg" onClick={() => { cargarDemo(); navigate('/ranking'); }}><Rocket /> Explorar un ejemplo</Button>}
          </EstadoVacio>
        </Card>
      </>
    );
  }

  const bloqueado = enDemo || backend !== 'conectado';
  const recibir = (files) => {
    const lista = Array.from(files ?? []);
    if (!lista.length) return;
    const r = agregarArchivos(lista);
    setRechazados(r);
    const aceptados = lista.length - r.length;
    if (aceptados && !bloqueado) notificar(`${aceptados} archivo(s) en proceso.`, 'info');
  };

  const procesados = conteo.total - conteo.proceso;
  const progreso = conteo.total ? Math.round((procesados / conteo.total) * 100) : 0;
  const duracion = lote?.fin && lote?.inicio ? (lote.fin - lote.inicio) / 1000 : null;
  const visibles = archivos.filter((a) => filtro === 'todos'
    || (filtro === 'problemas' && PROBLEMAS.includes(a.estado))
    || (filtro === 'listos' && a.estado === 'listo')
    || (filtro === 'proceso' && EN_PROCESO.includes(a.estado)));
  const ocupado = conteo.proceso > 0 || evaluando;

  return (
    <>
      <PageHeader
        paso="Paso 2 de 3"
        titulo="Carga de CVs"
        descripcion="Sube entre 50 y 100 hojas de vida en PDF o DOCX. Cada archivo se lee, se anonimiza y se evalúa por separado: un archivo con problemas nunca detiene el lote."
        acciones={(ranking.length > 0 || conteo.listos > 0) && (
          <Button size="lg" onClick={() => navigate('/ranking')} disabled={ocupado}>
            {ocupado ? <><Loader2 className="animate-spin" /> {evaluando ? 'Evaluando con IA…' : 'Procesando…'}</> : <>Ver ranking <ArrowRight /></>}
          </Button>
        )}
      />

      {!enDemo && backend === 'desconectado' && (
        <Alerta tipo="error" icono={CloudOff} className="mb-4" titulo="El servidor no está disponible">
          Inicia el backend para procesar CVs. No se generan datos ficticios para tus archivos.
        </Alerta>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); if (!bloqueado) setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); recibir(e.dataTransfer.files); }}
        onClick={() => !bloqueado && input.current?.click()}
        onKeyDown={(e) => !bloqueado && (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        role="button"
        tabIndex={bloqueado ? -1 : 0}
        aria-disabled={bloqueado}
        className={cn(
          'group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all',
          bloqueado ? 'cursor-not-allowed border-input bg-muted/40 opacity-70'
            : arrastrando ? 'scale-[1.01] cursor-pointer border-primary bg-accent' : 'cursor-pointer border-input bg-card hover:border-primary/50 hover:bg-accent/40',
        )}
      >
        <span className={cn('mb-4 grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground transition-transform', arrastrando ? 'scale-110' : 'group-hover:-translate-y-0.5')}>
          <UploadCloud className="size-7" />
        </span>
        <p className="text-lg font-semibold">{arrastrando ? 'Suelta los archivos aquí' : 'Arrastra los CVs o haz clic para elegirlos'}</p>
        <p className="mt-1 text-sm text-muted-foreground">PDF o DOCX · hasta 10 MB por archivo · carga en lote</p>
        <input ref={input} type="file" multiple accept=".pdf,.docx" className="hidden"
          onChange={(e) => { recibir(e.target.files); e.target.value = ''; }} />
      </div>

      {rechazados.length > 0 && (
        <Alerta tipo="warn" icono={FileType} className="mt-4" titulo={`${rechazados.length} archivo(s) no se cargaron por su formato`}>
          <p>Solo se aceptan .pdf y .docx: {rechazados.join(', ')}.</p>
        </Alerta>
      )}

      {evaluando && (
        <Alerta tipo="info" icono={Sparkles} className="mt-4" titulo="Evaluando los CVs contra los requisitos">
          La IA revisa cada requisito con una cita del CV. Puede tardar unos minutos con muchos archivos; el ranking se actualiza al terminar.
        </Alerta>
      )}
      {!evaluando && !enDemo && pendientes.length > 0 && conteo.proceso === 0 && (
        <Alerta tipo="warn" icono={Clock} className="mt-4" titulo={`${pendientes.length} CV(s) procesados todavía sin evaluar`}>
          Puedes evaluarlos desde el ranking.
        </Alerta>
      )}

      {conteo.total > 0 && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4 sm:col-span-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{conteo.proceso > 0 ? 'Procesando el lote…' : 'Lote procesado'}</span>
                <span className="tabular-nums text-muted-foreground">{procesados} de {conteo.total} · {progreso}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progreso} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500 transition-all duration-500" style={{ width: `${progreso}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Leer → anonimizar → extraer → evaluar. Hasta 3 archivos en paralelo.</p>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <span className="grid size-10 place-items-center rounded-lg bg-ok-soft text-ok"><CircleCheck className="size-5" /></span>
              <div><p className="text-2xl font-semibold tabular-nums">{conteo.listos}</p><p className="text-xs text-muted-foreground">procesados</p></div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <span className="grid size-10 place-items-center rounded-lg bg-bad-soft text-bad"><TriangleAlert className="size-5" /></span>
              <div><p className="text-2xl font-semibold tabular-nums">{conteo.problemas}</p><p className="text-xs text-muted-foreground">con problemas o en revisión</p></div>
            </Card>
          </div>

          {duracion && conteo.proceso === 0 && conteo.listos > 0 && (
            <Alerta tipo="ok" icono={Zap} className="mt-4">
              <b>{conteo.listos} CVs procesados en {duracion >= 60 ? `${Math.floor(duracion / 60)} min ${Math.round(duracion % 60)} s` : `${Math.round(duracion)} s`}</b>
              {' '}· a mano tomaría cerca de {conteo.listos * 5 < 60 ? `${conteo.listos * 5} minutos` : `${Math.round((conteo.listos * 5) / 60 * 10) / 10} horas`} (5 min por CV).
            </Alerta>
          )}

          <Card className="mt-4 overflow-hidden">
            <CardHeader icono={FileText} titulo="Archivos" descripcion="Estado de cada archivo. Los errores muestran la causa y se pueden reintentar."
              accion={(
                <Pestanas valor={filtro} onChange={setFiltro} className="hidden md:inline-flex" opciones={[
                  { valor: 'todos', etiqueta: 'Todos', contador: conteo.total },
                  { valor: 'proceso', etiqueta: 'En proceso', contador: conteo.proceso },
                  { valor: 'listos', etiqueta: 'Listos', contador: conteo.listos },
                  { valor: 'problemas', etiqueta: 'Problemas', contador: conteo.problemas },
                ]} />
              )} />
            <ul className="max-h-[520px] divide-y overflow-y-auto scrollbar-fino">
              {visibles.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted-foreground">No hay archivos en este filtro.</li>}
              {visibles.map((a) => (
                <FilaArchivo key={a.id} a={a}
                  onReintentar={() => reintentar(a.id)}
                  onQuitar={() => quitarArchivo(a.id)}
                  onEliminar={!enDemo && a.candidato_id ? () => setPorEliminar(a) : null}
                  onVer={() => navigate(`/candidato/${a.candidato_id}`)} />
              ))}
            </ul>
          </Card>
          <Modal abierto={!!porEliminar} onClose={() => !eliminando && setPorEliminar(null)} titulo="¿Eliminar este CV?"
            pie={(
              <>
                <Button variant="ghost" onClick={() => setPorEliminar(null)} disabled={eliminando}>Cancelar</Button>
                <Button variant="destructive" disabled={eliminando} onClick={async () => {
                  setEliminando(true);
                  const ok = await eliminarCandidato(porEliminar.candidato_id);
                  setEliminando(false);
                  if (ok) setPorEliminar(null);
                }}>
                  {eliminando ? <Loader2 className="animate-spin" /> : <Trash2 />} Eliminar
                </Button>
              </>
            )}>
            Se borran del servidor <b>{porEliminar?.nombre}</b>, sus datos de contacto, su evaluación y sus entrevistas. No se puede deshacer.
          </Modal>
        </>
      )}
    </>
  );
}
