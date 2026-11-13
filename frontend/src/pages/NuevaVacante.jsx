import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Wand2, Plus, Trash2, ShieldAlert, ArrowRight, Pencil, FileText, ListChecks, Loader2, Rocket, CircleAlert, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, PageHeader, TipoBadge, Alerta, Ayuda, CategoriaTag } from '@/components/ui/kit';
import { actualizarVacante, crearVacante, ErrorConexion } from '@/api';
import { useApp } from '@/store';
import { DESCRIPCION_EJEMPLO } from '@/data/demo';
import { CATEGORIAS, TIPOS } from '@/lib/constantes';
import { cn } from '@/lib/utils';

function FilaRequisito({ r, onChange, onDelete, error }) {
  return (
    <tr className={cn('border-b align-top transition-colors last:border-0', error && 'bg-bad-soft/60')}>
      <td className="py-3 pr-2 pl-4 text-xs font-semibold text-muted-foreground tabular-nums">{r.id}</td>
      <td className="py-2 pr-3">
        <input
          value={r.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
          aria-label={`Nombre del requisito ${r.id}`}
          placeholder="Describe el requisito"
          className={cn('w-full min-w-[220px] rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm transition-colors hover:border-input focus:border-ring focus:bg-card focus:outline-none',
            (!r.nombre.trim() || error) && 'border-bad/40')}
        />
        {error && (
          <p className="mt-1 flex items-center gap-1.5 px-2 text-xs font-medium text-bad">
            <ShieldAlert className="size-3.5" /> {error}
          </p>
        )}
      </td>
      <td className="py-2 pr-3">
        <select value={r.tipo} onChange={(e) => onChange({ tipo: e.target.value })} aria-label="Tipo"
          className="rounded-md border border-input bg-card px-2 py-1.5 text-sm focus:border-ring focus:outline-none">
          {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
        </select>
      </td>
      <td className="py-2 pr-3">
        <select value={r.categoria} onChange={(e) => onChange({ categoria: e.target.value })} aria-label="Categoría"
          className="rounded-md border border-input bg-card px-2 py-1.5 text-sm focus:border-ring focus:outline-none">
          {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </td>
      <td className="py-2 pr-3">
        {r.tipo === 'deseable' ? (
          <input type="number" min={0.5} max={3} step={0.5} value={r.peso}
            onChange={(e) => onChange({ peso: Math.max(0.5, Math.min(3, Number(e.target.value) || 1)) })}
            aria-label="Peso" className="w-16 rounded-md border border-input bg-card px-2 py-1.5 text-sm tabular-nums focus:border-ring focus:outline-none" />
        ) : <span className="px-2 text-sm text-muted-foreground">—</span>}
      </td>
      <td className="py-2 pr-4 text-right">
        <button onClick={onDelete} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-bad-soft hover:text-bad" aria-label={`Eliminar ${r.id}`}>
          <Trash2 className="size-4" />
        </button>
      </td>
    </tr>
  );
}

function Resumen({ vacante, onEditar }) {
  const navigate = useNavigate();
  const { candidatos } = useApp();
  const grupos = ['obligatorio', 'deseable', 'descalificante'].map((t) => ({ tipo: t, items: vacante.requisitos.filter((r) => r.tipo === t) }));
  const fechaConfirmacion = vacante.confirmada_en
    ? new Date(vacante.confirmada_en).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
    : 'recuperada del servidor';
  return (
    <>
      <PageHeader
        paso="Paso 1 de 3"
        titulo={vacante.titulo}
        descripcion={`Requisitos confirmados (versión ${vacante.version}) · ${fechaConfirmacion}.`}
        acciones={(
          <>
            <Button variant="outline" size="lg" onClick={onEditar}><Pencil /> Editar requisitos</Button>
            <Button size="lg" onClick={() => navigate(candidatos.length ? '/ranking' : '/cvs')}>
              {candidatos.length ? 'Ver ranking' : 'Cargar CVs'} <ArrowRight />
            </Button>
          </>
        )}
      />
      <div className="grid gap-4 md:grid-cols-3">
        {grupos.map((g) => (
          <Card key={g.tipo}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <TipoBadge tipo={g.tipo} />
              <span className="text-xs text-muted-foreground">{TIPOS[g.tipo].ayuda}</span>
            </div>
            <ul className="divide-y">
              {g.items.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Ninguno</li>}
              {g.items.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 text-xs font-semibold text-muted-foreground tabular-nums">{r.id}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{r.nombre}</p>
                    <CategoriaTag categoria={r.categoria} />
                  </div>
                  {r.tipo === 'deseable' && <span className="rounded bg-muted px-1.5 text-xs tabular-nums text-muted-foreground" title="Peso">×{r.peso}</span>}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}

export default function NuevaVacante() {
  const { vacante, confirmarVacante, backend, enDemo, cargarDemo, registrar, notificar, cargandoServidor } = useApp();
  const navigate = useNavigate();
  const [editando, setEditando] = useState(!vacante);
  const [descripcion, setDescripcion] = useState(vacante?.descripcion ?? '');
  const [titulo, setTitulo] = useState(vacante?.titulo ?? '');
  const [requisitos, setRequisitos] = useState(vacante ? structuredClone(vacante.requisitos) : null);
  const [vacanteId, setVacanteId] = useState(vacante?.id ?? null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [intentado, setIntentado] = useState(false);
  const [bloqueados, setBloqueados] = useState([]);

  useEffect(() => {
    if (!vacante?.requisitos) return;
    setDescripcion((actual) => actual || vacante.descripcion || '');
    setTitulo((actual) => actual || vacante.titulo);
    setRequisitos((actual) => actual ?? structuredClone(vacante.requisitos));
    setVacanteId((actual) => actual ?? vacante.id);
    if (vacante.requisitos_confirmados) setEditando(false);
    else setEditando(true);
  }, [vacante]);

  const vacios = (requisitos ?? []).filter((r) => !r.nombre.trim());
  const sinObligatorios = requisitos && !requisitos.some((r) => r.tipo === 'obligatorio');
  const problemas = [
    vacios.length && `${vacios.length} requisito(s) no tienen descripción.`,
    sinObligatorios && 'Agrega al menos un requisito obligatorio.',
    !titulo.trim() && 'La vacante necesita un título.',
  ].filter(Boolean);

  if ((cargandoServidor || backend === 'verificando') && !vacante?.requisitos) {
    return <Alerta tipo="info" icono={Loader2} className="[&>svg]:animate-spin" titulo="Recuperando vacantes del servidor">Espera un momento para continuar.</Alerta>;
  }

  if (vacante?.requisitos_confirmados && !editando) return <Resumen vacante={vacante} onEditar={() => setEditando(true)} />;

  const extraer = async () => {
    setError('');
    if (backend !== 'conectado') {
      setError('El servidor no está disponible. Inicia el backend para que la IA proponga los requisitos.');
      return;
    }
    setCargando(true);
    try {
      const res = await crearVacante(descripcion);
      if (!res.requisitos.length) setError('La IA no encontró requisitos en el texto. Agrégalos a mano.');
      setVacanteId(res.id);
      setTitulo(res.titulo);
      setRequisitos(res.requisitos.map((r) => ({ ...r, peso: r.peso ?? 1 })));
      // El backend descarta los requisitos con datos protegidos antes de guardarlos.
      const descartados = res.requisitos_bloqueados ?? [];
      setBloqueados(descartados);
      descartados.forEach((b) => registrar('Requisito bloqueado', `"${b.requisito.nombre}": ${b.motivo}`));
    } catch (e) {
      setError(e instanceof ErrorConexion ? 'No pudimos conectar con el servidor. Intenta de nuevo.' : e.message);
    } finally {
      setCargando(false);
    }
  };

  const cambiar = (id, cambios) => setRequisitos((rs) => rs.map((r) => (r.id === id ? { ...r, ...cambios } : r)));
  const agregar = () => setRequisitos((rs) => {
    const n = Math.max(0, ...rs.map((r) => Number(r.id.replace(/\D/g, '')) || 0)) + 1;
    return [...rs, { id: `R${n}`, nombre: '', tipo: 'deseable', categoria: 'tecnica', peso: 1 }];
  });

  const confirmar = async () => {
    setIntentado(true);
    setError('');
    if (problemas.length) return;
    let vacanteGuardada = null;
    try {
      // En la demo los requisitos solo viven en el navegador.
      if (!enDemo) {
        if (backend !== 'conectado') throw new ErrorConexion();
        if (!vacanteId) throw new Error('Primero pide a la IA que proponga los requisitos para crear la vacante en el servidor.');
        vacanteGuardada = await actualizarVacante(vacanteId, { titulo: titulo.trim(), descripcion, requisitos });
      }
    } catch (e) {
      setError(e instanceof ErrorConexion
        ? 'No pudimos guardar la vacante en el servidor.'
        : e.message);
      return;
    }
    if (vacante) registrar('Corrección humana', `Requisitos editados (${requisitos.length} en total)`);
    confirmarVacante({
      id: vacanteId,
      titulo: titulo.trim(),
      descripcion,
      requisitos,
      version_requisitos: vacanteGuardada?.version_requisitos,
      requisitos_confirmados: true,
    });
    setEditando(false);
    notificar(enDemo ? 'Requisitos actualizados en la demo.' : 'Requisitos confirmados. Ya puedes cargar CVs.', 'ok');
    navigate(enDemo ? '/ranking' : '/cvs');
  };

  const conteo = (t) => requisitos?.filter((r) => r.tipo === t).length ?? 0;

  return (
    <>
      <PageHeader
        paso="Paso 1 de 3"
        titulo={vacante ? 'Editar requisitos de la vacante' : 'Crea la vacante'}
        descripcion="Pega la descripción del cargo. La IA propone los requisitos y tú los ajustas antes de evaluar cualquier CV."
        acciones={!vacante && backend !== 'conectado' && (
          <Button variant="outline" size="lg" onClick={() => { cargarDemo(); navigate('/ranking'); }}>
            <Rocket /> Explorar un ejemplo
          </Button>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <Card className="self-start">
          <CardHeader icono={FileText} titulo="Descripción del cargo" descripcion="Acepta texto en español o inglés." />
          <div className="p-5">
            <textarea
              rows={requisitos ? 12 : 16}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={'Ejemplo:\nDesarrollador Backend Python\n\nRequisitos:\n- 3 años con Python\n- Inglés B2\n\nDeseable:\n- Docker'}
              className="w-full resize-y rounded-lg border border-input bg-background p-3 text-sm leading-relaxed transition-colors focus:border-ring focus:ring-3 focus:ring-ring/20 focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground tabular-nums">
                {descripcion.trim().length === 0
                  ? <button type="button" onClick={() => setDescripcion(DESCRIPCION_EJEMPLO)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><Wand2 className="size-3.5" /> ¿Sin una vacante a mano? Usa un ejemplo</button>
                  : descripcion.trim().length < 20 ? `Mínimo 20 caracteres (${descripcion.trim().length}/20)` : `${descripcion.trim().length} caracteres`}
              </span>
              <Button size="lg" onClick={extraer} disabled={cargando || descripcion.trim().length < 20}>
                {cargando ? <><Loader2 className="animate-spin" /> Analizando la descripción…</> : <><Sparkles /> {requisitos ? 'Volver a proponer' : 'Proponer requisitos'}</>}
              </Button>
            </div>
            {error && (
              <Alerta tipo="error" icono={CircleAlert} className="mt-4" titulo="Algo no salió bien">
                <p>{error}</p>
                {!requisitos && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={extraer}>Reintentar</Button>
                    {backend !== 'conectado' && <Button size="sm" variant="ghost" onClick={() => { cargarDemo(); navigate('/ranking'); }}>Explorar un ejemplo</Button>}
                  </div>
                )}
              </Alerta>
            )}
            {bloqueados.length > 0 && (
              <Alerta tipo="warn" icono={ShieldAlert} className="mt-4" titulo={`La IA propuso ${bloqueados.length} requisito(s) con datos protegidos y se descartaron`}>
                <ul className="mt-1 list-disc pl-4">
                  {bloqueados.map((b) => <li key={b.requisito.id}><b>{b.requisito.nombre}</b>: {b.motivo}</li>)}
                </ul>
              </Alerta>
            )}
          </div>
        </Card>

        <Card className="self-start overflow-hidden">
          <CardHeader
            icono={ListChecks}
            titulo="Requisitos propuestos"
            descripcion={requisitos ? 'Revisa, edita, agrega o quita. Nada se evalúa hasta que confirmes.' : 'Aparecerán aquí después del análisis.'}
            accion={(
              <Ayuda titulo="Tipos de requisito" ancho={320}>
                <ul className="space-y-2 text-muted-foreground">
                  <li><b className="text-foreground">Obligatorio:</b> debe cumplirse. Vale el 60% del puntaje.</li>
                  <li><b className="text-foreground">Deseable:</b> suma puntos según su peso. Vale el 40%.</li>
                  <li><b className="text-foreground">Descalificante:</b> si está presente, el candidato no avanza. Nunca puede ser un dato protegido.</li>
                </ul>
              </Ayuda>
            )}
          />

          {cargando && (
            <div className="space-y-3 p-5" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-4 w-6 animate-pulse rounded bg-muted" />
                  <div className="h-8 flex-1 animate-pulse rounded bg-muted" style={{ animationDelay: `${i * 80}ms` }} />
                  <div className="h-8 w-28 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          )}

          {!cargando && !requisitos && (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><Sparkles className="size-6" /></span>
              <p className="font-medium">Aún no hay requisitos</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Pega la descripción y pulsa <b>Proponer requisitos</b>, o prueba con la vacante de ejemplo.
              </p>
            </div>
          )}

          {!cargando && requisitos && (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-5 py-3">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <span className="shrink-0 text-muted-foreground">Título</span>
                  <input value={titulo} onChange={(e) => setTitulo(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-input bg-card px-2 py-1 font-medium focus:border-ring focus:outline-none" />
                </label>
                <div className="flex gap-1.5 text-xs">
                  <TipoBadge tipo="obligatorio" /><span className="tabular-nums text-muted-foreground">{conteo('obligatorio')}</span>
                  <TipoBadge tipo="deseable" /><span className="tabular-nums text-muted-foreground">{conteo('deseable')}</span>
                  <TipoBadge tipo="descalificante" /><span className="tabular-nums text-muted-foreground">{conteo('descalificante')}</span>
                </div>
              </div>
              <div className="overflow-x-auto scrollbar-fino">
                <table className="w-full text-left">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-2 pl-4 font-medium">Id</th>
                      <th className="py-2 pr-3 font-medium">Requisito</th>
                      <th className="py-2 pr-3 font-medium">Tipo</th>
                      <th className="py-2 pr-3 font-medium">Categoría</th>
                      <th className="py-2 pr-3 font-medium">Peso</th>
                      <th className="py-2 pr-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {requisitos.map((r) => (
                      <FilaRequisito key={r.id} r={r} onChange={(c) => cambiar(r.id, c)}
                        error={error.includes(`requisito ${r.id} «${r.nombre}»`) ? error : ''}
                        onDelete={() => setRequisitos((rs) => rs.filter((x) => x.id !== r.id))} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={agregar}><Plus /> Agregar requisito</Button>
                </div>
                <div className="flex gap-2">
                  {vacante && <Button variant="ghost" size="lg" onClick={() => setEditando(false)}>Cancelar</Button>}
                  <Button size="lg" onClick={confirmar}>Confirmar requisitos <ArrowRight /></Button>
                </div>
              </div>
              {intentado && problemas.length > 0 && (
                <div className="px-5 pb-5">
                  <Alerta tipo="error" icono={CircleAlert} titulo="Antes de confirmar, corrige lo siguiente">
                    <ul className="mt-1 list-disc pl-4">{problemas.map((p) => <li key={p}>{p}</li>)}</ul>
                  </Alerta>
                </div>
              )}
              {vacante?.requisitos_confirmados && (
                <div className="px-5 pb-5">
                  <Alerta tipo="info" icono={Info}>
                    Al confirmar se crea la versión {vacante.version + 1} de los requisitos y se reevalúan los CVs. El cambio queda registrado en la auditoría.
                  </Alerta>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
