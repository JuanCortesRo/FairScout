import { ShieldAlert, ScanText, CalendarX, Quote, EyeOff, ImageOff, UserRoundX } from 'lucide-react';

// Tipos de alerta del documento (backend: suspicious_content.py, document_processor.py) y de la demo.
// Bajan la confianza o mandan el CV a revisión humana; nunca cambian el puntaje.
export const ALERTAS = {
  prompt_injection: { texto: 'Texto que intenta manipular la evaluación de la IA', corto: 'Manipulación detectada', icono: ShieldAlert, clase: 'text-bad bg-bad-soft' },
  hidden_text: { texto: 'Texto oculto en el PDF (color blanco o tamaño mínimo)', corto: 'Texto oculto', icono: EyeOff, clase: 'text-bad bg-bad-soft' },
  posible_fuga_personal: { texto: 'Posible dato personal sin anonimizar: no se envió a la IA', corto: 'Dato personal sin anonimizar', icono: UserRoundX, clase: 'text-bad bg-bad-soft' },
  fotografia_o_imagen: { texto: 'El documento tiene una imagen o foto; no se usa para evaluar', corto: 'Foto ignorada', icono: ImageOff, clase: 'text-muted-foreground bg-muted' },
  ocr: { texto: 'Documento escaneado: se leyó con OCR', corto: 'Leído con OCR', icono: ScanText, clase: 'text-info bg-info-soft' },
  inconsistencia_fechas: { texto: 'Fechas de experiencia solapadas o imposibles', corto: 'Fechas inconsistentes', icono: CalendarX, clase: 'text-warn bg-warn-soft' },
  cita_no_verificada: { texto: 'Una cita no se encontró textualmente en el CV', corto: 'Cita no verificada', icono: Quote, clase: 'text-warn bg-warn-soft' },
};
