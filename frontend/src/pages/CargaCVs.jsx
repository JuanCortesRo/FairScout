import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  UploadCloud, FileText, CircleCheck, CircleX, Loader2, RotateCw, Trash2, Copy, ArrowRight, Briefcase, Rocket, Clock, Zap, TriangleAlert, FileType,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, PageHeader, EstadoVacio, Pestanas, Alerta } from '@/components/ui/kit';
import { useApp } from '@/store';
import { ESTADOS_ARCHIVO } from '@/lib/constantes';
import { cn } from '@/lib/utils';

const EN_PROCESO = ['pendiente', 'leyendo', 'anonimizando', 'extrayendo', 'evaluando'];
const PASOS_UI = ['leyendo', 'anonimizando', 'extrayendo', 'evaluando', 'listo'];

function tamanoLegible(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function IconoEstado({ estado }) {
  if (estado === 'listo') return <CircleCheck className="size-5 text-ok" />;
  if (estado === 'error') return <CircleX className="size-5 text-bad" />;
  if (estado === 'duplicado') return <Copy className="size-5 text-warn" />;
  if (estado === 'pendiente') return <Clock className="size-5 text-muted-foreground" />;
  return <Loader2 className="size-5 animate-spin text-primary" />;
}

function Pasos({ estado }) {
  const i = PASOS_UI.indexOf(estado);
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {PASOS_UI.slice(0, 4).map((p, k) => (
        <span key={p} className={cn('h-1 w-6 rounded-full transition-colors', k < i || estado === 'listo' ? 'bg-ok' : k === i ? 'animate-pulse bg-primary' : 'bg-muted')} />
      ))}
    </div>
  );
}

