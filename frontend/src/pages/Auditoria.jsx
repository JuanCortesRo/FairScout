import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings2, Zap, FlaskConical, History, FileText, Trash2, Download, CircleCheck, User, Bot, ShieldCheck, Loader2, RotateCw, Lock, EyeOff, Quote, ShieldAlert, Scale, Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, PageHeader, Modal, Pill } from '@/components/ui/kit';
import { useApp } from '@/store';
import { PRUEBAS_SESGO } from '@/data/demo';
import { exportarRankingCSV } from '@/lib/exportar';
import { cn } from '@/lib/utils';

const PASOS = [
  { nombre: 'Proponer requisitos desde la descripción', auto: true },
  { nombre: 'Confirmar requisitos', auto: false },
  { nombre: 'Carga masiva y validación de archivos', auto: true },
  { nombre: 'Lectura de PDF/DOCX (OCR si hace falta)', auto: true },
  { nombre: 'Anonimización de datos personales', auto: true },
  { nombre: 'Extracción de la ficha', auto: true },
  { nombre: 'Limpieza de fechas, años y habilidades', auto: true },
  { nombre: 'Evaluación por requisito con cita', auto: true },
  { nombre: 'Verificación de citas, puntaje y estado', auto: true },
  { nombre: 'Ranking y explicaciones', auto: true },
  { nombre: 'Decidir a quién entrevistar', auto: false },
];

function Dato({ etiqueta, valor, mono }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className={cn('text-right font-medium', mono && 'font-mono text-xs')}>{valor}</span>
    </div>
  );
}

