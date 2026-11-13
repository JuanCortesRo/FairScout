// Estado global: el backend es la fuente de verdad; localStorage conserva solo preferencias de interfaz.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { rankear } from '@/lib/scoring';
import { ARCHIVOS_CON_ERROR, VACANTE_EJEMPLO, DESCRIPCION_EJEMPLO, generarLoteDemo } from '@/data/demo';
import {
  ErrorAPI,
  eliminarVacante as eliminarVacanteApi,
  evaluarLote,
  listarCVs,
  listarEvaluaciones,
  listarVacantes,
  obtenerCandidato as obtenerCandidatoApi,
  obtenerEvaluacion,
  obtenerRanking,
  salud,
  subirCVs,
} from '@/api';
import { ALERTAS } from '@/lib/constantes';

const CLAVE = 'fairscout:v2';
const Ctx = createContext(null);

const INICIAL = {
  origen: null,             // 'backend' | 'demo'
  vacante: null,            // { id, titulo, descripcion, requisitos, version, confirmada_en }; solo completa
  vacanteIdGuardada: null,  // vacante abierta en la sesión anterior, mientras llega del servidor
  vacanteDesactivada: false,
  pesos: { obligatorios: 60 },
  candidatos: [],           // solo se guarda en modo demo; con backend se pide a la API
  archivos: [],             // estado de cada carga: { id, nombre, tamano, estado, error, candidato_id }
  correcciones: {},         // { [candidato_id]: { [requisito_id]: { resultado, motivo } } }
  modoCiego: true,
  auditoria: [],            // { fecha, accion, detalle }
  seleccion: [],            // ids para el comparador
  entrevistas: {},          // { [candidato_id]: estado de la entrevista }
  lote: null,               // { inicio, fin, total }
};

function cargar() {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return INICIAL;
    const preferencias = JSON.parse(raw);
    return {
      ...INICIAL,
      modoCiego: preferencias.modoCiego ?? INICIAL.modoCiego,
      pesos: preferencias.pesos ?? INICIAL.pesos,
      seleccion: preferencias.seleccion ?? INICIAL.seleccion,
      vacanteIdGuardada: preferencias.vacanteId ?? null,
      vacanteDesactivada: preferencias.vacanteDesactivada ?? false,
    };
  } catch {
    return INICIAL;
  }
}

// Lo que pertenece a una vacante y se descarta al cambiar de vacante.
const ESTADO_POR_VACANTE = { archivos: [], seleccion: [], correcciones: {}, entrevistas: {}, lote: null };
const SERVIDOR_VACIO = { candidatos: [], ranking: [], enRevision: [], cargando: false, error: null, erroresEvaluacion: [] };

const EXTENSIONES = ['.pdf', '.docx'];
const MAX_BYTES = 10 * 1024 * 1024;
const CARGAS_EN_PARALELO = 3;

/** Mensaje entendible para los errores que devuelve POST /cvs. */
function mensajeError(texto) {
  if (!texto) return 'No se pudo procesar el CV.';
  if (texto === 'documento_sin_texto_legible') return 'El documento no tiene texto legible (¿es una imagen escaneada sin OCR?).';
  if (texto.startsWith('extraccion_llm:')) return `La IA no pudo extraer los datos del CV: ${texto.slice(15).trim()}`;
  return texto;
}

const motivoRevision = (alertas) =>
  alertas.map((a) => ALERTAS[a]?.texto ?? a).join(' · ') || 'Requiere revisión humana antes de enviarse a la IA.';

/** CV de la API (+ su evaluación vigente) → candidato que usan las vistas. */
function desdeApi(cv, evaluacion) {
  return {
    candidato_id: cv.id,
    alias: cv.id.slice(0, 6).toUpperCase(),
    nombre_archivo: cv.nombre_archivo,
    estado_documento: cv.estado,            // processed | needs_review
    alertas: cv.alertas ?? [],
    lineas: cv.lineas ?? [],
    ficha: cv.ficha ?? null,
    evaluaciones: evaluacion?.evaluaciones ?? null,
    explicacion: evaluacion?.explicacion ?? null,
    trazabilidad: evaluacion?.trazabilidad ?? null,
  };
}

