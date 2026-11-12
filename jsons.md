# AI Talent Scout — Documentación de los contratos JSON

## 1. Descripción general

AI Talent Scout es un sistema de selección de talento que utiliza inteligencia artificial para analizar hojas de vida y compararlas con los requisitos de una vacante laboral. Su objetivo es facilitar la preselección de candidatos mediante la extracción estructurada de información, la evaluación basada en evidencias y la generación de un ranking explicado.

Este documento describe los cinco contratos JSON utilizados para organizar la información principal del sistema:

| Archivo | Propósito |
|---|---|
| `vacancy.json` | Almacena la información general de una vacante laboral. |
| `requirements.json` | Define los requisitos asociados a una vacante y sus condiciones de evaluación. |
| `candidate.json` | Contiene la información estructurada extraída de una hoja de vida. |
| `evaluation.json` | Registra la evaluación individual de un candidato frente a los requisitos de una vacante. |
| `ranking.json` | Contiene los resultados finales de los candidatos y su ordenamiento. |

Los contratos permiten mantener separadas las vacantes, sus requisitos, los perfiles de los candidatos, sus evaluaciones y los resultados del proceso de selección.

## 2. Arquitectura de los datos

Los cinco contratos cumplen funciones diferentes dentro del flujo de procesamiento:

```text
                  VACANTE
                     |
                     v
               vacancy.json
                     |
                     v
             requirements.json
                     |
              Confirmación del
                 reclutador
                     |
                     v
                CANDIDATOS
                     |
               Procesamiento CV
                     |
                     v
               candidate.json
                     |
                     v
              evaluation.json
                     |
              Verificación de
                 evidencias
                     |
                     v
              Cálculo en Python
                     |
                     v
               ranking.json
```

La relación entre los archivos se establece mediante identificadores:

- `vacante_id`: identifica la vacante y permite relacionarla con sus requisitos.
- `candidato_id`: identifica de manera única al candidato.
- `documento_id`: relaciona el perfil del candidato con el documento procesado.
- `requisito_id`: identifica cada requisito de una vacante.
- `version`: permite identificar la versión de los requisitos utilizada en una evaluación.

---

## 3. `vacancy.json`: información de la vacante

### Propósito

Almacena la información general de una oferta laboral. Representa la entidad principal sobre la cual se definen posteriormente los requisitos que deben cumplir los candidatos.

Este archivo no contiene los criterios detallados de evaluación, ya que estos se administran independientemente en `requirements.json`.

### Estructura

```json
{
  "vacante_id": "VAC-001",
  "titulo": "Backend Developer",
  "empresa": "Tech Solutions",
  "descripcion": "Buscamos un desarrollador backend para construir y mantener APIs.",
  "ubicacion": "Remoto",
  "modalidad": "remoto",
  "nivel": "junior",
  "idioma_descripcion": "es",
  "estado": "activa",
  "fecha_creacion": "2026-11-11",
  "version_requisitos": 1
}
```

### Descripción de los campos

| Campo | Tipo | Descripción |
|---|---|---|
| `vacante_id` | String | Identificador único de la vacante. |
| `titulo` | String | Nombre del cargo ofrecido. |
| `empresa` | String | Empresa que publica la vacante. |
| `descripcion` | String | Descripción general del cargo y sus responsabilidades. |
| `ubicacion` | String | Ubicación o lugar de trabajo. |
| `modalidad` | String | Modalidad laboral: presencial, híbrido o remoto. |
| `nivel` | String | Nivel profesional requerido. |
| `idioma_descripcion` | String | Idioma en el que está redactada la descripción. |
| `estado` | String | Estado actual de la vacante. |
| `fecha_creacion` | Date | Fecha de creación de la vacante. |
| `version_requisitos` | Integer | Versión de los requisitos asociados. |

### Validaciones

- El identificador, título y descripción no pueden estar vacíos.
- La modalidad debe corresponder a `presencial`, `hibrido` o `remoto`.
- El nivel debe ser uno de los valores permitidos: `trainee`, `junior`, `semi_senior`, `senior` o `lead`.
- El estado debe ser `activa`, `pausada` o `cerrada`.
- La fecha debe tener un formato válido.
- La versión de requisitos debe ser un entero mayor o igual a 1.

