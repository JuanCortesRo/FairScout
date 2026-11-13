import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, CircleCheck, CircleAlert, CircleHelp, CircleX, Star, Search, SlidersHorizontal, Columns3, Rocket, Briefcase, FileUp, X, ChevronRight, ThumbsUp, Minus,
  Loader2, Clock, Sparkles, CloudOff, RefreshCw, ShieldAlert, Trophy, ArrowRight,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card, PageHeader, Kpi, EstadoBadge, Confianza, BarraPuntaje, Pestanas, EstadoVacio, Ayuda, Interruptor, Alerta, Pill, AnilloPuntaje,
} from '@/components/ui/kit';
import { useApp } from '@/store';
import { ALERTAS, AVISO_DECISION, CATEGORIAS } from '@/lib/constantes';
import ExportarRanking from '@/components/ExportarRanking';
import { cn } from '@/lib/utils';

function MiniCategorias({ categorias }) {
  const orden = ['experiencia', 'tecnica', 'idioma', 'formacion', 'certificacion', 'blanda'].filter((c) => c in categorias);
  return (
    <div className="flex items-end gap-1" aria-label="Cumplimiento por categoría">
      {orden.map((c) => {
        const v = categorias[c];
        return (
          <div key={c} className="group/cat relative flex flex-col items-center" title={`${CATEGORIAS[c]}: ${Math.round(v * 100)}%`}>
            <div className="flex h-6 w-2 items-end overflow-hidden rounded-sm bg-muted">
              <div className="w-full rounded-sm" style={{ height: `${Math.max(8, v * 100)}%`, background: v >= 0.75 ? 'var(--ok)' : v >= 0.4 ? 'var(--warn)' : 'var(--bad)', opacity: v === 0 ? 0.35 : 1 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const MEDALLAS = [
  { etiqueta: '1.º', clase: 'from-amber-300 to-amber-500 text-amber-950', borde: 'ring-amber-300/60' },
  { etiqueta: '2.º', clase: 'from-slate-200 to-slate-400 text-slate-800', borde: 'ring-slate-300/60' },
  { etiqueta: '3.º', clase: 'from-orange-300 to-orange-500 text-orange-950', borde: 'ring-orange-300/60' },
];

/** Los tres primeros del ranking, destacados (solo presentación). */
function Podio({ items, nombreVisible, onAbrir }) {
  if (!items.length) return null;
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <Trophy className="size-4 text-amber-500" />
        <h2 className="font-heading text-lg font-bold">Mejor evaluados</h2>
      </div>
      <div className="entrada-escalonada grid gap-4 md:grid-cols-3">
        {items.map(({ candidato: c, resultado: r }, i) => (
          <button key={c.candidato_id} onClick={() => onAbrir(c.candidato_id)}
            className={cn('tarjeta-viva group relative overflow-hidden rounded-2xl border bg-card p-5 text-left shadow-sm ring-1', MEDALLAS[i].borde)}>
            <span aria-hidden="true" className="bg-marca pointer-events-none absolute -top-12 -right-12 size-32 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-25" />
            <div className="flex items-start justify-between">
              <span className={cn('grid size-9 place-items-center rounded-full bg-gradient-to-br font-heading text-sm font-extrabold shadow-sm', MEDALLAS[i].clase)}>{MEDALLAS[i].etiqueta}</span>
              <AnilloPuntaje valor={r.puntaje} tamano={64} grosor={6} />
            </div>
            <p className="mt-3 truncate font-heading text-lg font-bold">{nombreVisible(c)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <EstadoBadge estado={r.estado} />
              <Confianza nivel={r.confianza} />
            </div>
            <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-xs text-muted-foreground">{r.motivo_estado}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
              {r.recomendado_entrevista ? 'Recomendado para entrevista' : 'Ver evaluación'}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Barra apilada con la distribución de estados del lote. */
function Distribucion({ stats }) {
  const partes = [
    { clave: 'cumple', etiqueta: 'Cumplen', valor: stats.cumple, color: 'bg-ok' },
    { clave: 'parcial', etiqueta: 'Parcialmente', valor: stats.parcial, color: 'bg-warn' },
    { clave: 'pendiente', etiqueta: 'Por verificar', valor: stats.pendiente, color: 'bg-info' },
    { clave: 'no', etiqueta: 'No cumplen', valor: stats.no, color: 'bg-bad' },
  ].filter((p) => p.valor > 0);
  if (!stats.total) return null;
  return (
    <Card className="mt-4 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Distribución del lote</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {partes.map((p) => (
            <span key={p.clave} className="inline-flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-full', p.color)} /> {p.etiqueta} <b className="text-foreground tabular-nums">{p.valor}</b>
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label="Distribución de candidatos por estado">
        {partes.map((p) => (
          <div key={p.clave} className={cn('h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full', p.color)}
            style={{ width: `${(p.valor / stats.total) * 100}%` }} title={`${p.etiqueta}: ${p.valor}`} />
        ))}
      </div>
    </Card>
  );
}

function AjustePesos() {
  const { pesos, setPesos, registrar } = useApp();
  return (
    <Ayuda titulo="Cómo se calcula el puntaje" ancho={360} etiqueta="Ajustar pesos del puntaje" icono={SlidersHorizontal}>
      <div className="space-y-3 text-muted-foreground">
        <p>Cada requisito vale: <b className="text-foreground">cumple 1 · equivalente 0,8 · parcial 0,5 · no cumple o sin información 0</b>.</p>
        <p className="rounded-lg bg-muted px-3 py-2 font-mono text-xs text-foreground">
          puntaje = {pesos.obligatorios}% × obligatorios + {100 - pesos.obligatorios}% × deseables
        </p>
        <p>Dentro de cada grupo: Σ(peso × valor) / Σ(peso). Los descalificantes no suman: definen el estado.</p>
        <div className="pt-1">
          <div className="mb-1 flex justify-between text-xs font-medium text-foreground">
            <span>Obligatorios {pesos.obligatorios}%</span><span>Deseables {100 - pesos.obligatorios}%</span>
          </div>
          <input type="range" min={40} max={90} step={5} value={pesos.obligatorios}
            onChange={(e) => setPesos({ obligatorios: Number(e.target.value) })}
            onMouseUp={() => registrar('Pesos ajustados', `Obligatorios ${pesos.obligatorios}% / deseables ${100 - pesos.obligatorios}%`)}
            className="w-full accent-[var(--primary)]" aria-label="Peso de los obligatorios" />
          <p className="mt-1 text-xs">El backend recalcula el ranking sin volver a llamar a la IA.</p>
        </div>
        <p className="border-t pt-3 text-xs">El puntaje <b>no</b> es una probabilidad de éxito.</p>
      </div>
    </Ayuda>
  );
}

export default function Ranking() {
  const {
    vacante, ranking, cargarDemo, nombreVisible, seleccion, toggleSeleccion, backend, enDemo,
    pendientes, enRevision, evaluando, evaluar, refrescar, cargandoServidor, errorServidor, erroresEvaluacion,
  } = useApp();
  const navigate = useNavigate();
  const [pestana, setPestana] = useState('aptos');
  const [busqueda, setBusqueda] = useState('');
  const [confianza, setConfianza] = useState('todas');
  const [soloRecomendados, setSoloRecomendados] = useState(false);

  const stats = useMemo(() => ({
    total: ranking.length,
    cumple: ranking.filter((r) => r.resultado.estado === 'cumple').length,
    parcial: ranking.filter((r) => r.resultado.estado === 'cumple_parcialmente').length,
    pendiente: ranking.filter((r) => r.resultado.estado === 'pendiente_verificar').length,
    no: ranking.filter((r) => r.resultado.estado === 'no_cumple').length,
    recomendados: ranking.filter((r) => r.resultado.recomendado_entrevista).length,
  }), [ranking]);

  const filtrados = useMemo(() => ranking.filter(({ candidato, resultado }) => {
    if (pestana === 'aptos' && resultado.estado === 'no_cumple') return false;
    if (pestana === 'pendiente_verificar' && resultado.estado !== 'pendiente_verificar') return false;
    if (pestana === 'no_cumple' && resultado.estado !== 'no_cumple') return false;
    if (confianza !== 'todas' && resultado.confianza !== confianza) return false;
    if (soloRecomendados && !resultado.recomendado_entrevista) return false;
    if (busqueda && !nombreVisible(candidato).toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  }), [ranking, pestana, confianza, soloRecomendados, busqueda, nombreVisible]);

  const avisoEvaluacion = !enDemo && (evaluando || pendientes.length > 0) && (
    evaluando ? (
      <Alerta tipo="info" icono={Loader2} className="mb-4 [&>svg]:animate-spin" titulo="Evaluando CVs con la IA…">
        Cada requisito se evalúa con una cita del CV. El ranking se actualiza al terminar.
      </Alerta>
    ) : (
      <Alerta tipo="warn" icono={Clock} className="mb-4" titulo={`${pendientes.length} CV(s) procesados todavía sin evaluar`}>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span>Aún no aparecen en el ranking.</span>
          <Button size="sm" onClick={() => evaluar()}><Sparkles /> Evaluar ahora</Button>
        </div>
      </Alerta>
    )
  );
  const avisoErrores = erroresEvaluacion.length > 0 && (
    <Alerta tipo="error" icono={CircleAlert} className="mb-4" titulo={`${erroresEvaluacion.length} CV(s) no pudieron evaluarse`}>
      <ul className="mt-1 list-disc pl-4">
        {erroresEvaluacion.map((error) => (
          <li key={error.candidato_id}>
            {`Candidato ${error.candidato_id.slice(0, 6).toUpperCase()}: ${error.detalle}`}
          </li>
        ))}
      </ul>
    </Alerta>
  );

  if (!vacante || (ranking.length === 0 && enRevision.length === 0)) {
    const sinCVs = vacante && pendientes.length === 0 && !evaluando;
    return (
      <>
        <PageHeader paso="Paso 3 de 3" titulo="Ranking de candidatos" />
        {vacante && avisoEvaluacion}
        {avisoErrores}
        {errorServidor && <Alerta tipo="error" icono={CloudOff} className="mb-4" titulo="No se pudieron cargar los datos del servidor">{errorServidor}</Alerta>}
        <Card>
          <EstadoVacio
            icono={vacante ? FileUp : Briefcase}
            titulo={!vacante ? 'No hay una vacante activa' : cargandoServidor ? 'Cargando candidatos…' : sinCVs ? 'Aún no hay CVs evaluados' : 'Todavía no hay resultados'}
            descripcion={vacante
              ? 'Carga las hojas de vida para ver aquí el ranking explicado de todos los candidatos.'
              : backend === 'conectado' ? 'Crea la vacante y confirma sus requisitos para empezar.' : 'Crea una vacante para empezar, o explora un ejemplo con 60 candidatos ya evaluados.'}
          >
            {(!vacante || sinCVs) && <Link to={vacante ? '/cvs' : '/vacante'} className={buttonVariants({ size: 'lg' })}>{vacante ? 'Cargar CVs' : 'Crear vacante'}</Link>}
            {backend !== 'conectado' && <Button variant="outline" size="lg" onClick={cargarDemo}><Rocket /> Explorar un ejemplo</Button>}
          </EstadoVacio>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        paso="Paso 3 de 3"
        titulo="Ranking de candidatos"
        descripcion="Todos los candidatos ordenados por estado y puntaje. Cada CV se evaluó por separado; el backend calcula el orden, no la IA."
        acciones={(
          <>
            {!enDemo && (
              <Button variant="ghost" size="lg" onClick={refrescar} disabled={cargandoServidor || evaluando} aria-label="Actualizar datos del servidor">
                <RefreshCw className={cn(cargandoServidor && 'animate-spin')} /> Actualizar
              </Button>
            )}
            <ExportarRanking />
          </>
        )}
      />

      {avisoEvaluacion}
      {avisoErrores}
      {errorServidor && <Alerta tipo="error" icono={CloudOff} className="mb-4" titulo="No se pudieron actualizar los datos del servidor">{errorServidor}</Alerta>}

      <div className="entrada-escalonada grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icono={Users} etiqueta="CVs evaluados" valor={stats.total} />
        <Kpi icono={CircleCheck} tono="ok" etiqueta="Cumplen" valor={stats.cumple} total={stats.total} />
        <Kpi icono={CircleAlert} tono="warn" etiqueta="Cumplen parcialmente" valor={stats.parcial} total={stats.total} />
        <Kpi icono={CircleHelp} tono="info" etiqueta="Pendientes de verificar" valor={stats.pendiente} total={stats.total} />
        <Kpi icono={CircleX} tono="bad" etiqueta="No cumplen" valor={stats.no} total={stats.total} />
        <Kpi icono={Star} etiqueta="Recomendados a entrevista" valor={stats.recomendados} total={stats.total} />
      </div>

      <Distribucion stats={stats} />
      <Podio items={ranking.filter((r) => r.resultado.estado !== 'no_cumple').slice(0, 3)} nombreVisible={nombreVisible}
        onAbrir={(id) => navigate(`/candidato/${id}`)} />

      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <Pestanas valor={pestana} onChange={setPestana} opciones={[
            { valor: 'aptos', etiqueta: 'Para revisar', contador: stats.cumple + stats.parcial + stats.pendiente },
            { valor: 'pendiente_verificar', etiqueta: 'Pendientes', contador: stats.pendiente },
            { valor: 'no_cumple', etiqueta: 'No cumplen', contador: stats.no },
            { valor: 'todos', etiqueta: 'Todos', contador: stats.total },
            ...(enRevision.length ? [{ valor: 'revision', etiqueta: 'En revisión', contador: enRevision.length }] : []),
          ]} />
          <div className="flex flex-wrap items-center gap-3">
            {/* <label className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar candidato"
                className="h-8 w-44 rounded-lg border border-input bg-background pr-2 pl-8 text-sm focus:border-ring focus:outline-none" />
            </label> */}
            <select value={confianza} onChange={(e) => setConfianza(e.target.value)} aria-label="Filtrar por confianza"
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none">
              <option value="todas">Toda confianza</option>
              <option value="alta">Confianza alta</option>
              <option value="media">Confianza media</option>
              <option value="baja">Confianza baja</option>
            </select>
            <Interruptor activo={soloRecomendados} onChange={setSoloRecomendados} etiqueta="Solo recomendados" />
          </div>
        </div>

        {pestana === 'no_cumple' && (
          <p className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            Estos candidatos siguen visibles para revisión humana. Si crees que la evaluación se equivocó, abre el detalle y revisa la evidencia.
          </p>
        )}
        {pestana === 'pendiente_verificar' && (
          <p className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            Falta información del CV sobre requisitos obligatorios. Verifica esos puntos antes de decidir si cumple o no.
          </p>
        )}

        {pestana === 'revision' ? (
          <>
            <p className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
              Estos CVs no se enviaron a la IA por una alerta de seguridad. Una persona debe revisarlos antes de decidir.
            </p>
            <ul className="divide-y">
              {enRevision.map((c) => (
                <li key={c.candidato_id}>
                  <button onClick={() => navigate(`/candidato/${c.candidato_id}`)} className="group flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-accent/50">
                    <ShieldAlert className="size-5 shrink-0 text-warn" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{nombreVisible(c)}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {c.alertas.map((a) => ALERTAS[a] && <Pill key={a} className={cn(ALERTAS[a].clase, 'ring-transparent')} icono={ALERTAS[a].icono}>{ALERTAS[a].corto}</Pill>)}
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
        <div className="overflow-x-auto scrollbar-fino">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="w-10 py-2.5 pl-4" aria-label="Comparar" />
                <th className="w-12 py-2.5 font-medium">#</th>
                <th className="py-2.5 font-medium">Candidato</th>
                <th className="py-2.5 font-medium">Puntaje</th>
                <th className="py-2.5 font-medium">Estado</th>
                <th className="py-2.5 font-medium">Confianza</th>
                <th className="py-2.5 font-medium">Entrevista</th>
                <th className="py-2.5 font-medium" title="Experiencia, técnica, idioma, formación, certificación, blanda">Por categoría</th>
                <th className="w-8 py-2.5 pr-4" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtrados.length === 0 && (
                <tr><td colSpan={9} className="py-12 text-center text-muted-foreground">Ningún candidato coincide con los filtros.</td></tr>
              )}
              {filtrados.map(({ candidato: c, resultado: r, posicion }) => {
                const sel = seleccion.includes(c.candidato_id);
                return (
                  <tr key={c.candidato_id} onClick={() => navigate(`/candidato/${c.candidato_id}`)}
                    className={cn('group cursor-pointer transition-colors hover:bg-accent/50', sel && 'bg-accent/40')}>
                    <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={sel} onChange={() => toggleSeleccion(c.candidato_id)}
                        aria-label={`Comparar ${nombreVisible(c)}`} className="size-4 cursor-pointer accent-[var(--primary)]" />
                    </td>
                    <td className="py-3 font-semibold text-muted-foreground tabular-nums">{posicion}</td>
                    <td className="max-w-[300px] py-3 pr-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{nombreVisible(c)}</span>
                        {c.alertas.map((a) => {
                          const A = ALERTAS[a];
                          return A ? <span key={a} title={A.texto} className={cn('grid size-5 place-items-center rounded', A.clase)}><A.icono className="size-3.5" /></span> : null;
                        })}
                      </div>
                      <p className="truncate text-xs text-muted-foreground" title={r.motivo_estado}>{r.motivo_estado}</p>
                    </td>
                    <td className="py-3"><BarraPuntaje valor={r.puntaje} /></td>
                    <td className="py-3"><EstadoBadge estado={r.estado} /></td>
                    <td className="py-3"><Confianza nivel={r.confianza} /></td>
                    <td className="py-3">
                      {r.recomendado_entrevista
                        ? <span className="inline-flex items-center gap-1 text-xs font-medium text-info"><ThumbsUp className="size-3.5" /> Recomendado</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Minus className="size-3.5" /> No</span>}
                    </td>
                    <td className="py-3"><MiniCategorias categorias={r.detalle.categorias} /></td>
                    <td className="py-3 pr-4"><ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
          <span>{filtrados.length} de {ranking.length} candidatos</span>
          <span>{AVISO_DECISION}</span>
        </div>
      </Card>

      {seleccion.length > 0 && (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border bg-card py-2 pr-2 pl-4 shadow-xl animate-in slide-in-from-bottom-4 fade-in-0 lg:ml-32">
          <Columns3 className="size-4 text-primary" />
          <span className="text-sm font-medium">{seleccion.length} seleccionado(s)</span>
          <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => seleccion.forEach(toggleSeleccion)} aria-label="Limpiar selección">
            <X className="size-4" />
          </button>
          <Button onClick={() => navigate('/comparador')} disabled={seleccion.length < 2}>
            {seleccion.length < 2 ? 'Elige al menos 2' : 'Comparar'}
          </Button>
        </div>
      )}
    </>
  );
}
