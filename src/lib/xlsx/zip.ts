import { unzipSync, zipSync, strFromU8, strToU8, type Zippable } from 'fflate';

/** Un file .xlsx aperto: le parti dell'archivio nell'ordine originale. */
export class XlsxPackage {
  private parts: Map<string, Uint8Array>;

  private constructor(parts: Map<string, Uint8Array>) {
    this.parts = parts;
  }

  static open(bytes: Uint8Array): XlsxPackage {
    const files = unzipSync(bytes);
    return new XlsxPackage(new Map(Object.entries(files)));
  }

  has(path: string): boolean {
    return this.parts.has(path);
  }

  text(path: string): string {
    const data = this.parts.get(path);
    if (!data) throw new Error(`Parte mancante nel file xlsx: ${path}`);
    return strFromU8(data);
  }

  setText(path: string, text: string): void {
    if (!this.parts.has(path)) throw new Error(`Parte mancante nel file xlsx: ${path}`);
    this.parts.set(path, strToU8(text));
  }

  paths(): string[] {
    return [...this.parts.keys()];
  }

  /** Richiude l'archivio mantenendo l'ordine delle parti. */
  save(): Uint8Array {
    const out: Zippable = {};
    for (const [path, data] of this.parts) out[path] = [data, { level: 6 }];
    return zipSync(out);
  }
}

/** Risolve un percorso relativo di una relazione (es. "worksheets/sheet2.xml" da "xl/"). */
export function resolvePart(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (baseDir + target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

/** Legge le relazioni di workbook.xml: id → percorso della parte. */
export function workbookRels(pkg: XlsxPackage): Map<string, string> {
  const rels = pkg.text('xl/_rels/workbook.xml.rels');
  const map = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) map.set(id, resolvePart('xl/', target));
  }
  return map;
}

export interface SheetInfo {
  name: string;
  state: 'visible' | 'hidden' | 'veryHidden';
  path: string;
}

export function listSheets(pkg: XlsxPackage): SheetInfo[] {
  const wb = pkg.text('xl/workbook.xml');
  const rels = workbookRels(pkg);
  const out: SheetInfo[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = decodeXml(attr(m[0], 'name') ?? '');
    const state = (attr(m[0], 'state') ?? 'visible') as SheetInfo['state'];
    const rid = attr(m[0], 'r:id');
    const path = rid ? rels.get(rid) : undefined;
    if (path) out.push({ name, state, path });
  }
  return out;
}

export function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`\\s${name.replace(':', '\\:')}="([^"]*)"`);
  return re.exec(tag)?.[1];
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}
