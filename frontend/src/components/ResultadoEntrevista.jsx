import { useState } from 'react';
import { ArrowRight, Check, MessageSquareQuote, TriangleAlert, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pill, ResultadoBadge } from '@/components/ui/kit';
import { cn } from '@/lib/utils';

const CALIFICACION = {
  solida: { texto: 'Sólida', clase: 'bg-ok-soft text-ok ring-ok/25' },
  aceptable: { texto: 'Aceptable', clase: 'bg-info-soft text-info ring-info/25' },
  debil: { texto: 'Débil', clase: 'bg-warn-soft text-warn ring-warn/30' },
};
const NIVEL = { no_cumple: 0, sin_informacion: 0, parcial: 1, equivalente: 2, cumple: 3 };

/** Lo que la entrevista permite proponer: sólida → cumple; aceptable → parcial. Nunca baja un resultado. */
function propuesta(item, ev) {
  if (!item.verificado || item.tipo === 'descalificante' || !ev) return null;
  const propuesto = item.calificacion === 'solida' ? 'cumple' : 'parcial';
  const actual = ev.resultado;
  return (NIVEL[propuesto] ?? 0) > (NIVEL[actual] ?? 0) ? propuesto : null;
}

/**
 * Resultado de la entrevista por requisito: la frase del candidato como evidencia (igual que la cita del CV),
 * las contradicciones con el CV y, cuando la entrevista resolvió una duda, la propuesta de ajustar el resultado.
 * La propuesta solo se aplica si la persona la acepta.
 */
export default function ResultadoEntrevista({ informe, evaluaciones, entrevistaId, onAceptar, onDeshacer }) {
  const [guardando, setGuardando] = useState(null);
  const requisitos = informe?.requisitos ?? [];
  const inconsistencias = informe?.inconsistencias ?? [];
  const porId = new Map((evaluaciones ?? []).map((e) => [e.requisito_id, e]));
  const dudas = requisitos.filter((r) => {
    const ev = porId.get(r.requisito_id);
    return ev && ((NIVEL[ev.resultado_ia ?? ev.resultado] ?? 0) < 2);
  });
  const resueltas = dudas.filter((r) => r.verificado);

  const aceptar = async (item, resultado) => {
    setGuardando(item.requisito_id);
    await onAceptar?.(item.requisito_id, resultado, {
      origen: 'entrevista', entrevista_id: entrevistaId ?? null, evidencia: item.evidencia,
    });
    setGuardando(null);
  };

  if (!requisitos.length && !inconsistencias.length) {
    return <p className="text-sm text-muted-foreground">La entrevista no tocó requisitos específicos de la vacante.</p>;
  }

  return (
    <div className="space-y-3">
      {dudas.length > 0 && (
        <p className="text-sm">
          <span className="font-semibold tabular-nums">{resueltas.length} de {dudas.length}</span>
          <span className="text-muted-foreground"> dudas del CV quedaron resueltas con evidencia en la entrevista.</span>
        </p>
      )}
      <ul className="space-y-2.5">
        {requisitos.map((item) => {
          const ev = porId.get(item.requisito_id);
          const sugerido = propuesta(item, ev);
          const aceptada = ev?.origen_correccion === 'entrevista';
          const calif = CALIFICACION[item.calificacion] ?? CALIFICACION.debil;
          return (
            <li key={item.requisito_id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 text-sm font-medium">
                  <span className="mr-1.5 text-xs font-semibold text-muted-foreground tabular-nums">{item.requisito_id}</span>
                  {item.nombre}
                </p>
                <Pill className={calif.clase}>{calif.texto}</Pill>
              </div>
              {item.evidencia ? (
                <p className="mt-2 flex items-start gap-2 rounded-md bg-muted/70 px-2.5 py-1.5 text-xs">
                  <MessageSquareQuote className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span className="italic text-foreground/80">“{item.evidencia}”</span>
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Sin evidencia concreta en la respuesta.</p>
              )}
              {ev && (sugerido || aceptada) && (
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    En el CV: <ResultadoBadge resultado={ev.resultado_ia ?? ev.resultado} />
                    <ArrowRight className="size-3.5" />
                    <ResultadoBadge resultado={aceptada ? ev.resultado : sugerido} />
                  </span>
                  {aceptada ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-ok"><Check className="size-3.5" /> Aceptado</span>
                      {onDeshacer && (
                        <button onClick={() => onDeshacer(item.requisito_id)}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                          <Undo2 className="size-3.5" /> Deshacer
                        </button>
                      )}
                    </span>
                  ) : onAceptar && (
                    <Button size="sm" variant="outline" disabled={guardando === item.requisito_id}
                      onClick={() => aceptar(item, sugerido)}>
                      {guardando === item.requisito_id ? 'Guardando…' : 'Aceptar ajuste'}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {inconsistencias.length > 0 && (
        <div className={cn('rounded-lg border border-bad/25 bg-bad-soft p-3 text-sm')}>
          <p className="flex items-center gap-1.5 font-medium text-bad"><TriangleAlert className="size-4" /> Contradicciones con el CV</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-foreground/80">
            {inconsistencias.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        La entrevista propone; el ajuste solo cambia el puntaje si lo aceptas, y queda registrado.
      </p>
    </div>
  );
}

const ESTADOS_ENTREVISTA = {
  pending: { texto: 'Invitación enviada', clase: 'bg-muted text-muted-foreground ring-border' },
  en_curso: { texto: 'Entrevista en curso', clase: 'bg-info-soft text-info ring-info/25' },
  expirada: { texto: 'Invitación vencida', clase: 'bg-muted text-muted-foreground ring-border' },
  revocada: { texto: 'Invitación revocada', clase: 'bg-muted text-muted-foreground ring-border' },
};

/** Estado de la entrevista de un candidato: recomendación si terminó, avance si no. */
export function EntrevistaBadge({ entrevista }) {
  if (!entrevista) return null;
  if (entrevista.estado === 'finalizada') {
    const avanzar = entrevista.recomendacion === 'avanzar';
    return (
      <Pill className={avanzar ? 'bg-ok-soft text-ok ring-ok/25' : 'bg-warn-soft text-warn ring-warn/30'}>
        {avanzar ? 'Entrevista: avanzar' : 'Entrevista: revisar'}
      </Pill>
    );
  }
  const e = ESTADOS_ENTREVISTA[entrevista.estado] ?? ESTADOS_ENTREVISTA.pending;
  return <Pill className={e.clase}>{e.texto}</Pill>;
}
