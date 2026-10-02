import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generaFoglioOre, raggruppaPerGiorno, LAYOUT } from './genera';
import { XlsxPackage, listSheets } from '../xlsx/zip';
import { readWorkbook } from '../xlsx/read';
import { findCell } from '../xlsx/cells';
import { listXfs } from '../xlsx/styles';

// Il modello pulito che viaggia con l'app; se c'è, anche quello personale in fixtures/private
const TEMPLATE = 'src/assets/modello-foglio-ore.xlsx';
const haveTemplate = existsSync(TEMPLATE);

// Settembre 2026, come nel foglio inviato: 38,25 ore
const SETTEMBRE = [
  { day: 14, hours: 2.5 }, { day: 15, hours: 2.5 }, { day: 16, hours: 5 }, { day: 17, hours: 2.5 },
  { day: 21, hours: 3.75 }, { day: 23, hours: 5 }, { day: 24, hours: 3.75 }, { day: 28, hours: 3.75 },
  { day: 29, hours: 4.5 }, { day: 30, hours: 5 },
];

describe('raggruppaPerGiorno', () => {
  it('somma le ore e unisce le note dello stesso giorno', () => {
    const g = raggruppaPerGiorno([
      { day: 9, hours: 4.25 },
      { day: 9, hours: 4, note: 'sost atrio' },
    ]);
    expect(g.get(9)).toEqual({ hours: 8.25, notes: ['sost atrio'] });
  });
  it('rifiuta giorni fuori range', () => {
    expect(() => raggruppaPerGiorno([{ day: 32, hours: 1 }])).toThrow();
  });
});

describe.skipIf(!haveTemplate)('generaFoglioOre sul modello della società', () => {
  const template = haveTemplate ? new Uint8Array(readFileSync(TEMPLATE)) : new Uint8Array();
  const voci = [...SETTEMBRE, { day: 30, hours: 0, note: 'sost greta spogl piccoli' }];
  const out = haveTemplate ? generaFoglioOre(template, { year: 2026, month: 9, voci, nome: 'Mario Rossi' }) : undefined!;
  if (haveTemplate && existsSync('fixtures/private')) {
    mkdirSync('fixtures/private/out', { recursive: true });
    writeFileSync('fixtures/private/out/settembre.xlsx', out.bytes);
  }

  const sheetsBefore = haveTemplate ? readWorkbook(template) : [];
  const sheetsAfter = haveTemplate ? readWorkbook(out.bytes) : [];
  const after = sheetsAfter.find((s) => s.state === 'visible')!;
  const cell = (ref: string) => {
    const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
    const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    return after.rows.get(Number(m[2]))?.get(col) ?? null;
  };

  it('totale 38,25 e nome del foglio', () => {
    expect(out.totaleOre).toBe(38.25);
    expect(after.name).toBe('Settembre 26');
    expect(out.nomeFile).toBe('FOGLIO ORE - Mario Rossi - Settembre 2026.xlsx');
  });

  it('ore in colonna Q, nulla nei giorni senza turno', () => {
    for (let d = 1; d <= 31; d++) {
      const expected = SETTEMBRE.find((v) => v.day === d)?.hours ?? null;
      expect(cell(`Q${LAYOUT.firstDayRow + d - 1}`), `giorno ${d}`).toBe(expected);
    }
  });

  it('note in colonna R', () => {
    expect(cell('R41')).toBe('sost greta spogl piccoli');
    expect(cell('R13')).toBeNull();
  });

  it('colonne O e P svuotate', () => {
    for (let d = 1; d <= 31; d++) {
      const r = LAYOUT.firstDayRow + d - 1;
      expect(cell(`O${r}`)).toBeNull();
      expect(cell(`P${r}`)).toBeNull();
    }
  });

  it('Q45 (dove c\'era il compenso) vuota e senza bordi', () => {
    const pkg = XlsxPackage.open(out.bytes);
    const sheet = pkg.text(listSheets(pkg).find((s) => s.state === 'visible')!.path);
    const q45 = findCell(sheet, 'Q45')!;
    expect(q45).not.toMatch(/<v>|<f>/);
    const s = Number(/s="(\d+)"/.exec(q45)![1]);
    expect(listXfs(pkg.text('xl/styles.xml'))[s]).toMatch(/borderId="0"/);
  });

  it('il totale resta una formula con il valore aggiornato', () => {
    const pkg = XlsxPackage.open(out.bytes);
    const sheet = pkg.text(listSheets(pkg).find((s) => s.state === 'visible')!.path);
    expect(findCell(sheet, 'Q43')).toMatch(/<f>SUM\(Q12:Q42\)<\/f><v>38.25<\/v>/);
  });

  it('data e mese in alto', () => {
    expect(cell('E4')).toBe(46295); // 30/09/2026
    expect(cell('F6')).toBe('Settembre');
    expect(cell('E5')).toBe('Mario Rossi');
  });

  it('tutte le altre celle sono identiche al modello', () => {
    const before = sheetsBefore.find((s) => s.state === 'visible')!;
    const touched = new Set<string>(['E4', 'E5', 'F6', 'Q43', 'Q45']);
    for (let r = 12; r <= 42; r++) for (const c of ['O', 'P', 'Q', 'R']) touched.add(`${c}${r}`);
    const colName = (i: number) => { let s = ''; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
    const flat = (rows: Map<number, Map<number, unknown>>) => {
      const o: Record<string, unknown> = {};
      for (const [r, cols] of rows) for (const [c, v] of cols) { const ref = `${colName(c)}${r}`; if (!touched.has(ref)) o[ref] = v; }
      return o;
    };
    expect(flat(after.rows)).toEqual(flat(before.rows));
    // Fogli nascosti intatti
    for (const s of sheetsBefore.filter((x) => x.state !== 'visible')) {
      expect(sheetsAfter.find((x) => x.name === s.name)?.rows).toEqual(s.rows);
    }
  });

  it('le altre parti del file sono identiche byte per byte', () => {
    const a = XlsxPackage.open(template);
    const b = XlsxPackage.open(out.bytes);
    expect(b.paths()).toEqual(a.paths());
    const changed = b.paths().filter((p) => a.text(p) !== b.text(p));
    expect(changed.sort()).toEqual(['xl/workbook.xml', listSheets(a).find((s) => s.state === 'visible')!.path].sort());
  });

  it('rifiuta il 31 in un mese di 30 giorni', () => {
    expect(() => generaFoglioOre(template, { year: 2026, month: 9, voci: [{ day: 31, hours: 3 }] })).toThrow();
  });
});
