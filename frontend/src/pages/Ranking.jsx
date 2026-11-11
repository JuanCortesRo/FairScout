import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, CircleCheck, CircleAlert, CircleX, Star, Search, Download, SlidersHorizontal, Columns3, Rocket, Briefcase, FileUp, X, ChevronRight, ThumbsUp, Minus,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card, PageHeader, Kpi, EstadoBadge, Confianza, BarraPuntaje, Pestanas, EstadoVacio, Ayuda, Interruptor,
} from '@/components/ui/kit';
import { useApp } from '@/store';
import { ALERTAS, AVISO_DECISION, CATEGORIAS } from '@/lib/constantes';
import { exportarRankingCSV } from '@/lib/exportar';
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
          <p className="mt-1 text-xs">El ranking se recalcula al instante, sin volver a llamar a la IA.</p>
        </div>
        <p className="border-t pt-3 text-xs">El puntaje <b>no</b> es una probabilidad de éxito.</p>
      </div>
    </Ayuda>
  );
}

export default function Ranking() {
  const { vacante, ranking, candidatos, cargarDemo, nombreVisible, seleccion, toggleSeleccion } = useApp();
  const navigate = useNavigate();
  const [pestana, setPestana] = useState('aptos');
  const [busqueda, setBusqueda] = useState('');
  const [confianza, setConfianza] = useState('todas');
  const [soloRecomendados, setSoloRecomendados] = useState(false);

  const stats = useMemo(() => ({
    total: ranking.length,
    cumple: ranking.filter((r) => r.resultado.estado === 'cumple').length,
    parcial: ranking.filter((r) => r.resultado.estado === 'cumple_parcialmente').length,
    no: ranking.filter((r) => r.resultado.estado === 'no_cumple').length,
    recomendados: ranking.filter((r) => r.resultado.recomendado_entrevista).length,
  }), [ranking]);

  const filtrados = useMemo(() => ranking.filter(({ candidato, resultado }) => {
    if (pestana === 'aptos' && resultado.estado === 'no_cumple') return false;
    if (pestana === 'no_cumple' && resultado.estado !== 'no_cumple') return false;
    if (confianza !== 'todas' && resultado.confianza !== confianza) return false;
    if (soloRecomendados && !resultado.recomendado_entrevista) return false;
    if (busqueda && !nombreVisible(candidato).toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  }), [ranking, pestana, confianza, soloRecomendados, busqueda, nombreVisible]);

  if (!vacante || candidatos.length === 0) {
    return (
      <>
        <PageHeader paso="Paso 3 de 3" titulo="Ranking de candidatos" />
        <Card>
          <EstadoVacio
            icono={vacante ? FileUp : Briefcase}
            titulo={vacante ? 'Aún no hay CVs evaluados' : 'No hay una vacante activa'}
            descripcion={vacante ? 'Carga las hojas de vida para ver aquí el ranking explicado de todos los candidatos.' : 'Crea la vacante y carga CVs, o prueba la demo con 60 candidatos ya evaluados.'}
          >
            <Link to={vacante ? '/cvs' : '/vacante'} className={buttonVariants({ size: 'lg' })}>{vacante ? 'Cargar CVs' : 'Crear vacante'}</Link>
            <Button variant="outline" size="lg" onClick={cargarDemo}><Rocket /> Ver demo completa</Button>
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
        descripcion="Todos los candidatos ordenados por estado y puntaje. Cada CV se evaluó por separado contra la vacante; el orden lo calcula el código, no la IA."
        acciones={(
          <Button variant="outline" size="lg" onClick={() => exportarRankingCSV(ranking, vacante.requisitos, nombreVisible, vacante)}>
            <Download /> Exportar CSV
          </Button>
        )}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi icono={Users} etiqueta="CVs evaluados" valor={stats.total} />
        <Kpi icono={CircleCheck} tono="ok" etiqueta="Cumplen" valor={stats.cumple} />
        <Kpi icono={CircleAlert} tono="warn" etiqueta="Cumplen parcialmente" valor={stats.parcial} />
        <Kpi icono={CircleX} tono="bad" etiqueta="No cumplen" valor={stats.no} />
        <Kpi icono={Star} tono="info" etiqueta="Recomendados a entrevista" valor={stats.recomendados} />
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <Pestanas valor={pestana} onChange={setPestana} opciones={[
            { valor: 'aptos', etiqueta: 'Para revisar', contador: stats.cumple + stats.parcial },
            { valor: 'no_cumple', etiqueta: 'No cumplen', contador: stats.no },
            { valor: 'todos', etiqueta: 'Todos', contador: stats.total },
          ]} />
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar candidato"
                className="h-8 w-44 rounded-lg border border-input bg-background pr-2 pl-8 text-sm focus:border-ring focus:outline-none" />
            </label>
            <select value={confianza} onChange={(e) => setConfianza(e.target.value)} aria-label="Filtrar por confianza"
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none">
              <option value="todas">Toda confianza</option>
              <option value="alta">Confianza alta</option>
              <option value="media">Confianza media</option>
              <option value="baja">Confianza baja</option>
            </select>
            <Interruptor activo={soloRecomendados} onChange={setSoloRecomendados} etiqueta="Solo recomendados" />
            <AjustePesos />
          </div>
        </div>

        {pestana === 'no_cumple' && (
          <p className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            Estos candidatos siguen visibles para revisión humana. Si crees que la evaluación se equivocó, abre el detalle y revisa la evidencia.
          </p>
        )}

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
