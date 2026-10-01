/**
 * Scorrimento orizzontale tra le schede principali (Oggi, Mese, Importa, Foglio ore).
 * Il contenuto segue un po' il dito; oltre la soglia si passa alla scheda vicina.
 * Non interferisce con lo scroll verticale, con i campi di testo e con le liste che scorrono di lato.
 */

export interface OpzioniSwipe {
  /** -1 = scheda precedente, +1 = successiva. Restituisce false se non c'è. */
  vai: (direzione: -1 | 1) => boolean;
  /** Se false, lo scorrimento è disattivato (es. dentro un turno) */
  attivo: () => boolean;
}

const SOGLIA = 70; // px
const SOGLIA_VELOCE = 35; // px, se il gesto è rapido
const BORDO = 18; // px dai bordi dello schermo: lasciati ai gesti di sistema

function scorreDiLato(el: Element | null, fino: Element): boolean {
  for (let n = el; n && n !== fino; n = n.parentElement) {
    if (n.matches('input, textarea, select, [data-no-swipe]')) return true;
    const s = getComputedStyle(n);
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true;
  }
  return false;
}

export function swipe(node: HTMLElement, opzioni: OpzioniSwipe) {
  let x0 = 0, y0 = 0, t0 = 0, dx = 0;
  let stato: 'idle' | 'indeciso' | 'orizzontale' | 'ignora' = 'idle';
  const ridotto = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const imposta = (x: number) => {
    node.style.transform = x ? `translateX(${x}px)` : '';
    node.style.opacity = x ? String(1 - Math.min(Math.abs(x) / 400, 0.25)) : '';
  };

  function start(e: TouchEvent) {
    if (e.touches.length !== 1 || !opzioni.attivo()) return (stato = 'ignora');
    const t = e.touches[0];
    if (t.clientX < BORDO || t.clientX > window.innerWidth - BORDO || scorreDiLato(e.target as Element, node)) {
      stato = 'ignora';
      return;
    }
    x0 = t.clientX;
    y0 = t.clientY;
    t0 = performance.now();
    dx = 0;
    stato = 'indeciso';
    node.style.transition = '';
  }

  function move(e: TouchEvent) {
    if (stato === 'idle' || stato === 'ignora') return;
    const t = e.touches[0];
    const mx = t.clientX - x0;
    const my = t.clientY - y0;
    if (stato === 'indeciso') {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
      stato = Math.abs(mx) > Math.abs(my) * 1.3 ? 'orizzontale' : 'ignora';
      if (stato === 'ignora') return;
    }
    dx = mx;
    if (!ridotto()) imposta(dx * 0.35);
  }

  function end() {
    if (stato !== 'orizzontale') {
      stato = 'idle';
      return;
    }
    stato = 'idle';
    const dt = performance.now() - t0;
    const veloce = dt < 300 && Math.abs(dx) > SOGLIA_VELOCE;
    const cambia = Math.abs(dx) > SOGLIA || veloce;
    node.style.transition = 'transform 160ms ease-out, opacity 160ms ease-out';
    imposta(0);
    if (cambia) opzioni.vai(dx < 0 ? 1 : -1);
    setTimeout(() => (node.style.transition = ''), 180);
  }

  node.addEventListener('touchstart', start, { passive: true });
  node.addEventListener('touchmove', move, { passive: true });
  node.addEventListener('touchend', end, { passive: true });
  node.addEventListener('touchcancel', end, { passive: true });

  return {
    update(nuove: OpzioniSwipe) {
      opzioni = nuove;
    },
    destroy() {
      node.removeEventListener('touchstart', start);
      node.removeEventListener('touchmove', move);
      node.removeEventListener('touchend', end);
      node.removeEventListener('touchcancel', end);
    },
  };
}

/** Breve animazione d'ingresso nella direzione del cambio scheda. */
export function animaIngresso(node: HTMLElement, direzione: -1 | 1) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !node.animate) return;
  node.animate(
    [
      { transform: `translateX(${direzione * 36}px)`, opacity: 0.35 },
      { transform: 'translateX(0)', opacity: 1 },
    ],
    { duration: 200, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
  );
}
