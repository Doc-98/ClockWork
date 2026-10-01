import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { confronta, applicaImport, casiDoppi, applicaScelte, leggiFileTurni, chiaveDoppio, chiaveTurno, pianoAggiornamento } from './importa';
import type { TurnoLetto } from './parse';
import type { Turno } from '../model';
import { vociDaTurni } from '../foglio/daTurni';

const letto = (data: string, area: TurnoLetto['area'], inizio: number, fine: number, extra: Partial<TurnoLetto> = {}): TurnoLetto => ({
  data, area, inizio, fine, nome: 'Vincenzo', presa: false, prova: false, orarioDoppio: false, foglio: 'Ottobre 26', riga: 1, ...extra,
});
const turno = (data: string, area: Turno['area'], inizio: number, fine: number, extra: Partial<Turno> = {}): Turno => ({
  id: `${data}-${area}`, data, area, inizio, fine, origine: 'import', ...extra,
});

describe('confronto tra importazioni', () => {
  const esistenti: Turno[] = [
    turno('2026-10-02', 'maschile', 900, 1200),
    turno('2026-10-03', 'atrio', 570, 810),
    turno('2026-10-05', 'atrio', 930, 1155, { modificato: true, inizio: 945 }),
    turno('2026-10-17', 'piccoli', 570, 810, { origine: 'manuale', sostituisce: 'Greta', nota: 'sost greta spogl piccoli' }),
    turno('2026-09-30', 'maschile', 900, 1200),
  ];
  const letti = [
    letto('2026-10-02', 'maschile', 900, 1200),
    letto('2026-10-05', 'atrio', 930, 1155),
    letto('2026-10-09', 'maschile', 900, 1200),
    letto('2026-10-02', 'atrio', 930, 1155),
  ];

  it('classifica nuovi, uguali, rimossi e protetti', () => {
    const c = confronta(esistenti, letti, 2026, 10);
    expect(c.righe.map((r) => `${r.stato} ${r.letto.data} ${r.letto.area}`)).toEqual([
      'uguale 2026-10-02 maschile',
      'nuovo 2026-10-09 maschile',
      'nuovo 2026-10-02 atrio',
    ]);
    expect(c.rimossi.map((t) => t.data)).toEqual(['2026-10-03']);
    expect(c.protetti.map((t) => t.data)).toEqual(['2026-10-05']);
  });

  it('segnala gli orari cambiati', () => {
    const c = confronta(esistenti, [letto('2026-10-02', 'maschile', 930, 1200)], 2026, 10);
    expect(c.righe[0].stato).toBe('cambiato');
  });

  it("l'importazione non tocca sostituzioni, turni modificati e altri mesi", () => {
    const dopo = applicaImport(esistenti, letti, 2026, 10);
    const k = (t: Turno) => `${t.data} ${t.area} ${t.origine}${t.modificato ? ' mod' : ''}`;
    expect(dopo.map(k).sort()).toEqual([
      '2026-09-30 maschile import',
      '2026-10-02 atrio import',
      '2026-10-02 maschile import',
      '2026-10-05 atrio import mod',
      '2026-10-09 maschile import',
      '2026-10-17 piccoli manuale',
    ]);
    // stesso turno: stesso id (non duplica eventi del calendario in futuro)
    expect(dopo.find((t) => t.data === '2026-10-02' && t.area === 'maschile')!.id).toBe('2026-10-02-maschile');
  });
});

describe('orari doppi', () => {
  const doppio = letto('2026-10-07', 'piccoli', 900, 1140, {
    orarioDoppio: true, opzioniInizio: [855, 900], opzioniFine: [1080, 1140], grezzo: '14:15*/ 15:00 → 18:00/ 19:00',
  });
  const doppio2 = { ...doppio, data: '2026-10-14' };

  it('raggruppa i turni con lo stesso orario doppio', () => {
    const casi = casiDoppi([doppio, doppio2, letto('2026-10-02', 'maschile', 900, 1200)], {});
    expect(casi).toHaveLength(1);
    expect(casi[0].date).toEqual(['2026-10-07', '2026-10-14']);
    expect(casi[0].proposta).toEqual({ inizio: 900, fine: 1140 });
  });

  it('usa la scelta salvata', () => {
    const scelte = { [chiaveDoppio(doppio)]: { inizio: 855, fine: 1140 } };
    expect(casiDoppi([doppio], scelte)[0].proposta).toEqual({ inizio: 855, fine: 1140 });
    expect(applicaScelte([doppio, doppio2], scelte).map((t) => [t.inizio, t.fine])).toEqual([[855, 1140], [855, 1140]]);
  });
});

