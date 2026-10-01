import { describe, expect, it } from 'vitest';
import { risolvi } from './tema';

describe('risolvi', () => {
  it('una scelta esplicita vince sul sistema', () => {
    expect(risolvi('chiaro', true)).toBe('chiaro');
    expect(risolvi('scuro', false)).toBe('scuro');
  });
  it('«Sistema» segue il telefono', () => {
    expect(risolvi('sistema', true)).toBe('scuro');
    expect(risolvi('sistema', false)).toBe('chiaro');
  });
});
