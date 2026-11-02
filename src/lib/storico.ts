import { readWorkbook, serialToDate, type CellValue, type SheetData } from './xlsx/read';
import { meseDalNomeFoglio } from './turni/parse';
import { MANSIONE_ASSISTENTE, compensoTurni, oreDi, tariffaDi, type Impostazioni, type Turno } from './model';
import type { VoceGiorno } from './foglio/genera';

/**
 * Storico: ore mese per mese, totale dell'anno solare rispetto alla soglia dei compensi
 * sportivi, controlli sui fogli ore archiviati.
 *
 * Le ore vengono dai turni dell'app; per i mesi in cui l'app non ha turni (quelli prima di
 * ClockWork) dall'archivio dei fogli ore, se l'hai caricato. Tutto resta sul telefono.
 */

/** Un mese letto dall'archivio dei fogli ore */
export interface MeseArchivio {
  /** YYYY-MM */
  ym: string;
  /** Nome del foglio da cui viene, per i messaggi */
  foglio: string;
  voci: VoceGiorno[];
}

export interface Archivio {
  nomeFile: string;
  caricatoIl: string;
  mesi: MeseArchivio[];
  /** Controlli che hai scelto di lasciare così (chiavi di Controllo) */
  ignorati: string[];
}

const ymChiave = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

/** Colonna delle ore nel foglio ore della società */
const RE_COLONNA_ORE = /assistente\s+spogliatoio\s+nuoto\s+curricolare/i;

function testo(v: CellValue | undefined): string {
  return typeof v === 'string' ? v.trim() : '';
}

function numero(v: CellValue | undefined): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const s = v.trim().replace(',', '.');
    if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  }
  return undefined;
}

/** Mese del foglio: dal nome («Febbraio2026», «Ottobre 25»), altrimenti dalla data in testa */
function meseDelFoglio(sheet: SheetData, rigaIntestazione: number): string | undefined {
  const dalNome = meseDalNomeFoglio(sheet.name);
  if (dalNome) return ymChiave(dalNome.year, dalNome.month);
  for (let r = 1; r < rigaIntestazione; r++) {
    const riga = sheet.rows.get(r);
    if (!riga) continue;
    const celle = [...riga.entries()].sort((a, b) => a[0] - b[0]);
    const i = celle.findIndex(([, v]) => testo(v).toLowerCase() === 'data');
    if (i < 0) continue;
    const seriale = celle.slice(i + 1).map(([, v]) => v).find((v) => typeof v === 'number' && v > 30000) as number | undefined;
    if (seriale) {
      const d = serialToDate(seriale);
      return ymChiave(d.getFullYear(), d.getMonth() + 1);
    }
  }
  return undefined;
}

const COL_C = 3;
const COL_T = 20;
const COL_R = 18;
const COL_U = 21;
const lettera = (c: number) => String.fromCharCode(64 + c);

