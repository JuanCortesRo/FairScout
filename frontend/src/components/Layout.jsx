import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Briefcase, FolderKanban, FileUp, Trophy, Columns3, MessagesSquare, ShieldCheck, Menu, X,
  CircleCheck, CircleX, Info, Check, Sparkles, Scale, Moon, Sun,
} from 'lucide-react';
import { useApp } from '@/store';
import Logo from '@/components/Logo';
import { useTema } from '@/lib/tema';
import { cn } from '@/lib/utils';

const FLUJO = [
  { to: '/vacante', label: 'Vacante', icono: Briefcase, paso: 1 },
  { to: '/cvs', label: 'Carga de CVs', icono: FileUp, paso: 2 },
  { to: '/ranking', label: 'Ranking', icono: Trophy, paso: 3 },
];
const ANALISIS = [
  { to: '/comparador', label: 'Comparador', icono: Columns3 },
  { to: '/entrevista', label: 'Entrevistas', icono: MessagesSquare },
  { to: '/auditoria', label: 'Auditoría', icono: ShieldCheck },
];

function ItemNav({ item, completado, onNavigate }) {
  const Icono = item.icono;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) => cn(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
        isActive
          ? 'bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
          : 'text-sidebar-foreground/70 hover:bg-white/[0.05] hover:text-white',
      )}
    >
      {({ isActive }) => (
        <>
          {item.paso ? (
            <span className={cn(
              'relative z-10 grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ring-1 transition-all',
              completado ? 'bg-marca text-white ring-transparent shadow-[0_4px_12px_-2px_rgba(139,79,240,0.6)]'
                : isActive ? 'bg-sidebar ring-2 ring-sidebar-primary text-white' : 'bg-sidebar ring-sidebar-border text-sidebar-foreground/70',
            )}>
              {completado ? <Check className="size-3.5" /> : item.paso}
            </span>
          ) : (
            <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg transition-colors', isActive ? 'bg-marca text-white' : 'text-sidebar-foreground/70 group-hover:text-white')}>
              <Icono className="size-4" />
            </span>
          )}
          <span className="flex-1">{item.label}</span>
          {item.etiqueta && <span className="rounded-full bg-gradient-to-r from-violet-500/30 to-cyan-400/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">{item.etiqueta}</span>}
        </>
      )}
    </NavLink>
  );
}

function Sidebar({ onNavigate }) {
  const { vacante, candidatos, ranking } = useApp();
  const completados = { 1: !!vacante, 2: candidatos.length > 0, 3: ranking.length > 0 };
  const avance = Object.values(completados).filter(Boolean).length;
  return (
    <div className="fondo-sidebar flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-5 pt-6 pb-5">
        <Logo claro lema />
      </div>

      <nav className="flex-1 space-y-7 overflow-y-auto px-3 py-2" aria-label="Navegación principal">
        <ItemNav item={{ to: '/vacantes', label: 'Vacantes', icono: FolderKanban }} onNavigate={onNavigate} />
        <div>
          <div className="flex items-center justify-between px-3 pb-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">Proceso</p>
            <span className="text-[11px] font-medium text-sidebar-foreground/45 tabular-nums">{avance}/3</span>
          </div>
          <div className="relative space-y-1">
            {/* Línea que une los pasos del proceso; la parte de color avanza con cada paso completado */}
            <span aria-hidden="true" className="absolute top-6 bottom-6 left-[1.6rem] w-px bg-sidebar-border" />
            <span aria-hidden="true" className="bg-marca absolute top-6 left-[1.6rem] w-px transition-all duration-500"
              style={{ height: `calc((100% - 3rem) * ${Math.max(0, avance - 1) / 2})` }} />
            {FLUJO.map((it) => <ItemNav key={it.to} item={it} completado={completados[it.paso]} onNavigate={onNavigate} />)}
          </div>
        </div>
        <div>
          <p className="px-3 pb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">Análisis</p>
          <div className="space-y-1">
            {ANALISIS.map((it) => <ItemNav key={it.to} item={it} onNavigate={onNavigate} />)}
          </div>
        </div>
      </nav>
    </div>
  );
}

const SALIDA_PILDORA_MS = 250;

