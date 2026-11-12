// Estado global de la app. Mientras el pipeline del backend no expone resultados, el procesamiento
// de CVs se simula aquí con los mismos estados por archivo que tendrá el backend (sección 20.2).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { rankear } from '@/lib/scoring';
import { ARCHIVOS_CON_ERROR, VACANTE_EJEMPLO, DESCRIPCION_EJEMPLO, crearCandidato, generarLoteDemo, hashTexto } from '@/data/demo';
import { salud, subirCVs } from '@/api';

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
  const ref = useRef(estado);
  ref.current = estado;

  useEffect(() => {
    try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch { /* sin almacenamiento: la app sigue funcionando */ }
  }, [estado]);

  useEffect(() => {
    let vivo = true;
    salud().then((ok) => vivo && setBackend(ok ? 'conectado' : 'demo'));
    return () => { vivo = false; };
  }, []);

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
      else nuevos.push({ ...base, estado: 'pendiente' });
    }
    if (nuevos.length) {
      set((s) => ({ archivos: [...nuevos, ...s.archivos], lote: { inicio: Date.now(), fin: null, total: nuevos.length } }));
      registrar('Carga de CVs', `${nuevos.length} archivo(s) recibidos`);
      ejecutarCola(nuevos.filter((a) => a.estado === 'pendiente'));
      if (backend === 'conectado') {
        subirCVs(files.filter((f) => EXTENSIONES.some((e) => f.name.toLowerCase().endsWith(e))))
          .catch((e) => notificar(`El servidor no guardó los archivos: ${e.message}`, 'error'));
      }
    }
    return rechazados;
  }, [set, registrar, ejecutarCola, backend, notificar]);

  const reintentar = useCallback((id) => {
    const a = ref.current.archivos.find((x) => x.id === id);
    if (a) ejecutarCola([a]);
  }, [ejecutarCola]);

  const quitarArchivo = useCallback((id) => {
    set((s) => {
      const a = s.archivos.find((x) => x.id === id);
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
    cargarDemo, borrarTodo, toggleCiego, toggleSeleccion, guardarEntrevista, registrar, notificar, nombreVisible, corregirEvaluacion,
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useApp() {
  return useContext(Ctx);
}