---

## 4. `requirements.json`: requisitos de la vacante

### Propósito

Almacena los requisitos asociados a una vacante. Estos representan las condiciones y características que se tendrán en cuenta para evaluar posteriormente a los candidatos.

Los requisitos pueden ser propuestos mediante un modelo de inteligencia artificial a partir de la descripción de la vacante. Sin embargo, deben ser revisados y confirmados por el reclutador antes de utilizarse en una evaluación.

### Tipos de requisitos

| Tipo | Descripción | Ejemplo |
|---|---|---|
| `obligatorio` | Condición que el candidato debe cumplir. | Tener al menos tres años de experiencia con Python. |
| `deseable` | Característica que aporta valor, pero cuya ausencia no implica descartar al candidato. | Tener experiencia con FastAPI. |
| `descalificante` | Condición que, si está presente, impide que el candidato avance según las reglas de la vacante. | Una incompatibilidad técnica definida explícitamente para el cargo. |

Los requisitos descalificantes no pueden basarse en características personales protegidas.

### Estructura

```json
{
  "vacante_id": "VAC-001",
  "version": 1,
  "estado": "confirmado",
  "requisitos": [
    {
      "requisito_id": "REQ-001",
      "nombre": "Experiencia con Python",
      "descripcion": "Contar con al menos 3 años de experiencia profesional utilizando Python.",
      "tipo": "obligatorio",
      "categoria": "experiencia",
      "peso": 3,
      "criterios_evaluacion": {
        "minimo_anios": 3,
        "tecnologia": "Python"
      }
    },
    {
      "requisito_id": "REQ-002",
      "nombre": "Experiencia con FastAPI",
      "descripcion": "Experiencia desarrollando APIs utilizando FastAPI.",
      "tipo": "deseable",
      "categoria": "tecnica",
      "peso": 2,
      "criterios_evaluacion": {
        "tecnologia": "FastAPI"
      }
    },
    {
      "requisito_id": "REQ-003",
      "nombre": "Condición descalificante",
      "descripcion": "Condición específica definida para esta vacante.",
      "tipo": "descalificante",
      "categoria": "otro",
      "peso": null,
      "criterios_evaluacion": {
        "condicion": "condicion_definida_por_reclutador"
      }
    }
  ],
  "ponderacion": {
    "obligatorios": 60,
    "deseables": 40
  },
  "confirmado_por_reclutador": true
}
```

### Descripción de los campos principales

| Campo | Tipo | Descripción |
|---|---|---|
| `vacante_id` | String | Identificador de la vacante a la que pertenecen los requisitos. |
| `version` | Integer | Versión del conjunto de requisitos. |
| `estado` | String | Estado del conjunto: borrador, pendiente de confirmación o confirmado. |
| `requisitos` | Array | Lista de requisitos definidos para la vacante. |
| `requisito_id` | String | Identificador único de cada requisito. |
| `nombre` | String | Nombre corto del requisito. |
| `descripcion` | String | Explicación detallada de la condición. |
| `tipo` | String | Obligatorio, deseable o descalificante. |
| `categoria` | String | Área a la que pertenece el requisito. |
| `peso` | Number o null | Importancia relativa del requisito cuando aplica. |
| `criterios_evaluacion` | Object | Parámetros específicos para interpretar el requisito. |
| `ponderacion` | Object | Distribución porcentual entre requisitos obligatorios y deseables. |
| `confirmado_por_reclutador` | Boolean | Indica si el reclutador aprobó los requisitos. |

### Categorías de requisitos

- `experiencia`
- `formacion`
- `certificacion`
- `idioma`
- `tecnica`
- `blanda`
- `otro`

### Validaciones

- Cada requisito debe tener un identificador único dentro del conjunto.
- El tipo debe ser `obligatorio`, `deseable` o `descalificante`.
- Los requisitos obligatorios y deseables deben tener un peso positivo.
- Los requisitos descalificantes no deben tener peso.
- La ponderación de obligatorios y deseables debe sumar 100.
- El estado debe ser `borrador`, `pendiente_confirmacion` o `confirmado`.
- Solo los requisitos confirmados por el reclutador pueden utilizarse en las evaluaciones.
- No se permiten requisitos basados en características personales protegidas.