function desdeVacante(vacante) {
  return {
    ...vacante,
    version: vacante.version_requisitos,
    confirmada_en: null,
  };
}

function desdeRanking(respuesta, candidatos, requisitos) {
  const porId = new Map(candidatos.map((c) => [c.candidato_id, c]));
  return respuesta.candidatos.flatMap((resultado, indice) => {
    const candidato = porId.get(resultado.candidato_id);
    if (!candidato) return [];
    const detalle = respuesta.detalles?.[resultado.candidato_id] ?? {};
    const porRequisito = new Map((candidato.evaluaciones ?? []).map((e) => [e.requisito_id, e]));
    const filas = requisitos.map((req) => ({
      req,
      ev: porRequisito.get(req.id) ?? {
        requisito_id: req.id,
        resultado: 'sin_informacion',
        cita: null,
        lineas: [],
        justificacion: 'No evaluado.',
        cita_verificada: false,
      },
    }));
    return [{
      candidato,
      resultado: {
        ...resultado,
        detalle: {
          ...detalle,
          puntajeObligatorios: detalle.puntaje_obligatorios,
          puntajeDeseables: detalle.puntaje_deseables,
          motivosConfianza: detalle.motivos_confianza ?? [],
          citasSinVerificar: detalle.citas_sin_verificar ?? 0,
          categorias: detalle.categorias ?? {},
          filas,
        },
      },
      posicion: indice + 1,
    }];
  });
}

/** Aplica las correcciones humanas sobre la evaluación de la IA. */
function conCorrecciones(c, correcciones) {
  const propias = correcciones[c.candidato_id];
  if (!propias || !c.evaluaciones) return c;
  return {
    ...c,
    evaluaciones: c.evaluaciones.map((e) => {
      const corr = propias[e.requisito_id];
      if (!corr) return e;
      return {
        ...e,
        resultado: corr.resultado,
        resultado_ia: e.resultado,
        corregido_por_humano: true,
        justificacion: corr.motivo ? `${corr.motivo} (corrección humana)` : e.justificacion,
      };
    }),
  };
}

