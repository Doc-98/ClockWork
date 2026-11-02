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

/**
 * Le mansioni sono le colonne del foglio ore della Leone (riga 11, da C a T): le ore di un turno
 * finiscono nella colonna della sua mansione. Il nome è come scritto nel modello, rimesso in ordine.
 */
export const COLONNE_FOGLIO: { col: string; nome: string }[] = [
  { col: 'C', nome: 'Assistente bagnanti' },
  { col: 'D', nome: 'Assistente spogliatoio' },
  { col: 'E', nome: 'Istruttore acquababy' },
  { col: 'F', nome: 'Istruttore acquababy domenica' },
  { col: 'G', nome: 'Istruttore ambientamento' },
  { col: 'H', nome: 'Istruttore scuola nuoto' },
  { col: 'I', nome: 'Istruttore nuoto adulti' },
  { col: 'J', nome: 'Istruttore propaganda' },
  { col: 'K', nome: 'Istruttore Progetto Nemo' },
  { col: 'L', nome: 'Lezioni private individuali' },
  { col: 'M', nome: 'Lezioni private coppie' },
  { col: 'N', nome: 'Lezioni private da 3/4' },
  { col: 'O', nome: 'Acquagym o gestanti' },
  { col: 'P', nome: 'Assistente bagnanti nuoto curricolare' },
  { col: 'Q', nome: 'Assistente spogliatoio nuoto curricolare' },
  { col: 'R', nome: 'Nuoto curricolare (asilo, primaria, licei)' },
  { col: 'S', nome: 'Ore gara propaganda' },
  { col: 'T', nome: 'Ore feste compleanno' },
];
/** La mansione degli assistenti spogliatoio: quella dei turni del foglio turni e dei turni salvati prima delle mansioni */
export const MANSIONE_ASSISTENTE = 'Q';

/** Una mansione che svolgi: la colonna del foglio ore, un nome tuo (facoltativo) e la tariffa oraria */
export interface Mansione {
  col: string;
  nome?: string;
  /** €/h */
  tariffa: number;
}

export type Profilo = 'assistente' | 'istruttore';

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
  /** Colonna del foglio ore (C–T); assente = assistente spogliatoio (Q) */
  mansione?: string;
  /** Turni creati insieme con «ogni settimana fino al»: stesso id di serie */
  serie?: string;
}

export interface Impostazioni {
  /** Nome e cognome, scritto in testa al foglio ore (E5) */
  nome: string;
  /** Come compari nel foglio turni, es. ["Vincenzo"] */
  alias: string[];
  /** Le schede Mese e Foglio ore mostrano lo stesso mese */
  meseLegato: boolean;
  /** Assistente: turni dal foglio turni; istruttore: turni inseriti a mano, niente aree né foglio turni */
  profilo: Profilo;
  /** Le mansioni che svolgi, con la tariffa di ognuna (solo per te) */
  mansioni: Mansione[];
  /** Mese dello stipendio (1–12) da cui la società toglie i 5 € del casellario; 0 = nessuno */
  casellario: number;
  aree: Partial<Record<Area, PersonalizzazioneArea>>;
  calendario: ImpostazioniCalendario;
}

export const IMPOSTAZIONI_DEFAULT: Impostazioni = { nome: '', alias: [], meseLegato: true, profilo: 'assistente', mansioni: [{ col: MANSIONE_ASSISTENTE, tariffa: 9 }], casellario: 10, aree: {}, calendario: CALENDARIO_DEFAULT };

/** Completa impostazioni salvate da versioni precedenti (o da un backup) con i valori predefiniti. */
export function completaImpostazioni(imp?: Partial<Impostazioni> & { tariffa?: number }): Impostazioni {
  const { tariffa, ...resto } = imp ?? {};
  // Fino alla 0.10 c'era una sola tariffa, quella degli assistenti: diventa la mansione Q
  const mansioni = Array.isArray(imp?.mansioni)
    ? imp.mansioni.filter((m) => COLONNE_FOGLIO.some((c) => c.col === m?.col)).map((m) => ({ ...m, tariffa: Number(m.tariffa) || 0 }))
    : [{ col: MANSIONE_ASSISTENTE, tariffa: typeof tariffa === 'number' ? tariffa : 9 }];
  return {
    ...IMPOSTAZIONI_DEFAULT,
    ...resto,
    profilo: imp?.profilo === 'istruttore' ? 'istruttore' : 'assistente',
    mansioni,
    aree: { ...imp?.aree },
    calendario: { ...CALENDARIO_DEFAULT, ...imp?.calendario },
  };
}

/** Colonna del foglio ore di un turno */
export const mansioneDi = (t: Pick<Turno, 'mansione'>): string => t.mansione ?? MANSIONE_ASSISTENTE;

/** Nome di una mansione: quello che le hai dato, altrimenti quello del foglio ore */
export function nomeMansione(col: string, imp?: Partial<Pick<Impostazioni, 'mansioni'>>): string {
  return imp?.mansioni?.find((m) => m.col === col)?.nome?.trim() || COLONNE_FOGLIO.find((c) => c.col === col)?.nome || col;
}

/** Tariffa di una mansione; una mansione che non hai più (o mai avuta) vale come la prima delle tue */
export function tariffaDi(col: string, imp: Pick<Impostazioni, 'mansioni'>): number {
  return imp.mansioni.find((m) => m.col === col)?.tariffa ?? imp.mansioni[0]?.tariffa ?? 0;
}

/** Compenso di un elenco di turni (gli annullati non contano), ognuno alla tariffa della sua mansione */
export function compensoTurni(turni: Turno[], imp: Pick<Impostazioni, 'mansioni'>): number {
  return Math.round(turni.filter((t) => !t.annullato).reduce((s, t) => s + oreDi(t) * tariffaDi(mansioneDi(t), imp), 0) * 100) / 100;
}

/** Le aree (spogliatoi, atrio) hanno senso solo per i turni da assistente spogliatoio */
export const conAree = (t: Pick<Turno, 'mansione'>) => mansioneDi(t) === MANSIONE_ASSISTENTE;

/** Etichetta breve di un turno: l'area per gli assistenti, la mansione per gli altri */
export function etichettaTurno(t: Pick<Turno, 'area' | 'mansione'>, imp?: Pick<Impostazioni, 'aree'> & Partial<Pick<Impostazioni, 'mansioni'>>): string {
  return conAree(t) ? breveArea(t.area, imp) : nomeMansione(mansioneDi(t), imp);
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

/**
 * Un turno del foglio che hai cambiato (orario, giorno, area, annullato):
 * segnarlo come sostituzione non conta, perché il foglio può continuare ad aggiornarne l'orario.
 * da qui in poi gli aggiornamenti dal foglio lo lasciano com'è.
 */
export function segnaModifica(prima: Turno, dopo: Turno): Turno {
  if (prima.origine !== 'import') return dopo;
  const cambiato =
    dopo.data !== prima.data || dopo.area !== prima.area || dopo.inizio !== prima.inizio || dopo.fine !== prima.fine ||
    !!dopo.annullato !== !!prima.annullato;
  return cambiato ? { ...dopo, modificato: true } : dopo;
}

export function ordinaTurni(a: Turno, b: Turno): number {
  return a.data.localeCompare(b.data) || a.inizio - b.inizio;
}