### Versionamiento

Cada modificación del conjunto de requisitos debe generar una nueva versión. Esto permite conservar la trazabilidad de los criterios utilizados en cada proceso de selección.

---

## 5. `candidate.json`: información estructurada del candidato

### Propósito

Almacena la información estructurada extraída de una hoja de vida. Este contrato representa el perfil profesional del candidato y organiza los datos obtenidos durante el procesamiento del documento.

La extracción se realiza a partir del texto anonimizado del CV. El modelo de inteligencia artificial identifica la información y devuelve una estructura organizada, mientras que Python se encarga de normalizar y validar los datos.

La ficha del candidato es independiente de una vacante específica, por lo que puede reutilizarse para evaluar al mismo candidato frente a diferentes ofertas laborales.

### Estructura

```json
{
  "candidato_id": "CAN-001",
  "documento_id": "DOC-001",
  "version_esquema": "1.0",
  "idioma_cv": "es",
  "perfil_profesional": {
    "resumen": "Desarrollador backend con experiencia en desarrollo de APIs y servicios web.",
    "cargo_actual": {
      "valor": "Backend Developer",
      "evidencias": ["p1-l4"]
    }
  },
  "experiencia_laboral": [
    {
      "cargo": "Backend Developer",
      "empresa": "Empresa A",
      "fecha_inicio": "2022-01",
      "fecha_fin": "2024-06",
      "es_actual": false,
      "descripcion": "Desarrollo y mantenimiento de APIs.",
      "tecnologias": [
        {
          "nombre": "Python",
          "evidencias": ["p1-l8", "p1-l9"]
        },
        {
          "nombre": "FastAPI",
          "evidencias": ["p1-l9"]
        }
      ],
      "evidencias": ["p1-l7", "p1-l8", "p1-l9"]
    }
  ],
  "formacion_academica": [
    {
      "titulo": "Ingeniería de Sistemas",
      "institucion": "Universidad A",
      "fecha_inicio": "2020-01",
      "fecha_fin": "2025-06",
      "estado": "finalizada",
      "evidencias": ["p2-l3", "p2-l4"]
    }
  ],
  "certificaciones": [
    {
      "nombre": "AWS Certified Cloud Practitioner",
      "entidad": "Amazon Web Services",
      "fecha": "2024-05",
      "evidencias": ["p2-l10"]
    }
  ],
  "idiomas": [
    {
      "idioma": "Inglés",
      "nivel": "B2",
      "evidencias": ["p2-l13"]
    }
  ],
  "competencias_tecnicas": [
    {
      "nombre": "Python",
      "categoria": "lenguaje",
      "evidencias": ["p1-l8", "p1-l9"]
    },
    {
      "nombre": "PostgreSQL",
      "categoria": "base_de_datos",
      "evidencias": ["p2-l7"]
    }
  ],
  "competencias_blandas": [
    {
      "nombre": "Trabajo en equipo",
      "evidencias": ["p2-l15"]
    }
  ],
  "experiencia_total_anios": 2.5,
  "inconsistencias": [],
  "validacion": {
    "datos_normalizados": true,
    "evidencias_conservadas": true
  }
}
```

### Descripción de los campos principales

| Campo | Tipo | Descripción |
|---|---|---|
| `candidato_id` | String | Identificador único del candidato. |
| `documento_id` | String | Identificador del documento procesado. |
| `version_esquema` | String | Versión del contrato utilizado. |
| `idioma_cv` | String | Idioma principal de la hoja de vida. |
| `perfil_profesional` | Object | Resumen del perfil y cargo actual, cuando está disponible. |
| `experiencia_laboral` | Array | Experiencias profesionales identificadas. |
| `formacion_academica` | Array | Estudios y formación del candidato. |
| `certificaciones` | Array | Certificaciones identificadas en el documento. |
| `idiomas` | Array | Idiomas y niveles declarados. |
| `competencias_tecnicas` | Array | Tecnologías, herramientas y conocimientos técnicos. |
| `competencias_blandas` | Array | Competencias interpersonales identificadas. |
| `experiencia_total_anios` | Number | Experiencia laboral total calculada. |
| `inconsistencias` | Array | Datos que requieren revisión. |
| `validacion` | Object | Resultado de las validaciones de la ficha. |

