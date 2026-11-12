// Estado global de la app. El backend procesa archivos reales; el modo demo se
// conserva cuando la API no está disponible.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { rankear } from '@/lib/scoring';
import { ARCHIVOS_CON_ERROR, VACANTE_EJEMPLO, DESCRIPCION_EJEMPLO, crearCandidato, generarLoteDemo, hashTexto } from '@/data/demo';
import { borrarVacante, obtenerCandidato, obtenerEvaluacion, obtenerRanking, salud, subirCVs } from '@/api';

const CLAVE = 'fairscout:v1';
const Ctx = createContext(null);

const INICIAL = {
  vacante: null,            // { titulo, descripcion, requisitos, version, confirmada_en }
  pesos: { obligatorios: 60 },
  candidatos: [],
  archivos: [],             // { id, nombre, tamano, estado, error, candidato_id, intentos }
  modoCiego: true,
  auditoria: [],            // { fecha, accion, detalle }
  seleccion: [],            // ids para el comparador
  entrevistas: {},          // { [candidato_id]: { mensajes, terminada, resumen } }
  lote: null,               // { inicio, fin, total }
};

function cargar() {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return INICIAL;
    const s = { ...INICIAL, ...JSON.parse(raw) };
    // Un procesamiento interrumpido por recargar la página queda en error con opción de reintento.
    s.archivos = s.archivos.map((a) => (['pendiente', ...PASOS].includes(a.estado)
      ? { ...a, estado: 'error', error: 'El procesamiento se interrumpió. Puedes reintentar.' }
      : a));
    return s;
  } catch {
    return INICIAL;
  }
}