export function AppProvider({ children }) {
  const [estado, setEstado] = useState(cargar);
  const [backend, setBackend] = useState('verificando'); // verificando | conectado | desconectado
  const [servidor, setServidor] = useState(SERVIDOR_VACIO);
  const [vacantes, setVacantes] = useState([]);
  const [evaluando, setEvaluando] = useState(false);
  const [erroresEvaluacion, setErroresEvaluacion] = useState([]);
  const [avisos, setAvisos] = useState([]);
  const archivosRef = useRef(new Map());   // File originales para reintentar en esta sesión
  const ref = useRef(estado);
  ref.current = estado;
  const servidorRef = useRef([]);
  servidorRef.current = servidor.candidatos;
  const rankingSeq = useRef(0);

  const enDemo = estado.origen === 'demo';

  useEffect(() => {
    const preferencias = {
      modoCiego: estado.modoCiego,
      pesos: estado.pesos,
      seleccion: estado.seleccion,
      vacanteId: estado.origen === 'demo' ? null : estado.vacante?.id ?? estado.vacanteIdGuardada ?? null,
      vacanteDesactivada: estado.vacanteDesactivada,
    };
    try { localStorage.setItem(CLAVE, JSON.stringify(preferencias)); } catch { /* Las preferencias son opcionales. */ }
  }, [estado.modoCiego, estado.pesos, estado.seleccion, estado.origen, estado.vacante?.id, estado.vacanteIdGuardada, estado.vacanteDesactivada]);

  const set = useCallback((fn) => setEstado((s) => ({ ...s, ...fn(s) })), []);

  const notificar = useCallback((texto, tipo = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 5000);
  }, []);

  const registrar = useCallback((accion, detalle) => {
    set((s) => ({ auditoria: [{ fecha: new Date().toISOString(), accion, detalle }, ...s.auditoria].slice(0, 200) }));
  }, [set]);

  // ── Datos del servidor ─────────────────────────────────────────────────────
  const refrescar = useCallback(async (vacanteIdPreferida) => {
    if (ref.current.origen === 'demo') return;
    const solicitud = ++rankingSeq.current;
    setServidor((s) => ({ ...s, cargando: true, error: null }));
    try {
      const lista = await listarVacantes();
      if (solicitud !== rankingSeq.current) return;
      setVacantes(lista);
      const idPreferido = vacanteIdPreferida ?? ref.current.vacante?.id ?? ref.current.vacanteIdGuardada;
      const vacanteRespuesta = idPreferido
        ? lista.find((v) => v.id === idPreferido) ?? lista[0] ?? null
        : ref.current.vacanteDesactivada ? null : lista[0] ?? null;
      const vacante = vacanteRespuesta ? desdeVacante(vacanteRespuesta) : null;
      const [cvs, evaluaciones, respuestaRanking] = await Promise.all([
        vacante?.id ? listarCVs(vacante.id) : Promise.resolve({ archivos: [] }),
        vacante?.id ? listarEvaluaciones(vacante.id) : Promise.resolve([]),
        vacante?.id ? obtenerRanking(vacante.id, ref.current.pesos.obligatorios) : Promise.resolve({ candidatos: [], en_revision: [] }),
      ]);
      if (solicitud !== rankingSeq.current) return;
      const porCandidato = new Map(evaluaciones.map((e) => [e.candidato_id, e]));
      const candidatos = cvs.archivos.map((cv) => desdeApi(cv, porCandidato.get(cv.id)));
      const ranking = desdeRanking(respuestaRanking, candidatos, vacante?.requisitos ?? []);
      setEstado((s) => ({ ...s, origen: 'backend', vacante, vacanteIdGuardada: null, vacanteDesactivada: !vacante }));
      setServidor({
        candidatos,
        ranking,
        enRevision: respuestaRanking.en_revision ?? [],
        cargando: false,
        error: null,
        erroresEvaluacion: [],
      });
      set((s) => ({
        archivos: cvs.archivos.map((cv) => ({
          id: cv.id,
          candidato_id: cv.id,
          nombre: cv.nombre_archivo,
          tamano: null,
          estado: cv.estado === 'needs_review' ? 'revision' : cv.estado === 'failed' ? 'error' : 'listo',
          alertas: cv.alertas ?? [],
          error: cv.estado === 'needs_review' ? motivoRevision(cv.alertas ?? []) : null,
        })),
      }));
    } catch (e) {
      if (solicitud !== rankingSeq.current) return;
      setServidor((s) => ({ ...s, cargando: false, error: e.message }));
    }
  }, [set]);

  const cargarCandidato = useCallback(async (id) => {
    const vacanteId = ref.current.vacante?.id;
    const [cv, evaluacion] = await Promise.all([
      obtenerCandidatoApi(id),
      vacanteId
        ? obtenerEvaluacion(vacanteId, id).catch((e) => {
          if (e instanceof ErrorAPI && e.status === 404) return null;
          throw e;
        })
        : Promise.resolve(null),
    ]);
    const candidato = desdeApi(cv, evaluacion);
    setServidor((s) => ({
      ...s,
      candidatos: [...s.candidatos.filter((c) => c.candidato_id !== id), candidato],
      ranking: s.ranking.map((fila) => (
        fila.candidato.candidato_id === id ? { ...fila, candidato } : fila
      )),
    }));
    return candidato;
  }, []);

  useEffect(() => {
    let vivo = true;
    salud().then((ok) => {
      if (!vivo) return;
      setBackend(ok ? 'conectado' : 'desconectado');
      if (ok && ref.current.origen !== 'demo') {
        if (!ref.current.origen) set(() => ({ origen: 'backend' }));
        refrescar();
      }
    });
    return () => { vivo = false; };
  }, [refrescar, set]);

  /** Evalúa con la IA los CVs procesados que no tienen evaluación vigente (o todos, si `reevaluar`). */
  const evaluar = useCallback(async ({ reevaluar = false, vacanteId: vacanteIdPreferida } = {}) => {
    const vacanteId = vacanteIdPreferida ?? ref.current.vacante?.id;
    if (!vacanteId || ref.current.origen === 'demo') return;
    setEvaluando(true);
    setErroresEvaluacion([]);
    try {
      const r = await evaluarLote(vacanteId, reevaluar);
      setErroresEvaluacion(r.errores);
      if (r.evaluados) registrar('Evaluación con IA', `${r.evaluados} CV(s) evaluados contra los requisitos v${ref.current.vacante.version}`);
      if (r.errores.length) {
        notificar(`${r.errores.length} CV(s) no se pudieron evaluar. Revisa el detalle en el ranking.`, 'error');
        registrar('Error de evaluación', r.errores.map((e) => `${e.candidato_id.slice(0, 6).toUpperCase()}: ${e.detalle}`).join(' · '));
      } else if (r.evaluados) {
        notificar(`${r.evaluados} CV(s) evaluados.`, 'ok');
      }
    } catch (e) {
      notificar(`No se pudo evaluar: ${e.message}`, 'error');
    } finally {
      setEvaluando(false);
      await refrescar();
    }
  }, [refrescar, registrar, notificar]);

  // ── Vacante ────────────────────────────────────────────────────────────────
  const confirmarVacante = useCallback((vacante) => {
    const anterior = ref.current.vacante;
    const version = vacante.version_requisitos
      ?? (anterior?.id === vacante.id ? anterior.version + 1 : 1);
    // Requisitos nuevos ⇒ evaluaciones nuevas: las correcciones hechas sobre la versión anterior ya no aplican.
    set(() => ({
      vacante: { ...vacante, version, confirmada_en: new Date().toISOString() },
      vacanteDesactivada: false,
      correcciones: {},
    }));
    registrar('Requisitos confirmados', `Versión ${version} · ${vacante.requisitos.length} requisitos para "${vacante.titulo}"`);
    setTimeout(() => {
      void (async () => {
        await refrescar(vacante.id);
        await evaluar({ vacanteId: vacante.id });
      })();
    }, 0);
  }, [set, registrar, refrescar, evaluar]);

  const setPesos = useCallback((pesos) => {
    set(() => ({ pesos }));
    const vacanteId = ref.current.vacante?.id;
    if (!vacanteId || ref.current.origen === 'demo') return;
    const solicitud = ++rankingSeq.current;
    obtenerRanking(vacanteId, pesos.obligatorios).then((respuesta) => {
      if (solicitud !== rankingSeq.current) return;
      setServidor((s) => ({
        ...s,
        ranking: desdeRanking(respuesta, servidorRef.current, ref.current.vacante?.requisitos ?? []),
        enRevision: respuesta.en_revision ?? [],
        error: null,
      }));
    }).catch((e) => {
      if (solicitud !== rankingSeq.current) return;
      setServidor((s) => ({ ...s, error: e.message }));
    });
  }, [set]);

  // ── Carga de archivos ──────────────────────────────────────────────────────
  const actualizarArchivo = useCallback((id, cambios) => {
    set((s) => ({ archivos: s.archivos.map((a) => (a.id === id ? { ...a, ...cambios } : a)) }));
  }, [set]);

  const subirUno = useCallback(async (archivo, file) => {
    actualizarArchivo(archivo.id, { estado: 'procesando', error: null });
    try {
      const { archivos } = await subirCVs(ref.current.vacante.id, [file]);
      const r = archivos[0];
      if (!r || r.estado === 'failed') {
        // Un documento ilegible falla igual al reintentar; un fallo de la IA sí puede resolverse reintentando.
        const causa = r?.alertas?.[0];
        actualizarArchivo(archivo.id, {
          estado: 'error',
          error: mensajeError(causa),
          candidato_id: null,
          alertas: r?.alertas ?? [],
          reintentable: !!causa?.startsWith('extraccion_llm'),
        });
      } else if (r.estado === 'needs_review') {
        actualizarArchivo(archivo.id, { estado: 'revision', error: motivoRevision(r.alertas ?? []), candidato_id: r.id, alertas: r.alertas ?? [] });
      } else {
        actualizarArchivo(archivo.id, { estado: 'listo', candidato_id: r.id, alertas: r.alertas ?? [] });
      }
    } catch (e) {
      actualizarArchivo(archivo.id, { estado: 'error', error: e.message });
    }
  }, [actualizarArchivo]);

  const procesarCola = useCallback(async (lista) => {
    const cola = [...lista];
    await Promise.all(Array.from({ length: Math.min(CARGAS_EN_PARALELO, cola.length) }, async () => {
      while (cola.length) {
        const a = cola.shift();
        await subirUno(a, archivosRef.current.get(a.id));
      }
    }));
    set((s) => ({ lote: s.lote ? { ...s.lote, fin: Date.now() } : null }));
    await refrescar();
    if (ref.current.vacante?.id) await evaluar();
  }, [subirUno, set, refrescar, evaluar]);

  /** Valida y sube archivos al backend. Devuelve los rechazados por formato. */
  const agregarArchivos = useCallback((files) => {
    if (ref.current.origen === 'demo') {
      notificar('Estás viendo datos de ejemplo. Sal de la demo para cargar CVs reales.', 'error');
      return [];
    }
    if (backend !== 'conectado') {
      notificar('El servidor no está disponible. Inícialo para procesar los CVs.', 'error');
      return [];
    }
    if (!ref.current.vacante?.id) {
      notificar('Primero crea o abre una vacante: cada CV se carga dentro de una vacante.', 'error');
      return [];
    }
    const rechazados = [];
    const nuevos = [];
    const existentes = ref.current.archivos;
    for (const f of files) {
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
      if (!EXTENSIONES.includes(ext)) { rechazados.push(f.name); continue; }
      const base = { id: Math.random().toString(36).slice(2), nombre: f.name, tamano: f.size };
      if (f.size === 0) nuevos.push({ ...base, estado: 'error', error: 'El archivo está vacío.', reintentable: false });
      else if (f.size > MAX_BYTES) nuevos.push({ ...base, estado: 'error', error: 'El archivo supera el máximo de 10 MB.', reintentable: false });
      else if ([...existentes, ...nuevos].some((a) => a.nombre === f.name && a.tamano === f.size && a.estado !== 'error')) {
        nuevos.push({ ...base, estado: 'duplicado', error: 'Ya se cargó un archivo idéntico; no se volverá a procesar.' });
      } else {
        archivosRef.current.set(base.id, f);
        nuevos.push({ ...base, estado: 'pendiente' });
      }
    }
    if (nuevos.length) {
      set((s) => ({ archivos: [...nuevos, ...s.archivos], lote: { inicio: Date.now(), fin: null, total: nuevos.length } }));
      registrar('Carga de CVs', `${nuevos.length} archivo(s) recibidos`);
      procesarCola(nuevos.filter((a) => a.estado === 'pendiente'));
    }
    return rechazados;
  }, [backend, set, registrar, procesarCola, notificar]);

  const reintentar = useCallback((id) => {
    const a = ref.current.archivos.find((x) => x.id === id);
    if (!a) return;
    if (!archivosRef.current.has(id)) {
      actualizarArchivo(id, { error: 'Vuelve a seleccionar el archivo para reintentarlo.', reintentable: false });
      return;
    }
    procesarCola([a]);
  }, [procesarCola, actualizarArchivo]);

  const quitarArchivo = useCallback((id) => {
    archivosRef.current.delete(id);
    set((s) => ({ archivos: s.archivos.filter((x) => x.id !== id) }));
  }, [set]);

  // ── Varias vacantes ────────────────────────────────────────────────────────
  /** Abre una vacante guardada: los CVs, el ranking y las entrevistas pasan a ser los de esa vacante. */
  const abrirVacante = useCallback((vacanteApi) => {
    archivosRef.current.clear();
    setEstado((s) => ({
      ...s,
      ...ESTADO_POR_VACANTE,
      origen: 'backend',
      vacante: desdeVacante(vacanteApi),
      vacanteDesactivada: false,
      candidatos: [],
    }));
    setServidor(SERVIDOR_VACIO);
    setErroresEvaluacion([]);
    setTimeout(() => refrescar(vacanteApi.id), 0);
  }, [refrescar]);

  /** Deja el formulario listo para crear otra vacante; las existentes siguen en el servidor. */
  const nuevaVacante = useCallback(() => {
    archivosRef.current.clear();
    setEstado((s) => ({
      ...s,
      ...ESTADO_POR_VACANTE,
      origen: backend === 'conectado' ? 'backend' : s.origen,
      vacante: null,
      vacanteIdGuardada: null,
      vacanteDesactivada: true,
      candidatos: [],
    }));
    setServidor(SERVIDOR_VACIO);
    setErroresEvaluacion([]);
  }, [backend]);

  /** Borra en el servidor la vacante con sus CVs, evaluaciones y entrevistas. */
  const eliminarVacante = useCallback(async (vacanteApi) => {
    try {
      await eliminarVacanteApi(vacanteApi.id);
    } catch (e) {
      notificar(`No se pudo eliminar la vacante: ${e.message}`, 'error');
      return false;
    }
    registrar('Vacante eliminada', `"${vacanteApi.titulo}" con sus CVs, evaluaciones y entrevistas`);
    if (ref.current.vacante?.id === vacanteApi.id) nuevaVacante();
    notificar(`Se eliminó la vacante "${vacanteApi.titulo}".`, 'ok');
    await refrescar();
    return true;
  }, [nuevaVacante, refrescar, registrar, notificar]);

  // ── Demo ───────────────────────────────────────────────────────────────────
  const cargarDemo = useCallback(() => {
    const candidatos = generarLoteDemo(60);
    const archivos = [
      ...ARCHIVOS_CON_ERROR.map((a, i) => ({ ...a, id: `err${i}`, reintentable: false })),
      ...candidatos.map((c) => ({ id: `f${c.candidato_id}`, nombre: c.nombre_archivo, tamano: 80000, estado: 'listo', candidato_id: c.candidato_id })),
    ];
    const ahora = Date.now();
    setEstado((s) => ({
      ...INICIAL,
      origen: 'demo',
      modoCiego: s.modoCiego,
      vacanteDesactivada: false,
      vacante: {
        ...VACANTE_EJEMPLO,
        descripcion: DESCRIPCION_EJEMPLO,
        version: 1,
        requisitos_confirmados: true,
        confirmada_en: new Date().toISOString(),
      },
      candidatos,
      archivos,
      lote: { inicio: ahora - 6 * 60 * 1000 - 42000, fin: ahora, total: archivos.length },
      auditoria: [
        { fecha: new Date().toISOString(), accion: 'Datos de ejemplo cargados', detalle: `${candidatos.length} CVs procesados y 3 archivos con error` },
        { fecha: new Date(ahora - 60000).toISOString(), accion: 'Requisitos confirmados', detalle: 'Versión 1 · 9 requisitos' },
        { fecha: new Date(ahora - 120000).toISOString(), accion: 'Requisito bloqueado', detalle: '"Menor de 35 años" usa un dato protegido (edad)' },
      ],
    }));
    notificar('Datos de ejemplo cargados: 60 CVs evaluados.', 'ok');
  }, [notificar]);

  /** Vuelve a un estado limpio. Con backend, los CVs y evaluaciones siguen guardados en el servidor. */
  const reiniciar = useCallback(() => {
    archivosRef.current.clear();
    setEstado((s) => ({
      ...INICIAL,
      origen: backend === 'conectado' ? 'backend' : null,
      modoCiego: s.modoCiego,
      vacanteDesactivada: backend === 'conectado',
    }));
    setServidor(SERVIDOR_VACIO);
    if (backend === 'conectado') setTimeout(() => refrescar(), 0);
  }, [backend, refrescar]);

  // ── Otras acciones ─────────────────────────────────────────────────────────
  const toggleCiego = useCallback(() => set((s) => ({ modoCiego: !s.modoCiego })), [set]);

  const toggleSeleccion = useCallback((id) => {
    set((s) => {
      if (s.seleccion.includes(id)) return { seleccion: s.seleccion.filter((x) => x !== id) };
      if (s.seleccion.length >= 3) return { seleccion: [...s.seleccion.slice(1), id] };
      return { seleccion: [...s.seleccion, id] };
    });
  }, [set]);

  const guardarEntrevista = useCallback((id, datos) => {
    set((s) => ({ entrevistas: { ...s.entrevistas, [id]: datos } }));
  }, [set]);

  // ── Datos derivados ────────────────────────────────────────────────────────

  const todos = useMemo(() => {
    const base = enDemo ? estado.candidatos : servidor.candidatos;
    return base.map((c) => conCorrecciones(c, estado.correcciones));
  }, [enDemo, estado.candidatos, servidor.candidatos, estado.correcciones]);

  /** Corrección humana de un resultado: queda registrada en la auditoría (sección 12, trazabilidad). */
  const corregirEvaluacion = useCallback((candidatoId, requisitoId, resultado, motivo) => {
    if (!enDemo) {
      notificar('Las correcciones humanas aún no se pueden guardar en el servidor.', 'error');
      return;
    }
    const c = todos.find((x) => x.candidato_id === candidatoId);
    const ev = c?.evaluaciones?.find((e) => e.requisito_id === requisitoId);
    const anterior = ev?.resultado_ia ?? ev?.resultado;
    set((s) => ({
      correcciones: { ...s.correcciones, [candidatoId]: { ...s.correcciones[candidatoId], [requisitoId]: { resultado, motivo } } },
    }));
    registrar('Corrección humana', `Candidato ${c?.alias ?? candidatoId} · ${requisitoId}: ${anterior ?? '—'} → ${resultado}${motivo ? ` · "${motivo}"` : ''}`);
  }, [enDemo, todos, set, registrar, notificar]);

  const evaluados = useMemo(() => todos.filter((c) => c.evaluaciones), [todos]);
  const pendientes = useMemo(() => todos.filter((c) => !c.evaluaciones && c.estado_documento === 'processed'), [todos]);
  const enRevision = useMemo(() => todos.filter((c) => c.estado_documento === 'needs_review'), [todos]);

  const ranking = enDemo ? rankear(evaluados, estado.vacante?.requisitos ?? [], estado.pesos) : servidor.ranking;

  const trazabilidad = useMemo(() => evaluados.find((c) => c.trazabilidad)?.trazabilidad ?? null, [evaluados]);

  const nombreVisible = useCallback((c) => {
    if (!c) return '';
    const alias = c.alias ?? c.candidato_id;
    if (estado.modoCiego) return `Candidato ${alias}`;
    return c.nombre_real ? `${c.nombre_real} · ${alias}` : `${c.nombre_archivo} · ${alias}`;
  }, [estado.modoCiego]);

  const valor = {
    ...estado,
    candidatos: todos, vacantes, backend, enDemo, avisos, ranking, pendientes, enRevision, trazabilidad, evaluando, erroresEvaluacion,
    cargandoServidor: servidor.cargando, errorServidor: servidor.error,
    confirmarVacante, abrirVacante, nuevaVacante, eliminarVacante, setPesos, agregarArchivos, reintentar, quitarArchivo, evaluar, refrescar, cargarCandidato,
    cargarDemo, reiniciar, toggleCiego, toggleSeleccion, guardarEntrevista, registrar, notificar, nombreVisible, corregirEvaluacion,
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useApp() {
  return useContext(Ctx);
}
