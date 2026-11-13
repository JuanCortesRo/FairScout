import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Briefcase, FileUp, Trophy, Columns3, MessagesSquare, ShieldCheck, Menu, X, Eye, EyeOff, Scale,
  CircleCheck, CircleX, Info, Check, Rocket,
} from 'lucide-react';
import { useApp } from '@/store';
import { cn } from '@/lib/utils';

const FLUJO = [
  { to: '/vacante', label: 'Vacante', icono: Briefcase, paso: 1 },
  { to: '/cvs', label: 'Carga de CVs', icono: FileUp, paso: 2 },
  { to: '/ranking', label: 'Ranking', icono: Trophy, paso: 3 },
];
const ANALISIS = [
  { to: '/comparador', label: 'Comparador', icono: Columns3 },
  { to: '/entrevista', label: 'Entrevistas', icono: MessagesSquare, etiqueta: 'Bonus' },
  { to: '/auditoria', label: 'Auditoría', icono: ShieldCheck },
];

function ItemNav({ item, completado, onNavigate }) {
  const Icono = item.icono;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) => cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
      )}
    >
      {({ isActive }) => (
        <>
          {item.paso ? (
            <span className={cn(
              'grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ring-1',
              completado ? 'bg-sidebar-primary text-sidebar-primary-foreground ring-sidebar-primary'
                : isActive ? 'ring-sidebar-primary text-sidebar-accent-foreground' : 'ring-sidebar-border text-sidebar-foreground/70',
            )}>
              {completado ? <Check className="size-3.5" /> : item.paso}
            </span>
          ) : (
            <Icono className={cn('size-4 shrink-0', isActive ? 'text-sidebar-primary' : '')} />
          )}
          <span className="flex-1">{item.label}</span>
          {item.etiqueta && <span className="rounded bg-sidebar-primary/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sidebar-primary">{item.etiqueta}</span>}
        </>
      )}
    </NavLink>
  );
}

function Sidebar({ onNavigate }) {
  const { vacante, candidatos, backend, enDemo } = useApp();
  const completados = { 1: !!vacante, 2: candidatos.length > 0, 3: false };
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-600 text-white shadow-lg shadow-indigo-900/40">
          <Scale className="size-5" />
        </span>
        <div className="leading-tight">
          <p className="font-semibold text-white">FairScout</p>
          <p className="text-xs text-sidebar-foreground/60">Preselección justa y explicable</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2" aria-label="Navegación principal">
        <div>
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">Flujo</p>
          <div className="relative space-y-1">
            {FLUJO.map((it) => <ItemNav key={it.to} item={it} completado={completados[it.paso]} onNavigate={onNavigate} />)}
          </div>
        </div>
        <div>
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">Análisis y gobierno</p>
          <div className="space-y-1">
            {ANALISIS.map((it) => <ItemNav key={it.to} item={it} onNavigate={onNavigate} />)}
          </div>
        </div>
      </nav>

      <div className="m-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 text-xs">
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', enDemo ? 'bg-amber-400' : backend === 'conectado' ? 'bg-emerald-400' : backend === 'desconectado' ? 'bg-red-400' : 'animate-pulse bg-sidebar-foreground/40')} />
          <span className="font-medium text-sidebar-accent-foreground">
            {enDemo ? 'Modo demostración' : backend === 'conectado' ? 'Servidor conectado' : backend === 'desconectado' ? 'Servidor no disponible' : 'Verificando servidor…'}
          </span>
        </div>
        <p className="mt-1 text-sidebar-foreground/55">
          {enDemo ? 'Estás viendo datos de ejemplo.' : backend === 'desconectado' ? 'Inicia el backend para procesar CVs reales.' : 'La IA recomienda; el equipo de selección decide.'}
        </p>
      </div>
    </div>
  );
}

function BarraSuperior({ onMenu }) {
  const { vacante, modoCiego, toggleCiego, enDemo, reiniciar } = useApp();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
      <button className="-ml-1 rounded-md p-1.5 hover:bg-muted lg:hidden" onClick={onMenu} aria-label="Abrir menú">
        <Menu className="size-5" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        {vacante ? (
          <>
            <Briefcase className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{vacante.titulo}</span>
            <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground sm:inline">
              requisitos v{vacante.version}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Sin vacante activa</span>
        )}
      </div>
      {enDemo && (
        <button onClick={() => { reiniciar(); navigate('/vacante'); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-warn/30 bg-warn-soft px-3 py-1.5 text-sm font-medium text-warn transition-colors hover:bg-warn-soft/70">
          <Rocket className="size-4" /> <span className="hidden sm:inline">Demo ·</span> Salir
        </button>
      )}
      <button
        onClick={toggleCiego}
        aria-pressed={modoCiego}
        title="El modo ciego oculta los nombres y muestra solo un número de candidato"
        className={cn('inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
          modoCiego ? 'border-primary/30 bg-accent text-accent-foreground' : 'hover:bg-muted')}
      >
        {modoCiego ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        <span className="hidden sm:inline">{modoCiego ? 'Modo ciego activo' : 'Modo ciego apagado'}</span>
      </button>
    </header>
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

export default function Layout() {
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setMenu(false); window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="min-h-screen lg:pl-64">
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
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <Outlet />
      </main>
      <Avisos />
    </div>
  );
}
