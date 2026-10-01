import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { XlsxPackage, listSheets } from '../xlsx/zip';
import { readWorkbook, serialToDate, type CellValue } from '../xlsx/read';
import { cellStyle, colToIndex } from '../xlsx/cells';
import { listXfs } from '../xlsx/styles';
import { LAYOUT } from './genera';

/**
 * PDF del foglio ore, ricavato dal file .xlsx già compilato: stessi testi, stesse colonne,
 * stessi colori d'intestazione. Serve dove il sistema non permette di condividere file Excel (Android).
 */

const COLONNE = Array.from({ length: colToIndex('T') - colToIndex('B') + 1 }, (_, i) => String.fromCharCode(66 + i)); // B..T
const RIGA_INTESTAZIONE = LAYOUT.firstDayRow - 1; // 11
const RIGA_TOTALE = 43;

/** Solo caratteri che il font standard sa scrivere (WinAnsi); il resto diventa '?'. */
function pulisci(s: string): string {
  return s.replace(/[^\x20-\x7E\xA0-\xFF’‘“”–—€…•«»]/g, '?');
}

function fmtNumero(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2 });
}

function fmtData(serial: number): string {
  const d = serialToDate(serial);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
}

function testo(v: CellValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return fmtNumero(v);
  return String(v);
}

/** Colore di riempimento (se pieno) dello stile di una cella. */
function riempimenti(styles: string): (string | undefined)[] {
  const fillsXml = /<fills\b[^>]*>([\s\S]*?)<\/fills>/.exec(styles)?.[1] ?? '';
  const fills = fillsXml.match(/<fill\/>|<fill>[\s\S]*?<\/fill>/g) ?? [];
  const colori = fills.map((f) => (/patternType="solid"/.test(f) ? /<fgColor rgb="(?:FF)?([0-9A-Fa-f]{6})"/.exec(f)?.[1] : undefined));
  return listXfs(styles).map((xf) => colori[Number(/fillId="(\d+)"/.exec(xf)?.[1] ?? 0)]);
}

function hex(h: string) {
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}

/** Spezza il testo in righe che stanno nella larghezza data. */
function aCapo(t: string, font: PDFFont, size: number, larghezza: number): string[] {
  const parole = pulisci(t).split(/\s+/).filter(Boolean);
  const righe: string[] = [];
  let cur = '';
  for (const p of parole) {
    const prova = cur ? `${cur} ${p}` : p;
    if (font.widthOfTextAtSize(prova, size) <= larghezza) cur = prova;
    else {
      if (cur) righe.push(cur);
      // parola più lunga della cella: la tronco
      let w = p;
      while (font.widthOfTextAtSize(w, size) > larghezza && w.length > 1) w = w.slice(0, -1);
      cur = w;
    }
  }
  if (cur) righe.push(cur);
  return righe;
}

