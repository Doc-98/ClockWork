import { XlsxPackage, listSheets, escapeXml } from '../xlsx/zip';
import { setCell, findCell, cellStyle } from '../xlsx/cells';
import { borderlessStyle } from '../xlsx/styles';
import { dateToSerial, readWorkbook } from '../xlsx/read';

/** Dove stanno le cose nel modello "FOGLIO ORE – GENERICO". */
export const LAYOUT = {
  /** Riga del giorno 1; il giorno d sta nella riga firstDayRow + d - 1. */
  firstDayRow: 12,
  dayCol: 'B',
  hoursCol: 'Q',
  noteCol: 'R',
  /** Colonne promemoria (giorno e giorno della settimana) da svuotare. */
  helperCols: ['O', 'P'],
  totalCell: 'Q43',
  compensoCell: 'Q45',
  dateCell: 'E4',
  monthCell: 'F6',
} as const;

export const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

export interface VoceGiorno {
  day: number;
  hours: number;
  /** Es. "sost greta spogl piccoli": finisce nella colonna R. */
  note?: string;
}

export interface OpzioniFoglio {
  year: number;
  /** 1–12 */
  month: number;
  voci: VoceGiorno[];
  /** Data scritta in alto (E4). Default: ultimo giorno del mese. */
  data?: Date;
}

export interface EsitoFoglio {
  bytes: Uint8Array;
  totaleOre: number;
  nomeFile: string;
}

export class ModelloNonRiconosciuto extends Error {}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Raggruppa più turni nello stesso giorno: somma le ore, unisce le note. */
export function raggruppaPerGiorno(voci: VoceGiorno[]): Map<number, { hours: number; notes: string[] }> {
  const out = new Map<number, { hours: number; notes: string[] }>();
  for (const v of voci) {
    if (!Number.isInteger(v.day) || v.day < 1 || v.day > 31) throw new Error(`Giorno non valido: ${v.day}`);
    if (!(v.hours >= 0)) throw new Error(`Ore non valide il giorno ${v.day}: ${v.hours}`);
    const cur = out.get(v.day) ?? { hours: 0, notes: [] };
    cur.hours = round2(cur.hours + v.hours);
    if (v.note?.trim()) cur.notes.push(v.note.trim());
    out.set(v.day, cur);
  }
  return out;
}

