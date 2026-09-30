/**
 * Interpretazione degli orari come compaiono nel foglio turni.
 * Formati visti: "15:30 - 20:00", "14:15 - 18,30", "16.45- 20:00", "9:30 -15:15", "14,00 - 20:00",
 * frazioni di giorno Excel (0,65625 = 15:45), orari doppi ("14:15" con asterisco, poi "/ 15:00") o "15:30 / 15:45".
 */

/** Minuti dalla mezzanotte */
export type Minuti = number;

export function minutiToHHMM(m: Minuti): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${String(mm).padStart(2, '0')}`;
}

/** "15:30", "18,30", "16.45", "9" → minuti */
export function parseOra(s: string): Minuti | null {
  const t = s.trim().replace(/\*/g, '');
  const m = /^(\d{1,2})(?:[:.,](\d{2}))?$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Frazione di giorno Excel → minuti, arrotondati al minuto. */
export function frazioneToMinuti(f: number): Minuti | null {
  if (!(f >= 0 && f < 1)) return null;
  return Math.round(f * 24 * 60);
}

export interface OraCella {
  /** Orario normale, o per chi NON ha l'asterisco */
  normale: Minuti;
  /** Orario per chi ha l'asterisco (presa Leoniani/Asilo), se diverso */
  anticipato?: Minuti;
}

/**
 * Una cella con un singolo orario, eventualmente doppio ("15:30 / 15:45", anche con asterisco sul primo), o frazione 0.65625.
 * Nel doppio, il primo valore vale per chi ha l'asterisco sul nome.
 */
export function parseOraCella(v: unknown): OraCella | null {
  if (typeof v === 'number') {
    const m = frazioneToMinuti(v);
    return m === null ? null : { normale: m };
  }
  if (typeof v !== 'string') return null;
  const parts = v.split('/').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    const m = parseOra(parts[0]);
    return m === null ? null : { normale: m };
  }
  if (parts.length === 2) {
    const a = parseOra(parts[0]);
    const b = parseOra(parts[1]);
    if (a === null || b === null) return null;
    return { normale: b, anticipato: a };
  }
  return null;
}

/** Un intervallo "15:30 - 20:00" in una sola cella. */
export function parseIntervallo(v: unknown): { inizio: Minuti; fine: Minuti } | null {
  if (typeof v !== 'string') return null;
  const parts = v.split(/\s*-\s*/).filter((p) => p.trim() !== '');
  if (parts.length !== 2) return null;
  const inizio = parseOra(parts[0]);
  const fine = parseOra(parts[1]);
  if (inizio === null || fine === null || fine <= inizio) return null;
  return { inizio, fine };
}
