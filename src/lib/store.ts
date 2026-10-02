import { get, set } from 'idb-keyval';
import type { VoceGiorno } from './foglio/genera';

/**
 * Archivio locale sul telefono (IndexedDB). Niente server: i dati non escono dal dispositivo.
 * Prima versione: modello del foglio ore + ore inserite mese per mese.
 * Più avanti qui arriveranno i turni importati e le sostituzioni.
 */

/** Modello caricato a mano fino alla 0.7: oggi serve solo a recuperare il nome scritto in E5 */
export interface ModelloSalvato {
  nomeFile: string;
  bytes: Uint8Array;
  caricatoIl: string;
}

const K_MODELLO = 'modello-foglio-ore';
const kMese = (year: number, month: number) => `voci-${year}-${String(month).padStart(2, '0')}`;

export async function leggiModello(): Promise<ModelloSalvato | undefined> {
  return get<ModelloSalvato>(K_MODELLO);
}


export async function leggiVoci(year: number, month: number): Promise<VoceGiorno[]> {
  return (await get<VoceGiorno[]>(kMese(year, month))) ?? [];
}

export async function salvaVoci(year: number, month: number, voci: VoceGiorno[]): Promise<void> {
  await set(kMese(year, month), voci);
}

/** Chiede al browser di non cancellare i dati quando lo spazio scarseggia. */
export async function chiediArchivioPersistente(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