function checkTemplate(sheet: string): void {
  for (const d of [1, 15, 31]) {
    const ref = `${LAYOUT.dayCol}${LAYOUT.firstDayRow + d - 1}`;
    const c = findCell(sheet, ref);
    const v = c ? /<v>([^<]*)<\/v>/.exec(c)?.[1] : undefined;
    if (v === undefined || Number(v) !== d) {
      throw new ModelloNonRiconosciuto(`Nel modello la cella ${ref} dovrebbe contenere il giorno ${d}.`);
    }
  }
  const tot = findCell(sheet, LAYOUT.totalCell);
  if (!tot || !/<f>\s*SUM\(/i.test(tot)) {
    throw new ModelloNonRiconosciuto(`Nel modello la cella ${LAYOUT.totalCell} dovrebbe contenere la somma delle ore.`);
  }
}

/**
 * Compila il foglio ore partendo dal modello originale.
 * Tocca solo: colonna Q (ore), colonna R (note), O–P (svuotate), Q43 (valore del totale),
 * Q45 (svuotata e senza bordi), data E4, mese F6 e nome del foglio visibile.
 */
export function generaFoglioOre(template: Uint8Array, opt: OpzioniFoglio): EsitoFoglio {
  const { year, month } = opt;
  if (month < 1 || month > 12) throw new Error(`Mese non valido: ${month}`);
  const giorniNelMese = new Date(year, month, 0).getDate();
  const perGiorno = raggruppaPerGiorno(opt.voci);
  for (const d of perGiorno.keys()) {
    if (d > giorniNelMese) throw new Error(`Il ${d} non esiste in ${MESI[month - 1]} ${year}`);
  }

  const pkg = XlsxPackage.open(template);
  const sheets = listSheets(pkg);
  const visible = sheets.filter((s) => s.state === 'visible');
  if (visible.length !== 1) {
    throw new ModelloNonRiconosciuto(`Il modello dovrebbe avere un solo foglio visibile, ne ha ${visible.length}.`);
  }
  const target = visible[0];
  let sheet = pkg.text(target.path);
  checkTemplate(sheet);

  let totale = 0;
  for (let d = 1; d <= 31; d++) {
    const row = LAYOUT.firstDayRow + d - 1;
    for (const col of LAYOUT.helperCols) {
      sheet = setCell(sheet, `${col}${row}`, { content: { kind: 'empty' } });
    }
    const voce = d <= giorniNelMese ? perGiorno.get(d) : undefined;
    const ore = voce && voce.hours > 0 ? voce.hours : undefined;
    sheet = setCell(sheet, `${LAYOUT.hoursCol}${row}`, {
      content: ore === undefined ? { kind: 'empty' } : { kind: 'number', value: ore },
    });
    const nota = voce?.notes.join('; ');
    sheet = setCell(sheet, `${LAYOUT.noteCol}${row}`, {
      content: nota ? { kind: 'text', value: nota } : { kind: 'empty' },
    });
    if (ore) totale = round2(totale + ore);
  }

  // Il totale resta una formula: aggiorno solo il valore mostrato da chi non ricalcola (es. anteprime).
  sheet = setCell(sheet, LAYOUT.totalCell, { content: { kind: 'formulaCache', value: totale } });

  // Q45: via il compenso e via i bordi.
  const q45Style = cellStyle(sheet, LAYOUT.compensoCell);
  if (q45Style !== undefined) {
    const styled = borderlessStyle(pkg.text('xl/styles.xml'), q45Style);
    pkg.setText('xl/styles.xml', styled.styles);
    sheet = setCell(sheet, LAYOUT.compensoCell, { content: { kind: 'empty' }, style: styled.index });
  } else {
    sheet = setCell(sheet, LAYOUT.compensoCell, { content: { kind: 'empty' } });
  }

  const data = opt.data ?? new Date(year, month, 0);
  sheet = setCell(sheet, LAYOUT.dateCell, { content: { kind: 'number', value: dateToSerial(data) } });
  sheet = setCell(sheet, LAYOUT.monthCell, { content: { kind: 'text', value: MESI[month - 1] } });
  pkg.setText(target.path, sheet);

  // Nome del foglio visibile ("Ottobre 26") e ricalcolo all'apertura in Excel.
  const nomeFoglio = `${MESI[month - 1]} ${String(year).slice(-2)}`;
  let wb = pkg.text('xl/workbook.xml');
  const nameAttr = `name="${escapeXml(target.name)}"`;
  const others = sheets.filter((s) => s !== target).map((s) => s.name);
  if (!others.includes(nomeFoglio)) {
    wb = wb.replace(new RegExp(`(<sheet\\b[^>]*?)${nameAttr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `$1name="${escapeXml(nomeFoglio)}"`);
  }
  wb = wb.replace(/<calcPr\s*\/>/, '<calcPr fullCalcOnLoad="1"/>').replace(/<calcPr\b(?![^>]*fullCalcOnLoad)([^>]*?)(\/?)>/, '<calcPr$1 fullCalcOnLoad="1"$2>');
  pkg.setText('xl/workbook.xml', wb);

  const nome = nomeCollaboratore(template);
  return {
    bytes: pkg.save(),
    totaleOre: totale,
    nomeFile: `FOGLIO ORE - ${nome ? nome + ' - ' : ''}${MESI[month - 1]} ${year}.xlsx`,
  };
}

/** Nome scritto nel modello (cella E5), se presente. */
export function nomeCollaboratore(template: Uint8Array): string | undefined {
  const visible = readWorkbook(template).find((s) => s.state === 'visible');
  const v = visible?.rows.get(5)?.get(5);
  return typeof v === 'string' && v.trim() ? v.trim().replace(/[\\/:*?"<>|]/g, '') : undefined;
}

/** Controlla che un file caricato sia il modello atteso. Lancia ModelloNonRiconosciuto se no. */
export function validaModello(template: Uint8Array): { nome?: string } {
  let pkg: XlsxPackage;
  try {
    pkg = XlsxPackage.open(template);
  } catch {
    throw new ModelloNonRiconosciuto('Il file non è un .xlsx valido.');
  }
  const visible = listSheets(pkg).filter((s) => s.state === 'visible');
  if (visible.length !== 1) {
    throw new ModelloNonRiconosciuto(`Il modello dovrebbe avere un solo foglio visibile, ne ha ${visible.length}.`);
  }
  checkTemplate(pkg.text(visible[0].path));
  return { nome: nomeCollaboratore(template) };
}
