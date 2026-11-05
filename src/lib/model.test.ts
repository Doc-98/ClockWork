import { describe, it, expect } from 'vitest';
import { segnaModifica, completaImpostazioni, compensoTurni, tariffaDi, nomeMansione, modificaSerie, eliminaSerie, turniDellaSerie, pagaDi, totaliTurni, turniProposti, cambiaPaga, inizioCambio, type Turno, type Mansione } from './model';

const t: Turno = { id: 'x', data: '2026-10-02', area: 'maschile', inizio: 990, fine: 1200, origine: 'import' };

describe('segnaModifica', () => {
  it('un turno del foglio con orario o stato cambiato diventa «modificato»', () => {
    expect(segnaModifica(t, { ...t, fine: 1185 }).modificato).toBe(true);
    expect(segnaModifica(t, { ...t, annullato: true }).modificato).toBe(true);
  });
  it('nota e nome non lo bloccano: il foglio può ancora aggiornarlo', () => {
    expect(segnaModifica(t, { ...t, nota: 'ciao', nome: 'Leone' }).modificato).toBeUndefined();
  });
  it('segnarlo come sostituzione non lo blocca', () => {
    expect(segnaModifica(t, { ...t, sostituisce: 'Greta', nota: 'sost greta spogl maschi' }).modificato).toBeUndefined();
  });
  it('i turni aggiunti a mano non cambiano', () => {
    const m = { ...t, origine: 'manuale' as const };
    expect(segnaModifica(m, { ...m, fine: 1185 }).modificato).toBeUndefined();
  });
});

describe('mansioni', () => {
  it('le impostazioni di prima (una sola tariffa) diventano la mansione Q', () => {
    const imp = completaImpostazioni({ nome: 'Mario Rossi', tariffa: 9.5 } as never);
    expect(imp.profilo).toBe('assistente');
    expect(imp.mansioni).toEqual([{ col: 'Q', tariffa: 9.5 }]);
    expect('tariffa' in imp).toBe(false);
  });
  it('compenso: ogni turno alla tariffa della sua mansione; senza mansione vale Q', () => {
    const imp = completaImpostazioni({ profilo: 'istruttore', mansioni: [{ col: 'Q', tariffa: 9 }, { col: 'H', tariffa: 15 }] });
    const turni: Turno[] = [
      { ...t, inizio: 900, fine: 1020 }, // 2 h da assistente
      { ...t, id: 'y', mansione: 'H', inizio: 1020, fine: 1110 }, // 1,5 h di scuola nuoto
      { ...t, id: 'z', mansione: 'H', inizio: 600, fine: 660, annullato: true },
    ];
    expect(compensoTurni(turni, imp)).toBe(2 * 9 + 1.5 * 15);
    expect(tariffaDi('L', imp)).toBe(9);
    expect(nomeMansione('H', imp)).toBe('Istruttore scuola nuoto');
  });
  it('colonne fuori dal foglio ore scartate', () => {
    expect(completaImpostazioni({ mansioni: [{ col: 'Z', tariffa: 1 }, { col: 'L', nome: 'Private', tariffa: 20 }] }).mansioni).toEqual([{ col: 'L', nome: 'Private', tariffa: 20 }]);
  });
});

describe('serie di turni', () => {
  const serie = ['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24'].map((data, i): Turno => ({
    id: `s${i}`, data, area: 'altro', mansione: 'H', inizio: 1020, fine: 1170, origine: 'manuale', serie: 'A',
  }));
  const altro: Turno = { ...t, id: 'fuori' };
  const tutti = [...serie, altro];
  // il terzo ha una nota scritta a mano
  tutti[2] = { ...tutti[2], nota: 'piscina piccola' };

  it('solo questo', () => {
    const r = modificaSerie(tutti, tutti[1], { ...tutti[1], fine: 1200 }, 'solo');
    expect(r.map((x) => x.fine)).toEqual([1170, 1200, 1170, 1170, 1200]);
  });
  it('questo e i successivi: solo i campi cambiati, le note degli altri restano', () => {
    const r = modificaSerie(tutti, tutti[1], { ...tutti[1], fine: 1200, mansione: 'L' }, 'successivi');
    expect(r.map((x) => `${x.fine} ${x.mansione}`)).toEqual(['1170 H', '1200 L', '1200 L', '1200 L', '1200 undefined']);
    expect(r[2].nota).toBe('piscina piccola');
  });
  it('tutti, con il giorno spostato: gli altri si spostano dello stesso numero di giorni', () => {
    const r = modificaSerie(tutti, tutti[2], { ...tutti[2], data: '2026-11-18' }, 'tutti');
    expect(turniDellaSerie(r, tutti[0]).map((x) => x.data)).toEqual(['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25']);
    expect(r.find((x) => x.id === 'fuori')).toEqual(altro);
  });
  it('eliminare: solo questo, i successivi o tutta la serie', () => {
    expect(eliminaSerie(tutti, tutti[1], 'solo').map((x) => x.id)).toEqual(['s0', 's2', 's3', 'fuori']);
    expect(eliminaSerie(tutti, tutti[1], 'successivi').map((x) => x.id)).toEqual(['s0', 'fuori']);
    expect(eliminaSerie(tutti, tutti[1], 'tutti').map((x) => x.id)).toEqual(['fuori']);
  });
});