### Evidencias

Cada dato extraído debe conservar referencias a las líneas del documento que respaldan la información.

Ejemplo:

```json
{
  "nombre": "Python",
  "evidencias": ["p1-l8", "p1-l9"]
}
```

Los identificadores permiten localizar la información que respalda cada dato:

- `p1`: página 1 del documento.
- `l8`: línea 8 de esa página.

Las evidencias deben corresponder a identificadores reales generados durante el procesamiento del CV. No deben inventarse ni asignarse a información que no aparezca en el documento.

### Normalización de información

Python realiza las tareas de normalización después de la extracción:

- Normalizar las fechas laborales al formato `AAAA-MM`.
- Identificar experiencias laborales vigentes.
- Calcular los años de experiencia sin contar dos veces los periodos superpuestos.
- Unificar variantes de nombres de tecnologías cuando realmente representan la misma herramienta.
- Identificar fechas inconsistentes o periodos que requieren revisión.
- Conservar las evidencias asociadas a cada dato.

La información que no aparezca en el CV no debe inferirse ni completarse mediante suposiciones.

### Privacidad y anonimización

La ficha destinada al análisis debe excluir los datos personales protegidos, entre ellos:

- Nombre y apellidos.
- Correo electrónico y teléfono.
- Número de documento.
- Dirección residencial.
- Edad y fecha de nacimiento.
- Género y pronombres.
- Estado civil.
- Nacionalidad.
- Fotografía.

Estos datos no deben utilizarse como criterios para evaluar la idoneidad de un candidato.

---

## 6. `evaluation.json`: evaluación frente a la vacante

### Propósito

Almacena el resultado de la evaluación individual de un candidato frente a los requisitos confirmados de una vacante.

Este contrato permite identificar qué requisitos cumple el candidato, cuáles cumple parcialmente, cuáles no cumple y cuáles no cuentan con información suficiente en su hoja de vida.

La evaluación utiliza la información estructurada de `candidate.json` y los requisitos definidos en `requirements.json`.

El modelo de inteligencia artificial realiza el análisis semántico y proporciona una justificación respaldada por citas del CV. Posteriormente, Python verifica las evidencias y marca si las citas corresponden al documento procesado.

**Importante:** el LLM evalúa cada candidato de manera independiente. No calcula el puntaje final ni compara candidatos entre sí.

### Resultados posibles por requisito

Para requisitos obligatorios y deseables:

| Resultado | Descripción |
|---|---|
| `cumple` | Existe evidencia suficiente de que el candidato satisface el requisito. |
| `equivalente` | El candidato demuestra una experiencia o competencia equivalente, con justificación. |
| `parcial` | La evidencia demuestra un cumplimiento incompleto. |
| `no_cumple` | La evidencia disponible indica que el requisito no se satisface. |
| `sin_informacion` | El CV no contiene información suficiente para determinar el cumplimiento. |

Para requisitos descalificantes:

| Resultado | Descripción |
|---|---|
| `presente` | Se identifica la condición descalificante. |
| `ausente` | No se identifica la condición descalificante en la información evaluada. |
| `sin_informacion` | No existe información suficiente para determinar su presencia o ausencia. |

Una tecnología similar no debe considerarse automáticamente equivalente. Por ejemplo, si una vacante solicita experiencia en AWS y el candidato solo demuestra experiencia en Azure, la evaluación no debe marcar `cumple` por una simple similitud tecnológica.

### Estructura

