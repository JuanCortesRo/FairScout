import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Bot, Send, User, MessagesSquare, ArrowLeft, CircleCheck, Circle, TriangleAlert, ThumbsUp, ThumbsDown, RotateCcw, Square, ShieldCheck, Info, ChevronRight, ListChecks, Loader2,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, PageHeader, EstadoVacio, EstadoBadge, Confianza, Alerta, AnilloPuntaje } from '@/components/ui/kit';
import { useApp } from '@/store';
import { crearPlan, evaluarRespuesta, siguienteTurno, resumir } from '@/lib/entrevistador';
import {
  crearEntrevista, obtenerEntrevista, responderEntrevista,
  finalizarEntrevista, reiniciarEntrevista,
} from '@/api';
import { AVISO_DECISION } from '@/lib/constantes';
import { cn } from '@/lib/utils';

const CALIF = {
  solida: { texto: 'Sólida', clase: 'bg-ok-soft text-ok' },
  aceptable: { texto: 'Aceptable', clase: 'bg-info-soft text-info' },
  debil: { texto: 'Débil', clase: 'bg-warn-soft text-warn' },
};

function nuevoEstado(resultado) {
  const plan = crearPlan(resultado);
  return {
    plan, indice: 1, turnos: [], repreguntas: 0, terminada: false,
    actual: plan[0],
    mensajes: [
      { rol: 'agente', texto: 'Hola. Soy el asistente de entrevista. Te haré entre 5 y 10 preguntas sobre tu experiencia. Responde con tus palabras; no hay respuestas perfectas.' },
      { rol: 'agente', texto: plan[0].texto, preguntaId: plan[0].id },
    ],
  };
}

function estadoDesdeApi(respuesta) {
  const mensajes = (respuesta.mensajes ?? []).map((mensaje) => ({
    ...mensaje,
    preguntaId: mensaje.pregunta_id,
    evaluacion: mensaje.evaluacion,
  }));
  const actual = respuesta.pregunta ?? respuesta.pregunta_siguiente;
  return {
    id: respuesta.id,
    plan: [],
    indice: respuesta.progreso?.respondidas ?? 0,
    turnos: respuesta.historial ?? [],
    repreguntas: 0,
    terminada: respuesta.estado !== 'en_curso',
    actual,
    mensajes,
    progreso: respuesta.progreso ?? {},
    inconsistencias: respuesta.inconsistencias ?? [],
    informe: respuesta.informe,
  };
}

function resumenDesdeApi(estado, resultado) {
  const informe = estado.informe;
  if (!estado.terminada || !informe) return null;
  const avanzar = informe.recomendacion === 'avanzar';
  return {
    avanzar,
    inconsistencias: estado.inconsistencias,
    confianza: estado.informe.confianza ?? resultado.confianza,
    justificacion: informe.justificacion
      ?? (avanzar ? 'La entrevista no detectó contradicciones relevantes.' : 'La entrevista requiere revisión adicional.'),
    verificados: informe.fortalezas ?? [],
    buenas: informe.respuestas_suficientes ?? 0,
    total: informe.total_respuestas ?? estado.progreso.respondidas ?? 0,
  };
}

