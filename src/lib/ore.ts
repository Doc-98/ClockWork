/**
 * Interpreta le ore scritte a mano: "3,75", "3.75", "3:45", "3h45", "4".
 * Attenzione: "8.45" è ambiguo; qui vale 8,45 ore (come in Excel). Chi intende 8 ore e 45 minuti
 * deve scrivere "8:45". La UI mostra sempre la conversione per evitare equivoci.
 */
export function parseOre(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, '');
  if (s === '') return null;
  const hm = /^(\d{1,2})(?::|h)(\d{1,2})?$/.exec(s);
  if (hm) {
    const min = Number(hm[2] ?? 0);
    if (min >= 60) return NaN;
    return Math.round((Number(hm[1]) + min / 60) * 100) / 100;
  }
  if (/^\d{1,2}([.,]\d{1,2})?$/.test(s)) return Number(s.replace(',', '.'));
  return NaN;
}

/** 3.75 → "3,75"; 5 → "5" */
export function formatOre(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2 });
}

/** 3.75 → "3 h 45 min" */
export function oreInParole(n: number): string {
  const h = Math.floor(n + 1e-9);
  const m = Math.round((n - h) * 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatEuro(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}
