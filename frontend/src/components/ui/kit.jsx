// Componentes visuales reutilizables de la app.
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { CONFIANZAS, ESTADOS, RESULTADOS, TIPOS, CATEGORIAS } from '@/lib/constantes';
import { CircleHelp, X } from 'lucide-react';

export function Card({ className, ...props }) {
  return <div className={cn('rounded-xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]', className)} {...props} />;
}

export function CardHeader({ titulo, descripcion, accion, icono: Icono, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b px-5 py-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icono && (
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
            <Icono className="size-4" />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{titulo}</h3>
          {descripcion && <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p>}
        </div>
      </div>
      {accion}
    </div>
  );
}

export function PageHeader({ titulo, descripcion, paso, acciones }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {paso && <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">{paso}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descripcion && <p className="mt-1 max-w-2xl text-muted-foreground">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}

export function Pill({ className, icono: Icono, children, title }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', className)}>
      {Icono && <Icono className="size-3.5" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function EstadoBadge({ estado, className }) {
  const e = ESTADOS[estado];
  if (!e) return null;
  return <Pill className={cn(e.clase, className)} icono={e.icono}>{e.texto}</Pill>;
}

export function ResultadoBadge({ resultado, className }) {
  const r = RESULTADOS[resultado];
  if (!r) return <Pill className="bg-muted ring-border">{resultado}</Pill>;
  return <Pill className={cn(r.clase, className)} icono={r.icono}>{r.texto}</Pill>;
}

export function TipoBadge({ tipo }) {
  const t = TIPOS[tipo];
  return <Pill className={t?.clase} title={t?.ayuda}>{t?.texto ?? tipo}</Pill>;
}

export function CategoriaTag({ categoria }) {
  return <span className="text-xs text-muted-foreground">{CATEGORIAS[categoria] ?? categoria}</span>;
}

/** Confianza: barras + texto (no solo color). */
export function Confianza({ nivel, mostrarTexto = true, className }) {
  const c = CONFIANZAS[nivel];
  if (!c) return null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', c.clase, className)} title={`Confianza ${c.texto.toLowerCase()}`}>
      <span className="flex items-end gap-[2px]" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn('w-[3px] rounded-full', i <= c.nivel ? 'bg-current' : 'bg-current/20')} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      {mostrarTexto && <span>{c.texto}</span>}
    </span>
  );
}

function colorPuntaje(p) {
  if (p >= 70) return 'var(--ok)';
  if (p >= 50) return 'var(--warn)';
  return 'var(--bad)';
}

export function AnilloPuntaje({ valor, tamano = 72, grosor = 7 }) {
  const r = (tamano - grosor) / 2;
  const circ = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div className="relative shrink-0" style={{ width: tamano, height: tamano }} role="img" aria-label={`Puntaje ${Math.round(v)} de 100`}>
      <svg width={tamano} height={tamano} className="-rotate-90">
        <circle cx={tamano / 2} cy={tamano / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={grosor} />
        <circle
          cx={tamano / 2} cy={tamano / 2} r={r} fill="none" stroke={colorPuntaje(v)} strokeWidth={grosor}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - v / 100)}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-lg font-semibold tabular-nums">{Math.round(v)}</span>
    </div>
  );
}

export function BarraPuntaje({ valor }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 text-right text-sm font-semibold tabular-nums">{Math.round(valor)}</span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${valor}%`, background: colorPuntaje(valor) }} />
      </div>
    </div>
  );
}

export function Interruptor({ activo, onChange, etiqueta, descripcion }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer select-none items-center gap-2.5">
      <button
        id={id} type="button" role="switch" aria-checked={activo} onClick={() => onChange(!activo)}
        className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', activo ? 'bg-primary' : 'bg-input')}
      >
        <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform', activo && 'translate-x-4')} />
      </button>
      {(etiqueta || descripcion) && (
        <span className="leading-tight">
          {etiqueta && <span className="text-sm font-medium">{etiqueta}</span>}
          {descripcion && <span className="block text-xs text-muted-foreground">{descripcion}</span>}
        </span>
      )}
    </label>
  );
}