function leggiFoglio(sheet: SheetData): MeseArchivio | undefined {
  // Riga di intestazione: quella con «Assistente spogliatoio nuoto curricolare» (colonna Q)
  let rigaInt = 0;
  for (const [r, riga] of [...sheet.rows.entries()].sort((a, b) => a[0] - b[0])) {
    if ([...riga.values()].some((v) => RE_COLONNA_ORE.test(testo(v)))) {
      rigaInt = r;
      break;
    }
  }
  if (!rigaInt) return undefined;
  const intestazione = sheet.rows.get(rigaInt)!;
  const colGiorno = [...intestazione.entries()].find(([, v]) => testo(v).toLowerCase() === 'giorno')?.[0] ?? 2;

  // Le righe dei giorni
  const giorni: { day: number; riga: Map<number, CellValue> }[] = [];
  for (let r = rigaInt + 1; r <= rigaInt + 40; r++) {
    const riga = sheet.rows.get(r);
    if (!riga) continue;
    if (/^totale/i.test(testo(riga.get(colGiorno)))) break;
    const day = numero(riga.get(colGiorno));
    if (!day || !Number.isInteger(day) || day < 1 || day > 31) continue;
    giorni.push({ day, riga });
  }

  // Colonne di appoggio (es. il numero del giorno ripetuto in O): ogni valore uguale al giorno → non sono ore
  const appoggio = new Set<number>();
  for (let c = COL_C; c <= COL_T; c++) {
    const valori = giorni.map((g) => [g.day, numero(g.riga.get(c))] as const).filter(([, v]) => v !== undefined);
    if (valori.length >= 2 && valori.every(([d, v]) => v === d)) appoggio.add(c);
  }

  const voci: VoceGiorno[] = [];
  for (const { day, riga } of giorni) {
    const delGiorno: VoceGiorno[] = [];
    for (let c = COL_C; c <= COL_T; c++) {
      if (appoggio.has(c)) continue;
      const hours = numero(riga.get(c));
      if (!hours) continue;
      const col = lettera(c);
      delGiorno.push(col === MANSIONE_ASSISTENTE ? { day, hours } : { day, hours, col });
    }
    if (!delGiorno.length) continue;
    // Note e sostituzioni: testo in R (assistenti) o in U (gli altri)
    const note = [COL_R, COL_U].map((c) => (typeof riga.get(c) === 'string' ? testo(riga.get(c)) : '')).find(Boolean);
    if (note) delGiorno[0].note = note;
    voci.push(...delGiorno);
  }
  if (!voci.length) return undefined;
  const ym = meseDelFoglio(sheet, rigaInt);
  return ym ? { ym, foglio: sheet.name, voci } : undefined;
}

export interface EsitoArchivio {
  mesi: MeseArchivio[];
  /** Fogli con ore ma un mese già letto da un altro foglio */
  doppi: string[];
}

/** Legge l'archivio dei fogli ore: un foglio per mese, ore nelle colonne delle mansioni (C–T), note in R o U. */
export function leggiArchivio(bytes: Uint8Array): EsitoArchivio {
  const mesi = new Map<string, MeseArchivio>();
  const doppi: string[] = [];
  for (const sheet of readWorkbook(bytes)) {
    const m = leggiFoglio(sheet);
    if (!m) continue;
    if (mesi.has(m.ym)) doppi.push(sheet.name);
    else mesi.set(m.ym, m);
  }
  return { mesi: [...mesi.values()].sort((a, b) => a.ym.localeCompare(b.ym)), doppi };
}

// ---------------------------------------------------------------------------
// Riepilogo per mese

export interface MeseStorico {
  ym: string;
  ore: number;
  /** Ore delle sostituzioni (nell'archivio: dei giorni con nota «sost…») */
  oreSost: number;
  nSost: number;
  /** 'manuale': totale del mese inserito a mano (es. foglio ore perso o sbagliato) */
  fonte: 'app' | 'manuale' | 'archivio' | 'nessuna';
  /** Compenso del mese, ogni ora alla tariffa della sua mansione (0 senza tariffe) */
  euro: number;
}

/** Ore totali inserite a mano per un mese (chiave YYYY-MM): valgono più dell'archivio, meno dei turni dell'app */
export type OreManuali = Record<string, number>;

const arrotonda = (n: number) => Math.round(n * 100) / 100;
/** Nell'archivio le sostituzioni sono scritte a mano: «sost …», «sostit …», «sostituzione …» */
export const eSostituzione = (nota?: string) => /^\s*sost/i.test(nota ?? '');

