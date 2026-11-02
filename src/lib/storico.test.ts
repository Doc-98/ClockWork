import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  leggiArchivio, riepilogoMese, riepilogoAnno, ultimiMesi, controlliArchivio, correggiOre,
  minutiScrittiComeDecimali, eSostituzione, mesePagamento, detrazioneMese, compensoAnno, COSTO_CASELLARIO, type Archivio,
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
    expect(riepilogoMese('2026-01', turni, arch)).toEqual({ ym: '2026-01', ore: 11.5, oreSost: 8.25, nSost: 2, fonte: 'archivio', euro: 0 });
  });
  it('se l’app ha turni nel mese valgono quelli, non l’archivio; gli annullati non contano', () => {
    expect(riepilogoMese('2026-09', turni, arch)).toEqual({ ym: '2026-09', ore: 7.5, oreSost: 5, nSost: 1, fonte: 'app', euro: 0 });
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

describe('ore inserite a mano', () => {
  const nov = { ym: '2025-11', foglio: 'Novembre 25', voci: [{ day: 3, hours: 4 }, { day: 5, hours: 4.75, note: 'sost greta' }] };
  const dic = { ym: '2025-12', foglio: 'Dicembre 25', voci: [{ day: 3, hours: 4 }, { day: 5, hours: 4.75, note: 'sost greta' }] };
  const turni = [turno('2026-09-14', 900, 1050)];

  it('valgono più dell’archivio, meno dei turni dell’app', () => {
    expect(riepilogoMese('2025-12', turni, archivio([dic]), { '2025-12': 48.5 })).toEqual({ ym: '2025-12', ore: 48.5, oreSost: 0, nSost: 0, fonte: 'manuale', euro: 0 });
    expect(riepilogoMese('2026-09', turni, undefined, { '2026-09': 99 }).fonte).toBe('app');
    expect(riepilogoMese('2026-07', turni, undefined, { '2026-07': 12 }).ore).toBe(12);
  });
  it('correggere uno dei due mesi copiati toglie il controllo', () => {
    expect(controlliArchivio(archivio([nov, dic]))).toHaveLength(1);
    expect(controlliArchivio(archivio([nov, dic]), { '2025-12': 48.5 })).toEqual([]);
  });
  it('entrano nel totale dell’anno', () => {
    const a = riepilogoAnno(2026, '2026-01', turni, archivio([dic]), { '2025-12': 48.5 });
    expect(a.ore).toBe(48.5);
  });
});

describe('casellario', () => {
  it('5 € sullo stipendio di ottobre, cioè sul lavoro di settembre', () => {
    expect(detrazioneMese('2026-09', 10, 38.25)).toBe(COSTO_CASELLARIO);
    expect(detrazioneMese('2026-10', 10, 40)).toBe(0);
    expect(detrazioneMese('2026-09', 0, 38.25)).toBe(0);
    expect(detrazioneMese('2026-09', 10, 0)).toBe(0);
    expect(detrazioneMese('2025-12', 1, 10)).toBe(COSTO_CASELLARIO);
  });
  it('tolto dai compensi dell’anno in cui arriva lo stipendio', () => {
    const turni = [turno('2026-09-14', 900, 1500), turno('2026-10-05', 900, 1500)];
    const a = riepilogoAnno(2026, '2026-10', turni);
    const imp = (casellario: number) => ({ mansioni: [{ col: 'Q', tariffa: 9 }], casellario });
    expect(compensoAnno(a, imp(10), turni)).toEqual({ euro: 20 * 9 - 5, detrazioni: 5 });
    expect(compensoAnno(a, imp(0), turni)).toEqual({ euro: 180, detrazioni: 0 });
  });
});

describe('più mansioni', () => {
  const imp = { mansioni: [{ col: 'Q', tariffa: 9 }, { col: 'H', tariffa: 15 }] };
  it('compenso del mese: ogni ora alla tariffa della sua mansione, anche dall’archivio', () => {
    const turni = [turno('2026-10-05', 900, 1020), turno('2026-10-06', 900, 960, { mansione: 'H' })];
    expect(riepilogoMese('2026-10', turni, undefined, undefined, imp).euro).toBe(2 * 9 + 1 * 15);
    const arch = archivio([{ ym: '2026-03', foglio: 'Marzo 26', voci: [{ day: 2, hours: 2 }, { day: 2, hours: 3, col: 'H' }] }]);
    expect(riepilogoMese('2026-03', [], arch, undefined, imp).euro).toBe(2 * 9 + 3 * 15);
  });
});

describe.skipIf(!haveTemplate)('archivio di un istruttore', () => {
  it('legge le ore di ogni colonna e le note in U', () => {
    const template = new Uint8Array(readFileSync(TEMPLATE));
    const voci = [{ day: 3, hours: 2, col: 'H' }, { day: 3, hours: 1, col: 'L', note: 'sost marta' }, { day: 10, hours: 3, col: 'R' }];
    const out = generaFoglioOre(template, { year: 2026, month: 2, voci, nome: 'Anna Bianchi' });
    const m = leggiArchivio(out.bytes).mesi[0];
    expect(m.voci).toEqual([{ day: 3, hours: 2, col: 'H', note: 'sost marta' }, { day: 3, hours: 1, col: 'L' }, { day: 10, hours: 3, col: 'R' }]);
  });
  it('salta le colonne di appoggio con il numero del giorno', () => {
    const template = new Uint8Array(readFileSync(TEMPLATE));
    // un mese con il giorno ripetuto in colonna O, come nei vecchi fogli personali
    const out = generaFoglioOre(template, { year: 2026, month: 5, voci: [
      { day: 4, hours: 4, col: 'O' }, { day: 5, hours: 5, col: 'O' }, { day: 4, hours: 3.5 }, { day: 5, hours: 4.25 },
    ], nome: 'Mario Rossi' });
    expect(leggiArchivio(out.bytes).mesi[0].voci).toEqual([{ day: 4, hours: 3.5 }, { day: 5, hours: 4.25 }]);
  });
});
