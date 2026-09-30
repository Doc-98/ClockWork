const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Apre il menu Condividi del telefono (WhatsApp, Mail…) con il file allegato.
 * Dove non è supportato, scarica il file.
 * Restituisce 'condiviso', 'scaricato' o 'annullato'.
 */
export async function condividiFile(bytes: Uint8Array, nomeFile: string): Promise<'condiviso' | 'scaricato' | 'annullato'> {
  const file = new File([bytes as BlobPart], nomeFile, { type: XLSX_MIME });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: nomeFile });
      return 'condiviso';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'annullato';
      // altri errori: ripiega sullo scaricamento
    }
  }
  scaricaFile(bytes, nomeFile);
  return 'scaricato';
}

export function scaricaFile(bytes: Uint8Array, nomeFile: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: XLSX_MIME }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
