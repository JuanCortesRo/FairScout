// Tema claro u oscuro. Se guarda en el navegador; si no hay preferencia guardada, sigue al sistema.
// index.html aplica la clase .dark antes de pintar la página para evitar un destello claro.
import { useCallback, useEffect, useState } from 'react';

const CLAVE = 'fairscout:tema';

function temaInicial() {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) return 'oscuro';
  return 'claro';
}

export function useTema() {
  const [tema, setTema] = useState(temaInicial);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'oscuro');
  }, [tema]);

  const alternar = useCallback(() => {
    const raiz = document.documentElement;
    raiz.classList.add('tema-transicion');
    setTema((t) => {
      const nuevo = t === 'oscuro' ? 'claro' : 'oscuro';
      try { localStorage.setItem(CLAVE, nuevo); } catch { /* sin almacenamiento: solo dura la sesión */ }
      return nuevo;
    });
    setTimeout(() => raiz.classList.remove('tema-transicion'), 300);
  }, []);

  return { tema, alternar };
}
