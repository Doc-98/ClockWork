import type { SheetData, CellValue } from '../xlsx/read';
import { serialToDate } from '../xlsx/read';
import { parseIntervallo, parseOraCella, type Minuti } from './orari';

/**
 * Lettura del foglio turni "Assistenti Spogliatoio": un foglio per mese, quattro sezioni.
 *   spogliatoio Maschile / Femminile: coppie "postazione N" + "orario pN" ("15:30 - 20:00")
 *   spogliatoio Piccoli: fino a 6 postazioni + "orario inizio" / "orario termine" comuni
 *   Assistenti atrio: nome, inizio, fine (frazioni di giorno)
 * Un asterisco sul nome indica la presa (Leoniani/Asilo): vale l'orario anticipato.
 * Un nome tra parentesi indica una persona in prova.
 */

export type Area = 'maschile' | 'femminile' | 'piccoli' | 'atrio';

export interface TurnoLetto {
  /** YYYY-MM-DD */
  data: string;
  area: Area;
  postazione?: number;
  /** Nome come scritto nel foglio, ripulito da spazi, asterischi e parentesi */
  nome: string;
  inizio: Minuti;
  fine: Minuti;
  presa: boolean;
  prova: boolean;
  /** L'orario nel foglio era doppio (es. "15:30 / 15:45"): scelto in base all'asterisco */
  orarioDoppio: boolean;
  foglio: string;
  riga: number;
}

export interface EsitoLettura {
  turni: TurnoLetto[];
  avvisi: string[];
  /** Mese del foglio, se il nome è del tipo "Ottobre 26" */
  mese?: { year: number; month: number };
}

const MESI_NOMI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MESI_ABBR = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

export function meseDalNomeFoglio(nome: string): { year: number; month: number } | undefined {
  const m = /^\s*([a-zà-ù]+)\s*'?(\d{2}|\d{4})\s*$/i.exec(nome);
  if (!m) return undefined;
  const month = MESI_NOMI.indexOf(m[1].toLowerCase()) + 1;
  if (!month) return undefined;
  const y = Number(m[2]);
  return { year: y < 100 ? 2000 + y : y, month };
}

export function normalizzaNome(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function giornoSettimana(v: CellValue | undefined): number {
  if (typeof v !== 'string') return -1;
  return GIORNI.indexOf(v.trim().toLowerCase().replace(/i$/, 'ì'));
}

function sezioneDi(v: CellValue | undefined): Area | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.toLowerCase();
  if (s.includes('spogliatoio') && s.includes('maschil')) return 'maschile';
  if (s.includes('spogliatoio') && s.includes('femmin')) return 'femminile';
  if (s.includes('spogliatoio') && s.includes('piccol')) return 'piccoli';
  if (s.includes('atrio')) return 'atrio';
  return undefined;
}

/** Data esplicita della cella: seriale Excel o testo "05-dic". */
function dataDaCella(v: CellValue | undefined, anno?: number): Date | undefined {
  if (typeof v === 'number' && v > 30000 && v < 80000) return serialToDate(v);
  if (typeof v === 'string') {
    const m = /^\s*(\d{1,2})\s*[-/ ]\s*([a-z]{3})/i.exec(v);
    if (m && anno) {
      const month = MESI_ABBR.indexOf(m[2].toLowerCase());
      if (month >= 0) return new Date(anno, month, Number(m[1]));
    }
  }
  return undefined;
}

interface Colonne {
  area: Area;
  /** coppie nome/orario (maschile, femminile) */
  coppie?: { postazione: number; nome: number; orario: number }[];
  /** nomi con orario comune (piccoli, atrio) */
  nomi?: { postazione?: number; col: number }[];
  inizio?: number;
  fine?: number;
}

