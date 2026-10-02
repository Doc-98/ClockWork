import modelloUrl from '../../assets/modello-foglio-ore.xlsx?url';

/**
 * Il modello del foglio ore è lo stesso per tutti i collaboratori: viaggia con l'app
 * (e il service worker lo tiene per l'uso offline). L'app ci scrive nome, mese, data e ore.
 */
let inCorso: Promise<Uint8Array> | undefined;

export function caricaModello(): Promise<Uint8Array> {
  inCorso ??= fetch(modelloUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`modello non disponibile (${r.status})`);
      return r.arrayBuffer();
    })
    .then((b) => new Uint8Array(b))
    .catch((e) => {
      inCorso = undefined;
      throw e;
    });
  return inCorso;
}
