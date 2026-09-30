import type { Area as AreaFoglio } from './turni/parse';

/** Aree del foglio turni più "altro" (gare, eventi, qualsiasi turno fuori dal foglio). */
export type Area = AreaFoglio | 'altro';

export const AREE: { id: Area; nome: string; breve: string }[] = [
  { id: 'maschile', nome: 'Spogliatoio maschile', breve: 'Spogl. M' },
  { id: 'femminile', nome: 'Spogliatoio femminile', breve: 'Spogl. F' },
  { id: 'piccoli', nome: 'Spogliatoio piccoli', breve: 'Piccoli' },
  { id: 'atrio', nome: 'Atrio', breve: 'Atrio' },
  { id: 'altro', nome: 'Altro', breve: 'Altro' },
];

export function nomeArea(a: Area): string {
  return AREE.find((x) => x.id === a)?.nome ?? a;
}
export function breveArea(a: Area): string {
  return AREE.find((x) => x.id === a)?.breve ?? a;
}

export interface Turno {
  id: string;
  /** YYYY-MM-DD */
  data: string;
  area: Area;
  postazione?: number;
  /** minuti dalla mezzanotte */
  inizio: number;
  fine: number;
  /** 'import' = dal foglio turni; 'manuale' = aggiunto da te (sostituzioni, cambi, gare…) */
  origine: 'import' | 'manuale';
  /** Turno importato che poi hai modificato: le importazioni successive non lo toccano. */
  modificato?: boolean;
  /** Se è una sostituzione: chi hai sostituito */
  sostituisce?: string;
  /** Nota per il foglio ore (colonna R) */
  nota?: string;
  presa?: boolean;
  annullato?: boolean;
  /** Evento su Google Calendar (in futuro) */
  calendarEventId?: string;
}

export interface Impostazioni {
  /** Come compari nel foglio turni, es. ["Vincenzo"] */
  alias: string[];
  /** €/h, solo per te */
  tariffa: number;
}

export const IMPOSTAZIONI_DEFAULT: Impostazioni = { alias: [], tariffa: 9 };

export function oreDi(t: Pick<Turno, 'inizio' | 'fine'>): number {
  return Math.round(((t.fine - t.inizio) / 60) * 100) / 100;
}

export function nuovoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** "YYYY-MM-DD" → Date locale */
export function dataDa(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isoDa(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function hhmm(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

export function daHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h < 24 && mm < 60 ? h * 60 + mm : null;
}

/** Nota automatica nello stile dell'archivio: "sost greta spogl piccoli" */
export function notaSostituzione(nome: string, area: Area): string {
  const dove: Record<Area, string> = {
    maschile: 'spogl maschi',
    femminile: 'spogl femmine',
    piccoli: 'spogl piccoli',
    atrio: 'atrio',
    altro: '',
  };
  return ['sost', nome.trim().toLowerCase(), dove[area]].filter(Boolean).join(' ');
}

export function ordinaTurni(a: Turno, b: Turno): number {
  return a.data.localeCompare(b.data) || a.inizio - b.inizio;
}
