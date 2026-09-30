import { attr, escapeXml } from './zip';

/**
 * Modifiche mirate a singole celle dentro l'XML di un foglio.
 * Tutto il resto del file (stili, bordi, colonne, disegni) resta intatto.
 */

export type CellContent =
  | { kind: 'empty' }
  | { kind: 'number'; value: number }
  | { kind: 'text'; value: string }
  /** Mantiene la formula esistente e aggiorna solo il valore in cache. */
  | { kind: 'formulaCache'; value: number };

export interface CellEdit {
  content: CellContent;
  /** Indice di stile da applicare; se assente resta quello attuale. */
  style?: number;
}

export function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function splitRef(ref: string): { col: string; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Riferimento di cella non valido: ${ref}`);
  return { col: m[1], row: Number(m[2]) };
}

const cellRe = (ref: string) => new RegExp(`<c r="${ref}"(?=[\\s/>])[^>]*?(?:/>|>[\\s\\S]*?</c>)`);

/** Restituisce il markup attuale della cella, o undefined se non esiste. */
export function findCell(xml: string, ref: string): string | undefined {
  return cellRe(ref).exec(xml)?.[0];
}

export function cellStyle(xml: string, ref: string): number | undefined {
  const c = findCell(xml, ref);
  const s = c ? attr(c.slice(0, c.indexOf('>') + 1), 's') : undefined;
  return s === undefined ? undefined : Number(s);
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Numero non valido: ${n}`);
  // Evita rumore tipo 3.7499999999: arrotonda a 6 decimali
  return String(Math.round(n * 1e6) / 1e6);
}

function buildCell(ref: string, style: number | undefined, content: CellContent, existing?: string): string {
  const s = style === undefined ? '' : ` s="${style}"`;
  switch (content.kind) {
    case 'empty':
      return `<c r="${ref}"${s}/>`;
    case 'number':
      return `<c r="${ref}"${s}><v>${formatNumber(content.value)}</v></c>`;
    case 'text':
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(content.value)}</t></is></c>`;
    case 'formulaCache': {
      const f = existing ? /<f\b[^>]*(?:\/>|>[\s\S]*?<\/f>)/.exec(existing)?.[0] : undefined;
      if (!f) throw new Error(`La cella ${ref} non contiene una formula`);
      return `<c r="${ref}"${s}>${f}<v>${formatNumber(content.value)}</v></c>`;
    }
  }
}

/** Applica una modifica a una cella; se la cella non esiste la crea nella riga giusta. */
export function setCell(xml: string, ref: string, edit: CellEdit): string {
  const existing = findCell(xml, ref);
  if (existing) {
    const openTag = existing.slice(0, existing.indexOf('>') + 1);
    const cur = attr(openTag, 's');
    const style = edit.style ?? (cur === undefined ? undefined : Number(cur));
    return xml.replace(existing, buildCell(ref, style, edit.content, existing));
  }
  return insertCell(xml, ref, buildCell(ref, edit.style, edit.content));
}

function insertCell(xml: string, ref: string, cell: string): string {
  const { col, row } = splitRef(ref);
  const rowRe = new RegExp(`<row r="${row}"(?=[\\s/>])[^>]*?(?:/>|>[\\s\\S]*?</row>)`);
  const rowMatch = rowRe.exec(xml);
  if (!rowMatch) throw new Error(`Riga ${row} assente nel foglio: impossibile creare ${ref}`);
  const rowXml = rowMatch[0];
  if (rowXml.endsWith('/>')) {
    const open = rowXml.slice(0, -2) + '>';
    return xml.replace(rowXml, `${open}${cell}</row>`);
  }
  const target = colToIndex(col);
  let insertAt = rowXml.lastIndexOf('</row>');
  for (const m of rowXml.matchAll(/<c r="([A-Z]+)\d+"/g)) {
    if (colToIndex(m[1]) > target) {
      insertAt = m.index!;
      break;
    }
  }
  const newRow = rowXml.slice(0, insertAt) + cell + rowXml.slice(insertAt);
  return xml.replace(rowXml, newRow);
}