function colonneDaIntestazione(area: Area, header: Map<number, CellValue>): Colonne | undefined {
  const testo = [...header.entries()].map(([c, v]) => [c, String(v).toLowerCase().trim()] as const);
  if (area === 'maschile' || area === 'femminile') {
    const coppie: NonNullable<Colonne['coppie']> = [];
    for (const [c, t] of testo) {
      const p = /^postazione\s*(\d+)/.exec(t);
      if (!p) continue;
      const n = Number(p[1]);
      const orario = testo.find(([, t2]) => new RegExp(`^orario\\s*p\\s*${n}\\b`).test(t2));
      if (orario) coppie.push({ postazione: n, nome: c, orario: orario[0] });
    }
    return coppie.length ? { area, coppie } : undefined;
  }
  if (area === 'piccoli') {
    const nomi = testo
      .map(([c, t]) => ({ c, p: /^postazione\s*(\d+)/.exec(t) }))
      .filter((x) => x.p)
      .map((x) => ({ postazione: Number(x.p![1]), col: x.c }));
    const inizio = testo.find(([, t]) => t.startsWith('orario inizio'))?.[0];
    const fine = testo.find(([, t]) => t.startsWith('orario termine'))?.[0];
    return nomi.length && inizio && fine ? { area, nomi, inizio, fine } : undefined;
  }
  return undefined;
}

interface Persona {
  nome: string;
  presa: boolean;
  prova: boolean;
}

/** "BerettaC.*" → BerettaC. con presa; "(Ling)" → in prova; "Marta/GiuliaL." → due persone. */
export function personeDaCella(v: CellValue | undefined): Persona[] {
  if (typeof v !== 'string') return [];
  return v
    .split('/')
    .map((raw) => {
      const presa = raw.includes('*');
      const prova = /\(.*\)/.test(raw);
      const nome = raw.replace(/[*()]/g, '').trim();
      return { nome, presa, prova };
    })
    .filter((p) => normalizzaNome(p.nome).length > 1);
}

export function leggiFoglioTurni(sheet: SheetData): EsitoLettura {
  const avvisi: string[] = [];
  const mese = meseDalNomeFoglio(sheet.name);
  const righe = [...sheet.rows.keys()].sort((a, b) => a - b);
  const turni: TurnoLetto[] = [];

  let colonne: Colonne | undefined;
  let area: Area | undefined;
  // righe di dati della sezione corrente, per risolvere le date mancanti
  let blocco: { riga: number; cells: Map<number, CellValue> }[] = [];

  const chiudiBlocco = () => {
    if (!colonne || !blocco.length) {
      blocco = [];
      return;
    }
    const date = risolviDate(blocco.map((b) => b.cells), mese?.year, sheet.name, avvisi, blocco.map((b) => b.riga));
    blocco.forEach((b, i) => {
      const d = date[i];
      if (!d) return;
      if (mese && (d.getFullYear() !== mese.year || d.getMonth() + 1 !== mese.month)) return;
      turni.push(...turniDaRiga(colonne!, b.cells, iso(d), sheet.name, b.riga, avvisi));
    });
    blocco = [];
  };

  for (const r of righe) {
    const cells = sheet.rows.get(r)!;
    const nuova = sezioneDi(cells.get(2));
    if (nuova) {
      chiudiBlocco();
      area = nuova;
      colonne = nuova === 'atrio' ? { area: 'atrio' } : undefined;
      continue;
    }
    if (!area) continue;
    if (!colonne || (colonne.area !== 'atrio' && [...cells.values()].some((v) => typeof v === 'string' && /^postazione/i.test(v.trim())))) {
      if (area !== 'atrio') {
        const c = colonneDaIntestazione(area, cells);
        if (c) colonne = c;
      }
      continue;
    }
    if (giornoSettimana(cells.get(2)) >= 0) blocco.push({ riga: r, cells });
  }
  chiudiBlocco();
  return { turni, avvisi, mese };
}

