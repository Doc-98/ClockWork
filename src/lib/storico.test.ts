import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  leggiArchivio, riepilogoMese, riepilogoAnno, ultimiMesi, controlliArchivio, correggiOre,
  minutiScrittiComeDecimali, eSostituzione, mesePagamento, type Archivio,
} from './storico';
import { generaFoglioOre } from './foglio/genera';
import type { Turno } from './model';

const TEMPLATE = 'src/assets/modello-foglio-ore.xlsx';
const haveTemplate = existsSync(TEMPLATE);

const turno = (data: string, inizio: number, fine: number, extra: Partial<Turno> = {}): Turno => ({
  id: `${data}-${inizio}`, data, area: 'piccoli', inizio, fine, origine: 'import', ...extra,
});

const archivio = (mesi: Archivio['mesi'], ignorati: string[] = []): Archivio => ({ nomeFile: 'archivio.xlsx', caricatoIl: '2026-10-30', mesi, ignorati });

describe.skipIf(!haveTemplate)('leggiArchivio', () => {
  it('legge un foglio ore generato dall’app: ore in Q, note in R, mese dal nome del foglio', () => {
    const template = new Uint8Array(readFileSync(TEMPLATE));
    const voci = [
      { day: 2, hours: 3.5 },
      { day: 11, hours: 8.45, note: 'sost giorgio spogl maschi' },
      { day: 28, hours: 5 },
    ];
    const out = generaFoglioOre(template, { year: 2026, month: 2, voci, nome: 'Mario Rossi' });
    const esito = leggiArchivio(out.bytes);
    expect(esito.mesi).toHaveLength(1);
    expect(esito.mesi[0].ym).toBe('2026-02');
    expect(esito.mesi[0].voci).toEqual(voci);
  });
});

describe('riepilogo per mese', () => {
  const arch = archivio([
    { ym: '2026-01', foglio: 'Gennaio 2026', voci: [{ day: 8, hours: 3.25 }, { day: 9, hours: 4.25, note: 'sostit atrio' }, { day: 28, hours: 4, note: 'sostit spogl mas' }] },
    { ym: '2026-09', foglio: 'Settembre 26', voci: [{ day: 14, hours: 99 }] },
  ]);
  const turni = [
    turno('2026-09-14', 15 * 60, 17 * 60 + 30),
    turno('2026-09-16', 15 * 60, 20 * 60, { origine: 'manuale', sostituisce: 'Greta' }),
    turno('2026-09-17', 15 * 60, 17 * 60, { annullato: true }),
  ];

  it('dall’archivio: le sostituzioni sono i giorni con nota «sost…»', () => {
    expect(riepilogoMese('2026-01', turni, arch)).toEqual({ ym: '2026-01', ore: 11.5, oreSost: 8.25, nSost: 2, fonte: 'archivio' });
  });
  it('se l’app ha turni nel mese valgono quelli, non l’archivio; gli annullati non contano', () => {
    expect(riepilogoMese('2026-09', turni, arch)).toEqual({ ym: '2026-09', ore: 7.5, oreSost: 5, nSost: 1, fonte: 'app' });
  });
  it('mese senza dati', () => {
    expect(riepilogoMese('2026-03', turni, arch).fonte).toBe('nessuna');
  });
  it('anno dei pagamenti: da dicembre dell’anno prima, fino al mese indicato', () => {
    const a = riepilogoAnno(2026, '2026-03', turni, arch);
    expect(a.mesi).toEqual(['2025-12', '2026-01', '2026-02', '2026-03']);
    expect(a.ore).toBe(11.5);
    expect(a.mancanti).toEqual(['2025-12', '2026-02', '2026-03']);
  });
  it('dicembre conta per l’anno dopo', () => {
    expect(riepilogoAnno(2026, '2026-12', turni, arch).mesi.at(-1)).toBe('2026-11');
    expect(riepilogoAnno(2027, '2026-12', turni, arch).mesi).toEqual(['2026-12']);
    expect(mesePagamento('2025-12')).toBe('2026-01');
  });
  it('ultimi 12 mesi attraverso il cambio d’anno', () => {
    const m = ultimiMesi('2026-09');
    expect(m[0]).toBe('2025-10');
    expect(m.at(-1)).toBe('2026-09');
    expect(m).toHaveLength(12);
  });
  it('riconosce le note di sostituzione', () => {
    expect(eSostituzione('sost greta spogl piccoli')).toBe(true);
    expect(eSostituzione('Sostituzione giada')).toBe(true);
    expect(eSostituzione('cambio turni con daniel')).toBe(false);
    expect(eSostituzione(undefined)).toBe(false);
  });
});

describe('controlli sull’archivio', () => {
  it('minuti scritti come decimali', () => {
    expect(minutiScrittiComeDecimali(8.45)).toBe(8.75);
    expect(minutiScrittiComeDecimali(3.3)).toBe(3.5);
    expect(minutiScrittiComeDecimali(2.15)).toBe(2.25);
    expect(minutiScrittiComeDecimali(3.75)).toBeUndefined();
    expect(minutiScrittiComeDecimali(4)).toBeUndefined();
  });

  const nov = { ym: '2025-11', foglio: 'Novembre 25', voci: [{ day: 3, hours: 4 }, { day: 5, hours: 4.75 }] };
  const dic = { ym: '2025-12', foglio: 'Dicembre 25', voci: [{ day: 3, hours: 4 }, { day: 5, hours: 4.75 }] };
  const feb = { ym: '2026-02', foglio: 'Febbraio2026', voci: [{ day: 10, hours: 4 }, { day: 11, hours: 8.45, note: 'sost giorgio' }] };

  it('trova l’8.45 di febbraio e i due mesi copiati', () => {
    const c = controlliArchivio(archivio([nov, dic, feb]));
    expect(c).toEqual([
      { tipo: 'minuti', chiave: 'minuti|2026-02|11|8.45', ym: '2026-02', day: 11, scritto: 8.45, proposta: 8.75 },
      { tipo: 'copia', chiave: 'copia|2025-11|2025-12', a: '2025-11', b: '2025-12' },
    ]);
  });
  it('quelli lasciati così non tornano', () => {
    expect(controlliArchivio(archivio([nov, dic, feb], ['copia|2025-11|2025-12', 'minuti|2026-02|11|8.45']))).toEqual([]);
  });
  it('correggere le ore toglie il controllo', () => {
    const a = correggiOre(archivio([feb]), '2026-02', 11, 8.75);
    expect(a.mesi[0].voci[1]).toEqual({ day: 11, hours: 8.75, note: 'sost giorgio' });
    expect(controlliArchivio(a)).toEqual([]);
  });
});
