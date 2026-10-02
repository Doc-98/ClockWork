import { describe, it, expect } from 'vitest';
import { segnaModifica, type Turno } from './model';

const t: Turno = { id: 'x', data: '2026-10-02', area: 'maschile', inizio: 990, fine: 1200, origine: 'import' };

describe('segnaModifica', () => {
  it('un turno del foglio con orario o stato cambiato diventa «modificato»', () => {
    expect(segnaModifica(t, { ...t, fine: 1185 }).modificato).toBe(true);
    expect(segnaModifica(t, { ...t, annullato: true }).modificato).toBe(true);
  });
  it('nota e nome non lo bloccano: il foglio può ancora aggiornarlo', () => {
    expect(segnaModifica(t, { ...t, nota: 'ciao', nome: 'Leone' }).modificato).toBeUndefined();
  });
  it('i turni aggiunti a mano non cambiano', () => {
    const m = { ...t, origine: 'manuale' as const };
    expect(segnaModifica(m, { ...m, fine: 1185 }).modificato).toBeUndefined();
  });
});
