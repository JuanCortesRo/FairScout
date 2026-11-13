import { useEffect, useState } from 'react';
import { Bot, CheckCircle2, Loader2, Send, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Alerta } from '@/components/ui/kit';
import Logo, { MarcaFairScout } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import {
  consultarEntrevistaPublica, iniciarEntrevistaPublica, responderEntrevistaPublica,
} from '@/api';

const MENSAJE_NO_DISPONIBLE = 'Este enlace ya no está disponible.';

function preguntaDe(respuesta) {
  return respuesta?.pregunta_siguiente ?? respuesta?.pregunta ?? respuesta?.pregunta_actual ?? null;
}

export default function EntrevistaPublica() {
  const { token } = useParams();
  const [datos, setDatos] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [acepta, setAcepta] = useState(false);
  const [texto, setTexto] = useState('');
  const [mensajes, setMensajes] = useState([]);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    consultarEntrevistaPublica(token).then((respuesta) => {
      if (!activo) return;
      setDatos(respuesta);
      setEstado(respuesta.estado === 'en_curso' ? 'entrevista' : respuesta.estado === 'finalizada' ? 'finalizada' : 'bienvenida');
      const pregunta = preguntaDe(respuesta);
      if (pregunta) setMensajes([{ rol: 'agente', texto: pregunta.texto }]);
    }).catch(() => {
      if (activo) setEstado('no_disponible');
    });
    return () => { activo = false; };
  }, [token]);

  const iniciar = async () => {
    if (!acepta || procesando) return;
    setProcesando(true);
    setError('');
    try {
      const respuesta = await iniciarEntrevistaPublica(token, acepta);
      setDatos(respuesta);
      const pregunta = preguntaDe(respuesta);
      if (pregunta) setMensajes([{ rol: 'agente', texto: pregunta.texto }]);
      setEstado('entrevista');
    } catch {
      setEstado('no_disponible');
    } finally {
      setProcesando(false);
    }
  };

  const responder = async (evento) => {
    evento.preventDefault();
    const respuesta = texto.trim();
    if (!respuesta || procesando) return;
    setProcesando(true);
    setError('');
    try {
      const siguiente = await responderEntrevistaPublica(token, respuesta);
      setDatos((anterior) => ({ ...anterior, ...siguiente }));
      const pregunta = preguntaDe(siguiente);
      setMensajes((anteriores) => [
        ...anteriores,
        { rol: 'candidato', texto: respuesta },
        ...(pregunta ? [{ rol: 'agente', texto: pregunta.texto }] : []),
      ]);
      if (siguiente.terminada || siguiente.estado === 'finalizada') setEstado('finalizada');
      else {
        setEstado('entrevista');
        setTexto('');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setProcesando(false);
    }
  };

  if (estado === 'cargando') {
    return <main className="fondo-cabecera grid min-h-screen place-items-center p-6"><div className="flex flex-col items-center gap-4"><MarcaFairScout tamano={48} /><Loader2 className="size-6 animate-spin text-primary" /></div></main>;
  }
  if (estado === 'no_disponible') {
    return (
      <main className="fondo-cabecera grid min-h-screen place-items-center p-6">
        <div className="w-full max-w-md text-center">
          <Logo tamano={40} className="mb-6 justify-center" />
          <Alerta tipo="error" icono={TriangleAlert} titulo={MENSAJE_NO_DISPONIBLE}>Si crees que es un error, contacta al equipo de selección que te envió la invitación.</Alerta>
        </div>
      </main>
    );
  }

  const pregunta = preguntaDe(datos);
  const respondidas = datos?.progreso?.respondidas ?? datos?.preguntas_respondidas ?? 0;
  const maximo = datos?.progreso?.total ?? datos?.max_preguntas ?? 10;
  return (
    <main className="fondo-cabecera flex min-h-screen flex-col px-4 py-8 sm:px-6">
      <div className="entrada mx-auto w-full max-w-2xl flex-1">
        <header className="mb-8 flex items-center justify-between gap-3">
          <Logo tamano={38} lema />
          <span className="hidden items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border dark:bg-white/10 sm:inline-flex">
            <ShieldCheck className="size-3.5 text-primary" /> Entrevista segura
          </span>
        </header>

        {estado === 'bienvenida' && (
          <section className="relative overflow-hidden rounded-3xl border bg-card p-6 shadow-[0_24px_60px_-28px_rgba(91,91,240,0.45)] sm:p-9">
            <span aria-hidden="true" className="bg-marca absolute inset-x-0 top-0 h-1.5" />
            <p className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-violet-200 dark:bg-violet-500/15 dark:ring-violet-400/30">Invitación a entrevista</p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{datos?.vacante_titulo ?? datos?.titulo ?? 'Entrevista profesional'}</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Responderás aproximadamente entre 5 y 10 preguntas sobre tu experiencia profesional. La entrevista tarda cerca de 10 minutos.</p>
            <div className="mt-6 rounded-xl bg-muted/60 p-4 text-sm">
              <p className="font-medium">Aviso de privacidad</p>
              <p className="mt-1 text-muted-foreground">Tus respuestas serán tratadas para apoyar el proceso de selección, conforme a la Ley 1581 de 2012. El resultado será revisado por el equipo de selección y no constituye una decisión automática de contratación.</p>
              <label className="mt-4 flex cursor-pointer gap-3">
                <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-1 size-4 accent-primary" />
                <span>Acepto el tratamiento de mis datos personales para realizar esta entrevista.</span>
              </label>
            </div>
            <Button className="mt-6 w-full" size="lg" disabled={!acepta || procesando} onClick={iniciar}>
              {procesando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Comenzar entrevista
            </Button>
          </section>
        )}

        {estado === 'entrevista' && (
          <section className="overflow-hidden rounded-3xl border bg-card shadow-[0_24px_60px_-28px_rgba(91,91,240,0.45)]">
            <div className="border-b px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="bg-marca grid size-9 place-items-center rounded-full text-white"><Bot className="size-5" /></span>
                  <div className="leading-tight"><p className="font-semibold">Asistente de entrevista</p><p className="text-xs text-muted-foreground">Responde con tus palabras</p></div>
                </div>
                <span className="text-xs font-medium text-muted-foreground tabular-nums">Pregunta {Math.min(respondidas + 1, maximo)} de ~{maximo}</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="bg-marca h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (respondidas / Math.max(maximo, 1)) * 100)}%` }} />
              </div>
            </div>
            <div className="space-y-4 p-5 sm:p-7">
              {mensajes.filter((m) => m.rol === 'agente' || m.rol === 'candidato').map((mensaje, indice) => (
                <div key={`${indice}-${mensaje.texto}`} className={mensaje.rol === 'candidato' ? 'entrada ml-10 rounded-2xl rounded-tr-sm bg-marca p-3.5 text-sm text-white shadow-sm' : 'entrada mr-10 rounded-2xl rounded-tl-sm bg-muted/70 p-3.5 text-sm'}>
                  {mensaje.texto}
                </div>
              ))}
              {pregunta && !mensajes.some((m) => m.pregunta_id === pregunta.id) && <div className="entrada mr-10 rounded-2xl rounded-tl-sm bg-muted/70 p-3.5 text-sm">{pregunta.texto}</div>}
              {error && <Alerta tipo="error" icono={TriangleAlert} titulo="No se pudo enviar la respuesta">{error}</Alerta>}
              <form onSubmit={responder} className="flex items-end gap-2 border-t pt-4">
                <textarea value={texto} maxLength={2000} rows={3} disabled={procesando} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe tu respuesta…" className="min-w-0 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                <Button type="submit" size="icon-lg" disabled={!texto.trim() || procesando} aria-label="Enviar respuesta">{procesando ? <Loader2 className="animate-spin" /> : <Send />}</Button>
              </form>
            </div>
          </section>
        )}

        {estado === 'finalizada' && (
          <section className="rounded-3xl border bg-card p-10 text-center shadow-[0_24px_60px_-28px_rgba(91,91,240,0.45)]">
            <span className="bg-marca mx-auto grid size-16 place-items-center rounded-2xl text-white shadow-lg shadow-violet-500/30"><CheckCircle2 className="size-8" /></span>
            <h1 className="mt-5 text-3xl font-extrabold tracking-tight">¡Gracias por completar la entrevista!</h1>
            <p className="mt-3 text-muted-foreground">El equipo de selección revisará tus respuestas y se pondrá en contacto contigo.</p>
          </section>
        )}
      </div>
      <footer className="mx-auto mt-10 flex w-full max-w-2xl flex-col items-center gap-1 text-center text-xs text-muted-foreground">
        <span>Tus datos se tratan según la Ley 1581 de 2012. La decisión final la toma una persona del equipo de selección.</span>
        <span>© {new Date().getFullYear()} FairScout</span>
      </footer>
    </main>
  );
}
