import type { VoceGiorno } from './genera';
import { MANSIONE_ASSISTENTE, mansioneDi, quantitaDi, type Impostazioni, type Turno } from '../model';

/**
 * Dai turni del mese alle righe del foglio ore: per giorno e per mansione (colonna) le ore sommate,
 * o il numero di turni se la mansione è pagata a turno; note (sostituzioni) unite. I turni annullati non contano.
 */
export function vociDaTurni(turni: Turno[], year: number, month: number, imp: Pick<Impostazioni, 'mansioni'>): VoceGiorno[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const perGiorno = new Map<string, { day: number; col: string; hours: number; aTurno: boolean; notes: string[] }>();
  for (const t of turni) {
    if (t.annullato || !t.data.startsWith(prefix)) continue;
    const day = Number(t.data.slice(8, 10));
    const col = mansioneDi(t);
    const q = quantitaDi(t, imp);
    const k = `${day}|${col}`;
    const g = perGiorno.get(k) ?? { day, col, hours: 0, aTurno: q.aTurno, notes: [] };
    g.hours = Math.round((g.hours + q.valore) * 100) / 100;
    if (t.nota?.trim()) g.notes.push(t.nota.trim());
    perGiorno.set(k, g);
  }
  return [...perGiorno.values()]
    .sort((a, b) => a.day - b.day || a.col.localeCompare(b.col))
    .map((g) => ({
      day: g.day,
      hours: g.hours,
      note: g.notes.join('; ') || undefined,
      ...(g.col !== MANSIONE_ASSISTENTE ? { col: g.col } : {}),
      ...(g.aTurno ? { aTurno: true } : {}),
    }));
}