```json
{
  "evaluacion_id": "EVAL-001",
  "candidato_id": "CAN-001",
  "vacante_id": "VAC-001",
  "version_requisitos": 1,
  "evaluaciones": [
    {
      "requisito_id": "REQ-001",
      "resultado": "cumple",
      "cita": "Desarrollé aplicaciones backend utilizando Python durante tres años.",
      "lineas": ["p1-l8", "p1-l9"],
      "justificacion": "El candidato demuestra experiencia profesional con Python durante el periodo solicitado.",
      "cita_verificada": true
    },
    {
      "requisito_id": "REQ-002",
      "resultado": "parcial",
      "cita": "Desarrollo de servicios y APIs REST.",
      "lineas": ["p1-l10"],
      "justificacion": "Se demuestra experiencia desarrollando APIs, pero no se identifica evidencia específica del uso de FastAPI.",
      "cita_verificada": true
    },
    {
      "requisito_id": "REQ-003",
      "resultado": "sin_informacion",
      "cita": null,
      "lineas": [],
      "justificacion": "El documento no contiene información suficiente para determinar este criterio.",
      "cita_verificada": false
    }
  ],
  "explicacion": {
    "fortalezas": [
      "Experiencia profesional demostrada con Python.",
      "Experiencia en desarrollo de servicios backend."
    ],
    "brechas": [
      "No se demuestra experiencia específica con FastAPI."
    ],
    "aspectos_por_verificar": [
      "Confirmar el uso de FastAPI en proyectos anteriores."
    ]
  },
  "trazabilidad": {
    "modelo": "claude",
    "version_prompt": "1.0"
  }
}
```

*Nota: el ejemplo es ilustrativo. Los identificadores de los requisitos y las líneas deben corresponder a los registros reales de la vacante y al CV procesado.*

### Descripción de los campos principales

| Campo | Tipo | Descripción |
|---|---|---|
| `evaluacion_id` | String | Identificador único de la evaluación. |
| `candidato_id` | String | Identificador del candidato evaluado. |
| `vacante_id` | String | Identificador de la vacante evaluada. |
| `version_requisitos` | Integer | Versión de los requisitos utilizados. |
| `evaluaciones` | Array | Resultados individuales de cada requisito. |
| `requisito_id` | String | Identificador del requisito evaluado. |
| `resultado` | String | Resultado del análisis frente al requisito. |
| `cita` | String o null | Fragmento textual que respalda la evaluación. |
| `lineas` | Array | Identificadores de las líneas que contienen la evidencia. |
| `justificacion` | String | Explicación del resultado asignado. |
| `cita_verificada` | Boolean | Indica si Python verificó la cita contra el documento. |
| `explicacion` | Object | Fortalezas, brechas y aspectos por verificar. |
| `trazabilidad` | Object | Información del modelo y versión del prompt utilizados. |

### Evidencias y verificación

Cada evaluación debe incluir evidencia verificable siempre que exista información que respalde el resultado.

El proceso funciona de la siguiente manera:

1. El LLM analiza el perfil del candidato frente a un requisito.
2. Identifica el fragmento textual que respalda su conclusión.
3. Devuelve la cita y los identificadores de las líneas correspondientes.
4. Python comprueba que la cita exista en el texto original procesado.
5. El sistema actualiza `cita_verificada` según el resultado de la comprobación.

La verificación de las citas es responsabilidad de Python, no del modelo de inteligencia artificial.

Si una cita no puede verificarse, debe conservarse la alerta correspondiente y reducirse el nivel de confianza de la evaluación según las reglas del sistema.

### Explicaciones

El objeto `explicacion` organiza los resultados de forma comprensible para el reclutador:

- **Fortalezas:** requisitos o competencias que cuentan con evidencia favorable.
- **Brechas:** requisitos que presentan cumplimiento parcial o incumplimiento.
- **Aspectos por verificar:** información que requiere aclaración o validación adicional.

Estas explicaciones deben derivarse de los resultados y evidencias de la evaluación, sin inventar experiencia o competencias.

### Validaciones

- El candidato y la vacante deben existir.
- La versión de requisitos debe corresponder a una versión confirmada.
- Cada `requisito_id` debe pertenecer a la vacante evaluada.
- Cada requisito debe evaluarse de acuerdo con su tipo.
- Las referencias de líneas deben existir en el documento procesado.
- Las citas no verificadas deben quedar identificadas.
- No se deben evaluar características personales protegidas.
- El LLM no debe calcular el puntaje global ni el ranking.

---

## 7. `ranking.json`: resultado final

### Propósito