describe('foglio ore dai turni', () => {
  it('somma per giorno, unisce le note, ignora gli annullati', () => {
    const voci = vociDaTurni([
      turno('2026-10-02', 'maschile', 900, 1200),
      turno('2026-10-02', 'atrio', 570, 810, { origine: 'manuale', nota: 'sost simone atrio' }),
      turno('2026-10-05', 'atrio', 930, 1155, { annullato: true }),
      turno('2026-11-02', 'atrio', 930, 1155),
    ], 2026, 10);
    expect(voci).toEqual([{ day: 2, hours: 9, note: 'sost simone atrio' }]);
  });
});

const FILE = 'fixtures/private/turni.xlsx';
describe.skipIf(!existsSync(FILE))('file reale', () => {
  it('trova i mesi e i turni doppi', () => {
    const f = leggiFileTurni(new Uint8Array(readFileSync(FILE)), ['Vincenzo']);
    const ott = f.mesi.find((m) => m.nome === 'Ottobre 26')!;
    expect(ott.miei).toHaveLength(9);
    const mar = f.mesi.find((m) => m.nome === 'Marzo 26')!;
    const casi = casiDoppi(mar.miei, {});
    expect(casi.length).toBeGreaterThan(0);
    expect(f.mesi[0].nome).toBe('Dicembre 25');
  });

  const f = () => leggiFileTurni(new Uint8Array(readFileSync(FILE)), ['Vincenzo']);
  const oggi = new Date(2026, 9, 2); // 2 ottobre: si guardano settembre e i mesi dopo
  const importaMese = (turni: Turno[], nome: string) => {
    const m = f().mesi.find((x) => x.nome === nome)!;
    return applicaImport(turni, m.miei, m.year, m.month);
  };

  it('aggiornamento: mese nuovo applicato da solo, mesi vecchi ignorati', () => {
    const piano = pianoAggiornamento(f(), [], {}, [], oggi);
    expect(piano.some((m) => m.year === 2026 && m.month < 9)).toBe(false);
    const ott = piano.find((m) => m.nome === 'Ottobre 26')!;
    expect(ott).toMatchObject({ azione: 'applica', nuovi: 9, cambiati: 0, rimossi: 0 });
  });

  it('aggiornamento: niente di nuovo se già importato', () => {
    const turni = importaMese(importaMese([], 'Settembre 26'), 'Ottobre 26');
    const piano = pianoAggiornamento(f(), turni, {}, [], oggi);
    expect(piano.filter((m) => m.azione !== 'nessuna')).toEqual([]);
  });

  it('aggiornamento: orario cambiato nel foglio → applicato', () => {
    const turni = importaMese([], 'Ottobre 26').map((t, i) => (i === 0 ? { ...t, fine: t.fine - 30 } : t));
    const ott = pianoAggiornamento(f(), turni, {}, [], oggi).find((m) => m.nome === 'Ottobre 26')!;
    expect(ott).toMatchObject({ azione: 'applica', cambiati: 1 });
  });

  it('aggiornamento: turno sparito dal foglio → da rivedere', () => {
    const extra: Turno = { id: 'x', data: '2026-10-30', area: 'atrio', inizio: 900, fine: 1200, origine: 'import' };
    const ott = pianoAggiornamento(f(), [...importaMese([], 'Ottobre 26'), extra], {}, [], oggi).find((m) => m.nome === 'Ottobre 26')!;
    expect(ott).toMatchObject({ azione: 'rivedi', rimossi: 1 });
    expect(ott.motivo).toBe('un turno non è più nel foglio');
  });

  it('aggiornamento: turno che avevi escluso non torna', () => {
    const m = f().mesi.find((x) => x.nome === 'Ottobre 26')!;
    const via = chiaveTurno(m.miei[0]);
    const turni = applicaImport([], m.miei.slice(1), m.year, m.month);
    const ott = pianoAggiornamento(f(), turni, {}, [via], oggi).find((x) => x.nome === 'Ottobre 26')!;
    expect(ott.azione).toBe('nessuna');
  });

  it('aggiornamento: orario doppio mai scelto → da rivedere; scelto → applicato', () => {
    const marzo = new Date(2026, 2, 5);
    const p1 = pianoAggiornamento(f(), [], {}, [], marzo).find((x) => x.nome === 'Marzo 26')!;
    expect(p1.azione).toBe('rivedi');
    const mar = f().mesi.find((x) => x.nome === 'Marzo 26')!;
    const scelte = Object.fromEntries(casiDoppi(mar.miei, {}).map((c) => [c.chiave, c.proposta]));
    const p2 = pianoAggiornamento(f(), [], scelte, [], marzo).find((x) => x.nome === 'Marzo 26')!;
    expect(p2.azione).toBe('applica');
  });
});
