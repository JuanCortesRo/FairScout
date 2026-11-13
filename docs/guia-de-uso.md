# Guía de uso

## Recorrido recomendado

### 1. Crear y confirmar una vacante

En **Vacantes**, crea una vacante con una descripción concreta del cargo. FairScout propone requisitos agrupados como obligatorios, deseables o descalificantes. Revisa cada nombre, categoría y tipo antes de confirmar:

- **Obligatorio:** requisito necesario para considerar que cumple.
- **Deseable:** contribuye al puntaje, pero su ausencia no cambia por sí sola el estado de cumplimiento.
- **Descalificante:** su presencia produce el estado **No cumple**.

Los requisitos basados en atributos protegidos se bloquean y se explican en la interfaz. Modificar los requisitos evaluables genera una nueva versión de la vacante; las evaluaciones de versiones anteriores dejan de ser las vigentes. Cambiar pesos no requiere volver a llamar a la IA.

### 2. Cargar CVs

En **Carga de CVs**, selecciona archivos PDF o DOCX. El procesamiento incluye lectura de texto, OCR cuando corresponde, alertas, anonimización y extracción de una ficha. La subida se procesa en la solicitud HTTP; la evaluación posterior sí puede ejecutarse por lotes.

Cada archivo puede quedar listo, en revisión, duplicado o con error. Un documento con alerta crítica se aparta para revisión humana y no se envía al modelo de extracción. Los duplicados y documentos similares se identifican en el ámbito de la vacante.

### 3. Interpretar puntaje y estado

El puntaje es una medida de ajuste a los requisitos declarados, **no una probabilidad de contratación**. Por defecto, los requisitos obligatorios aportan el 60 % del puntaje y los deseables el 40 %. El peso de los deseables individuales se usa para ponderar su promedio; el control de pesos permite cambiar la proporción entre obligatorios y deseables.

En términos simples, el puntaje combina el promedio de obligatorios con el promedio ponderado de deseables según el porcentaje seleccionado. Si la vacante no tiene requisitos de uno de esos dos grupos, el otro grupo determina el total; si no hay ninguno, el puntaje es 0. El resultado se redondea a un decimal.

| Evidencia por requisito | Aporte al puntaje |
|---|---:|
| Cumple | 1.0 |
| Equivalente | 0.8 |
| Parcial | 0.5 |
| No cumple | 0 |
| Sin información | 0 |

El estado global sigue reglas independientes del puntaje:

| Estado | Regla |
|---|---|
| **No cumple** | Hay un descalificante presente o evidencia explícita de que no satisface un obligatorio. |
| **Pendiente de verificar** | Falta información de un obligatorio y no existe un incumplimiento explícito. Si también hay evidencia parcial, se mantiene pendiente hasta aclarar la información faltante. |
| **Cumple parcialmente** | Hay evidencia parcial en uno o más obligatorios, sin faltantes obligatorios ni incumplimientos explícitos. |
| **Cumple** | Todos los obligatorios están como “Cumple” o “Equivalente” y no hay un descalificante presente. Los deseables no condicionan este estado. |

Si un requisito obligatorio no tiene evaluación guardada, se trata como **Sin información**. Un 0 puede resultar de información ausente, incumplimiento explícito o ambos; consulta siempre el estado y la evidencia requisito por requisito.

### 4. Confianza y recomendación

La **confianza** resume cobertura de información, verificación de citas y alertas como OCR, fechas inconsistentes o posible manipulación. No es una probabilidad estadística. Es baja si la cobertura es menor al 50 %, hay citas obligatorias sin verificar o se detecta prompt injection; puede ser alta con al menos 80 % de cobertura, todas las citas verificadas, sin alertas de OCR/fechas y menos de dos obligatorios parciales. Los demás casos son de confianza media. Una cita no verificada se marca para revisión.

La recomendación de entrevista es una ayuda, no una decisión automática. El código recomienda a quienes cumplen; también puede recomendar un caso pendiente de verificar si el puntaje llega al umbral de 60 y las dudas son exclusivamente falta de información. **No recomendado** tampoco equivale por sí solo a una decisión de contratación.

El ranking ordena primero por estado, luego por puntaje descendente y finalmente por identificador. Los CVs con alertas críticas se muestran aparte como **En revisión**.

### 5. Revisar y comparar

- Abre un candidato para ver su resumen, ficha y cada requisito con cita, líneas asociadas y explicación.
- Usa **Comparador** para revisar hasta tres candidatos y, si conviene, mostrar solo requisitos con resultados diferentes.
- En modo demo, **Entrevista simulada** corre en el frontend con datos de ejemplo. Con el servidor conectado, la entrevista interna usa el agente del backend y persiste la sesión. También se puede generar una invitación pública; la persona candidata debe aceptar el consentimiento antes de comenzar.

### 6. Exportar y borrar

El ranking puede exportarse a XLSX. El archivo incluye nombre, correo y teléfono cuando se extrajeron; esos datos personales requieren distribución restringida y eliminación cuando ya no se necesiten.

Eliminar una vacante desde la API borra en cascada sus requisitos, CVs, evaluaciones, entrevistas y exportaciones registradas. El borrado no puede deshacerse; confirma el identificador de vacante antes de usarlo.

## Modo demo

La demo usa perfiles y evaluaciones de ejemplo en el navegador; no sube CVs ni llama al backend para esos datos. Úsala para explorar la interfaz, no para validar la calidad del modelo ni para inferir resultados reales.