Almacena los resultados finales de los candidatos evaluados frente a una vacante y establece su ordenamiento según el puntaje calculado por Python.

Este contrato consolida la información necesaria para presentar el ranking en la interfaz del sistema, incluyendo:

- Posición del candidato.
- Puntaje obtenido.
- Estado global de cumplimiento.
- Nivel de confianza de la evaluación.
- Recomendación para entrevista.
- Motivo del estado asignado.

A diferencia de `evaluation.json`, que contiene el análisis detallado de cada requisito, `ranking.json` presenta el resultado consolidado del proceso de selección.

**Importante:** el ranking se calcula exclusivamente mediante código Python. El LLM no compara candidatos ni decide el orden final.

### Estructura

```json
{
  "ranking_id": "RANK-001",
  "vacante_id": "VAC-001",
  "version_requisitos": 1,
  "total_candidatos": 3,
  "resultados": [
    {
      "posicion": 1,
      "candidato_id": "CAN-001",
      "evaluacion_id": "EVAL-001",
      "puntaje": 92.0,
      "estado": "cumple",
      "confianza": "alta",
      "recomendado_entrevista": true,
      "motivo_estado": "Cumple los requisitos obligatorios y obtiene un puntaje superior al umbral establecido."
    },
    {
      "posicion": 2,
      "candidato_id": "CAN-002",
      "evaluacion_id": "EVAL-002",
      "puntaje": 76.0,
      "estado": "cumple_parcialmente",
      "confianza": "media",
      "recomendado_entrevista": true,
      "motivo_estado": "Presenta cumplimiento parcial en un requisito obligatorio que requiere verificación."
    },
    {
      "posicion": 3,
      "candidato_id": "CAN-003",
      "evaluacion_id": "EVAL-003",
      "puntaje": 38.0,
      "estado": "no_cumple",
      "confianza": "alta",
      "recomendado_entrevista": false,
      "motivo_estado": "Presenta un requisito obligatorio incumplido."
    }
  ],
  "resumen": {
    "cumple": 1,
    "cumple_parcialmente": 1,
    "no_cumple": 1,
    "recomendados_entrevista": 2
  },
  "trazabilidad": {
    "version_requisitos": 1,
    "criterio_puntaje": "obligatorios_60_deseables_40"
  }
}
```

*Nota: los puntajes y resultados son valores de ejemplo para ilustrar la estructura. No representan resultados reales de candidatos.*

### Descripción de los campos principales

| Campo | Tipo | Descripción |
|---|---|---|
| `ranking_id` | String | Identificador único del ranking generado. |
| `vacante_id` | String | Vacante para la cual se genera el ranking. |
| `version_requisitos` | Integer | Versión de los requisitos utilizados. |
| `total_candidatos` | Integer | Cantidad total de candidatos procesados para la vacante. |
| `resultados` | Array | Lista de resultados individuales ordenados. |
| `posicion` | Integer | Posición del candidato en el ranking. |
| `candidato_id` | String | Identificador del candidato. |
| `evaluacion_id` | String | Identificador de la evaluación que respalda el resultado. |
| `puntaje` | Number | Puntaje calculado, expresado en una escala de 0 a 100. |
| `estado` | String | Estado global de cumplimiento. |
| `confianza` | String | Nivel de confianza de la evaluación. |
| `recomendado_entrevista` | Boolean | Indica si se recomienda considerar al candidato para entrevista. |
| `motivo_estado` | String | Explicación breve del estado asignado. |
| `resumen` | Object | Conteo de candidatos por estado y recomendaciones. |
| `trazabilidad` | Object | Información de los criterios utilizados para calcular el ranking. |

### Cálculo del puntaje

El puntaje se calcula en Python a partir de los resultados verificados de `evaluation.json`.

Los valores asignados a cada resultado son:

| Resultado | Valor |
|---|---:|
| `cumple` | 1.0 |
| `equivalente` | 0.8 |
| `parcial` | 0.5 |
| `no_cumple` | 0.0 |
| `sin_informacion` | 0.0 |

La ponderación inicial es:

- Requisitos obligatorios: 60%.
- Requisitos deseables: 40%.
- Requisitos descalificantes: no suman ni restan puntos; determinan el estado global.

