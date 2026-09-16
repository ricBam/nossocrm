import { useSyncExternalStore } from 'react';

const BELOW_MD_QUERY = '(max-width: 767.98px)';

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mql = window.matchMedia(BELOW_MD_QUERY);
  mql.addEventListener?.('change', onChange);
  return () => mql.removeEventListener?.('change', onChange);
}

function getSnapshot() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(BELOW_MD_QUERY).matches;
}

/**
 * `true` quando a viewport está abaixo do breakpoint `md` (768px) — o mesmo
 * corte usado pelo app shell mobile (BottomNav).
 *
 * Usar só quando a versão mobile é uma árvore de componentes DIFERENTE (ex.:
 * lista do dia no lugar da grade semanal) e renderizar as duas com classes
 * `md:hidden` duplicaria conteúdo. No servidor e na hidratação retorna
 * `false` (layout desktop), trocando no primeiro render do cliente.
 */
export function useIsBelowMd(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
