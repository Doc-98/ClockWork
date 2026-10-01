/** Parte pura del tema (testata): la scelta e come si traduce nel tema da mostrare. */

export type SceltaTema = 'sistema' | 'chiaro' | 'scuro';

/** Chiave in localStorage. La legge anche lo script in index.html: tenerle uguali. */
export const CHIAVE_TEMA = 'clockwork-tema';

export function risolvi(scelta: SceltaTema, sistemaScuro: boolean): 'chiaro' | 'scuro' {
  return scelta === 'sistema' ? (sistemaScuro ? 'scuro' : 'chiaro') : scelta;
}
