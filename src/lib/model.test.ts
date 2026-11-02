import { describe, it, expect } from 'vitest';
import { segnaModifica, completaImpostazioni, compensoTurni, tariffaDi, nomeMansione, modificaSerie, eliminaSerie, turniDellaSerie, type Turno } from './model';

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
