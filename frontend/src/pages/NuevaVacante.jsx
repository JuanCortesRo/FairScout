import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, Wand2, Plus, Trash2, ShieldAlert, ArrowRight, Pencil, FileText, ListChecks, Loader2, Rocket, CircleAlert, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, PageHeader, TipoBadge, Alerta, Ayuda, CategoriaTag } from '@/components/ui/kit';
import { actualizarVacante, crearVacante, ErrorConexion } from '@/api';
import { useApp } from '@/store';
import { DESCRIPCION_EJEMPLO, VACANTE_EJEMPLO } from '@/data/demo';
import { detectarDatoProtegido } from '@/lib/protegidos';
import { CATEGORIAS, TIPOS } from '@/lib/constantes';
import { cn } from '@/lib/utils';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Extracción aproximada sin backend: viñetas → requisitos, encabezados → tipo. */
function extraerLocal(texto) {
  if (texto.trim() === DESCRIPCION_EJEMPLO.trim()) return structuredClone(VACANTE_EJEMPLO);
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  let tipo = 'obligatorio';
  const requisitos = [];
  for (const l of lineas) {
    const low = l.toLowerCase();
    if (/^(deseable|plus|valoramos|nice to have)/.test(low)) { tipo = 'deseable'; continue; }
    if (/^(no aplica|descalifica|excluyente)/.test(low)) { tipo = 'descalificante'; }
    if (/^(requisitos|requirements|obligatorio)/.test(low)) { tipo = 'obligatorio'; continue; }
    if (!/^[-•*]/.test(l) && tipo !== 'descalificante') continue;
    const nombre = l.replace(/^[-•*]\s*/, '').replace(/^no aplica:\s*/i, '').replace(/\.$/, '');
    let categoria = 'tecnica';
    if (/(año|experiencia|years)/i.test(nombre)) categoria = 'experiencia';
    if (/(título|profesional en|carrera|grado|degree)/i.test(nombre)) categoria = 'formacion';
    if (/(certifica)/i.test(nombre)) categoria = 'certificacion';
    if (/(inglés|ingles|english|idioma|francés|portugués)/i.test(nombre)) categoria = 'idioma';
    if (/(liderazgo|comunicación|trabajo en equipo|leadership)/i.test(nombre)) categoria = 'blanda';
    requisitos.push({ id: `R${requisitos.length + 1}`, nombre, tipo, categoria, peso: 1 });
  }
  return { titulo: lineas[0]?.slice(0, 80) ?? 'Nueva vacante', requisitos };
}