Dentro de cada grupo, el cálculo se realiza mediante la suma ponderada:

\[
P_g = \frac{\sum_{i=1}^{n} peso_i \cdot valor_i}
{\sum_{i=1}^{n} peso_i}
\]

El puntaje final se obtiene combinando ambos grupos:

\[
P = 100 \cdot (0.60P_{obligatorios}+0.40P_{deseables})
\]

La ponderación puede ajustarse para cada vacante, siempre que se conserve la configuración utilizada en el proceso.

### Estado global del candidato

El estado se determina mediante reglas implementadas en Python:

| Estado | Condición |
|---|---|
| `no_cumple` | Existe algún requisito descalificante con resultado `presente` o algún obligatorio con resultado `no_cumple`. |
| `cumple` | Todos los obligatorios tienen resultado `cumple` o `equivalente`, no existe un descalificante presente y el puntaje es igual o superior a 70. |
| `cumple_parcialmente` | Se presenta cualquier otra condición que no corresponda a los dos estados anteriores. |

Los candidatos con estado `no_cumple` permanecen visibles en el sistema para permitir su revisión humana.

### Nivel de confianza

El nivel de confianza representa qué tan confiable es la evaluación realizada, no la probabilidad de éxito del candidato.

Se consideran los siguientes factores:

- **Cobertura de información:** cantidad de requisitos que cuentan con información suficiente.
- **Citas verificadas:** correspondencia entre las citas y el contenido del CV.
- **Calidad de lectura:** calidad de extracción del documento y uso de OCR.
- **Inconsistencias:** fechas imposibles, periodos superpuestos u otros datos que requieren revisión.
- **Ambigüedad:** presencia de resultados parciales o información poco clara.

Reglas iniciales:

| Nivel | Condición |
|---|---|
| `alta` | Cobertura igual o superior al 80% y todas las citas verificadas. |
| `baja` | Cobertura inferior al 50% o citas obligatorias sin verificar. |
| `media` | Casos restantes que no cumplen las condiciones de confianza alta o baja. |

### Recomendación de entrevista

La recomendación se calcula en Python a partir del estado y el puntaje:

- **Recomendado:** candidato con estado `cumple`, o con estado `cumple_parcialmente` y puntaje alto cuando existen dudas que pueden aclararse durante una entrevista.
- **No recomendado:** candidato con estado `no_cumple`.

La recomendación es una ayuda para el equipo de selección y no sustituye la decisión final del reclutador.

### Ordenamiento y validaciones

- El ranking debe incluir todos los candidatos procesados y evaluados para la vacante.
- La posición debe corresponder al orden calculado a partir del puntaje.
- Cada resultado debe estar asociado a una evaluación existente.
- Todos los resultados deben utilizar la misma versión de requisitos dentro de un ranking.
- Los puntajes deben estar dentro del rango de 0 a 100.
- Los estados y niveles de confianza deben pertenecer a los valores permitidos.
- La recomendación debe ser coherente con las reglas definidas.
- Los candidatos no deben desaparecer del ranking por tener un resultado desfavorable.

---

## 8. Relación entre los cinco contratos

| Contrato | Se relaciona con | Relación |
|---|---|---|
| `vacancy.json` | `requirements.json` | Una vacante puede tener diferentes versiones de requisitos. |
| `requirements.json` | `vacancy.json` | Cada conjunto de requisitos pertenece a una vacante. |
| `candidate.json` | Documento procesado | Cada ficha se relaciona con el CV de origen. |
| `evaluation.json` | `candidate.json` | Evalúa la información estructurada del candidato. |
| `evaluation.json` | `requirements.json` | Compara el perfil con los requisitos confirmados. |
| `ranking.json` | `evaluation.json` | Consolida los resultados de las evaluaciones individuales. |
| `ranking.json` | `vacancy.json` | Presenta el orden de los candidatos para una vacante específica. |

La separación permite que una misma ficha de candidato pueda utilizarse en diferentes procesos de selección sin volver a extraer la información del CV.

Asimismo, una evaluación conserva la versión de requisitos utilizada, lo que permite identificar los criterios con los que se obtuvo cada resultado.

