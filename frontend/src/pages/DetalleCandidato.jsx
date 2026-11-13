import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, MessagesSquare, Columns3, BadgeCheck, CircleAlert, FileText, ListChecks, Lightbulb, IdCard, ThumbsUp, ThumbsDown,
  Quote, ShieldAlert, Briefcase, GraduationCap, Languages, Award, Wrench, Heart, TrendingUp, TrendingDown, SearchCheck, PenLine, Gauge, UserX,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card, CardHeader, AnilloPuntaje, EstadoBadge, Confianza, ResultadoBadge, TipoBadge, Pestanas, EstadoVacio, Alerta, Pill, Modal,
} from '@/components/ui/kit';
import { useApp } from '@/store';
import { explicar } from '@/lib/scoring';
import { ALERTAS, AVISO_DECISION, CATEGORIAS, RESULTADOS } from '@/lib/constantes';
import { cn } from '@/lib/utils';
import { aniosExperiencia, nombreCertificacion } from '@/lib/ficha';

// ── Visor del CV con resaltado de la evidencia ──────────────────────────────
function VisorCV({ candidato, activas, citadas, alClicLinea }) {
  const contenedor = useRef(null);
  useEffect(() => {
    if (!activas.length) return;
    // Desplaza solo el visor (no la página) hasta la línea citada.
    const caja = contenedor.current;
    const el = caja?.querySelector(`[data-linea="${activas[0]}"]`);
    if (!el) return;
    const delta = el.getBoundingClientRect().top - caja.getBoundingClientRect().top;
    caja.scrollTo({ top: caja.scrollTop + delta - caja.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
  }, [activas]);

  const paginas = useMemo(() => {
    const m = new Map();
    for (const l of candidato.lineas) {
      const p = l.id.split('-')[0];
      if (!m.has(p)) m.set(p, []);
      m.get(p).push(l);
    }
    return [...m.entries()];
  }, [candidato.lineas]);

  return (
    <div ref={contenedor} className="max-h-[calc(100vh-11rem)] space-y-4 overflow-y-auto bg-muted/50 p-4 scrollbar-fino">
      {paginas.map(([p, lineas]) => (
        <div key={p} className="rounded-lg bg-white px-6 py-5 shadow-sm ring-1 ring-black/5">
          <p className="mb-3 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Página {p.slice(1)}</p>
          {lineas.map((l) => {
            const activa = activas.includes(l.id);
            const citada = citadas.has(l.id);
            if (l.oculto) {
              return (
                <div key={l.id} data-linea={l.id} className={cn('my-1 rounded-md border border-dashed border-bad/50 bg-bad-soft px-2 py-1.5', activa && 'linea-activa')}>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-bad"><ShieldAlert className="size-3.5" /> Texto oculto detectado (blanco, tamaño 1 pt). Se trató como dato y se ignoró:</p>
                  <p className="font-mono text-xs text-bad/80 line-through">{l.texto}</p>
                </div>
              );
            }
            return (
              <div key={l.id} data-linea={l.id} onClick={() => citada && alClicLinea(l.id)}
                className={cn('group -mx-2 flex gap-3 rounded px-2 py-[3px] transition-colors',
                  activa && 'linea-activa', citada && !activa && 'cursor-pointer hover:bg-accent/60')}>
                <span className="w-10 shrink-0 pt-0.5 text-right font-mono text-[10px] text-muted-foreground/60 select-none">{l.id.split('-')[1].slice(1)}</span>
                <span className={cn('min-w-0 text-[13px] leading-relaxed text-slate-700',
                  l.seccion && 'mt-3 text-xs font-bold tracking-wider text-slate-900',
                  l.fuerte && 'font-semibold text-slate-900',
                  l.tenue && 'text-slate-500',
                  /^\[[A-Z]+\]/.test(l.texto) && 'font-mono text-xs text-slate-400',
                  citada && 'underline decoration-primary/30 decoration-dotted underline-offset-4')}>
                  {l.texto}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Evaluación por requisito ───────────────────────────────────────────────
function FilaEvaluacion({ fila, activa, onCita, onCorregir }) {
  const { req, ev } = fila;
  return (
    <div className={cn('rounded-lg border p-3.5 transition-all', activa ? 'border-primary/40 bg-accent/40 ring-2 ring-primary/15' : 'hover:border-input')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">{req.id}</span>
            <p className="font-medium">{req.nombre}</p>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{CATEGORIAS[req.categoria]}{req.tipo === 'deseable' && ` · peso ${req.peso}`}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {ev.corregido_por_humano && <Pill className="bg-muted ring-border" icono={PenLine} title={`La IA había dicho: ${RESULTADOS[ev.resultado_ia]?.texto}`}>Corregido</Pill>}
          <ResultadoBadge resultado={ev.resultado} />
        </div>
      </div>
      <p className="mt-2 text-sm text-foreground/80">{ev.justificacion}</p>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        {ev.cita ? (
          <button onClick={onCita}
            className="group flex max-w-full items-start gap-2 rounded-md bg-muted/70 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent">
            <Quote className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span className="min-w-0 italic text-foreground/80">“{ev.cita}”</span>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{ev.lineas.join(', ')}</span>
            {ev.cita_verificada
              ? <BadgeCheck className="size-3.5 shrink-0 text-ok" aria-label="Cita verificada en el CV" />
              : <CircleAlert className="size-3.5 shrink-0 text-warn" aria-label="Cita no encontrada en el CV" />}
          </button>
        ) : <span className="text-xs text-muted-foreground">Sin cita: no hay evidencia en el CV.</span>}
        {onCorregir && <button onClick={onCorregir} className="text-xs font-medium text-muted-foreground hover:text-primary">Corregir</button>}
      </div>
      {ev.cita && !ev.cita_verificada && (
        <p className="mt-2 text-xs text-warn">La cita no aparece textualmente en el CV. Se marcó como no verificada y bajó la confianza.</p>
      )}
    </div>
  );
}

function ListaExplicacion({ icono: Icono, titulo, items, tono, vacio }) {
  const tonos = { ok: 'text-ok bg-ok-soft', bad: 'text-bad bg-bad-soft', warn: 'text-warn bg-warn-soft' };
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className={cn('grid size-6 place-items-center rounded-md', tonos[tono])}><Icono className="size-3.5" /></span>
        {titulo} <span className="text-muted-foreground tabular-nums">({items.length})</span>
      </h4>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">{vacio}</p> : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={typeof it === 'string' ? it : it.req.id} className="rounded-lg border px-3 py-2 text-sm">
              {typeof it === 'string'
                ? it
                : <><span className="font-medium">{it.req.nombre}.</span> <span className="text-foreground/75">{it.texto}</span></>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Ficha({ ficha, onLinea }) {
  const Seccion = ({ icono: Icono, titulo, children }) => (
    <div>
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icono className="size-4 text-muted-foreground" />{titulo}</h4>
      {children}
    </div>
  );
  const Chip = ({ children }) => <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{children}</span>;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/60 p-3"><p className="text-2xl font-semibold tabular-nums">{aniosExperiencia(ficha)}</p><p className="text-xs text-muted-foreground">años de experiencia (solapes unidos)</p></div>
        <div className="rounded-lg bg-muted/60 p-3"><p className="text-2xl font-semibold tabular-nums">{ficha.experiencias.length}</p><p className="text-xs text-muted-foreground">cargos registrados</p></div>
      </div>
      <Seccion icono={Briefcase} titulo="Experiencia">
        <ol className="relative space-y-3 border-l pl-4">
          {ficha.experiencias.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card bg-primary" />
              <button className="text-left" onClick={() => onLinea(e.lineas)}>
                <p className="text-sm font-medium hover:text-primary">{e.cargo} · {e.empresa}</p>
              </button>
              <p className="text-xs text-muted-foreground tabular-nums">{e.inicio} → {e.fin}</p>
            </li>
          ))}
        </ol>
      </Seccion>
      <Seccion icono={GraduationCap} titulo="Formación">
        {ficha.formacion.length ? ficha.formacion.map((f, i) => (
          <button key={i} onClick={() => onLinea(f.lineas)} className="block text-left text-sm hover:text-primary">
            {f.titulo} <span className="text-muted-foreground">· {f.institucion} · {f.nivel} · {f.fin}</span>
          </button>
        )) : <p className="text-sm text-muted-foreground">Sin información.</p>}
      </Seccion>
      <div className="grid gap-5 sm:grid-cols-2">
        <Seccion icono={Award} titulo="Certificaciones">
          {ficha.certificaciones.length ? <div className="flex flex-wrap gap-1.5">{ficha.certificaciones.map((c, i) => <Chip key={i}>{nombreCertificacion(c)}</Chip>)}</div>
            : <p className="text-sm text-muted-foreground">Ninguna reportada.</p>}
        </Seccion>
        <Seccion icono={Languages} titulo="Idiomas">
          {ficha.idiomas.length ? <div className="flex flex-wrap gap-1.5">{ficha.idiomas.map((l) => <Chip key={l.idioma}>{l.idioma} · {l.nivel}</Chip>)}</div>
            : <p className="text-sm text-muted-foreground">Sin información.</p>}
        </Seccion>
        <Seccion icono={Wrench} titulo="Habilidades técnicas">
          <div className="flex flex-wrap gap-1.5">{ficha.habilidades_tecnicas.map((h) => <Chip key={h}>{h}</Chip>)}</div>
        </Seccion>
        <Seccion icono={Heart} titulo="Competencias blandas">
          <div className="flex flex-wrap gap-1.5">{ficha.competencias_blandas.map((h) => <Chip key={h}>{h}</Chip>)}</div>
        </Seccion>
      </div>
    </div>
  );
}

/** CV en revisión humana (no se envió a la IA) o procesado pero todavía sin evaluar. */
function SinEvaluacion({ c, nombre, onVolver }) {
  const revision = c.estado_documento === 'needs_review';
  return (
    <>
      <button onClick={onVolver} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Volver al ranking
      </button>
      <Card className="mb-6 p-5">
        <p className="text-xs font-medium text-muted-foreground">{c.nombre_archivo}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{nombre}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {c.alertas.map((a) => ALERTAS[a] && <Pill key={a} className={cn(ALERTAS[a].clase, 'ring-transparent')} icono={ALERTAS[a].icono}>{ALERTAS[a].corto}</Pill>)}
        </div>
      </Card>
      <Alerta tipo={revision ? 'warn' : 'info'} icono={revision ? ShieldAlert : CircleAlert} className="mb-6"
        titulo={revision ? 'En revisión humana: este CV no se envió a la IA' : 'Este CV todavía no se ha evaluado'}>
        {revision
          ? 'Se detectó una alerta de seguridad (texto que intenta manipular la evaluación o un dato personal sin anonimizar). Revisa el documento antes de decidir.'
          : 'Ya se leyó y anonimizó. Evalúalo desde el ranking para ver su resultado por requisito.'}
        <ul className="mt-1 list-disc pl-4">{c.alertas.map((a) => <li key={a}>{ALERTAS[a]?.texto ?? a}</li>)}</ul>
      </Alerta>
      <Card className="overflow-hidden">
        <CardHeader icono={FileText} titulo="Hoja de vida anonimizada" descripcion="Texto extraído del documento." />
        <VisorCV candidato={c} activas={[]} citadas={new Set()} alClicLinea={() => {}} />
      </Card>
    </>
  );
}

const OPCIONES_CORRECCION = {
  normal: ['cumple', 'equivalente', 'parcial', 'no_cumple', 'sin_informacion'],
  descalificante: ['presente', 'ausente', 'sin_informacion'],
};

export default function DetalleCandidato() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    ranking, candidatos, vacante, nombreVisible, toggleSeleccion, seleccion, corregirEvaluacion, notificar,
    cargarCandidato, enDemo,
  } = useApp();
  const [pestana, setPestana] = useState('evaluacion');
  const [activas, setActivas] = useState([]);
  const [reqActivo, setReqActivo] = useState(null);
  const [correccion, setCorreccion] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState('');
  useEffect(() => { setActivas([]); setReqActivo(null); }, [id]);
  useEffect(() => {
    if (!id || enDemo) return undefined;
    let vigente = true;
    setCargandoDetalle(true);
    setErrorDetalle('');
    cargarCandidato(id).catch((e) => {
      if (vigente) setErrorDetalle(e.message);
    }).finally(() => {
      if (vigente) setCargandoDetalle(false);
    });
    return () => { vigente = false; };
  }, [id, enDemo, cargarCandidato]);

  const item = ranking.find((r) => r.candidato.candidato_id === id);
  const candidatoActual = item?.candidato ?? candidatos.find((x) => x.candidato_id === id);
  const necesitaCarga = !enDemo && !!id && !errorDetalle && !candidatoActual?.ficha;
  const exp = useMemo(() => {
    if (!item) return null;
    const explicacion = item.candidato.explicacion;
    return explicacion
      ? {
        fortalezas: explicacion.fortalezas,
        brechas: explicacion.brechas,
        porVerificar: explicacion.aspectos_por_verificar,
      }
      : explicar(item.resultado);
  }, [item]);

  const sinEvaluar = !item && candidatoActual;
  if (cargandoDetalle || necesitaCarga) {
    return <Alerta tipo="info" icono={CircleAlert} titulo="Cargando el CV y la evaluación desde el servidor">Las líneas del documento se consultan solo al abrir el detalle.</Alerta>;
  }
  if (errorDetalle && !sinEvaluar?.lineas?.length && !item?.candidato.lineas?.length) {
    return (
      <Card>
        <EstadoVacio icono={UserX} titulo="No se pudo cargar este candidato" descripcion={errorDetalle}>
          <Link to="/ranking" className={buttonVariants({ size: 'lg' })}>Volver al ranking</Link>
        </EstadoVacio>
      </Card>
    );
  }
  if (sinEvaluar) return <SinEvaluacion c={sinEvaluar} nombre={nombreVisible(sinEvaluar)} onVolver={() => navigate('/ranking')} />;

  if (!item) {
    return (
      <Card>
        <EstadoVacio icono={UserX} titulo="No encontramos este candidato"
          descripcion={vacante ? 'Puede que se haya eliminado o que el enlace sea incorrecto.' : 'No hay una vacante activa con candidatos evaluados.'}>
          <Link to="/ranking" className={buttonVariants({ size: 'lg' })}>Volver al ranking</Link>
        </EstadoVacio>
      </Card>
    );
  }

  const { candidato: c, resultado: r, posicion } = item;
  const { filas } = r.detalle;
  const citadas = new Set(filas.flatMap((f) => f.ev.lineas));
  const mostrarCita = (f) => { setActivas([...f.ev.lineas]); setReqActivo(f.req.id); };
  const grupos = ['obligatorio', 'deseable', 'descalificante'].map((t) => ({ tipo: t, filas: filas.filter((f) => f.req.tipo === t) }));
  const anterior = ranking[posicion - 2];
  const siguiente = ranking[posicion];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => navigate('/ranking')} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Volver al ranking
        </button>
        <div className="flex items-center gap-1 text-sm">
          <Button variant="ghost" size="sm" disabled={!anterior} onClick={() => navigate(`/candidato/${anterior.candidato.candidato_id}`)}>← Anterior</Button>
          <span className="px-1 text-muted-foreground tabular-nums">{posicion} de {ranking.length}</span>
          <Button variant="ghost" size="sm" disabled={!siguiente} onClick={() => navigate(`/candidato/${siguiente.candidato.candidato_id}`)}>Siguiente →</Button>
        </div>
      </div>

      {/* Encabezado */}
      <Card className="mb-6 p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <AnilloPuntaje valor={r.puntaje} tamano={84} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Posición #{posicion} · {c.nombre_archivo}</p>
              <h1 className="truncate text-2xl font-semibold tracking-tight">{nombreVisible(c)}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <EstadoBadge estado={r.estado} />
                <Confianza nivel={r.confianza} />
                {c.alertas.map((a) => ALERTAS[a] && <Pill key={a} className={cn(ALERTAS[a].clase, 'ring-transparent')} icono={ALERTAS[a].icono}>{ALERTAS[a].corto}</Pill>)}
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{r.motivo_estado}</p>
            </div>
          </div>
          <div className={cn('flex items-start gap-3 rounded-xl border p-4 lg:w-80', r.recomendado_entrevista ? 'border-info/25 bg-info-soft' : 'bg-muted/50')}>
            {r.recomendado_entrevista ? <ThumbsUp className="mt-0.5 size-5 shrink-0 text-info" /> : <ThumbsDown className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
            <div className="min-w-0">
              <p className="font-semibold">{r.recomendado_entrevista ? 'Recomendado para entrevista' : 'No recomendado para entrevista'}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {r.recomendado_entrevista
                  ? (r.estado === 'cumple' ? 'Cumple todos los obligatorios.' : 'Falta información de requisitos obligatorios que puede verificarse en entrevista.')
                  : r.estado === 'no_cumple'
                    ? 'Hay evidencia de que no cumple un obligatorio o de un descalificante presente.'
                    : r.estado === 'pendiente_verificar'
                      ? 'Falta información sobre requisitos obligatorios; verifica esos puntos antes de decidir.'
                      : 'Hay evidencia parcial sobre uno o más requisitos obligatorios.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => navigate(`/entrevista/${c.candidato_id}`)}><MessagesSquare /> Iniciar entrevista</Button>
                <Button size="sm" variant="outline" onClick={() => { if (!seleccion.includes(c.candidato_id)) toggleSeleccion(c.candidato_id); navigate('/comparador'); }}>
                  <Columns3 /> Comparar
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {c.alertas.some((a) => ['prompt_injection', 'hidden_text'].includes(a)) && (
        <Alerta tipo="error" icono={ShieldAlert} className="mb-6" titulo="Este CV contiene texto oculto que intenta manipular la evaluación">
          Se encontró una instrucción escrita en blanco y en tamaño mínimo. El texto del CV se envía a la IA como dato, nunca como instrucción, así que no tuvo efecto.
          {c.linea_inyeccion && <>{' '}<button className="font-medium underline" onClick={() => { setActivas([c.linea_inyeccion]); setReqActivo(null); }}>Ver en el CV</button></>}
        </Alerta>
      )}
      {!enDemo && (
        <Alerta tipo="info" icono={CircleAlert} className="mb-6" titulo="Correcciones humanas no disponibles en el backend">
          El servidor aún no ofrece un endpoint para guardar correcciones. La evidencia y el resultado que ves provienen de la evaluación persistida.
        </Alerta>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <Pestanas valor={pestana} onChange={setPestana} opciones={[
              { valor: 'evaluacion', etiqueta: 'Requisitos', icono: ListChecks },
              { valor: 'explicacion', etiqueta: 'Explicación', icono: Lightbulb },
              { valor: 'ficha', etiqueta: 'Ficha', icono: IdCard },
            ]} />
            {pestana === 'evaluacion' && <span className="text-xs text-muted-foreground">Haz clic en una cita para verla en el CV</span>}
          </div>

          <div className="p-4 sm:p-5">
            {pestana === 'evaluacion' && (
              <div className="space-y-6">
                {grupos.filter((g) => g.filas.length).map((g) => (
                  <section key={g.tipo}>
                    <div className="mb-2.5 flex items-center gap-2">
                      <TipoBadge tipo={g.tipo} />
                      {g.tipo === 'obligatorio' && r.detalle.puntajeObligatorios != null && <span className="text-xs text-muted-foreground tabular-nums">{Math.round(r.detalle.puntajeObligatorios * 100)}% cumplido</span>}
                      {g.tipo === 'deseable' && r.detalle.puntajeDeseables != null && <span className="text-xs text-muted-foreground tabular-nums">{Math.round(r.detalle.puntajeDeseables * 100)}% cumplido</span>}
                    </div>
                    <div className="space-y-2.5">
                      {g.filas.map((f) => (
                        <FilaEvaluacion key={f.req.id} fila={f} activa={reqActivo === f.req.id}
                          onCita={() => mostrarCita(f)}
                        onCorregir={enDemo ? () => setCorreccion({ req: f.req, valor: f.ev.resultado, motivo: '' }) : null} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {pestana === 'explicacion' && exp && (
              <div className="space-y-6">
                <div className="rounded-xl border bg-muted/40 p-4">
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Gauge className="size-4 text-muted-foreground" /> Nivel de confianza: <Confianza nivel={r.confianza} /></h4>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/80">
                    {r.detalle.motivosConfianza.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">La confianza mide qué tan segura es la evaluación, no qué tan bueno es el candidato.</p>
                </div>
                <ListaExplicacion icono={TrendingUp} tono="ok" titulo="Fortalezas" items={exp.fortalezas} vacio="No hay requisitos cumplidos." />
                <ListaExplicacion icono={TrendingDown} tono="bad" titulo="Brechas" items={exp.brechas} vacio="Sin brechas frente a la vacante." />
                <ListaExplicacion icono={SearchCheck} tono="warn" titulo="Por verificar en entrevista" items={exp.porVerificar} vacio="Nada pendiente de verificar." />
              </div>
            )}

            {pestana === 'ficha' && <Ficha ficha={c.ficha} onLinea={(ls) => { setActivas([...ls]); setReqActivo(null); }} />}
          </div>
        </Card>

        <Card className="overflow-hidden xl:sticky xl:top-20">
          <CardHeader icono={FileText} titulo="Hoja de vida anonimizada" descripcion="Lo que vio la IA. Las líneas subrayadas tienen evidencia." />
          <VisorCV candidato={c} activas={activas} citadas={citadas} alClicLinea={(lid) => {
            const f = filas.find((x) => x.ev.lineas.includes(lid));
            if (f) { mostrarCita(f); setPestana('evaluacion'); }
          }} />
        </Card>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">{AVISO_DECISION}</p>

      <Modal abierto={!!correccion} onClose={() => setCorreccion(null)} titulo={`Corregir ${correccion?.req.id ?? ''}`}
        pie={(
          <>
            <Button variant="ghost" onClick={() => setCorreccion(null)}>Cancelar</Button>
            <Button onClick={() => {
              corregirEvaluacion(c.candidato_id, correccion.req.id, correccion.valor, correccion.motivo.trim());
              setCorreccion(null);
              notificar('Corrección guardada y registrada en la auditoría.', 'ok');
            }}>Guardar corrección</Button>
          </>
        )}>
        {correccion && (
          <div className="space-y-3">
            <p className="font-medium">{correccion.req.nombre}</p>
            <div className="flex flex-wrap gap-1.5">
              {OPCIONES_CORRECCION[correccion.req.tipo === 'descalificante' ? 'descalificante' : 'normal'].map((o) => (
                <button key={o} onClick={() => setCorreccion({ ...correccion, valor: o })}
                  className={cn('rounded-full transition-all', correccion.valor === o ? 'ring-2 ring-primary ring-offset-2' : 'opacity-70 hover:opacity-100')}>
                  <ResultadoBadge resultado={o} />
                </button>
              ))}
            </div>
            <label className="block">
              <span className="text-xs text-muted-foreground">Motivo (queda en la auditoría)</span>
              <textarea rows={3} value={correccion.motivo} onChange={(e) => setCorreccion({ ...correccion, motivo: e.target.value })}
                placeholder="Ej.: verificado por teléfono con el candidato"
                className="mt-1 w-full rounded-lg border border-input bg-background p-2 text-sm focus:border-ring focus:outline-none" />
            </label>
            <p className="text-xs text-muted-foreground">El puntaje, el estado y el ranking se recalculan al guardar.</p>
          </div>
        )}
      </Modal>
    </>
  );
}