function FilaRequisito({ r, onChange, onDelete }) {
  const protegido = detectarDatoProtegido(r.nombre);
  return (
    <tr className={cn('border-b align-top transition-colors last:border-0', protegido && 'bg-bad-soft/60')}>
      <td className="py-3 pr-2 pl-4 text-xs font-semibold text-muted-foreground tabular-nums">{r.id}</td>
      <td className="py-2 pr-3">
        <input
          value={r.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
          aria-label={`Nombre del requisito ${r.id}`}
          placeholder="Describe el requisito"
          className={cn('w-full min-w-[220px] rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm transition-colors hover:border-input focus:border-ring focus:bg-card focus:outline-none',
            !r.nombre.trim() && 'border-bad/40')}
        />
        {protegido && (
          <p className="mt-1 flex items-center gap-1.5 px-2 text-xs font-medium text-bad">
            <ShieldAlert className="size-3.5" /> Usa un dato protegido ({protegido}). No puede ser criterio de selección.
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
  return (
    <>
      <PageHeader
        paso="Paso 1 de 3"
        titulo={vacante.titulo}
        descripcion={`Requisitos confirmados (versión ${vacante.version}) el ${new Date(vacante.confirmada_en).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}.`}
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
  const { vacante, confirmarVacante, backend, cargarDemo, registrar, notificar } = useApp();
  const navigate = useNavigate();
  const [editando, setEditando] = useState(!vacante);
  const [descripcion, setDescripcion] = useState(vacante?.descripcion ?? '');
  const [titulo, setTitulo] = useState(vacante?.titulo ?? '');
  const [requisitos, setRequisitos] = useState(vacante ? structuredClone(vacante.requisitos) : null);
  const [vacanteId, setVacanteId] = useState(vacante?.id ?? null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [intentado, setIntentado] = useState(false);

  const protegidos = useMemo(() => (requisitos ?? []).filter((r) => detectarDatoProtegido(r.nombre)), [requisitos]);
  const vacios = (requisitos ?? []).filter((r) => !r.nombre.trim());
  const sinObligatorios = requisitos && !requisitos.some((r) => r.tipo === 'obligatorio');
  const problemas = [
    protegidos.length && `${protegidos.length} requisito(s) usan datos protegidos. Quítalos o reescríbelos.`,
    vacios.length && `${vacios.length} requisito(s) no tienen descripción.`,
    sinObligatorios && 'Agrega al menos un requisito obligatorio.',
    !titulo.trim() && 'La vacante necesita un título.',
  ].filter(Boolean);

  if (vacante && !editando) return <Resumen vacante={vacante} onEditar={() => setEditando(true)} />;

  const extraer = async () => {
    setError('');
    setCargando(true);
    try {
      let res;
      if (backend === 'conectado') {
        res = await crearVacante(descripcion);
      } else {
        await espera(1100);
        res = extraerLocal(descripcion);
      }
      if (!res.requisitos.length) {
        setError('No encontramos requisitos en el texto. Escribe cada requisito en una línea que empiece con "-" o agrégalos a mano.');
      }
      if (res.id) setVacanteId(res.id);
      setTitulo(res.titulo);
      setRequisitos(res.requisitos.map((r) => ({ ...r, peso: r.peso ?? 1 })));
      const bloqueados = res.requisitos.filter((r) => detectarDatoProtegido(r.nombre));
      bloqueados.forEach((r) => registrar('Requisito bloqueado', `"${r.nombre}" usa un dato protegido (${detectarDatoProtegido(r.nombre)})`));
    } catch (e) {
      setError(e instanceof ErrorConexion
        ? 'No pudimos conectar con el servidor. Puedes reintentar o usar la extracción local.'
        : e.message);
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
    if (problemas.length) return;
    try {
      if (backend === 'conectado' && vacanteId) {
        await actualizarVacante(vacanteId, { titulo: titulo.trim(), descripcion, requisitos });
      }
    } catch (e) {
      setError(e instanceof ErrorConexion
        ? 'No pudimos guardar la vacante en el servidor.'
        : e.message);
      return;
    }
    if (vacante) registrar('Corrección humana', `Requisitos editados (${requisitos.length} en total)`);
    confirmarVacante({ id: vacanteId, titulo: titulo.trim(), descripcion, requisitos });
    setEditando(false);
    notificar('Requisitos confirmados. Ya puedes cargar CVs.', 'ok');
    navigate('/cvs');
  };

  const conteo = (t) => requisitos?.filter((r) => r.tipo === t).length ?? 0;

  return (
    <>
      <PageHeader
        paso="Paso 1 de 3"
        titulo={vacante ? 'Editar requisitos de la vacante' : 'Crea la vacante'}
        descripcion="Pega la descripción del cargo. La IA propone los requisitos y tú los ajustas antes de evaluar cualquier CV."
        acciones={!vacante && (
          <Button variant="outline" size="lg" onClick={() => { cargarDemo(); navigate('/ranking'); }}>
            <Rocket /> Ver demo completa
          </Button>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <Card className="self-start">
          <CardHeader icono={FileText} titulo="Descripción del cargo" descripcion="Acepta texto en español o inglés."
            accion={(
              <Button variant="ghost" size="sm" onClick={() => setDescripcion(DESCRIPCION_EJEMPLO)}>
                <Wand2 /> Usar ejemplo
              </Button>
            )} />
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
                {descripcion.trim().length < 20 ? `Mínimo 20 caracteres (${descripcion.trim().length}/20)` : `${descripcion.trim().length} caracteres`}
              </span>
              <Button size="lg" onClick={extraer} disabled={cargando || descripcion.trim().length < 20}>
                {cargando ? <><Loader2 className="animate-spin" /> Analizando la descripción…</> : <><Sparkles /> {requisitos ? 'Volver a proponer' : 'Proponer requisitos'}</>}
              </Button>
            </div>
            {error && (
              <Alerta tipo="error" icono={CircleAlert} className="mt-4" titulo="No se pudieron proponer los requisitos">
                <p>{error}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={extraer}>Reintentar</Button>
                  <Button size="sm" variant="ghost" onClick={() => { const r = extraerLocal(descripcion); setTitulo(r.titulo); setRequisitos(r.requisitos); setError(''); }}>
                    Usar extracción local
                  </Button>
                </div>
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
                        onDelete={() => setRequisitos((rs) => rs.filter((x) => x.id !== r.id))} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={agregar}><Plus /> Agregar requisito</Button>
                  {protegidos.length > 0 && (
                    <Button variant="destructive" onClick={() => setRequisitos((rs) => rs.filter((r) => !detectarDatoProtegido(r.nombre)))}>
                      <ShieldAlert /> Quitar protegidos ({protegidos.length})
                    </Button>
                  )}
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
              {vacante && (
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
