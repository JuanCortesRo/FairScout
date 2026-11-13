import { useEffect, useState } from 'react';
import { Bot, CheckCircle2, Loader2, Send, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Alerta } from '@/components/ui/kit';
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
    return <main className="grid min-h-screen place-items-center p-6"><Loader2 className="size-7 animate-spin text-primary" /></main>;
  }
  if (estado === 'no_disponible') {
    return <main className="grid min-h-screen place-items-center bg-muted/30 p-6"><Alerta tipo="error" icono={TriangleAlert} titulo={MENSAJE_NO_DISPONIBLE}>{MENSAJE_NO_DISPONIBLE}</Alerta></main>;
  }

  const pregunta = preguntaDe(datos);
  const respondidas = datos?.progreso?.respondidas ?? datos?.preguntas_respondidas ?? 0;
  const maximo = datos?.progreso?.total ?? datos?.max_preguntas ?? 10;
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><ShieldCheck className="size-5" /></span>
          <div><p className="font-semibold">FairScout</p><p className="text-xs text-muted-foreground">Entrevista profesional</p></div>
        </header>

        {estado === 'bienvenida' && (
          <section className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
            <p className="text-sm font-medium text-primary">Invitación a entrevista</p>
            <h1 className="mt-2 text-2xl font-semibold">{datos?.vacante_titulo ?? datos?.titulo ?? 'Entrevista profesional'}</h1>
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
          <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="flex items-center gap-2"><Bot className="size-5 text-primary" /><span className="font-medium">Entrevista</span></div>
              <span className="text-xs text-muted-foreground">Pregunta {Math.min(respondidas + 1, maximo)} de aproximadamente {maximo}</span>
            </div>
            <div className="space-y-4 p-5 sm:p-7">
              {mensajes.filter((m) => m.rol === 'agente' || m.rol === 'candidato').map((mensaje, indice) => (
                <div key={`${indice}-${mensaje.texto}`} className={mensaje.rol === 'candidato' ? 'ml-8 rounded-xl bg-primary p-3 text-sm text-primary-foreground' : 'rounded-xl bg-muted/60 p-3 text-sm'}>
                  {mensaje.texto}
                </div>
              ))}
              {pregunta && !mensajes.some((m) => m.pregunta_id === pregunta.id) && <div className="rounded-xl bg-muted/60 p-3 text-sm">{pregunta.texto}</div>}
              {error && <Alerta tipo="error" icono={TriangleAlert} titulo="No se pudo enviar la respuesta">{error}</Alerta>}
              <form onSubmit={responder} className="flex items-end gap-2 border-t pt-4">
                <textarea value={texto} maxLength={2000} rows={3} disabled={procesando} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe tu respuesta…" className="min-w-0 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                <Button type="submit" size="icon-lg" disabled={!texto.trim() || procesando} aria-label="Enviar respuesta">{procesando ? <Loader2 className="animate-spin" /> : <Send />}</Button>
              </form>
            </div>
          </section>
        )}

        {estado === 'finalizada' && (
          <section className="rounded-2xl border bg-card p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto size-12 text-ok" />
            <h1 className="mt-4 text-2xl font-semibold">¡Gracias por completar la entrevista!</h1>
            <p className="mt-3 text-muted-foreground">El equipo de selección revisará tus respuestas y se pondrá en contacto contigo.</p>
          </section>
        )}
      </div>
    </main>
  );
}
