import { dati } from './dati.svelte';

/**
 * Il mese aperto nelle schede Mese e Foglio ore. Con «Coordina le schede» attivo (impostazioni)
 * le due schede si seguono: scorri a gennaio in una e trovi gennaio anche nell'altra.
 */

export interface Ym {
  year: number;
  month: number;
}

export const ymOggi = (d = new Date()): Ym => ({ year: d.getFullYear(), month: d.getMonth() + 1 });
export const ymStr = (ym: Ym) => `${ym.year}-${String(ym.month).padStart(2, '0')}`;
export function ymDa(s: string | undefined): Ym | undefined {
  const m = /^(\d{4})-(\d{2})$/.exec(s ?? '');
  return m ? { year: Number(m[1]), month: Number(m[2]) } : undefined;
}
export function spostaYm(ym: Ym, delta: number): Ym {
  const k = ym.year * 12 + ym.month - 1 + delta;
  return { year: Math.floor(k / 12), month: (k % 12) + 1 };
}

class Vista {
  /** Ultimo mese aperto per scheda; quello di oggi finché non ne scegli un altro */
  private ultimi = $state<Record<'mese' | 'foglio', Ym | undefined>>({ mese: undefined, foglio: undefined });

  /** Una scheda ha mostrato questo mese */
  segna(scheda: 'mese' | 'foglio', ym: Ym) {
    const a = this.ultimi[scheda];
    if (a && a.year === ym.year && a.month === ym.month) return;
    this.ultimi = dati.impostazioni.meseLegato ? { mese: ym, foglio: ym } : { ...this.ultimi, [scheda]: ym };
  }

  /** Dove porta la scheda nella barra in basso */
  href(scheda: 'mese' | 'foglio'): string {
    const ym = this.ultimi[scheda];
    return ym ? `#/${scheda}/${ymStr(ym)}` : `#/${scheda}`;
  }
}

export const vista = new Vista();
