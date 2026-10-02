import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { generaFoglioOre } from './genera';
import { generaPdfFoglio } from './pdf';

const TEMPLATE = 'src/assets/modello-foglio-ore.xlsx';
const OUT = 'node_modules/.tmp/ottobre.pdf';

describe.skipIf(!existsSync(TEMPLATE))('PDF del foglio ore', () => {
  it('contiene intestazione, ore, note e totale', async () => {
    const xlsx = generaFoglioOre(new Uint8Array(readFileSync(TEMPLATE)), {
      year: 2026,
      month: 10,
      nome: 'Mario Rossi',
      voci: [
        { day: 2, hours: 5 },
        { day: 5, hours: 3.75 },
        { day: 17, hours: 4, note: 'sost greta spogl piccoli' },
      ],
    });
    const pdf = await generaPdfFoglio(xlsx.bytes);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    mkdirSync('node_modules/.tmp', { recursive: true });
    writeFileSync(OUT, pdf);

    let txt = '';
    try {
      txt = execFileSync('pdftotext', ['-layout', OUT, '-']).toString();
    } catch {
      return; // pdftotext non disponibile: basta l'intestazione %PDF
    }
    expect(txt).toContain('FOGLIO ORE MENSILE COLLABORATORI SPORTIVI');
    expect(txt).toContain('Ottobre');
    expect(txt).toContain('31/10/26');
    expect(txt).toContain('3,75');
    expect(txt).toContain('12,75'); // totale
    expect(txt).toContain('sost greta');
    expect(txt).toContain('TOTALE');
    expect(txt).toContain('Mario Rossi');
    expect(txt).not.toMatch(/114,75|€/); // niente compenso
  });
});
