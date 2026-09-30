import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseIntervallo, parseOraCella, parseOra, frazioneToMinuti } from './orari';
import { leggiFoglioTurni, turniDi, oreTurno, personeDaCella, meseDalNomeFoglio } from './parse';
import { readWorkbook } from '../xlsx/read';

describe('orari', () => {
  it.each([
    ['15:30 - 20:00', 930, 1200],
    ['14:15 - 18,30', 855, 1110],
    ['16.45- 20:00', 1005, 1200],
    ['9:30 -15:15', 570, 915],
    ['14,00 - 20:00', 840, 1200],
    ['15:30- 20:00', 930, 1200],
  ])('%s', (s, a, b) => {
    expect(parseIntervallo(s)).toEqual({ inizio: a, fine: b });
  });
  it('frazioni di giorno Excel', () => {
    expect(frazioneToMinuti(0.65625)).toBe(15 * 60 + 45);
    expect(frazioneToMinuti(0.8020833333333334)).toBe(19 * 60 + 15);
  });
  it('orari doppi: il primo vale per chi ha l’asterisco', () => {
    expect(parseOraCella('14:15*/ 15:00')).toEqual({ anticipato: 855, normale: 900 });
    expect(parseOraCella('15:30 / 15:45')).toEqual({ anticipato: 930, normale: 945 });
    expect(parseOraCella('8:45*/9:30')).toEqual({ anticipato: 525, normale: 570 });
  });
  it('rifiuta orari non validi', () => {
    expect(parseOra('25:00')).toBeNull();
    expect(parseIntervallo('20:00 - 15:00')).toBeNull();
  });
});

describe('nomi', () => {
  it('asterisco, parentesi e nomi doppi', () => {
    expect(personeDaCella('BerettaC.*')).toEqual([{ nome: 'BerettaC.', presa: true, prova: false }]);
    expect(personeDaCella('(Ling)')).toEqual([{ nome: 'Ling', presa: false, prova: true }]);
    expect(personeDaCella('Marta/GiuliaL.').map((p) => p.nome)).toEqual(['Marta', 'GiuliaL.']);
    expect(personeDaCella('Vincenzo *')).toEqual([{ nome: 'Vincenzo', presa: true, prova: false }]);
  });
  it('mese dal nome del foglio', () => {
    expect(meseDalNomeFoglio('Ottobre 26')).toEqual({ year: 2026, month: 10 });
    expect(meseDalNomeFoglio('Sheet6')).toBeUndefined();
  });
});

const FILE = 'fixtures/private/turni.xlsx';
const ALIAS = process.env.CLOCKWORK_ALIAS ?? 'Vincenzo';

/**
 * Ore per giorno prese dai fogli ore realmente inviati (archivio), solo nei giorni
 * che risultano anche dal foglio turni (le sostituzioni concordate su WhatsApp non ci sono).
 */
const ARCHIVIO: Record<string, Record<number, number>> = {
  'Gennaio 26': { 8: 3.25, 12: 3.5, 13: 4, 15: 3.25, 19: 3.5, 20: 5, 22: 3.25, 26: 3.5, 27: 4, 29: 3.25 },
  'Aprile 26': { 9: 3.5, 13: 3.5, 14: 3.5, 16: 3.5, 18: 4, 20: 3.5, 21: 3.5, 23: 3.5, 24: 5, 27: 3.5, 28: 3.5 },
  'Settembre 26': { 14: 2.5, 15: 2.5, 16: 5, 17: 2.5, 21: 3.75, 23: 5, 24: 3.75, 28: 3.75, 29: 4.5, 30: 5 },
};

describe.skipIf(!existsSync(FILE))('foglio turni reale', () => {
  const wb = existsSync(FILE) ? readWorkbook(new Uint8Array(readFileSync(FILE))) : [];

  it('legge tutti i fogli mensili senza errori gravi', () => {
    for (const s of wb.filter((x) => meseDalNomeFoglio(x.name))) {
      const e = leggiFoglioTurni(s);
      expect(e.turni.length, s.name).toBeGreaterThan(0);
      for (const t of e.turni) {
        expect(t.fine).toBeGreaterThan(t.inizio);
        expect(t.data.startsWith(`${e.mese!.year}-${String(e.mese!.month).padStart(2, '0')}`)).toBe(true);
      }
    }
  });

  for (const [foglio, attese] of Object.entries(ARCHIVIO)) {
    it(`${foglio}: ore uguali al foglio ore inviato`, () => {
      const s = wb.find((x) => x.name === foglio)!;
      const miei = turniDi(leggiFoglioTurni(s).turni, [ALIAS]);
      const perGiorno: Record<number, number> = {};
      for (const t of miei) {
        const d = Number(t.data.slice(8));
        perGiorno[d] = (perGiorno[d] ?? 0) + oreTurno(t);
      }
      for (const [d, ore] of Object.entries(attese)) {
        expect(perGiorno[Number(d)], `${foglio} giorno ${d}`).toBe(ore);
      }
    });
  }

  it('Ottobre 26: i turni attesi', () => {
    const s = wb.find((x) => x.name === 'Ottobre 26')!;
    const miei = turniDi(leggiFoglioTurni(s).turni, [ALIAS]).map((t) => `${t.data.slice(8)} ${t.area} ${oreTurno(t)}`);
    expect(miei).toEqual(expect.arrayContaining(['02 maschile 5', '05 atrio 3.75', '07 atrio 4.25', '10 atrio 4']));
  });
});
