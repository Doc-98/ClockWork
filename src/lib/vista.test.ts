import { describe, it, expect } from 'vitest';
import { spostaYm, ymDa, ymStr } from './vista.svelte';

describe('mesi', () => {
  it('sposta avanti e indietro tra gli anni', () => {
    expect(spostaYm({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(spostaYm({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(spostaYm({ year: 2026, month: 10 }, -14)).toEqual({ year: 2025, month: 8 });
  });
  it('legge e scrive YYYY-MM', () => {
    expect(ymDa('2026-03')).toEqual({ year: 2026, month: 3 });
    expect(ymDa('marzo')).toBeUndefined();
    expect(ymStr({ year: 2026, month: 3 })).toBe('2026-03');
  });
});
