import type { VoceGiorno } from './genera';
import { oreDi, type Turno } from '../model';

/**
 * Dai turni del mese alle righe del foglio ore: ore sommate per giorno,
 * note (sostituzioni) unite. I turni annullati non contano.
 */
export function vociDaTurni(turni: Turno[], year: number, month: number): VoceGiorno[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const perGiorno = new Map<number, { hours: number; notes: string[] }>();
  for (const t of turni) {
    if (t.annullato || !t.data.startsWith(prefix)) continue;
    const d = Number(t.data.slice(8, 10));
    const g = perGiorno.get(d) ?? { hours: 0, notes: [] };
    g.hours = Math.round((g.hours + oreDi(t)) * 100) / 100;
    if (t.nota?.trim()) g.notes.push(t.nota.trim());
    perGiorno.set(d, g);
  }
  return [...perGiorno.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, g]) => ({ day, hours: g.hours, note: g.notes.join('; ') || undefined }));
}