export function Pestanas({ opciones, valor, onChange, className }) {
  return (
    <div role="tablist" className={cn('inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-1 scrollbar-fino', className)}>
      {opciones.map((o) => (
        <button
          key={o.valor} role="tab" type="button" aria-selected={valor === o.valor} onClick={() => onChange(o.valor)}
          className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all',
            valor === o.valor ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.icono && <o.icono className="size-4" />}
          {o.etiqueta}
          {o.contador != null && (
            <span className={cn('rounded-full px-1.5 text-xs tabular-nums', valor === o.valor ? 'bg-muted' : 'bg-background/60')}>{o.contador}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function EstadoVacio({ icono: Icono, titulo, descripcion, children, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {Icono && (
        <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
          <Icono className="size-7" />
        </span>
      )}
      <h3 className="text-lg font-semibold">{titulo}</h3>
      {descripcion && <p className="mt-1 max-w-md text-muted-foreground">{descripcion}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function Alerta({ tipo = 'info', icono: Icono, titulo, children, className }) {
  const estilos = {
    info: 'border-info/25 bg-info-soft text-info',
    ok: 'border-ok/25 bg-ok-soft text-ok',
    warn: 'border-warn/30 bg-warn-soft text-warn',
    error: 'border-bad/25 bg-bad-soft text-bad',
  };
  return (
    <div className={cn('flex gap-3 rounded-lg border p-3 text-sm', estilos[tipo], className)} role={tipo === 'error' ? 'alert' : 'status'}>
      {Icono && <Icono className="mt-0.5 size-4 shrink-0" />}
      <div className="min-w-0 text-foreground/85">
        {titulo && <p className="font-semibold text-foreground">{titulo}</p>}
        {children}
      </div>
    </div>
  );
}

/** Ventana emergente ligera anclada a un botón (ayuda del puntaje, etc.). */
export function Ayuda({ titulo, children, ancho = 340, etiqueta = 'Ayuda', icono: Icono = CircleHelp }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e) => { if (!ref.current?.contains(e.target)) setAbierto(false); };
    const esc = (e) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', cerrar); document.removeEventListener('keydown', esc); };
  }, [abierto]);
  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" aria-label={etiqueta} aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}
        className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <Icono className="size-4" />
      </button>
      {abierto && (
        <div className="absolute top-8 right-0 z-40 rounded-xl border bg-popover p-4 text-left text-sm font-normal normal-case tracking-normal text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95"
          style={{ width: ancho }}>
          {titulo && <p className="mb-2 font-semibold">{titulo}</p>}
          {children}
        </div>
      )}
    </span>
  );
}

export function Modal({ abierto, onClose, titulo, children, pie }) {
  useEffect(() => {
    if (!abierto) return;
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [abierto, onClose]);
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in-0" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-md rounded-2xl border bg-card shadow-2xl animate-in fade-in-0 zoom-in-95">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="font-semibold">{titulo}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Cerrar"><X className="size-4" /></button>
        </div>
        <div className="px-5 py-4 text-sm">{children}</div>
        {pie && <div className="flex justify-end gap-2 border-t px-5 py-3">{pie}</div>}
      </div>
    </div>
  );
}

export function Kpi({ etiqueta, valor, detalle, icono: Icono, tono = 'default' }) {
  const tonos = {
    default: 'bg-accent text-accent-foreground',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad',
    info: 'bg-info-soft text-info',
  };
  return (
    <Card className="flex items-center gap-3 p-4">
      {Icono && <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', tonos[tono])}><Icono className="size-5" /></span>}
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-none tabular-nums">{valor}</p>
        <p className="mt-1 text-xs leading-tight text-muted-foreground">{etiqueta}{detalle && <span> · {detalle}</span>}</p>
      </div>
    </Card>
  );
}