/** Píldora de la vacante abierta: entra deslizándose a la derecha y sale hacia la izquierda. */
function PildoraVacante({ vacante, visible }) {
  const [montada, setMontada] = useState(visible && !!vacante);
  const [ultima, setUltima] = useState(vacante);
  useEffect(() => { if (vacante) setUltima(vacante); }, [vacante]);
  useEffect(() => {
    if (visible && vacante) { setMontada(true); return undefined; }
    // Se mantiene montada mientras dura la animación de salida.
    const t = setTimeout(() => setMontada(false), SALIDA_PILDORA_MS);
    return () => clearTimeout(t);
  }, [visible, vacante]);
  if (!montada || !ultima) return null;
  const saliendo = !(visible && vacante);
  return (
    <Link to="/vacantes" title="Cambiar de vacante" aria-hidden={saliendo || undefined} tabIndex={saliendo ? -1 : undefined}
      className={cn('hidden min-w-0 items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 shadow-sm transition-colors hover:bg-muted sm:inline-flex',
        saliendo ? 'pildora-sale pointer-events-none' : 'pildora-entra')}>
      <span className="bg-marca grid size-6 shrink-0 place-items-center rounded-full text-white"><Briefcase className="size-3.5" /></span>
      <span className="truncate font-medium">{ultima.titulo}</span>
      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">v{ultima.version}</span>
    </Link>
  );
}

function BarraSuperior({ onMenu }) {
  const { vacante, enDemo, reiniciar } = useApp();
  const { tema, alternar } = useTema();
  const oscuro = tema === 'oscuro';
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // En la lista de vacantes no hay "vacante actual" que mostrar.
  const mostrarVacante = pathname !== '/vacantes';
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/70 bg-background/75 px-4 backdrop-blur-xl sm:px-6">
      <button className="-ml-1 rounded-md p-1.5 hover:bg-muted lg:hidden" onClick={onMenu} aria-label="Abrir menú">
        <Menu className="size-5" />
      </button>
      <Logo tamano={30} className="mr-1 lg:hidden" />
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <PildoraVacante vacante={vacante} visible={mostrarVacante} />
        {mostrarVacante && !vacante && (
          <Link to="/vacantes" className="hidden text-muted-foreground hover:text-foreground sm:inline">Crea o abre una vacante para empezar</Link>
        )}
      </div>
      {enDemo && (
        <button onClick={() => { reiniciar(); navigate('/vacante'); }} title="Salir de los datos de ejemplo"
          className="group inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20">
          <Sparkles className="size-3.5" /> Ejemplo <X className="size-3 opacity-60 group-hover:opacity-100" />
        </button>
      )}
      <button
        onClick={alternar}
        aria-label={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        title={oscuro ? 'Modo claro' : 'Modo oscuro'}
        className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border bg-card shadow-sm transition-colors hover:bg-muted"
      >
        <Moon className={cn('size-4 transition-all duration-300', oscuro ? 'translate-y-6 rotate-90 opacity-0' : 'text-violet-600')} />
        <Sun className={cn('absolute size-4 transition-all duration-300', oscuro ? 'text-amber-300' : '-translate-y-6 -rotate-90 opacity-0')} />
      </button>
    </header>
  );
}

function Pie() {
  return (
    <footer className="border-t border-border/70 bg-card/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 text-sm sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Logo tamano={28} />
          <span className="hidden h-5 w-px bg-border md:block" />
          <span className="text-muted-foreground">Preselección justa, explicable y basada en evidencia.</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <NavLink to="/auditoria" className="inline-flex items-center gap-1.5 hover:text-foreground"><ShieldCheck className="size-3.5" /> Ficha del sistema</NavLink>
          <span>Desarrollado por <b className="font-semibold text-foreground">Backpropagation</b></span>
          <span>© {new Date().getFullYear()} FairScout</span>
        </div>
      </div>
    </footer>
  );
}

function Avisos() {
  const { avisos } = useApp();
  const iconos = { ok: CircleCheck, error: CircleX, info: Info };
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {avisos.map((a) => {
        const Icono = iconos[a.tipo] ?? Info;
        return (
          <div key={a.id} className="pointer-events-auto flex items-start gap-3 rounded-xl border bg-card p-3 text-sm shadow-lg animate-in slide-in-from-bottom-2 fade-in-0">
            <Icono className={cn('mt-0.5 size-4 shrink-0', a.tipo === 'ok' ? 'text-ok' : a.tipo === 'error' ? 'text-bad' : 'text-info')} />
            <span>{a.texto}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Marco de navegación de las vistas privadas, estado de conexión y preferencias visuales. */
export default function Layout() {
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setMenu(false); window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <Sidebar />
      </aside>
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 animate-in fade-in-0" onClick={() => setMenu(false)} />
          <aside className="relative h-full w-72 animate-in slide-in-from-left">
            <button className="absolute top-5 right-3 z-10 rounded-md p-1 text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => setMenu(false)} aria-label="Cerrar menú">
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setMenu(false)} />
          </aside>
        </div>
      )}
      <BarraSuperior onMenu={() => setMenu(true)} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
        <div key={pathname} className="entrada">
          <Outlet />
        </div>
      </main>
      <Pie />
      <Avisos />
    </div>
  );
}