function risolviDate(
  rows: Map<number, CellValue>[],
  anno: number | undefined,
  foglio: string,
  avvisi: string[],
  numeri: number[],
): (Date | undefined)[] {
  // 1) date esplicite coerenti con il giorno della settimana
  const out: (Date | undefined)[] = rows.map((cells) => {
    const d = dataDaCella(cells.get(3), anno);
    return d && d.getDay() === giornoSettimana(cells.get(2)) ? d : undefined;
  });
  // 2) date mancanti o sbagliate: righe consecutive = giorni consecutivi
  for (let i = 0; i < out.length; i++) {
    if (out[i]) continue;
    const prev = out.slice(0, i).findLastIndex((d) => d);
    const next = out.findIndex((d, j) => j > i && d);
    let guess: Date | undefined;
    if (prev >= 0) guess = new Date(out[prev]!.getFullYear(), out[prev]!.getMonth(), out[prev]!.getDate() + (i - prev));
    else if (next >= 0) guess = new Date(out[next]!.getFullYear(), out[next]!.getMonth(), out[next]!.getDate() - (next - i));
    if (guess && guess.getDay() === giornoSettimana(rows[i].get(2))) out[i] = guess;
    else avvisi.push(`${foglio}, riga ${numeri[i]}: data non riconosciuta, riga ignorata.`);
  }
  return out;
}

function turniDaRiga(c: Colonne, cells: Map<number, CellValue>, data: string, foglio: string, riga: number, avvisi: string[]): TurnoLetto[] {
  const out: TurnoLetto[] = [];
  const base = { data, area: c.area, foglio, riga };

  if (c.coppie) {
    for (const p of c.coppie) {
      const persone = personeDaCella(cells.get(p.nome));
      if (!persone.length) continue;
      const iv = parseIntervallo(cells.get(p.orario));
      if (!iv) {
        avvisi.push(`${foglio}, riga ${riga}: orario non leggibile per ${persone.map((x) => x.nome).join('/')} («${cells.get(p.orario) ?? ''}»).`);
        continue;
      }
      for (const pers of persone) {
        out.push({ ...base, postazione: p.postazione, ...pers, inizio: iv.inizio, fine: iv.fine, orarioDoppio: false });
      }
    }
    return out;
  }

  // Piccoli e atrio: orario comune alla riga
  const nomi = c.nomi ?? [{ col: 4 }];
  const colInizio = c.inizio ?? 5;
  const colFine = c.fine ?? 6;
  const ini = parseOraCella(cells.get(colInizio));
  const fin = parseOraCella(cells.get(colFine));
  for (const n of nomi) {
    const persone = personeDaCella(cells.get(n.col));
    if (!persone.length) continue;
    if (!ini || !fin) {
      avvisi.push(`${foglio}, riga ${riga}: orario non leggibile per ${persone.map((x) => x.nome).join('/')}.`);
      continue;
    }
    for (const pers of persone) {
      const inizio = pers.presa && ini.anticipato !== undefined ? ini.anticipato : ini.normale;
      const fine = pers.presa && fin.anticipato !== undefined ? fin.anticipato : fin.normale;
      if (fine <= inizio) {
        avvisi.push(`${foglio}, riga ${riga}: orario incoerente per ${pers.nome}.`);
        continue;
      }
      out.push({
        ...base,
        postazione: n.postazione,
        ...pers,
        inizio,
        fine,
        orarioDoppio: ini.anticipato !== undefined || fin.anticipato !== undefined,
      });
    }
  }
  return out;
}

/** I turni di una persona, dati i suoi nomi possibili nel foglio (es. ["Vincenzo"]). */
export function turniDi(turni: TurnoLetto[], alias: string[]): TurnoLetto[] {
  const set = new Set(alias.map(normalizzaNome).filter(Boolean));
  return turni.filter((t) => set.has(normalizzaNome(t.nome)));
}

export function oreTurno(t: Pick<TurnoLetto, 'inizio' | 'fine'>): number {
  return Math.round(((t.fine - t.inizio) / 60) * 100) / 100;
}
