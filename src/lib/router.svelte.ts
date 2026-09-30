/**
 * Navigazione minima basata sull'hash (#/mese, #/turno/abc…):
 * funziona su GitHub Pages senza configurazione e il tasto "indietro" di Android fa la cosa giusta.
 */

export type Rotta =
  | { nome: 'oggi' }
  | { nome: 'mese'; ym?: string; giorno?: string }
  | { nome: 'importa' }
  | { nome: 'foglio'; ym?: string }
  | { nome: 'turno'; id?: string; data?: string; tipo?: 'sost' }
  | { nome: 'impostazioni' };

function leggi(): Rotta {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const q = new URLSearchParams(query);
  const [a, b] = path.split('/');
  switch (a) {
    case 'mese':
      return { nome: 'mese', ym: b, giorno: q.get('g') ?? undefined };
    case 'importa':
      return { nome: 'importa' };
    case 'foglio':
      return { nome: 'foglio', ym: b };
    case 'turno':
      return { nome: 'turno', id: b && b !== 'nuovo' ? b : undefined, data: q.get('data') ?? undefined, tipo: q.get('tipo') === 'sost' ? 'sost' : undefined };
    case 'impostazioni':
      return { nome: 'impostazioni' };
    default:
      return { nome: 'oggi' };
  }
}

class Router {
  rotta = $state<Rotta>(leggi());
  constructor() {
    window.addEventListener('hashchange', () => {
      this.rotta = leggi();
      window.scrollTo(0, 0);
    });
  }
  vai(hash: string, sostituisci = false) {
    const h = hash.startsWith('#') ? hash : `#${hash}`;
    if (sostituisci) history.replaceState(null, '', h);
    else history.pushState(null, '', h);
    this.rotta = leggi();
    window.scrollTo(0, 0);
  }
  indietro(fallback = '#/') {
    if (history.length > 1) history.back();
    else this.vai(fallback, true);
  }
}

export const router = new Router();