const EXTENSIONES = ['.pdf', '.docx'];
const MAX_BYTES = 10 * 1024 * 1024;
const PASOS = ['leyendo', 'anonimizando', 'extrayendo', 'evaluando'];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export function AppProvider({ children }) {
  const [estado, setEstado] = useState(cargar);
  const [backend, setBackend] = useState('verificando'); // verificando | conectado | demo
  const [avisos, setAvisos] = useState([]);
  const filesRef = useRef(new Map());
  const ref = useRef(estado);
  ref.current = estado;

  useEffect(() => {
    try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch { /* sin almacenamiento: la app sigue funcionando */ }
  }, [estado]);

  useEffect(() => {
    let vivo = true;
    salud().then((ok) => {
      if (!vivo) return;
      setBackend(ok ? 'conectado' : 'demo');
      setEstado((s) => {
        const idsDemo = new Set(
          s.candidatos
            .filter((c) => /^\d+$/.test(String(c.candidato_id)))
            .map((c) => String(c.candidato_id)),
        );
        if (!idsDemo.size) return s;
        return {
          ...s,
          candidatos: s.candidatos.filter((c) => !idsDemo.has(String(c.candidato_id))),
          archivos: s.archivos.filter((a) => !idsDemo.has(String(a.candidato_id ?? ''))),
        };
      });
    });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (backend !== 'conectado' || !estado.vacante?.id) return;
    let activo = true;

    const sincronizarRankingReal = async () => {
      try {
        const rankingReal = await obtenerRanking(estado.vacante.id, estado.pesos.obligatorios);
        const ids = Array.from(new Set([
          ...rankingReal.candidatos.map((c) => c.candidato_id),
          ...rankingReal.en_revision.map((c) => c.candidato_id),
        ]));

        const candidatos = await Promise.all(ids.map(async (id) => {
          try {
            const candidato = await obtenerCandidato(id);
            const evaluacion = await obtenerEvaluacion(id, estado.vacante.id).catch(() => null);
            return {
              candidato_id: candidato.id,
              nombre_real: candidato.nombre_archivo,
              nombre_archivo: candidato.nombre_archivo,
              formato: candidato.nombre_archivo?.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf',
              alertas: candidato.alertas || [],
              lineas: candidato.lineas || [],
              ficha: candidato.ficha || null,
              evaluaciones: evaluacion?.evaluaciones || [],
              estado: candidato.estado,
            };
          } catch {
            return null;
          }
        }));

        if (!activo) return;
        setEstado((s) => ({
          ...s,
          candidatos: candidatos.filter(Boolean),
          archivos: s.archivos.map((archivo) => {
            const dato = candidatos.find((c) => c && c.candidato_id === archivo.candidato_id);
            if (!dato) return archivo;
            return { ...archivo, estado: dato.estado === 'needs_review' ? 'error' : 'listo', error: dato.alertas?.length ? dato.alertas.join(', ') : null };
          }),
        }));
      } catch (error) {
        if (!activo) return;
        notificar(`No se pudo sincronizar el ranking real: ${error.message}`, 'error');
      }
    };

    sincronizarRankingReal();
    return () => { activo = false; };
  }, [backend, estado.vacante?.id, estado.pesos.obligatorios, notificar]);

  const set = useCallback((fn) => setEstado((s) => ({ ...s, ...fn(s) })), []);

  const notificar = useCallback((texto, tipo = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4500);
  }, []);

  const registrar = useCallback((accion, detalle) => {
    set((s) => ({ auditoria: [{ fecha: new Date().toISOString(), accion, detalle }, ...s.auditoria].slice(0, 200) }));
  }, [set]);

  // ── Vacante ────────────────────────────────────────────────────────────────
  const confirmarVacante = useCallback((vacante) => {
    set((s) => {
      const version = (s.vacante?.version ?? 0) + 1;
      return {
        vacante: { ...vacante, version, confirmada_en: new Date().toISOString() },
      };
    });
    registrar('Requisitos confirmados', `${vacante.requisitos.length} requisitos para "${vacante.titulo}"`);
  }, [set, registrar]);

  const setPesos = useCallback((pesos) => set(() => ({ pesos })), [set]);

  const actualizarPesoRequisito = useCallback((id, peso) => {
    set((s) => ({ vacante: { ...s.vacante, requisitos: s.vacante.requisitos.map((r) => (r.id === id ? { ...r, peso } : r)) } }));
  }, [set]);

  // ── Procesamiento de archivos ──────────────────────────────────────────────
  const actualizarArchivo = useCallback((id, cambios) => {
    set((s) => ({ archivos: s.archivos.map((a) => (a.id === id ? { ...a, ...cambios } : a)) }));
  }, [set]);

  const siguienteId = () => {
    const usados = new Set(ref.current.candidatos.map((c) => c.candidato_id));
    let n = 100;
    while (usados.has(String(n))) n++;
    return String(n);
  };

  const procesarUno = useCallback(async (archivo) => {
    const intentos = (archivo.intentos ?? 0) + 1;
    actualizarArchivo(archivo.id, { estado: 'leyendo', error: null, intentos });
    const nombre = archivo.nombre.toLowerCase();
    for (const paso of PASOS) {
      actualizarArchivo(archivo.id, { estado: paso });
      await espera(350 + Math.random() * 650);
      if (paso === 'leyendo' && nombre.includes('corrupt')) return actualizarArchivo(archivo.id, { estado: 'error', error: 'El PDF está dañado y no se pudo abrir.' });
      if (paso === 'leyendo' && (nombre.includes('protegid') || nombre.includes('password'))) return actualizarArchivo(archivo.id, { estado: 'error', error: 'Este PDF está protegido con contraseña.' });
      if (paso === 'extrayendo' && nombre.includes('timeout') && intentos === 1) return actualizarArchivo(archivo.id, { estado: 'error', error: 'El modelo tardó demasiado en responder. Puedes reintentar.' });
      if (paso === 'extrayendo' && (nombre.includes('factura') || nombre.includes('invoice'))) return actualizarArchivo(archivo.id, { estado: 'error', error: 'El documento no parece una hoja de vida. Se excluyó del ranking.' });
    }
    const id = siguienteId();
    const cand = crearCandidato(id, archivo.nombre, {}, hashTexto(archivo.nombre + archivo.tamano));
    set((s) => ({ candidatos: [...s.candidatos, cand] }));
    actualizarArchivo(archivo.id, { estado: 'listo', candidato_id: id });
  }, [actualizarArchivo, set]);

  const procesarConBackend = useCallback(async (archivos, files) => {
    archivos.forEach((archivo) => actualizarArchivo(archivo.id, {
      estado: 'leyendo',
      error: null,
      intentos: (archivo.intentos ?? 0) + 1,
    }));
    try {
      const respuesta = await subirCVs(files);
      const porNombre = new Map(respuesta.archivos.map((a) => [a.nombre_archivo, a]));
      for (const archivo of archivos) {
        const resultado = porNombre.get(archivo.nombre);
        if (!resultado) {
          actualizarArchivo(archivo.id, { estado: 'error', error: 'El servidor no devolvió este archivo.' });
          continue;
        }
        if (resultado.estado === 'failed') {
          actualizarArchivo(archivo.id, { estado: 'error', error: resultado.alertas?.join(', ') || 'No se pudo procesar el CV.' });
          continue;
        }
        if (resultado.estado === 'needs_review') {
          notificar('Se bloqueó un CV por riesgo de datos protegidos o manipulación del prompt.', 'warn');
        }
        actualizarArchivo(archivo.id, {
          estado: resultado.estado === 'needs_review' ? 'error' : 'listo',
          error: resultado.estado === 'needs_review' ? 'El documento requiere revisión antes de enviarse al modelo.' : null,
          candidato_id: resultado.ficha ? resultado.id : null,
        });
        if (resultado.ficha) {
          set((s) => ({
            candidatos: [...s.candidatos.filter((c) => c.candidato_id !== resultado.id), {
              candidato_id: resultado.id,
              nombre_real: null,
              nombre_archivo: resultado.nombre_archivo,
              formato: resultado.nombre_archivo.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf',
              alertas: resultado.alertas || [],
              lineas: resultado.lineas || [],
              ficha: resultado.ficha,
              evaluaciones: [],
            }],
          }));
        }
      }
      set((s) => ({ lote: s.lote ? { ...s.lote, fin: Date.now() } : null }));
    } catch (e) {
      for (const archivo of archivos) actualizarArchivo(archivo.id, { estado: 'error', error: e.message });
      notificar(`El servidor no pudo procesar los CVs: ${e.message}`, 'error');
    }
  }, [actualizarArchivo, set, notificar]);

  const ejecutarCola = useCallback(async (lista) => {
    const cola = [...lista];
    const trabajadores = Array.from({ length: Math.min(4, cola.length) }, async () => {
      while (cola.length) await procesarUno(cola.shift());
    });
    await Promise.all(trabajadores);
    set((s) => ({ lote: s.lote ? { ...s.lote, fin: Date.now() } : null }));
  }, [procesarUno, set]);

  /** Valida y encola archivos. Devuelve los rechazados por formato. */
  const agregarArchivos = useCallback((files) => {
    const rechazados = [];
    const nuevos = [];
    const existentes = ref.current.archivos;
    for (const f of files) {
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
      if (!EXTENSIONES.includes(ext)) { rechazados.push(f.name); continue; }
      const base = { id: Math.random().toString(36).slice(2), nombre: f.name, tamano: f.size, intentos: 0 };
      if (f.size === 0) nuevos.push({ ...base, estado: 'error', error: 'El archivo está vacío.', reintentable: false });
      else if (f.size > MAX_BYTES) nuevos.push({ ...base, estado: 'error', error: 'El archivo supera el máximo de 10 MB.', reintentable: false });
      else if ([...existentes, ...nuevos].some((a) => a.nombre === f.name && a.tamano === f.size)) nuevos.push({ ...base, estado: 'duplicado', error: 'Ya se cargó un archivo idéntico; no se volverá a procesar.' });
      else {
        filesRef.current.set(base.id, f);
        nuevos.push({ ...base, estado: 'pendiente' });
      }
    }
    if (nuevos.length) {
      set((s) => ({ archivos: [...nuevos, ...s.archivos], lote: { inicio: Date.now(), fin: null, total: nuevos.length } }));
      registrar('Carga de CVs', `${nuevos.length} archivo(s) recibidos`);
      if (backend !== 'demo') {
        const pendientes = nuevos.filter((a) => a.estado === 'pendiente');
        procesarConBackend(pendientes, files.filter((f) => pendientes.some((a) => a.nombre === f.name)));
      } else {
        const pendientes = nuevos.filter((a) => a.estado === 'pendiente');
        pendientes.forEach((archivo) => actualizarArchivo(archivo.id, {
          estado: 'error',
          error: 'El backend no está conectado; el CV no se procesó y no se generaron datos demo.',
          reintentable: false,
        }));
        if (pendientes.length) {
          notificar('Inicia el backend para procesar el CV real.', 'error');
        }
      }
    }
    return rechazados;
  }, [set, registrar, ejecutarCola, procesarConBackend, backend]);

  const reintentar = useCallback((id) => {
    const a = ref.current.archivos.find((x) => x.id === id);
    const file = filesRef.current.get(id);
    if (!a || !file) {
      if (a) actualizarArchivo(id, { estado: 'error', error: 'Selecciona nuevamente el archivo para reintentarlo.', reintentable: false });
      return;
    }
    if (backend === 'conectado') procesarConBackend([a], [file]);
    else notificar('El backend no está conectado; no se puede reintentar el CV real.', 'error');
  }, [backend, procesarConBackend, actualizarArchivo, notificar]);

  const quitarArchivo = useCallback((id) => {
    set((s) => {
      const a = s.archivos.find((x) => x.id === id);
      filesRef.current.delete(id);
      return {
        archivos: s.archivos.filter((x) => x.id !== id),
        candidatos: a?.candidato_id ? s.candidatos.filter((c) => c.candidato_id !== a.candidato_id) : s.candidatos,
      };
    });
  }, [set]);

  // ── Demo y retención ───────────────────────────────────────────────────────
  const cargarDemo = useCallback(() => {
    const candidatos = generarLoteDemo(60);
    const archivos = [
      ...ARCHIVOS_CON_ERROR.map((a, i) => ({ ...a, id: `err${i}`, tamano: a.tamano, intentos: 1 })),
      ...candidatos.map((c) => ({ id: `f${c.candidato_id}`, nombre: c.nombre_archivo, tamano: 50000 + (hashTexto(c.candidato_id) % 150000), estado: 'listo', candidato_id: c.candidato_id, intentos: 1 })),
    ];
    const ahora = Date.now();
    setEstado((s) => ({
      ...INICIAL,
      modoCiego: s.modoCiego,
      vacante: { ...VACANTE_EJEMPLO, descripcion: DESCRIPCION_EJEMPLO, version: 1, confirmada_en: new Date().toISOString() },
      candidatos,
      archivos,
      lote: { inicio: ahora - 6 * 60 * 1000 - 42000, fin: ahora, total: archivos.length },
      auditoria: [
        { fecha: new Date().toISOString(), accion: 'Datos de ejemplo cargados', detalle: `${candidatos.length} CVs procesados y 3 archivos con error` },
        { fecha: new Date(ahora - 60000).toISOString(), accion: 'Requisitos confirmados', detalle: 'Versión 1 · 9 requisitos' },
        { fecha: new Date(ahora - 90000).toISOString(), accion: 'Corrección humana', detalle: 'R7 cambiado de obligatorio a deseable (peso 1.5)' },
        { fecha: new Date(ahora - 120000).toISOString(), accion: 'Requisito bloqueado', detalle: '"Menor de 35 años" usa un dato protegido (edad)' },
      ],
    }));
    notificar('Datos de ejemplo cargados: 60 CVs evaluados.', 'ok');
  }, [notificar]);

  const borrarTodo = useCallback(() => {
    setEstado((s) => ({ ...INICIAL, modoCiego: s.modoCiego }));
    notificar('Se borraron la vacante, los CVs y los resultados.', 'ok');
  }, [notificar]);

  const eliminarVacante = useCallback(async (vacanteId) => {
    try {
      if (backend === 'conectado' && vacanteId) await borrarVacante(vacanteId);
      setEstado((s) => ({ ...INICIAL, modoCiego: s.modoCiego }));
      notificar('La vacante fue eliminada correctamente.', 'ok');
      registrar('Vacante eliminada', vacanteId ? `Se eliminó la vacante ${vacanteId}` : 'Se eliminó la vacante actual');
    } catch (error) {
      notificar(`No se pudo eliminar la vacante: ${error.message}`, 'error');
    }
  }, [backend, notificar, registrar]);

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

  /** Corrección humana de un resultado: queda registrada en la auditoría (sección 12, trazabilidad). */
  const corregirEvaluacion = useCallback((candidatoId, requisitoId, resultado, motivo) => {
    const anterior = ref.current.candidatos.find((c) => c.candidato_id === candidatoId)
      ?.evaluaciones.find((e) => e.requisito_id === requisitoId)?.resultado;
    set((s) => ({
      candidatos: s.candidatos.map((c) => (c.candidato_id !== candidatoId ? c : {
        ...c,
        evaluaciones: c.evaluaciones.map((e) => {
          if (e.requisito_id !== requisitoId) return e;
          return { ...e, resultado, corregido_por_humano: true, resultado_ia: e.resultado_ia ?? e.resultado, justificacion: motivo ? `${motivo} (corrección humana)` : e.justificacion };
        }),
      })),
    }));
    registrar('Corrección humana', `Candidato ${candidatoId} · ${requisitoId}: ${anterior ?? '—'} → ${resultado}${motivo ? ` · "${motivo}"` : ''}`);
  }, [set, registrar]);

  const ranking = useMemo(
    () => (estado.vacante ? rankear(estado.candidatos, estado.vacante.requisitos, estado.pesos) : []),
    [estado.candidatos, estado.vacante, estado.pesos],
  );

  const nombreVisible = useCallback((c) => {
    if (!c) return '';
    return estado.modoCiego ? `Candidato ${c.candidato_id}` : `${c.nombre_real} · ${c.candidato_id}`;
  }, [estado.modoCiego]);

  const valor = {
    ...estado, backend, avisos, ranking,
    confirmarVacante, setPesos, actualizarPesoRequisito, agregarArchivos, reintentar, quitarArchivo,
    cargarDemo, borrarTodo, eliminarVacante, toggleCiego, toggleSeleccion, guardarEntrevista, registrar, notificar, nombreVisible, corregirEvaluacion,
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useApp() {
  return useContext(Ctx);
}
