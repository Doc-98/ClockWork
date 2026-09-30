import { XlsxPackage, listSheets, decodeXml, attr, type SheetInfo } from './zip';
import { colToIndex } from './cells';

/** Valore di una cella letta: numero (anche date/orari come seriali Excel), testo o vuoto. */
export type CellValue = number | string | boolean | null;

export interface SheetData {
  name: string;
  state: SheetInfo['state'];
  /** righe[numeroRiga][indiceColonna] con indici a base 1, come in Excel. */
  rows: Map<number, Map<number, CellValue>>;
}

function readSharedStrings(pkg: XlsxPackage): string[] {
  if (!pkg.has('xl/sharedStrings.xml')) return [];
  const xml = pkg.text('xl/sharedStrings.xml');
  const out: string[] = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    // Testo semplice o "rich text" con più <r><t>; ignora le annotazioni fonetiche
    const body = si[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    const texts = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]));
    out.push(texts.join(''));
  }
  return out;
}

function parseSheet(xml: string, shared: string[]): Map<number, Map<number, CellValue>> {
  const rows = new Map<number, Map<number, CellValue>>();
  for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const head = `<c${c[1]}>`;
    const ref = attr(head, 'r');
    if (!ref) continue;
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!m) continue;
    const body = c[2] ?? '';
    const t = attr(head, 't');
    let value: CellValue = null;
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    if (t === 's' && v !== undefined) value = shared[Number(v)] ?? null;
    else if (t === 'inlineStr') {
      value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decodeXml(x[1])).join('');
    } else if (t === 'str' && v !== undefined) value = decodeXml(v);
    else if (t === 'b' && v !== undefined) value = v === '1';
    else if (t === 'e') value = null;
    else if (v !== undefined) value = Number(v);
    if (value === null || value === '') continue;
    const row = Number(m[2]);
    if (!rows.has(row)) rows.set(row, new Map());
    rows.get(row)!.set(colToIndex(m[1]), value);
  }
  return rows;
}

export function readWorkbook(bytes: Uint8Array): SheetData[] {
  const pkg = XlsxPackage.open(bytes);
  const shared = readSharedStrings(pkg);
  return listSheets(pkg).map((s) => ({
    name: s.name,
    state: s.state,
    rows: parseSheet(pkg.text(s.path), shared),
  }));
}

/** Converte un seriale Excel (sistema 1900) in data locale a mezzanotte. */
export function serialToDate(serial: number): Date {
  const utc = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
  const d = new Date(utc);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function dateToSerial(d: Date): number {
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
}