export default function Auditoria() {
  const { vacante, pesos, ranking, candidatos, archivos, auditoria, lote, reiniciar, nombreVisible, trazabilidad, enDemo } = useApp();
  const navigate = useNavigate();
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [ejecutando, setEjecutando] = useState(false);
  const [ultimaPrueba, setUltimaPrueba] = useState(null);

  const seguridad = useMemo(() => {
    const filas = ranking.flatMap((r) => r.resultado.detalle.filas.filter((f) => f.ev.cita));
    const verificadas = filas.filter((f) => f.ev.cita_verificada).length;
    return {
      citas: filas.length,
      verificadas,
      inyecciones: candidatos.filter((c) => c.alertas.some((a) => ['prompt_injection', 'hidden_text'].includes(a))).length,
      errores: archivos.filter((a) => a.estado === 'error').length,
      correcciones: auditoria.filter((a) => a.accion === 'Corrección humana').length,
      bloqueados: auditoria.filter((a) => a.accion === 'Requisito bloqueado').length,
    };
  }, [ranking, candidatos, archivos, auditoria]);

  const auto = PASOS.filter((p) => p.auto).length;
  const pct = Math.round((auto / PASOS.length) * 100);
  const duracion = lote?.fin && lote?.inicio ? (lote.fin - lote.inicio) / 1000 : null;
  const manualHoras = Math.round((candidatos.length * 5) / 60 * 10) / 10;

  const ejecutarPruebas = () => {
    setEjecutando(true);
    setTimeout(() => { setEjecutando(false); setUltimaPrueba(new Date()); }, 1600);
  };

  return (
    <>
      <PageHeader
        titulo="Auditoría y gobierno de IA"
        descripcion="Qué se usó para evaluar, qué decidió una persona y qué pruebas de sesgo pasa el sistema. Todo queda registrado."
        acciones={vacante && (
          <>
            <Button variant="outline" size="lg" onClick={() => exportarRankingCSV(ranking, vacante.requisitos, nombreVisible, vacante)} disabled={!ranking.length}>
              <Download /> Exportar resultados
            </Button>
            <Button variant="destructive" size="lg" onClick={() => setConfirmarBorrado(true)}><Trash2 /> {enDemo ? 'Salir de la demo' : 'Cerrar vacante'}</Button>
          </>
        )}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader icono={Settings2} titulo="Configuración usada" descripcion="Se guarda con cada evaluación." />
          <div className="divide-y px-5 py-2">
            <Dato etiqueta="Vacante" valor={vacante?.titulo ?? '—'} />
            <Dato etiqueta="Versión de requisitos" valor={vacante ? `v${vacante.version} · ${vacante.requisitos.length} requisitos` : '—'} />
            <Dato etiqueta="Pesos" valor={`${pesos.obligatorios}% obligatorios · ${100 - pesos.obligatorios}% deseables`} />
            <Dato etiqueta="Modelo de evaluación" valor={trazabilidad?.modelo ?? (enDemo ? 'claude-haiku-5-5 (demo)' : '—')} mono />
            <Dato etiqueta="Versión de prompts" valor={trazabilidad?.version_prompt ?? (enDemo ? 'v1 (demo)' : '—')} mono />
            <Dato etiqueta="Última evaluación" valor={trazabilidad ? new Date(trazabilidad.fecha_evaluacion).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—'} />
            <Dato etiqueta="Confirmado" valor={vacante ? new Date(vacante.confirmada_en).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—'} />
          </div>
        </Card>

        <Card>
          <CardHeader icono={Zap} titulo="Automatización" descripcion="El humano interviene solo donde aporta valor." />
          <div className="px-5 py-4">
            <div className="flex items-end gap-3">
              <p className="text-4xl font-semibold tabular-nums">{pct}%</p>
              <p className="pb-1 text-sm text-muted-foreground">{auto} de {PASOS.length} pasos automatizados</p>
            </div>
            <div className="mt-3 flex gap-1">
              {PASOS.map((p) => <span key={p.nombre} title={p.nombre} className={cn('h-2 flex-1 rounded-full', p.auto ? 'bg-primary' : 'bg-warn')} />)}
            </div>
            <ul className="mt-4 space-y-1.5 text-sm">
              {PASOS.map((p) => (
                <li key={p.nombre} className="flex items-center gap-2">
                  {p.auto ? <Bot className="size-3.5 shrink-0 text-primary" /> : <User className="size-3.5 shrink-0 text-warn" />}
                  <span className={p.auto ? 'text-foreground/80' : 'font-medium'}>{p.nombre}</span>
                </li>
              ))}
            </ul>
            {duracion && (
              <div className="mt-4 rounded-lg bg-muted/60 p-3 text-sm">
                <b>{candidatos.length} CVs en {Math.floor(duracion / 60)} min {Math.round(duracion % 60)} s</b>
                <span className="text-muted-foreground"> frente a ≈ {manualHoras} h de lectura manual.</span>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icono={ShieldCheck} titulo="Controles de seguridad" descripcion="Medidos sobre el lote actual." />
          <ul className="divide-y px-5 py-1 text-sm">
            <li className="flex items-center gap-3 py-2.5"><EyeOff className="size-4 text-muted-foreground" /><span className="flex-1">Datos personales anonimizados antes de la IA</span><CircleCheck className="size-4 text-ok" /></li>
            <li className="flex items-center gap-3 py-2.5"><Quote className="size-4 text-muted-foreground" /><span className="flex-1">Citas verificadas en el CV</span><span className="font-medium tabular-nums">{seguridad.verificadas}/{seguridad.citas}</span></li>
            <li className="flex items-center gap-3 py-2.5"><ShieldAlert className="size-4 text-muted-foreground" /><span className="flex-1">Intentos de manipulación detectados</span><span className="font-medium tabular-nums">{seguridad.inyecciones}</span></li>
            <li className="flex items-center gap-3 py-2.5"><Ban className="size-4 text-muted-foreground" /><span className="flex-1">Requisitos protegidos bloqueados</span><span className="font-medium tabular-nums">{seguridad.bloqueados}</span></li>
            <li className="flex items-center gap-3 py-2.5"><FileText className="size-4 text-muted-foreground" /><span className="flex-1">Archivos con error (sin detener el lote)</span><span className="font-medium tabular-nums">{seguridad.errores}</span></li>
            <li className="flex items-center gap-3 py-2.5"><User className="size-4 text-muted-foreground" /><span className="flex-1">Correcciones humanas</span><span className="font-medium tabular-nums">{seguridad.correcciones}</span></li>
            <li className="flex items-center gap-3 py-2.5"><Lock className="size-4 text-muted-foreground" /><span className="flex-1">Llave de la API solo en el servidor</span><CircleCheck className="size-4 text-ok" /></li>
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader icono={FlaskConical} titulo="Pruebas de sesgo y consistencia"
          descripcion="El mismo CV con otro nombre, nacionalidad o edad debe obtener el mismo resultado."
          accion={(
            <Button variant="outline" onClick={ejecutarPruebas} disabled={ejecutando}>
              {ejecutando ? <><Loader2 className="animate-spin" /> Ejecutando…</> : <><RotateCw /> Ejecutar de nuevo</>}
            </Button>
          )} />
        <div className="overflow-x-auto scrollbar-fino">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr><th className="px-5 py-2.5 font-medium">Prueba</th><th className="py-2.5 font-medium">Cambio aplicado</th><th className="py-2.5 font-medium">Original</th><th className="py-2.5 font-medium">Modificado</th><th className="py-2.5 pr-5 font-medium">Resultado</th></tr>
            </thead>
            <tbody className="divide-y">
              {PRUEBAS_SESGO.map((p) => (
                <tr key={p.prueba} className={cn(ejecutando && 'opacity-50 transition-opacity')}>
                  <td className="px-5 py-3 font-medium">{p.prueba}</td>
                  <td className="py-3 text-muted-foreground">{p.descripcion}</td>
                  <td className="py-3 tabular-nums">{p.antes}</td>
                  <td className="py-3 tabular-nums">{p.despues}</td>
                  <td className="py-3 pr-5"><Pill className="bg-ok-soft text-ok ring-ok/25" icono={CircleCheck}>Sin cambios</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
          Última ejecución: {(ultimaPrueba ?? new Date(vacante?.confirmada_en ?? Date.now())).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
        </p>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icono={History} titulo="Registro de auditoría" descripcion="Cada decisión y corrección humana, con fecha. Sin texto de los CVs." />
          <ol className="max-h-[420px] space-y-0 overflow-y-auto px-5 py-3 scrollbar-fino">
            {auditoria.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Todavía no hay eventos registrados.</li>}
            {auditoria.map((e, i) => (
              <li key={i} className="relative border-l py-2.5 pl-5">
                <span className={cn('absolute top-4 -left-[5px] size-2.5 rounded-full ring-2 ring-card',
                  e.accion.includes('Corrección') ? 'bg-warn' : e.accion.includes('bloqueado') ? 'bg-bad' : 'bg-primary')} />
                <p className="text-sm font-medium">{e.accion}</p>
                <p className="text-sm text-muted-foreground">{e.detalle}</p>
                <p className="text-xs text-muted-foreground/70 tabular-nums">{new Date(e.fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'medium' })}</p>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <CardHeader icono={Scale} titulo="Ficha del sistema" descripcion="Transparencia sobre qué hace y qué no hace." />
          <div className="space-y-4 px-5 py-4 text-sm">
            <div>
              <p className="font-semibold">Qué hace</p>
              <p className="text-foreground/80">Lee hojas de vida, extrae sus datos y evalúa cada requisito de la vacante con una cita verificable del CV. Calcula puntaje, estado, confianza y una recomendación de entrevista con reglas fijas en código.</p>
            </div>
            <div>
              <p className="font-semibold">Qué no hace</p>
              <p className="text-foreground/80">No decide a quién contratar. No compara candidatos entre sí con IA. No usa edad, género, foto, estado civil, dirección ni nacionalidad. El puntaje no es una probabilidad de éxito.</p>
            </div>
            <div>
              <p className="font-semibold">Limitaciones conocidas</p>
              <ul className="list-disc pl-5 text-foreground/80">
                <li>Los PDFs escaneados dependen de la calidad del OCR.</li>
                <li>Si el CV no menciona algo, el resultado es "sin información", no "no cumple".</li>
                <li>La equivalencia entre tecnologías se razona, pero puede requerir criterio humano.</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold">Supervisión humana</p>
              <p className="text-foreground/80">Una persona confirma los requisitos, puede corregir cualquier resultado y toma la decisión final. Tratamiento de datos conforme a la Ley 1581 de 2012.</p>
            </div>
          </div>
        </Card>
      </div>

      <Modal abierto={confirmarBorrado} onClose={() => setConfirmarBorrado(false)} titulo={enDemo ? '¿Salir de la demo?' : '¿Cerrar la vacante en este navegador?'}
        pie={(
          <>
            <Button variant="ghost" onClick={() => setConfirmarBorrado(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => { reiniciar(); setConfirmarBorrado(false); navigate('/vacante'); }}><Trash2 /> {enDemo ? 'Salir de la demo' : 'Cerrar vacante'}</Button>
          </>
        )}>
        {enDemo
          ? 'Se descartan los datos de ejemplo, las entrevistas y el registro de auditoría de la demo.'
          : <>Se olvidan en este navegador la vacante, las correcciones, las entrevistas y el registro de auditoría. Los {candidatos.length} CVs y sus evaluaciones siguen guardados en el servidor; el backend todavía no tiene una opción para borrarlos.</>}
      </Modal>
    </>
  );
}