export function riepilogoMese(ym: string, turni: Turno[], archivio?: Pick<Archivio, 'mesi'>, manuali?: OreManuali, imp?: Pick<Impostazioni, 'mansioni'>): MeseStorico {
  const tar = (col?: string) => (imp ? tariffaDi(col ?? MANSIONE_ASSISTENTE, imp) : 0);
  const suoi = turni.filter((t) => !t.annullato && t.data.startsWith(`${ym}-`));
  if (suoi.length) {
    const sost = suoi.filter((t) => t.sostituisce);
    return {
      ym,
      ore: arrotonda(suoi.reduce((s, t) => s + oreDi(t), 0)),
      oreSost: arrotonda(sost.reduce((s, t) => s + oreDi(t), 0)),
      nSost: sost.length,
      fonte: 'app',
      euro: imp ? compensoTurni(suoi, imp) : 0,
    };
  }
  const aMano = manuali?.[ym];
  // Le ore scritte a mano non hanno mansione: valgono alla tariffa della tua prima mansione
  if (aMano !== undefined) return { ym, ore: arrotonda(aMano), oreSost: 0, nSost: 0, fonte: 'manuale', euro: arrotonda(aMano * (imp?.mansioni[0]?.tariffa ?? 0)) };
  const a = archivio?.mesi.find((m) => m.ym === ym);
  if (a) {
    const sost = a.voci.filter((v) => eSostituzione(v.note));
    return {
      ym,
      ore: arrotonda(a.voci.reduce((s, v) => s + v.hours, 0)),
      oreSost: arrotonda(sost.reduce((s, v) => s + v.hours, 0)),
      nSost: sost.length,
      fonte: 'archivio',
      euro: arrotonda(a.voci.reduce((s, v) => s + v.hours * tar(v.col), 0)),
    };
  }
  return { ym, ore: 0, oreSost: 0, nSost: 0, fonte: 'nessuna', euro: 0 };
}

/** Gli ultimi `n` mesi fino a `fino` compreso (YYYY-MM), dal più vecchio */
export function ultimiMesi(fino: string, n = 12): string[] {
  const [y, m] = fino.split('-').map(Number);
  const k = y * 12 + m - 1;
  return Array.from({ length: n }, (_, i) => {
    const j = k - (n - 1) + i;
    return ymChiave(Math.floor(j / 12), (j % 12) + 1);
  });
}

/**
 * Soglie dei compensi sportivi dilettantistici, sull'anno solare in cui il pagamento arriva
 * (cumulative tra tutte le società sportive):
 * fino a 5.000 € niente contributi né tasse; oltre, contributi INPS sulla parte eccedente;
 * oltre 15.000 € anche l'IRPEF sulla parte che li supera.
 */
export const SOGLIA_INPS = 5000;
export const SOGLIA_IRPEF = 15000;

/** Il compenso di un mese arriva il mese dopo: dicembre si incassa a gennaio */
export const mesePagamento = (ym: string) => spostaChiave(ym, 1);

function spostaChiave(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const k = y * 12 + m - 1 + delta;
  return ymChiave(Math.floor(k / 12), (k % 12) + 1);
}

export interface AnnoStorico {
  /** Anno solare dei pagamenti */
  anno: number;
  /** Mesi di lavoro pagati in quell'anno, fino a `fino` compreso: da dicembre dell'anno prima */
  mesi: string[];
  ore: number;
  /** Di quei mesi, quelli senza dati né nell'app né nell'archivio */
  mancanti: string[];
}

/**
 * Le soglie contano i compensi per data di pagamento: nell'anno `anno` entrano i mesi di lavoro
 * da dicembre dell'anno prima a novembre, fino al mese `fino` compreso.
 */
export function riepilogoAnno(anno: number, fino: string, turni: Turno[], archivio?: Pick<Archivio, 'mesi'>, manuali?: OreManuali): AnnoStorico {
  const mesi: string[] = [];
  for (let ym = ymChiave(anno - 1, 12); ym <= ymChiave(anno, 11) && ym <= fino; ym = spostaChiave(ym, 1)) mesi.push(ym);
  let ore = 0;
  const mancanti: string[] = [];
  for (const ym of mesi) {
    const r = riepilogoMese(ym, turni, archivio, manuali);
    ore += r.ore;
    if (r.fonte === 'nessuna') mancanti.push(ym);
  }
  return { anno, mesi, ore: arrotonda(ore), mancanti };
}

// ---------------------------------------------------------------------------
// Controlli sull'archivio

export type Controllo =
  | { tipo: 'minuti'; chiave: string; ym: string; day: number; scritto: number; proposta: number }
  | { tipo: 'copia'; chiave: string; a: string; b: string };

