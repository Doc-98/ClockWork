/**
 * Tema dell'app: chiaro, scuro o come il sistema.
 * La scelta vale per questo telefono, quindi sta in localStorage e non nel backup.
 * Il primo tema lo applica già uno script in index.html, prima che la pagina si disegni:
 * qui si tiene allineato quando cambi la scelta o, con «Sistema», quando cambia il telefono.
 */

import { CHIAVE_TEMA, risolvi, type SceltaTema } from './tema';

export type { SceltaTema };

/** Colore della barra di stato e della finestra, uguale a quello di index.html */
const THEME_COLOR = { chiaro: '#10212B', scuro: '#0E1A21' } as const;

function leggi(): SceltaTema {
  try {
    const v = localStorage.getItem(CHIAVE_TEMA);
    return v === 'chiaro' || v === 'scuro' ? v : 'sistema';
  } catch {
    return 'sistema';
  }
}

const scuroDiSistema = () => window.matchMedia('(prefers-color-scheme: dark)');

class Tema {
  scelta = $state<SceltaTema>(leggi());

  constructor() {
    scuroDiSistema().addEventListener('change', () => this.applica());
    this.applica();
  }

  imposta(scelta: SceltaTema) {
    this.scelta = scelta;
    try {
      if (scelta === 'sistema') localStorage.removeItem(CHIAVE_TEMA);
      else localStorage.setItem(CHIAVE_TEMA, scelta);
    } catch {
      /* senza storage il tema vale finché l'app resta aperta */
    }
    this.applica();
  }

  private applica() {
    const tema = risolvi(this.scelta, scuroDiSistema().matches);
    document.documentElement.dataset.tema = tema;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[tema]);
  }
}

export const tema = new Tema();
