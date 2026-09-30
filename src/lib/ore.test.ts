import { describe, it, expect } from 'vitest';
import { parseOre, formatOre, oreInParole } from './ore';

describe('parseOre', () => {
  it.each([
    ['3,75', 3.75], ['3.75', 3.75], ['4', 4], ['3:45', 3.75], ['4:15', 4.25], ['8h45', 8.75], ['2h', 2], ['', null],
  ])('%s → %s', (input, expected) => {
    expect(parseOre(input)).toBe(expected);
  });
  it('rifiuta input non validi', () => {
    expect(parseOre('abc')).toBeNaN();
    expect(parseOre('3:75')).toBeNaN();
  });
});

describe('formattazione', () => {
  it('usa la virgola italiana', () => {
    expect(formatOre(3.75)).toBe('3,75');
    expect(formatOre(5)).toBe('5');
  });
  it('ore in parole', () => {
    expect(oreInParole(4.25)).toBe('4 h 15 min');
    expect(oreInParole(5)).toBe('5 h');
  });
});
