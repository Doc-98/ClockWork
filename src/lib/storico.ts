import { readWorkbook, serialToDate, type CellValue, type SheetData } from './xlsx/read';
import { meseDalNomeFoglio } from './turni/parse';
import { oreDi, type Turno } from './model';
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

function leggiFoglio(sheet: SheetData): MeseArchivio | undefined {
  // Riga di intestazione: quella con la colonna delle ore
  let rigaInt = 0;
  let colOre = 0;
  for (const [r, riga] of [...sheet.rows.entries()].sort((a, b) => a[0] - b[0])) {
    for (const [c, v] of riga) {
      if (RE_COLONNA_ORE.test(testo(v))) {
        rigaInt = r;
        colOre = c;
        break;
      }
    }
    if (rigaInt) break;
  }
  if (!rigaInt) return undefined;
  const intestazione = sheet.rows.get(rigaInt)!;
  const colGiorno = [...intestazione.entries()].find(([, v]) => testo(v).toLowerCase() === 'giorno')?.[0] ?? 2;

  const voci: VoceGiorno[] = [];
  for (let r = rigaInt + 1; r <= rigaInt + 40; r++) {
    const riga = sheet.rows.get(r);
    if (!riga) continue;
    if (/^totale/i.test(testo(riga.get(colGiorno)))) break;
    const day = numero(riga.get(colGiorno));
    if (!day || !Number.isInteger(day) || day < 1 || day > 31) continue;
    const hours = numero(riga.get(colOre));
    if (!hours) continue;
    const note = testo(riga.get(colOre + 1)) || undefined;
    voci.push({ day, hours, note });
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

/** Legge l'archivio dei fogli ore: un foglio per mese, ore nella colonna «Assistente spogliatoio nuoto curricolare». */
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
  fonte: 'app' | 'archivio' | 'nessuna';
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;
/** Nell'archivio le sostituzioni sono scritte a mano: «sost …», «sostit …», «sostituzione …» */
export const eSostituzione = (nota?: string) => /^\s*sost/i.test(nota ?? '');

export function riepilogoMese(ym: string, turni: Turno[], archivio?: Pick<Archivio, 'mesi'>): MeseStorico {
  const suoi = turni.filter((t) => !t.annullato && t.data.startsWith(`${ym}-`));
  if (suoi.length) {
    const sost = suoi.filter((t) => t.sostituisce);
    return {
      ym,
      ore: arrotonda(suoi.reduce((s, t) => s + oreDi(t), 0)),
      oreSost: arrotonda(sost.reduce((s, t) => s + oreDi(t), 0)),
      nSost: sost.length,
      fonte: 'app',
    };
  }
  const a = archivio?.mesi.find((m) => m.ym === ym);
  if (a) {
    const sost = a.voci.filter((v) => eSostituzione(v.note));
    return {
      ym,
      ore: arrotonda(a.voci.reduce((s, v) => s + v.hours, 0)),
      oreSost: arrotonda(sost.reduce((s, v) => s + v.hours, 0)),
      nSost: sost.length,
      fonte: 'archivio',
    };
  }
  return { ym, ore: 0, oreSost: 0, nSost: 0, fonte: 'nessuna' };
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

export interface AnnoStorico {
  anno: number;
  ore: number;
  /** Mesi dell'anno, fino a `fino`, senza dati né nell'app né nell'archivio */
  mancanti: string[];
}

export function riepilogoAnno(anno: number, fino: string, turni: Turno[], archivio?: Pick<Archivio, 'mesi'>): AnnoStorico {
  const ultimo = fino.startsWith(`${anno}-`) ? Number(fino.slice(5, 7)) : 12;
  let ore = 0;
  const mancanti: string[] = [];
  for (let m = 1; m <= ultimo; m++) {
    const r = riepilogoMese(ymChiave(anno, m), turni, archivio);
    ore += r.ore;
    if (r.fonte === 'nessuna') mancanti.push(r.ym);
  }
  return { anno, ore: arrotonda(ore), mancanti };
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

const firma = (m: MeseArchivio) => m.voci.map((v) => `${v.day}:${v.hours}`).join('|');

export function controlliArchivio(archivio: Pick<Archivio, 'mesi' | 'ignorati'>): Controllo[] {
  const out: Controllo[] = [];
  for (const m of archivio.mesi) {
    for (const v of m.voci) {
      const proposta = minutiScrittiComeDecimali(v.hours);
      if (proposta !== undefined) out.push({ tipo: 'minuti', chiave: `minuti|${m.ym}|${v.day}|${v.hours}`, ym: m.ym, day: v.day, scritto: v.hours, proposta });
    }
  }
  const mesi = [...archivio.mesi].sort((a, b) => a.ym.localeCompare(b.ym));
  for (let i = 0; i < mesi.length; i++) {
    for (let j = i + 1; j < mesi.length; j++) {
      if (firma(mesi[i]) === firma(mesi[j])) out.push({ tipo: 'copia', chiave: `copia|${mesi[i].ym}|${mesi[j].ym}`, a: mesi[i].ym, b: mesi[j].ym });
    }
  }
  return out.filter((c) => !archivio.ignorati.includes(c.chiave));
}

/** Applica la correzione proposta per le ore di un giorno */
export function correggiOre(archivio: Archivio, ym: string, day: number, ore: number): Archivio {
  return {
    ...archivio,
    mesi: archivio.mesi.map((m) => (m.ym !== ym ? m : { ...m, voci: m.voci.map((v) => (v.day === day ? { ...v, hours: ore } : v)) })),
  };
}
