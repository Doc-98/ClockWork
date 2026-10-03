const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type EsitoCondivisione =
  | { esito: 'condiviso' }
  | { esito: 'annullato' }
  /** Il sistema non permette di condividere questo file: serve scaricarlo */
  | { esito: 'non-supportato'; motivo: string };

/**
 * Prepara il File da condividere. Alcuni sistemi rifiutano il tipo .xlsx nel menu Condividi:
 * proviamo prima col tipo corretto, poi come file generico (stesso nome, stessa estensione).
 */
export const PDF_MIME = 'application/pdf';

/**
 * Chrome (Android, Windows, ChromeOS…) accetta nel menu Condividi solo alcuni tipi di file: PDF sì,
 * Excel no. Ma il suo canShare() risponde «sì» per qualsiasi file e il rifiuto arriva solo dopo,
 * da share(), come NotAllowedError. Quindi su Chromium non ci si fida di canShare per l'Excel.
 * Safari (iPhone, iPad, Mac) invece condivide l'Excel senza problemi.
 */
export function excelCondivisibile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: unknown };
  if (nav.userAgentData) return false; // Chromium
  if (/Android/i.test(navigator.userAgent)) return false;
  return true;
}

export function fileCondivisibile(
  bytes: Uint8Array,
  nomeFile: string,
  tipi: string[] = [XLSX_MIME, 'application/octet-stream', ''],
): File | undefined {
  if (typeof navigator === 'undefined' || !navigator.canShare) return undefined;
  if (/\.xlsx$/i.test(nomeFile) && !excelCondivisibile()) return undefined;
  for (const type of tipi) {
    const f = new File([bytes as BlobPart], nomeFile, type ? { type } : {});
    try {
      if (navigator.canShare({ files: [f] })) return f;
    } catch {
      /* prova il prossimo */
    }
  }
  return undefined;
}

/**
 * Apre il menu Condividi del telefono (WhatsApp, Mail…) con il file allegato.
 * Va chiamata direttamente dal tocco, senza lavoro pesante prima (altrimenti il sistema la blocca):
 * per questo il File arriva già pronto.
 */
export async function condividiFile(file: File | undefined): Promise<EsitoCondivisione> {
  if (!navigator.share) return { esito: 'non-supportato', motivo: 'questo browser non ha il menu Condividi' };
  if (!file) return { esito: 'non-supportato', motivo: 'il sistema non permette di condividere file Excel da qui' };
  try {
    // Solo il file: su iOS aggiungere testo o titolo può far condividere solo il testo
    await navigator.share({ files: [file] });
    return { esito: 'condiviso' };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { esito: 'annullato' };
    const nome = e instanceof DOMException ? e.name : e instanceof Error ? e.name : 'errore';
    const dettaglio = e instanceof Error && e.message ? ` (${e.message})` : '';
    return { esito: 'non-supportato', motivo: nome === 'NotAllowedError' ? `il sistema ha rifiutato questo file${dettaglio}` : `errore ${nome}${dettaglio}` };
  }
}

export function scaricaFile(bytes: Uint8Array, nomeFile: string, mime = XLSX_MIME): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