## 9. Flujo de generación de los JSON

### 9.1 Registro de la vacante y sus requisitos

1. El reclutador registra la información general de la vacante.
2. El sistema almacena los datos en `vacancy.json`.
3. A partir de la descripción, el modelo de IA propone los requisitos.
4. Python valida la estructura y los tipos de datos.
5. El reclutador revisa y confirma los requisitos.
6. El sistema conserva la versión confirmada en `requirements.json`.

### 9.2 Procesamiento del candidato

1. El sistema recibe el CV en PDF o DOCX.
2. Se realiza la extracción de texto y la identificación de líneas.
3. Se aplica el proceso de anonimización.
4. El texto anonimizado se envía al modelo de IA.
5. El modelo identifica experiencia, formación, certificaciones, idiomas y competencias.
6. Python normaliza y valida la información.
7. Se genera la ficha estructurada del candidato en `candidate.json`.

### 9.3 Evaluación del candidato

1. Se recupera la ficha del candidato.
2. Se consultan los requisitos confirmados de la vacante.
3. El LLM evalúa cada requisito de manera independiente.
4. Se generan resultados, citas, líneas y justificaciones.
5. Python verifica las citas contra el texto del documento.
6. Se construye `evaluation.json` con los resultados y sus explicaciones.

### 9.4 Generación del ranking

1. Python recibe las evaluaciones verificadas.
2. Calcula el puntaje de cada candidato.
3. Determina el estado global de cumplimiento.
4. Calcula el nivel de confianza.
5. Establece la recomendación para entrevista.
6. Ordena todos los candidatos.
7. Genera `ranking.json`.

---

## 10. Tecnologías utilizadas

| Tecnología | Función |
|---|---|
| Python | Procesamiento, normalización, verificación y cálculo de resultados. |
| Pydantic | Definición de modelos y validación de estructuras JSON. |
| FastAPI | Integración de los contratos con los servicios del backend. |
| Claude API | Extracción de información, propuesta de requisitos y evaluación individual. |
| PyMuPDF | Extracción de texto y líneas de documentos PDF. |
| Presidio y Regex | Anonimización de información personal. |
| RapidFuzz | Verificación aproximada de citas y normalización de información textual. |

## 11. Consideraciones de seguridad y trazabilidad

- Los JSON deben cumplir sus respectivos modelos de validación.
- Los identificadores deben mantenerse consistentes entre los documentos relacionados.
- Los requisitos generados por IA requieren confirmación humana.
- Las evaluaciones deben conservar las evidencias de cada conclusión.
- Los datos ausentes no deben inferirse.
- Los datos personales protegidos no deben utilizarse en la evaluación.
- Las modificaciones en los requisitos deben conservar su versionamiento.
- Las evaluaciones deben permitir rastrear la versión de requisitos, el modelo y el prompt utilizados.
- El puntaje no representa una probabilidad de éxito laboral.
- La decisión final de contratación corresponde al equipo de selección.

## 12. Alcance de los contratos

Los cinco contratos documentan las principales estructuras de información del pipeline de AI Talent Scout:

| Etapa | Contrato | Responsable principal |
|---|---|---|
| Registro de vacante | `vacancy.json` | Backend / reclutador |
| Definición de requisitos | `requirements.json` | IA + reclutador + Python |
| Extracción del perfil | `candidate.json` | IA + Python |
| Evaluación por requisito | `evaluation.json` | IA + verificación en Python |
| Puntaje y ranking | `ranking.json` | Python |

El flujo mantiene una separación clara de responsabilidades: la inteligencia artificial extrae y analiza información, mientras que Python valida evidencias, calcula resultados y determina el orden final de los candidatos.

### Funcionalidad adicional futura

El proyecto contempla como funcionalidad opcional un agente entrevistador que realiza entre 5 y 10 preguntas dinámicas, evalúa las respuestas, detecta inconsistencias y genera una recomendación de avance.

Esta funcionalidad no forma parte de los cinco contratos principales descritos en este documento.

---

**AI Talent Scout**  
*Sistema de selección de talento asistido por inteligencia artificial.*