/**
 * «8.45» in un foglio ore quasi sempre vuol dire 8 ore e 45 minuti (8,75), non 8,45 ore:
 * i turni durano a quarti d'ora. Lo stesso per ,15 e ,30.
 */
export function minutiScrittiComeDecimali(hours: number): number | undefined {
  const h = Math.floor(hours + 1e-9);
  const centesimi = Math.round((hours - h) * 100);
  if (![15, 30, 45].includes(centesimi)) return undefined;
  return arrotonda(h + centesimi / 60);
}

const firma = (m: MeseArchivio) => m.voci.map((v) => `${v.day}:${v.col ?? ''}${v.hours}`).join('|');

export function controlliArchivio(archivio: Pick<Archivio, 'mesi' | 'ignorati'>, manuali: OreManuali = {}): Controllo[] {
  const out: Controllo[] = [];
  for (const m of archivio.mesi) {
    for (const v of m.voci) {
      const proposta = minutiScrittiComeDecimali(v.hours);
      if (proposta !== undefined && !(m.ym in manuali)) out.push({ tipo: 'minuti', chiave: `minuti|${m.ym}|${v.day}|${v.hours}`, ym: m.ym, day: v.day, scritto: v.hours, proposta });
    }
  }
  const mesi = [...archivio.mesi].sort((a, b) => a.ym.localeCompare(b.ym));
  for (let i = 0; i < mesi.length; i++) {
    for (let j = i + 1; j < mesi.length; j++) {
      // Se hai già corretto a mano uno dei due mesi, il dubbio è risolto
      if (mesi[i].ym in manuali || mesi[j].ym in manuali) continue;
      if (firma(mesi[i]) === firma(mesi[j])) out.push({ tipo: 'copia', chiave: `copia|${mesi[i].ym}|${mesi[j].ym}`, a: mesi[i].ym, b: mesi[j].ym });
    }
  }
  return out.filter((c) => !archivio.ignorati.includes(c.chiave));
}

/** Applica la correzione proposta per le ore di un giorno */
export function correggiOre(archivio: Archivio, ym: string, day: number, ore: number, scritto?: number): Archivio {
  // Con più mansioni nello stesso giorno, solo la voce con il valore sbagliato
  const questa = (v: VoceGiorno) => v.day === day && (scritto === undefined || v.hours === scritto);
  return {
    ...archivio,
    mesi: archivio.mesi.map((m) => (m.ym !== ym ? m : { ...m, voci: m.voci.map((v) => (questa(v) ? { ...v, hours: ore } : v)) })),
  };
}

// ---------------------------------------------------------------------------
// Casellario giudiziario

/**
 * Il certificato del casellario (lavoro a contatto con minori) si rinnova ogni stagione:
 * la società toglie 5 € dal primo stipendio, di solito quello di ottobre (lavoro di settembre).
 */
export const COSTO_CASELLARIO = 5;

/**
 * Detrazione sul compenso di un mese di lavoro: c'è se quel mese si incassa nel mese dello
 * stipendio scelto (1–12; 0 = nessuna detrazione) e se nel mese hai lavorato.
 */
export function detrazioneMese(ymLavoro: string, meseStipendio: number, ore: number): number {
  if (!meseStipendio || ore <= 0) return 0;
  return Number(mesePagamento(ymLavoro).slice(5, 7)) === meseStipendio ? COSTO_CASELLARIO : 0;
}

/** Compensi dell'anno (per data di pagamento), ognuno alla tariffa della sua mansione, già senza le detrazioni */
export function compensoAnno(a: AnnoStorico, imp: Pick<Impostazioni, 'mansioni' | 'casellario'>, turni: Turno[], archivio?: Pick<Archivio, 'mesi'>, manuali?: OreManuali): { euro: number; detrazioni: number } {
  let lordo = 0;
  let detrazioni = 0;
  for (const ym of a.mesi) {
    const r = riepilogoMese(ym, turni, archivio, manuali, imp);
    lordo += r.euro;
    detrazioni += detrazioneMese(ym, imp.casellario, r.ore);
  }
  return { euro: Math.max(0, Math.round((lordo - detrazioni) * 100) / 100), detrazioni };
}
