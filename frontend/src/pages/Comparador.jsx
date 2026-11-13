import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Columns3, X, Plus, Quote, BadgeCheck, CircleAlert, ThumbsUp, Minus, ArrowUpRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import {
  Card, PageHeader, EstadoVacio, AnilloPuntaje, EstadoBadge, Confianza, ResultadoBadge, TipoBadge, Interruptor,
} from '@/components/ui/kit';
import { useApp } from '@/store';
import { AVISO_DECISION } from '@/lib/constantes';
import { cn } from '@/lib/utils';

/** Compara hasta tres candidatos en paralelo por resultado y evidencia de cada requisito. */
export default function Comparador() {
  const { ranking, seleccion, toggleSeleccion, nombreVisible, vacante } = useApp();
  const navigate = useNavigate();
  const [soloDiferencias, setSoloDiferencias] = useState(false);

  if (!vacante || ranking.length === 0) {
    return (
      <>
        <PageHeader titulo="Comparador" />
        <Card>
          <EstadoVacio icono={Columns3} titulo="No hay candidatos para comparar" descripcion="Cuando haya CVs evaluados podrás poner 2 o 3 candidatos lado a lado, requisito por requisito.">
            <Link to="/ranking" className={buttonVariants({ size: 'lg' })}>Ir al ranking</Link>
          </EstadoVacio>
        </Card>
      </>
    );
  }

  const elegidos = seleccion.map((id) => ranking.find((r) => r.candidato.candidato_id === id)).filter(Boolean);
  const disponibles = ranking.filter((r) => !seleccion.includes(r.candidato.candidato_id));
  const requisitos = vacante.requisitos.filter((req) => {
    if (!soloDiferencias || elegidos.length < 2) return true;
    const res = elegidos.map((e) => e.resultado.detalle.filas.find((f) => f.req.id === req.id)?.ev.resultado);
    return new Set(res).size > 1;
  });

  const cols = `minmax(180px,1.1fr) repeat(${elegidos.length + (elegidos.length < 3 ? 1 : 0)}, minmax(220px,1fr))`;

  return (
    <>
      <PageHeader
        titulo="Comparador de candidatos"
        descripcion="Hasta 3 candidatos lado a lado, con el resultado y la evidencia de cada requisito."
        acciones={elegidos.length >= 2 && <Interruptor activo={soloDiferencias} onChange={setSoloDiferencias} etiqueta="Solo diferencias" />}
      />

      <Card className="overflow-x-auto scrollbar-fino">
        <div className="min-w-fit">
          {/* Encabezados */}
          <div className="grid border-b" style={{ gridTemplateColumns: cols }}>
            <div className="flex items-end p-4 text-xs font-medium text-muted-foreground">Requisito</div>
            {elegidos.map(({ candidato: c, resultado: r, posicion }) => (
              <div key={c.candidato_id} className="relative border-l p-4">
                <button onClick={() => toggleSeleccion(c.candidato_id)} className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Quitar de la comparación">
                  <X className="size-4" />
                </button>
                <div className="flex items-center gap-3">
                  <AnilloPuntaje valor={r.puntaje} tamano={56} grosor={5} />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">#{posicion}</p>
                    <button onClick={() => navigate(`/candidato/${c.candidato_id}`)} className="group flex items-center gap-1 truncate font-semibold hover:text-primary">
                      {nombreVisible(c)} <ArrowUpRight className="size-3.5 opacity-0 group-hover:opacity-100" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <EstadoBadge estado={r.estado} />
                  <Confianza nivel={r.confianza} />
                </div>
                <p className="mt-2 flex items-center gap-1 text-xs">
                  {r.recomendado_entrevista
                    ? <><ThumbsUp className="size-3.5 text-info" /> <span className="font-medium text-info">Recomendado para entrevista</span></>
                    : <><Minus className="size-3.5 text-muted-foreground" /> <span className="text-muted-foreground">No recomendado</span></>}
                </p>
              </div>
            ))}
            {elegidos.length < 3 && (
              <div className="flex flex-col justify-center gap-2 border-l border-dashed p-4">
                <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Plus className="size-4" /> Agregar candidato</p>
                <select value="" onChange={(e) => e.target.value && toggleSeleccion(e.target.value)} aria-label="Agregar candidato a la comparación"
                  className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm focus:border-ring focus:outline-none">
                  <option value="">Elegir…</option>
                  {disponibles.map(({ candidato: c, resultado: r, posicion }) => (
                    <option key={c.candidato_id} value={c.candidato_id}>#{posicion} · {nombreVisible(c)} · {Math.round(r.puntaje)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {elegidos.length === 0 && (
            <EstadoVacio icono={Columns3} titulo="Elige candidatos" descripcion="Usa el selector de arriba o marca las casillas en el ranking." />
          )}

          {/* Filas por requisito */}
          {elegidos.length > 0 && requisitos.map((req) => {
            const res = elegidos.map((e) => e.resultado.detalle.filas.find((f) => f.req.id === req.id));
            const distintos = new Set(res.map((f) => f?.ev.resultado)).size > 1;
            return (
              <div key={req.id} className={cn('grid border-b last:border-0', distintos && elegidos.length > 1 && 'bg-warn-soft/25')} style={{ gridTemplateColumns: cols }}>
                <div className="p-4">
                  <div className="flex items-center gap-1.5"><span className="text-xs font-semibold text-muted-foreground">{req.id}</span><TipoBadge tipo={req.tipo} /></div>
                  <p className="mt-1 text-sm font-medium">{req.nombre}</p>
                </div>
                {res.map((f, i) => (
                  <div key={elegidos[i].candidato.candidato_id} className="space-y-1.5 border-l p-4">
                    <ResultadoBadge resultado={f?.ev.resultado ?? 'sin_informacion'} />
                    {f?.ev.cita ? (
                      <p className="flex gap-1.5 text-xs text-foreground/75">
                        <Quote className="mt-0.5 size-3 shrink-0 text-primary" />
                        <span className="line-clamp-2 italic">{f.ev.cita}</span>
                        {f.ev.cita_verificada ? <BadgeCheck className="size-3.5 shrink-0 text-ok" /> : <CircleAlert className="size-3.5 shrink-0 text-warn" />}
                      </p>
                    ) : <p className="text-xs text-muted-foreground">{f?.ev.justificacion}</p>}
                  </div>
                ))}
                {elegidos.length < 3 && <div className="border-l border-dashed" />}
              </div>
            );
          })}
          {elegidos.length >= 2 && soloDiferencias && requisitos.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">Los candidatos tienen el mismo resultado en todos los requisitos.</p>
          )}
        </div>
      </Card>
      <p className="mt-4 text-center text-xs text-muted-foreground">{AVISO_DECISION}</p>
    </>
  );
}
