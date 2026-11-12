import { ShieldAlert, ScanText, CalendarX, Quote } from 'lucide-react';

export const ALERTAS = {
  prompt_injection: { texto: 'Texto oculto que intenta manipular la IA', corto: 'Manipulación detectada', icono: ShieldAlert, clase: 'text-bad bg-bad-soft' },
  ocr: { texto: 'Documento escaneado: se leyó con OCR', corto: 'Leído con OCR', icono: ScanText, clase: 'text-info bg-info-soft' },
  inconsistencia_fechas: { texto: 'Fechas de experiencia solapadas o imposibles', corto: 'Fechas inconsistentes', icono: CalendarX, clase: 'text-warn bg-warn-soft' },
  cita_no_verificada: { texto: 'Una cita no se encontró textualmente en el CV', corto: 'Cita no verificada', icono: Quote, clase: 'text-warn bg-warn-soft' },
};