function Selector() {
  const { ranking, nombreVisible, entrevistas } = useApp();
  const navigate = useNavigate();
  const recomendados = ranking.filter((r) => r.resultado.recomendado_entrevista);
  return (
    <>
      <PageHeader titulo="Entrevistas" paso="Bonus"
        descripcion="Crea invitaciones públicas desde el detalle de cada candidato." />
      {ranking.length === 0 ? (
        <Card>
          <EstadoVacio icono={MessagesSquare} titulo="Aún no hay candidatos" descripcion="Las invitaciones se crean desde un candidato evaluado.">
            <Link to="/ranking" className={buttonVariants({ size: 'lg' })}>Ir al ranking</Link>
          </EstadoVacio>
        </Card>
      ) : (
        <Card>
          <CardHeader icono={ListChecks} titulo="Candidatos recomendados para entrevista" descripcion={`${recomendados.length} candidatos. También puedes iniciarla desde el detalle de cualquier candidato.`} />
          <ul className="divide-y">
            {recomendados.map(({ candidato: c, resultado: r, posicion }) => {
              const e = entrevistas[c.candidato_id];
              return (
                <li key={c.candidato_id}>
                  <button onClick={() => navigate(`/candidato/${c.candidato_id}`)} className="group flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-accent/50">
                    <span className="w-8 text-sm font-semibold text-muted-foreground tabular-nums">#{posicion}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{nombreVisible(c)}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.motivo_estado}</p>
                    </div>
                    <EstadoBadge estado={r.estado} />
                    <span className={cn('hidden w-28 text-xs sm:block', e?.terminada ? 'text-ok' : e ? 'text-info' : 'text-muted-foreground')}>
                      {e?.terminada ? 'Entrevista lista' : e ? 'En curso' : 'Sin entrevista'}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

export default function Entrevista() {
  const { id } = useParams();
  const { ranking, entrevistas, guardarEntrevista, nombreVisible, registrar, cargarCandidato, enDemo, vacante, backend } = useApp();
  const navigate = useNavigate();
  const item = ranking.find((r) => r.candidato.candidato_id === id);
  const [texto, setTexto] = useState('');
  const [escribiendo, setEscribiendo] = useState(false);
  const [cargandoCandidato, setCargandoCandidato] = useState(false);
  const [errorCandidato, setErrorCandidato] = useState('');
  const [entrevistaApi, setEntrevistaApi] = useState(null);
  const [cargandoEntrevista, setCargandoEntrevista] = useState(false);
  const [errorEntrevista, setErrorEntrevista] = useState('');
  const fin = useRef(null);

  const estadoLocal = useMemo(() => (item ? (entrevistas[id] ?? nuevoEstado(item.resultado)) : null), [item, entrevistas, id]);
  const estado = enDemo ? estadoLocal : (entrevistaApi ? estadoDesdeApi(entrevistaApi) : null);
  const resumen = useMemo(() => {
    if (!estado?.terminada || !item) return null;
    return enDemo ? resumir(estado, item.resultado) : resumenDesdeApi(estado, item.resultado);
  }, [estado, item, enDemo]);

  useEffect(() => {
    if (!id || enDemo || !item || item.candidato.ficha) return undefined;
    let vigente = true;
    setCargandoCandidato(true);
    setErrorCandidato('');
    cargarCandidato(id).catch((e) => {
      if (vigente) setErrorCandidato(e.message);
    }).finally(() => {
      if (vigente) setCargandoCandidato(false);
    });
    return () => { vigente = false; };
  }, [id, enDemo, item, cargarCandidato]);

  useEffect(() => {
    if (!id || enDemo || !item || !vacante?.id) return undefined;
    let vigente = true;
    const clave = `fairscout:entrevista:${id}:${vacante.id}`;
    setCargandoEntrevista(true);
    setErrorEntrevista('');
    const cargar = async () => {
      try {
        const guardada = localStorage.getItem(clave);
        const respuesta = guardada
          ? await obtenerEntrevista(guardada)
          : await crearEntrevista(id, vacante.id);
        if (!guardada) localStorage.setItem(clave, respuesta.id);
        if (vigente) setEntrevistaApi(respuesta);
      } catch (e) {
        if (vigente) setErrorEntrevista(e.message);
      } finally {
        if (vigente) setCargandoEntrevista(false);
      }
    };
    void cargar();
    return () => { vigente = false; };
  }, [id, enDemo, item, vacante?.id]);

  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [estado?.mensajes.length, escribiendo]);

  if (!id) return <Selector />;
  if (!item) {
    return (
      <Card>
        <EstadoVacio icono={MessagesSquare} titulo="Candidato no encontrado" descripcion="Elige un candidato de la lista para iniciar la entrevista.">
          <Link to="/entrevista" className={buttonVariants({ size: 'lg' })}>Ver candidatos</Link>
        </EstadoVacio>
      </Card>
    );
  }
  const { candidato: c, resultado: r } = item;
  if (cargandoCandidato || (!c.ficha && !errorCandidato)) {
    return <Alerta tipo="info" icono={Loader2} className="[&>svg]:animate-spin" titulo="Cargando el CV para la simulación">Espera mientras se consulta el perfil en el servidor.</Alerta>;
  }
  if (errorCandidato) {
    return <Alerta tipo="error" icono={Info} titulo="No se pudo cargar el CV">{errorCandidato}</Alerta>;
  }
  if (!enDemo && (cargandoEntrevista || !entrevistaApi) && !errorEntrevista) {
    return <Alerta tipo="info" icono={Loader2} className="[&>svg]:animate-spin" titulo="Preparando la entrevista">El agente está generando la primera pregunta.</Alerta>;
  }
  if (!enDemo && errorEntrevista) {
    return <Alerta tipo="error" icono={Info} titulo="No se pudo iniciar la entrevista">{errorEntrevista}</Alerta>;
  }

  const terminar = async (e) => {
    if (!enDemo) {
      setEscribiendo(true);
      try {
        const respuesta = await finalizarEntrevista(entrevistaApi.id);
        setEntrevistaApi(respuesta);
      } catch (error) {
        setErrorEntrevista(error.message);
      } finally {
        setEscribiendo(false);
      }
      return;
    }
    const final = { ...e, terminada: true, mensajes: [...e.mensajes, { rol: 'agente', texto: 'Gracias por tu tiempo. La entrevista terminó; el equipo de selección revisará el resumen.' }] };
    guardarEntrevista(id, final);
    const res = resumir(final, r);
    registrar('Entrevista simulada', `Candidato ${id}: ${res.avanzar ? 'avanzar' : 'no avanzar'} · ${res.inconsistencias.length} inconsistencia(s)`);
  };

  const enviar = async (ev) => {
    ev?.preventDefault();
    const respuesta = texto.trim();
    if (!respuesta || escribiendo || estado.terminada) return;
    setTexto('');
    if (!enDemo) {
      setEscribiendo(true);
      try {
        const siguiente = await responderEntrevista(entrevistaApi.id, respuesta);
        setEntrevistaApi(siguiente);
      } catch (error) {
        setErrorEntrevista(error.message);
        setTexto(respuesta);
      } finally {
        setEscribiendo(false);
      }
      return;
    }
    const evaluacion = evaluarRespuesta(estado.actual, respuesta, c);
    const turnos = [...estado.turnos, { pregunta: estado.actual, respuesta, evaluacion, esRepregunta: !!estado.actual.esRepregunta }];
    const parcial = { ...estado, turnos, mensajes: [...estado.mensajes, { rol: 'candidato', texto: respuesta, evaluacion }] };
    guardarEntrevista(id, parcial);
    setEscribiendo(true);
    setTimeout(() => {
      setEscribiendo(false);
      const sig = siguienteTurno(parcial);
      if (sig.tipo === 'terminar') return terminar(parcial);
      const esRep = !!sig.pregunta.esRepregunta;
      guardarEntrevista(id, {
        ...parcial,
        actual: sig.pregunta,
        indice: esRep ? parcial.indice : parcial.indice + 1,
        repreguntas: parcial.repreguntas + (esRep ? 1 : 0),
        mensajes: [...parcial.mensajes, { rol: 'agente', texto: sig.pregunta.texto, preguntaId: sig.pregunta.id, repregunta: esRep }],
      });
    }, 900);
  };

  const reiniciar = async () => {
    if (enDemo) {
      guardarEntrevista(id, nuevoEstado(r));
      return;
    }
    setEscribiendo(true);
    try {
      const nueva = await reiniciarEntrevista(entrevistaApi.id);
      localStorage.setItem(`fairscout:entrevista:${id}:${vacante.id}`, nueva.id);
      setEntrevistaApi(nueva);
      setErrorEntrevista('');
    } catch (error) {
      setErrorEntrevista(error.message);
    } finally {
      setEscribiendo(false);
    }
  };
  const inconsistencias = enDemo
    ? estado.turnos.flatMap((t) => t.evaluacion.inconsistencias)
    : estado.inconsistencias;
  const cubiertos = new Set(estado.turnos.map((t) => t.pregunta.id));
  const nPreg = enDemo ? estado.turnos.length : (estado.progreso.respondidas ?? 0);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate(`/candidato/${id}`)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Volver al candidato
        </button>
        <Button variant="ghost" size="sm" onClick={reiniciar}><RotateCcw /> Reiniciar</Button>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
        <Card className="flex h-[calc(100vh-10rem)] min-h-[520px] flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b px-5 py-3.5">
            <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><Bot className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">Entrevista · {nombreVisible(c)}</p>
              <p className="text-xs text-muted-foreground">{estado.terminada ? 'Finalizada' : escribiendo ? 'El agente está escribiendo…' : `Pregunta ${Math.min(nPreg + 1, 10)} · máximo 10`}</p>
            </div>
            {!estado.terminada && nPreg >= 5 && <Button variant="outline" size="sm" onClick={() => terminar(estado)}><Square /> Terminar</Button>}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-muted/30 px-4 py-5 scrollbar-fino sm:px-6">
            <p className="mx-auto max-w-md rounded-full bg-card px-3 py-1 text-center text-[11px] text-muted-foreground ring-1 ring-border">
              <ShieldCheck className="mr-1 inline size-3" /> El agente no pregunta por edad, estado civil, hijos, nacionalidad ni otros datos protegidos.
            </p>
            {estado.mensajes.map((m, i) => (
              <div key={i} className={cn('flex gap-2.5 animate-in fade-in-0 slide-in-from-bottom-1', m.rol === 'candidato' && 'flex-row-reverse')}>
                <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', m.rol === 'agente' ? 'bg-accent text-accent-foreground' : 'bg-foreground text-background')}>
                  {m.rol === 'agente' ? <Bot className="size-4" /> : <User className="size-4" />}
                </span>
                <div className={cn('max-w-[80%] space-y-1.5', m.rol === 'candidato' && 'items-end text-right')}>
                  <div className={cn('inline-block rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed',
                    m.rol === 'agente' ? 'rounded-tl-sm bg-card shadow-sm ring-1 ring-border' : 'rounded-tr-sm bg-primary text-primary-foreground')}>
                    {m.repregunta && <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-primary">Repregunta</span>}
                    {m.texto}
                  </div>
                  {m.evaluacion && (
                    <div className="flex flex-col items-end gap-1">
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', CALIF[m.evaluacion.calificacion].clase)}>
                        {CALIF[m.evaluacion.calificacion].texto} · {m.evaluacion.comentario}
                      </span>
                      {m.evaluacion.inconsistencias.map((x) => (
                        <span key={x} className="inline-flex items-center gap-1 rounded-full bg-bad-soft px-2 py-0.5 text-[11px] font-medium text-bad"><TriangleAlert className="size-3" /> {x}</span>
                      ))}
                      {m.evaluacion.notas.map((x) => (
                        <span key={x} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"><ShieldCheck className="size-3" /> {x}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {escribiendo && (
              <div className="flex gap-2.5">
                <span className="grid size-7 place-items-center rounded-full bg-accent text-accent-foreground"><Bot className="size-4" /></span>
                <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-card px-4 py-3 shadow-sm ring-1 ring-border">
                  {[0, 1, 2].map((d) => <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${d * 120}ms` }} />)}
                </div>
              </div>
            )}
            <div ref={fin} />
          </div>

          <form onSubmit={enviar} className="flex items-end gap-2 border-t bg-card p-3">
            <textarea
              rows={2}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) enviar(e); }}
              disabled={estado.terminada}
              placeholder={estado.terminada ? 'La entrevista terminó.' : 'Escribe la respuesta del candidato… (Enter para enviar)'}
              className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none disabled:opacity-60"
            />
            <Button type="submit" size="icon-lg" disabled={!texto.trim() || escribiendo || estado.terminada} aria-label="Enviar respuesta"><Send /></Button>
          </form>
        </Card>

        <div className="space-y-4 xl:sticky xl:top-20">
          {resumen && (
            <Card className={cn('overflow-hidden border-2', resumen.avanzar ? 'border-ok/40' : 'border-bad/30')}>
              <div className={cn('flex items-center gap-3 px-5 py-4', resumen.avanzar ? 'bg-ok-soft' : 'bg-bad-soft')}>
                {resumen.avanzar ? <ThumbsUp className="size-6 text-ok" /> : <ThumbsDown className="size-6 text-bad" />}
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Recomendación del agente</p>
                  <p className="text-lg font-semibold">{resumen.avanzar ? 'Avanzar en el proceso' : 'No avanzar por ahora'}</p>
                </div>
              </div>
              <div className="space-y-3 px-5 py-4 text-sm">
                <p>{resumen.justificacion}</p>
                <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2">
                  <span className="text-muted-foreground">Confianza actualizada</span>
                  <span className="flex items-center gap-2"><Confianza nivel={r.confianza} mostrarTexto={false} /> → <Confianza nivel={resumen.confianza} /></span>
                </div>
                <p className="text-xs text-muted-foreground">{AVISO_DECISION}</p>
              </div>
            </Card>
          )}

          <Card>
            <div className="flex items-center gap-3 px-5 py-4">
              <AnilloPuntaje valor={r.puntaje} tamano={52} grosor={5} />
              <div className="min-w-0">
                <p className="font-semibold">{nombreVisible(c)}</p>
                <div className="mt-1 flex flex-wrap gap-2"><EstadoBadge estado={r.estado} /><Confianza nivel={r.confianza} /></div>
              </div>
            </div>
            <div className="border-t px-5 py-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Progreso</span>
                <span className="text-muted-foreground tabular-nums">{nPreg} respondidas · {estado.plan.length} planeadas</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (nPreg / Math.max(estado.plan.length, 5)) * 100)}%` }} />
              </div>
              <ul className="mt-4 space-y-2">
                {estado.plan.map((p) => {
                  const hecho = cubiertos.has(p.id);
                  const enCurso = !estado.terminada && estado.actual?.id === p.id && !hecho;
                  return (
                    <li key={p.id} className="flex items-start gap-2 text-sm">
                      {hecho ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" /> : <Circle className={cn('mt-0.5 size-4 shrink-0', enCurso ? 'text-primary' : 'text-muted-foreground/50')} />}
                      <div className="min-w-0">
                        <p className={cn(hecho ? 'text-foreground' : enCurso ? 'font-medium' : 'text-muted-foreground')}>{p.tema}</p>
                        <p className="text-xs text-muted-foreground">{p.motivo}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>

          <Card>
            <CardHeader icono={TriangleAlert} titulo="Inconsistencias detectadas" descripcion="Contradicciones entre las respuestas y el CV." />
            <div className="px-5 py-4">
              {inconsistencias.length === 0
                ? <p className="text-sm text-muted-foreground">Ninguna por ahora.</p>
                : <ul className="space-y-2">{inconsistencias.map((x) => <li key={x} className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{x}</li>)}</ul>}
            </div>
          </Card>

        </div>
      </div>
    </>
  );
}