function FilaArchivo({ a, onReintentar, onQuitar, onVer }) {
  const procesando = EN_PROCESO.includes(a.estado);
  return (
    <li className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
      <IconoEstado estado={a.estado} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{a.nombre}</p>
          <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
            {a.nombre.split('.').pop()}
          </span>
        </div>
        <p className={cn('text-xs', a.estado === 'error' ? 'text-bad' : a.estado === 'duplicado' ? 'text-warn' : 'text-muted-foreground')}>
          {a.error ?? `${ESTADOS_ARCHIVO[a.estado]}${a.candidato_id ? ` · Candidato ${a.candidato_id}` : ''} · ${tamanoLegible(a.tamano)}`}
        </p>
      </div>
      {procesando && <Pasos estado={a.estado} />}
      <div className="flex shrink-0 items-center gap-1">
        {a.estado === 'listo' && <Button variant="ghost" size="sm" onClick={onVer}>Ver <ArrowRight /></Button>}
        {a.estado === 'error' && a.reintentable !== false && <Button variant="outline" size="sm" onClick={onReintentar}><RotateCw /> Reintentar</Button>}
        {!procesando && (
          <button onClick={onQuitar} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Quitar ${a.nombre}`}>
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </li>
  );
}

export default function CargaCVs() {
  const { vacante, archivos, agregarArchivos, reintentar, quitarArchivo, cargarDemo, lote, notificar } = useApp();
  const navigate = useNavigate();
  const input = useRef(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [rechazados, setRechazados] = useState([]);
  const [filtro, setFiltro] = useState('todos');

  const conteo = useMemo(() => ({
    total: archivos.length,
    listos: archivos.filter((a) => a.estado === 'listo').length,
    errores: archivos.filter((a) => a.estado === 'error').length,
    duplicados: archivos.filter((a) => a.estado === 'duplicado').length,
    proceso: archivos.filter((a) => EN_PROCESO.includes(a.estado)).length,
  }), [archivos]);

  if (!vacante) {
    return (
      <>
        <PageHeader paso="Paso 2 de 3" titulo="Carga de CVs" />
        <Card>
          <EstadoVacio icono={Briefcase} titulo="Primero define la vacante"
            descripcion="Los CVs se evalúan contra los requisitos confirmados. Crea la vacante o usa la demo con 60 CVs ya procesados.">
            <Link to="/vacante" className={buttonVariants({ size: 'lg' })}>Crear vacante</Link>
            <Button variant="outline" size="lg" onClick={() => { cargarDemo(); navigate('/ranking'); }}><Rocket /> Ver demo completa</Button>
          </EstadoVacio>
        </Card>
      </>
    );
  }

  const recibir = (files) => {
    const lista = Array.from(files ?? []);
    if (!lista.length) return;
    const r = agregarArchivos(lista);
    setRechazados(r);
    const aceptados = lista.length - r.length;
    if (aceptados) notificar(`${aceptados} archivo(s) en proceso.`, 'info');
  };

  const procesados = conteo.listos + conteo.errores + conteo.duplicados;
  const progreso = conteo.total ? Math.round((procesados / conteo.total) * 100) : 0;
  const duracion = lote?.fin && lote?.inicio ? (lote.fin - lote.inicio) / 1000 : null;
  const visibles = archivos.filter((a) => filtro === 'todos'
    || (filtro === 'errores' && ['error', 'duplicado'].includes(a.estado))
    || (filtro === 'listos' && a.estado === 'listo')
    || (filtro === 'proceso' && EN_PROCESO.includes(a.estado)));

  return (
    <>
      <PageHeader
        paso="Paso 2 de 3"
        titulo="Carga de CVs"
        descripcion="Sube entre 50 y 100 hojas de vida en PDF o DOCX. Cada archivo se lee, se anonimiza y se evalúa por separado: un archivo con problemas nunca detiene el lote."
        acciones={conteo.listos > 0 && (
          <Button size="lg" onClick={() => navigate('/ranking')} disabled={conteo.proceso > 0}>
            {conteo.proceso > 0 ? <><Loader2 className="animate-spin" /> Procesando…</> : <>Ver ranking <ArrowRight /></>}
          </Button>
        )}
      />

      <div
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); recibir(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        role="button"
        tabIndex={0}
        className={cn(
          'group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all',
          arrastrando ? 'scale-[1.01] border-primary bg-accent' : 'border-input bg-card hover:border-primary/50 hover:bg-accent/40',
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
              <p className="mt-2 text-xs text-muted-foreground">Leer → anonimizar → extraer → evaluar. Hasta 4 archivos en paralelo.</p>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <span className="grid size-10 place-items-center rounded-lg bg-ok-soft text-ok"><CircleCheck className="size-5" /></span>
              <div><p className="text-2xl font-semibold tabular-nums">{conteo.listos}</p><p className="text-xs text-muted-foreground">evaluados</p></div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <span className="grid size-10 place-items-center rounded-lg bg-bad-soft text-bad"><TriangleAlert className="size-5" /></span>
              <div><p className="text-2xl font-semibold tabular-nums">{conteo.errores + conteo.duplicados}</p><p className="text-xs text-muted-foreground">con problemas</p></div>
            </Card>
          </div>

          {duracion && conteo.proceso === 0 && (
            <Alerta tipo="ok" icono={Zap} className="mt-4">
              <b>{conteo.listos} CVs evaluados en {duracion >= 60 ? `${Math.floor(duracion / 60)} min ${Math.round(duracion % 60)} s` : `${Math.round(duracion)} s`}</b>
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
                  { valor: 'errores', etiqueta: 'Problemas', contador: conteo.errores + conteo.duplicados },
                ]} />
              )} />
            <ul className="max-h-[520px] divide-y overflow-y-auto scrollbar-fino">
              {visibles.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted-foreground">No hay archivos en este filtro.</li>}
              {visibles.map((a) => (
                <FilaArchivo key={a.id} a={a}
                  onReintentar={() => reintentar(a.id)}
                  onQuitar={() => quitarArchivo(a.id)}
                  onVer={() => navigate(`/candidato/${a.candidato_id}`)} />
              ))}
            </ul>
          </Card>
        </>
      )}

      {conteo.total === 0 && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿Sin archivos a mano? <button className="font-medium text-primary hover:underline" onClick={() => { cargarDemo(); navigate('/ranking'); }}>Carga 60 CVs de ejemplo</button>.
          {' '}Para probar errores, sube archivos llamados <code className="rounded bg-muted px-1">corrupto.pdf</code> o <code className="rounded bg-muted px-1">protegido.pdf</code>.
        </p>
      )}
    </>
  );
}
