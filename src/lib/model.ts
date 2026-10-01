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

/** Nome dell'area: quello scelto in Personalizza, altrimenti quello standard. */
export function nomeArea(a: Area, imp?: Pick<Impostazioni, 'aree'>): string {
  return imp?.aree?.[a]?.nome?.trim() || AREE.find((x) => x.id === a)?.nome || a;
}
export function breveArea(a: Area, imp?: Pick<Impostazioni, 'aree'>): string {
  return imp?.aree?.[a]?.breve?.trim() || AREE.find((x) => x.id === a)?.breve || a;
}

/** Un promemoria di Google Calendar: notifica sul telefono o email, N minuti prima dell'inizio. */
export interface Promemoria {
  metodo: 'popup' | 'email';
  minuti: number;
}
/** Google accetta al massimo 5 promemoria per evento, fino a 4 settimane prima. */
export const MAX_PROMEMORIA = 5;
export const MAX_MINUTI_PROMEMORIA = 40320;

/** Personalizzazione di un'area. Ogni campo vuoto vuol dire «come predefinito». */
export interface PersonalizzazioneArea {
  /** Nome nell'app (es. «Spogliatoio grande») */
  nome?: string;
  breve?: string;
  /** Titolo dell'evento sul calendario (es. «Leone 🔽»); può contenere segnaposto */
  titolo?: string;
  luogo?: string;
  /** colorId degli eventi di Google ('1'…'11') */
  colore?: string;
  /** Se presente sostituisce i promemoria predefiniti (anche vuoto: nessun promemoria) */
  promemoria?: Promemoria[];
}

export interface ImpostazioniCalendario {
  /** 'area': un titolo per area (se vuoto si usano i modelli); 'modello': lo stesso modello per tutte */
  modoTitolo: 'area' | 'modello';
  modelloTurno: string;
  modelloSost: string;
  luogo: string;
  /** colorId degli eventi; assente = colore del calendario */
  colore?: string;
  promemoria: Promemoria[];
}

export const CALENDARIO_DEFAULT: ImpostazioniCalendario = {
  modoTitolo: 'area',
  modelloTurno: 'Leone · {area} {postazione}',
  modelloSost: 'Leone · Sost. {collega} ({area})',
  luogo: 'Leone XIII Sport',
  promemoria: [{ metodo: 'popup', minuti: 60 }],
};

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
  /** Nome scelto per questo turno: vale nell'app e come titolo dell'evento */
  nome?: string;
  /** Promemoria solo per questo turno (vince su area e predefiniti) */
  promemoria?: Promemoria[];
  /** Evento su Google Calendar (in futuro) */
  calendarEventId?: string;
}

export interface Impostazioni {
  /** Come compari nel foglio turni, es. ["Vincenzo"] */
  alias: string[];
  /** €/h, solo per te */
  tariffa: number;
  aree: Partial<Record<Area, PersonalizzazioneArea>>;
  calendario: ImpostazioniCalendario;
}

export const IMPOSTAZIONI_DEFAULT: Impostazioni = { alias: [], tariffa: 9, aree: {}, calendario: CALENDARIO_DEFAULT };

/** Completa impostazioni salvate da versioni precedenti (o da un backup) con i valori predefiniti. */
export function completaImpostazioni(imp?: Partial<Impostazioni>): Impostazioni {
  return {
    ...IMPOSTAZIONI_DEFAULT,
    ...imp,
    aree: { ...imp?.aree },
    calendario: { ...CALENDARIO_DEFAULT, ...imp?.calendario },
  };
}

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