describe('mansioni pagate a turno', () => {
  const t = (id: string, data: string, mansione: string, inizio: number, fine: number, extra: Partial<Turno> = {}): Turno =>
    ({ id, data, area: 'altro', inizio, fine, origine: 'manuale', mansione, ...extra });
  const mansioni: Mansione[] = [
    { col: 'G', tariffa: 10, paga: 'turno' },
    { col: 'H', tariffa: 15 },
  ];
  const turni = [
    t('a', '2026-11-03', 'G', 900, 1110, { turni: 4 }),
    t('b', '2026-11-05', 'H', 1020, 1110),
    t('c', '2026-11-10', 'G', 900, 1020),
  ];

  it('compenso: turni × tariffa a turno, ore × tariffa oraria', () => {
    // a: 4 × 10; c: senza numero vale 1 turno; b: 1,5 h × 15
    expect(compensoTurni(turni, { mansioni })).toBe(40 + 10 + 22.5);
    expect(totaliTurni(turni, { mansioni })).toEqual({ ore: 1.5, turni: 5 });
  });

  it('propone il numero dell’ultima volta con la stessa mansione e lo stesso orario', () => {
    const piu = [...turni, t('d', '2026-11-12', 'G', 900, 1020, { turni: 2 })];
    expect(turniProposti(piu, 'G', 900, 1110)).toBe(4);
    expect(turniProposti(piu, 'G', 600, 700)).toBe(2);
    expect(turniProposti(piu, 'H', 600, 700)).toBe(1);
  });

  it('completaImpostazioni tiene il tipo di paga', () => {
    expect(completaImpostazioni({ mansioni }).mansioni.map((m) => m.paga)).toEqual(['turno', undefined]);
  });

  it('inizio del cambio: il mese corrente, il precedente solo nei primi tre giorni', () => {
    expect(inizioCambio(new Date(2026, 10, 5), true)).toBe('2026-11');
    expect(inizioCambio(new Date(2026, 11, 2), true)).toBe('2026-11');
    expect(inizioCambio(new Date(2026, 11, 2), false)).toBe('2026-12');
    expect(inizioCambio(new Date(2027, 0, 3), true)).toBe('2026-12');
  });

  it('cambio da ore a turno: i mesi prima restano a ore, i turni da novembre prendono il numero', () => {
    const vecchi = [...turni, t('o', '2026-10-20', 'H', 1020, 1140)];
    const r = cambiaPaga(mansioni, vecchi, 'H', { paga: 'turno', tariffa: 12 }, '2026-11', 2);
    expect(pagaDi('H', { mansioni: r.mansioni }, '2026-10')).toEqual({ paga: 'ore', tariffa: 15 });
    expect(pagaDi('H', { mansioni: r.mansioni }, '2026-11')).toEqual({ paga: 'turno', tariffa: 12 });
    expect(pagaDi('H', { mansioni: r.mansioni })).toEqual({ paga: 'turno', tariffa: 12 });
    expect(r.turni.find((x) => x.id === 'b')?.turni).toBe(2);
    expect(r.turni.find((x) => x.id === 'o')?.turni).toBeUndefined();
    // Ottobre si paga ancora a ore: 2 h × 15
    expect(compensoTurni(r.turni.filter((x) => x.id === 'o'), { mansioni: r.mansioni })).toBe(30);
    expect(compensoTurni(r.turni.filter((x) => x.id === 'b'), { mansioni: r.mansioni })).toBe(24);
  });

  it('cambio da turno a ore: i turni perdono il numero, un secondo cambio non riscrive i mesi già fissati', () => {
    const r = cambiaPaga(mansioni, turni, 'G', { paga: 'ore', tariffa: 16 }, '2026-11');
    expect(r.turni.find((x) => x.id === 'a')?.turni).toBeUndefined();
    expect(r.mansioni[0].paga).toBeUndefined();
    const r2 = cambiaPaga(r.mansioni, r.turni, 'G', { paga: 'turno', tariffa: 11 }, '2026-12');
    expect(pagaDi('G', { mansioni: r2.mansioni }, '2026-10')).toEqual({ paga: 'turno', tariffa: 10 });
    expect(pagaDi('G', { mansioni: r2.mansioni }, '2026-11')).toEqual({ paga: 'ore', tariffa: 16 });
    expect(pagaDi('G', { mansioni: r2.mansioni }, '2026-12')).toEqual({ paga: 'turno', tariffa: 11 });
    // Rifatto nello stesso mese: la paga di novembre rimpiazza quella vecchia
    const r3 = cambiaPaga(r2.mansioni, r2.turni, 'G', { paga: 'ore', tariffa: 16 }, '2026-11');
    expect(r3.mansioni[0].prima?.map((p) => p.fino)).toEqual(['2026-10']);
  });
});

describe('foglio ore con mansioni pagate a turno', () => {
  it('nella colonna a turno va il numero di turni del giorno', async () => {
    const { vociDaTurni } = await import('./foglio/daTurni');
    const imp = { mansioni: [{ col: 'G', tariffa: 10, paga: 'turno' as const }, { col: 'H', tariffa: 15 }] };
    const base = { area: 'altro' as const, origine: 'manuale' as const };
    const voci = vociDaTurni([
      { ...base, id: '1', data: '2026-11-03', inizio: 900, fine: 1020, mansione: 'G', turni: 2 },
      { ...base, id: '2', data: '2026-11-03', inizio: 1035, fine: 1110, mansione: 'G', turni: 1 },
      { ...base, id: '3', data: '2026-11-05', inizio: 1020, fine: 1110, mansione: 'H' },
    ], 2026, 11, imp);
    expect(voci).toEqual([
      { day: 3, hours: 3, col: 'G', aTurno: true },
      { day: 5, hours: 1.5, col: 'H' },
    ]);
  });
});
