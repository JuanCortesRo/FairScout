# Privacidad, seguridad y uso responsable

## Propósito y límites

FairScout ayuda a organizar evidencia de un CV frente a requisitos de una vacante. No determina contratación ni reemplaza la revisión humana. El puntaje no es una probabilidad de éxito y el ranking no debe usarse como único fundamento de una decisión laboral.

La calidad de la extracción y evaluación depende del formato y legibilidad del CV, el OCR, la redacción de requisitos y las respuestas del proveedor de IA. La equivalencia entre tecnologías o experiencias puede requerir criterio profesional. Revisa las citas, la confianza y los motivos antes de actuar.

## Datos tratados

- El archivo original se guarda temporalmente durante el procesamiento y se elimina al terminar la solicitud.
- La base de datos conserva la ficha estructurada, el texto de líneas anonimizado y alertas del documento.
- Nombre, correo y teléfono extraídos se mantienen en una tabla separada del contenido evaluativo; el XLSX de ranking es el canal previsto para exportar esos contactos.
- Evaluaciones, trazabilidad, entrevistas internas e invitaciones se persisten en la base de datos.
- El navegador conserva preferencias de interfaz y el identificador de la entrevista interna en curso; las respuestas e informes de la entrevista están en el backend.
- El texto anonimizado usado en extracción y evaluación se transmite al proveedor configurado de IA. No envíes CVs reales a entornos de prueba sin autorización y una base legal adecuada.

Eliminar un candidato borra sus datos relacionados; eliminar una vacante los borra en cascada, incluidas evaluaciones y entrevistas. La eliminación lógica de la aplicación no reemplaza políticas de respaldo: los backups deben tener retención y acceso controlados.

## Controles implementados

- Anonimización previa al envío a modelos y separación del contacto.
- Bloqueo de requisitos protegidos en la propuesta/confirmación/evaluación.
- Detección de contenido sospechoso, incluidos indicios de prompt injection y texto de baja visibilidad.
- Citas asociadas a líneas y verificadas en código antes de mostrarse como verificadas.
- Los candidatos con alertas críticas quedan aparte del ranking para revisión humana.
- Las invitaciones públicas tienen tokens aleatorios de duración limitada; se guarda el hash del token y se registra consentimiento antes de comenzar.
- Los errores operativos se reportan sin detener toda la evaluación por lote cuando es posible.

Estos controles reducen riesgos, pero no garantizan anonimización perfecta, ausencia de sesgo ni resistencia completa a manipulación.

## Protección de accesos

La API administrativa de vacantes, CVs, ranking, exportación y entrevistas internas no implementa autenticación de usuarios. Debe permanecer en un entorno controlado o detrás de controles de acceso de infraestructura (por ejemplo, red privada y autenticación en proxy). No la expongas directamente a Internet.

El token de invitación pública es una credencial portadora: cualquier persona que lo tenga puede acceder a la invitación hasta que expire o sea revocada. Evita ponerlo en logs, capturas o canales públicos. El enlace expira a las 72 horas según la implementación actual.

Las exportaciones pueden contener información identificable. Comparte el archivo solo con personas autorizadas y elimínalo cuando termine su propósito.

## Interpretación de resultados

- **Sin información** significa que el documento no permitió verificar un requisito; no es prueba de que la persona no lo cumpla.
- **No cumple** requiere evidencia explícita de incumplimiento en un requisito obligatorio o la presencia de un criterio descalificante.
- **Pendiente de verificar** expresa falta de evidencia sobre un obligatorio.
- **Cumple parcialmente** representa evidencia parcial en obligatorios, sin faltantes ni incumplimientos explícitos.
- Una recomendación de entrevista es orientativa. La decisión final corresponde a una persona.

## Responsabilidades del equipo operador

Antes de usar datos reales, define quién puede acceder, por cuánto tiempo se conservan, cómo se atienden solicitudes de titulares, cómo se protegen respaldos y exportaciones, y qué proveedor procesa los datos. Cumple las normas aplicables de protección de datos y documenta la base legal y los avisos de privacidad del proceso. Esta guía técnica no constituye asesoría jurídica.
