import type { VoceGiorno } from './genera';
import { MANSIONE_ASSISTENTE, mansioneDi, oreDi, type Turno } from '../model';

/**
 * Dai turni del mese alle righe del foglio ore: ore sommate per giorno e per mansione (colonna),
 * note (sostituzioni) unite. I turni annullati non contano.
 */
export function vociDaTurni(turni: Turno[], year: number, month: number): VoceGiorno[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const perGiorno = new Map<string, { day: number; col: string; hours: number; notes: string[] }>();
  for (const t of turni) {
    if (t.annullato || !t.data.startsWith(prefix)) continue;
    const day = Number(t.data.slice(8, 10));
    const col = mansioneDi(t);
    const k = `${day}|${col}`;
    const g = perGiorno.get(k) ?? { day, col, hours: 0, notes: [] };
    g.hours = Math.round((g.hours + oreDi(t)) * 100) / 100;
    if (t.nota?.trim()) g.notes.push(t.nota.trim());
    perGiorno.set(k, g);
  }
  return [...perGiorno.values()]
    .sort((a, b) => a.day - b.day || a.col.localeCompare(b.col))
    .map((g) => ({ day: g.day, hours: g.hours, note: g.notes.join('; ') || undefined, ...(g.col !== MANSIONE_ASSISTENTE ? { col: g.col } : {}) }));
}
