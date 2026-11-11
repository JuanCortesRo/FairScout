// Etiquetas y estilos compartidos. Los estados siempre llevan ícono además de color (sección 19).
import {
  CircleCheck, CircleAlert, CircleX, CircleHelp, Equal, CircleMinus, Ban, ShieldCheck,
} from 'lucide-react';

export const ESTADOS = {
  cumple: { texto: 'Cumple', icono: CircleCheck, clase: 'bg-ok-soft text-ok ring-ok/25' },
  cumple_parcialmente: { texto: 'Cumple parcialmente', icono: CircleAlert, clase: 'bg-warn-soft text-warn ring-warn/30' },
  no_cumple: { texto: 'No cumple', icono: CircleX, clase: 'bg-bad-soft text-bad ring-bad/25' },
};

export const CONFIANZAS = {
  alta: { texto: 'Alta', nivel: 3, clase: 'text-ok' },
  media: { texto: 'Media', nivel: 2, clase: 'text-warn' },
  baja: { texto: 'Baja', nivel: 1, clase: 'text-bad' },
};

// Resultado de cada requisito (obligatorio/deseable y descalificante).
export const RESULTADOS = {
  cumple: { texto: 'Cumple', icono: CircleCheck, clase: 'bg-ok-soft text-ok ring-ok/25' },
  equivalente: { texto: 'Equivalente', icono: Equal, clase: 'bg-info-soft text-info ring-info/25' },
  parcial: { texto: 'Parcial', icono: CircleMinus, clase: 'bg-warn-soft text-warn ring-warn/30' },
  no_cumple: { texto: 'No cumple', icono: CircleX, clase: 'bg-bad-soft text-bad ring-bad/25' },
  sin_informacion: { texto: 'Sin información', icono: CircleHelp, clase: 'bg-muted text-muted-foreground ring-border' },
  presente: { texto: 'Presente', icono: Ban, clase: 'bg-bad-soft text-bad ring-bad/25' },
  ausente: { texto: 'Ausente', icono: ShieldCheck, clase: 'bg-ok-soft text-ok ring-ok/25' },
};

export const TIPOS = {
  obligatorio: { texto: 'Obligatorio', clase: 'bg-primary/10 text-primary ring-primary/20', ayuda: 'Debe cumplirse.' },
  deseable: { texto: 'Deseable', clase: 'bg-info-soft text-info ring-info/20', ayuda: 'Suma puntos; su ausencia no descarta.' },
  descalificante: { texto: 'Descalificante', clase: 'bg-foreground text-background ring-foreground/20', ayuda: 'Si está presente, el candidato no avanza.' },
};

export const CATEGORIAS = {
  experiencia: 'Experiencia',
  formacion: 'Formación',
  certificacion: 'Certificación',
  idioma: 'Idioma',
  tecnica: 'Técnica',
  blanda: 'Blanda',
};

export const ESTADOS_ARCHIVO = {
  pendiente: 'En cola',
  leyendo: 'Leyendo',
  anonimizando: 'Anonimizando',
  extrayendo: 'Extrayendo datos',
  evaluando: 'Evaluando',
  listo: 'Listo',
  error: 'Error',
  duplicado: 'Duplicado',
};

export const AVISO_DECISION = 'Recomendación de apoyo. La decisión final es del equipo de selección. El puntaje no es probabilidad de éxito.';

// Alertas por candidato (bajan la confianza; nunca el puntaje).
export { ALERTAS } from './alertas.jsx';