export async function generaPdfFoglio(xlsx: Uint8Array): Promise<Uint8Array> {
  const pkg = XlsxPackage.open(xlsx);
  const visibile = listSheets(pkg).find((s) => s.state === 'visible')!;
  const sheetXml = pkg.text(visibile.path);
  const dati = readWorkbook(xlsx).find((s) => s.state === 'visible')!;
  const val = (col: string, row: number) => dati.rows.get(row)?.get(colToIndex(col));
  const fill = riempimenti(pkg.text('xl/styles.xml'));

  // Larghezze delle colonne come nel modello
  const larghezze = new Map<number, number>();
  for (const m of sheetXml.matchAll(/<col\b[^>]*>/g)) {
    const min = Number(/min="(\d+)"/.exec(m[0])?.[1]);
    const max = Number(/max="(\d+)"/.exec(m[0])?.[1]);
    const w = Number(/width="([\d.]+)"/.exec(m[0])?.[1] ?? 14.43);
    for (let c = min; c <= max; c++) larghezze.set(c, w);
  }

  const doc = await PDFDocument.create();
  doc.setTitle(pulisci(`${testo(val('B', 2))} – ${testo(val(LAYOUT.monthCell.replace(/\d+/, ''), 6))}`));
  doc.setCreator('ClockWork');
  doc.setProducer('ClockWork');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page: PDFPage = doc.addPage([841.89, 595.28]); // A4 orizzontale
  const { width: W, height: H } = page.getSize();
  const M = 26;
  const nero = rgb(0, 0, 0);
  const grigio = rgb(0.35, 0.35, 0.35);

  // Titolo
  let y = H - M - 14;
  const titolo = pulisci(testo(val('B', 2)));
  page.drawText(titolo, { x: (W - bold.widthOfTextAtSize(titolo, 14)) / 2, y, size: 14, font: bold, color: nero });

  // Dati in alto
  y -= 26;
  const riga = (etichetta: string, valore: string) => {
    page.drawText(pulisci(etichetta), { x: M, y, size: 9, font, color: grigio });
    page.drawText(pulisci(valore), { x: M + 110, y, size: 10, font: bold, color: nero });
    page.drawLine({ start: { x: M + 106, y: y - 3 }, end: { x: M + 300, y: y - 3 }, thickness: 0.5, color: grigio });
    y -= 17;
  };
  const dataV = val('E', 4);
  riga(testo(val('B', 4)), typeof dataV === 'number' ? fmtData(dataV) : testo(dataV));
  riga(testo(val('B', 5)), testo(val('E', 5)));
  riga(testo(val('B', 6)), testo(val('F', 6)));
  page.drawText(pulisci(testo(val('B', 7))), { x: M, y, size: 9, font, color: nero });
  y -= 15;
  page.drawText(pulisci(testo(val('B', 9))), { x: M, y, size: 8, font: font, color: grigio });
  y -= 10;

  // Tabella
  const wModello = COLONNE.map((c) => larghezze.get(colToIndex(c)) ?? 14.43);
  const scala = (W - 2 * M) / wModello.reduce((a, b) => a + b, 0);
  const wCol = wModello.map((w) => w * scala);
  const xCol = wCol.reduce<number[]>((acc, w, i) => (acc.push(i ? acc[i - 1] + wCol[i - 1] : M), acc), []);

  // Intestazioni: carattere ridotto quanto basta perché la parola più lunga stia nella colonna
  const sizeHeadMax = 5.6;
  const sizeHeadCol = COLONNE.map((c, i) => {
    const parole = pulisci(testo(val(c, RIGA_INTESTAZIONE))).split(/\s+/).filter(Boolean);
    let size = sizeHeadMax;
    while (size > 3.8 && parole.some((p) => bold.widthOfTextAtSize(p, size) > wCol[i] - 3)) size -= 0.2;
    return size;
  });
  const righeHead = COLONNE.map((c, i) => aCapo(testo(val(c, RIGA_INTESTAZIONE)), bold, sizeHeadCol[i], wCol[i] - 3));
  const sizeHead = sizeHeadMax;
  const hHead = Math.max(...righeHead.map((r) => r.length)) * (sizeHead + 1.2) + 6;
  const nRighe = RIGA_TOTALE - LAYOUT.firstDayRow + 1; // 31 giorni + totale
  const hRiga = Math.min(14, (y - M - hHead) / nRighe);
  const sizeCella = Math.min(8.5, hRiga - 4);

  const cella = (i: number, top: number, h: number, colore?: string) => {
    if (colore) page.drawRectangle({ x: xCol[i], y: top - h, width: wCol[i], height: h, color: hex(colore) });
    page.drawRectangle({ x: xCol[i], y: top - h, width: wCol[i], height: h, borderColor: nero, borderWidth: 0.4 });
  };

  // Intestazione
  COLONNE.forEach((c, i) => {
    const s = cellStyle(sheetXml, `${c}${RIGA_INTESTAZIONE}`);
    cella(i, y, hHead, s !== undefined ? fill[s] : undefined);
    const righe = righeHead[i];
    const blocco = righe.length * (sizeHead + 1.2);
    const sz = sizeHeadCol[i];
    righe.forEach((r, k) => {
      const tw = bold.widthOfTextAtSize(r, sz);
      page.drawText(r, { x: xCol[i] + (wCol[i] - tw) / 2, y: y - (hHead - blocco) / 2 - (k + 1) * (sizeHead + 1.2) + 1.5, size: sz, font: bold, color: nero });
    });
  });
  y -= hHead;

  // Giorni e totale
  for (let r: number = LAYOUT.firstDayRow; r <= RIGA_TOTALE; r++) {
    const totale = r === RIGA_TOTALE;
    COLONNE.forEach((c, i) => {
      cella(i, y, hRiga);
      const v = val(c, r);
      if (v === null || v === undefined || v === '') return;
      const f = totale || c === 'B' ? bold : font;
      const t = pulisci(testo(v));
      if (typeof v === 'string' && c !== 'B') {
        // Note (es. sostituzioni): su due righe, carattere ridotto se serve
        let size = Math.min(sizeCella, 6.5);
        let righe = aCapo(t, f, size, wCol[i] - 4);
        if (righe.length > 1) {
          size = Math.min(size, (hRiga - 2) / 2 - 0.6);
          righe = aCapo(t, f, size, wCol[i] - 4);
        }
        while (righe.length > 2 && size > 4.2) {
          size -= 0.3;
          righe = aCapo(t, f, size, wCol[i] - 4);
        }
        righe = righe.slice(0, 2);
        const lh = size + 0.6;
        righe.forEach((rr, k) => {
          const tw = f.widthOfTextAtSize(rr, size);
          page.drawText(rr, { x: xCol[i] + (wCol[i] - tw) / 2, y: y - (hRiga - righe.length * lh) / 2 - (k + 1) * lh + lh * 0.28, size, font: f, color: nero });
        });
        return;
      }
      let size = sizeCella;
      while (f.widthOfTextAtSize(t, size) > wCol[i] - 3 && size > 4) size -= 0.25;
      const tw = f.widthOfTextAtSize(t, size);
      page.drawText(t, { x: xCol[i] + (wCol[i] - tw) / 2, y: y - hRiga / 2 - size * 0.35, size, font: f, color: nero });
    });
    y -= hRiga;
  }

  return doc.save();
}
