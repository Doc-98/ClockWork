/**
 * Il foglio turni letto direttamente da Google Sheets, dato il link di condivisione.
 * Il file è condiviso con «chiunque abbia il link»: basta una chiave API del progetto (nessun accesso
 * dell'utente). Drive lo esporta in .xlsx, cioè lo stesso file che si scaricherebbe a mano:
 * lettura, orari doppi e confronto restano quelli di sempre.
 */

export interface RifFoglio {
  id: string;
  /** Alcuni link condivisi prima del 2021 richiedono anche la resourcekey */
  resourceKey?: string;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';

export const API_KEY_BUILD: string = import.meta.env.VITE_GOOGLE_API_KEY ?? '';

/** Riconosce i link di Google Sheets / Drive e ne estrae l'id (e la resourcekey, se c'è). */
export function rifDaLink(testo: string): RifFoglio | null {
  const s = testo.trim();
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    // incollato solo l'id
    return /^[\w-]{25,}$/.test(s) ? { id: s } : null;
  }
  if (!/(^|\.)google\.com$/.test(url.hostname)) return null;
  const m = /\/(?:spreadsheets\/d|file\/d|d)\/([\w-]{20,})/.exec(url.pathname);
  const id = m?.[1] ?? url.searchParams.get('id') ?? undefined;
  if (!id || !/^[\w-]{20,}$/.test(id)) return null;
  const resourceKey = url.searchParams.get('resourcekey') ?? undefined;
  return resourceKey ? { id, resourceKey } : { id };
}

export class FoglioNonRaggiungibile extends Error {
  constructor(
    msg: string,
    /** true: il link non funziona più (non condiviso, eliminato); false: problema passeggero */
    public definitivo: boolean,
  ) {
    super(msg);
  }
}

function intestazioni(rif: RifFoglio): HeadersInit {
  return rif.resourceKey ? { 'X-Goog-Drive-Resource-Keys': `${rif.id}/${rif.resourceKey}` } : {};
}

async function errore(res: Response): Promise<FoglioNonRaggiungibile> {
  const d = await res.json().catch(() => ({}));
  const motivo: string = d?.error?.errors?.[0]?.reason ?? d?.error?.status ?? '';
  if (res.status === 404) return new FoglioNonRaggiungibile('Il foglio turni non si trova più: forse il link è cambiato o non è più condiviso.', true);
  if (res.status === 403 && /rateLimit|userRateLimit|quota/i.test(motivo)) return new FoglioNonRaggiungibile('Google ha ricevuto troppe richieste: riprovo più tardi.', false);
  if (res.status === 403 && /keyInvalid|API_KEY|accessNotConfigured|SERVICE_DISABLED|referer/i.test(motivo + JSON.stringify(d)))
    return new FoglioNonRaggiungibile('La chiave API di Google non è configurata bene (Drive API non abilitata o dominio non autorizzato).', true);
  if (res.status === 403 || res.status === 401) return new FoglioNonRaggiungibile('Il foglio turni non è più condiviso con chi ha il link.', true);
  if (res.status === 400 && /keyInvalid|API key/i.test(JSON.stringify(d))) return new FoglioNonRaggiungibile('La chiave API di Google non è valida.', true);
  return new FoglioNonRaggiungibile(`Google non risponde come previsto (${res.status}).`, false);
}

/** Nome del file su Drive (es. «Assistenti Spogliatoio 2026-27»). */
export async function nomeFoglio(rif: RifFoglio, apiKey: string, f: typeof fetch = fetch): Promise<string> {
  const res = await richiesta(f, `${DRIVE}/${encodeURIComponent(rif.id)}?fields=name,mimeType&supportsAllDrives=true&key=${encodeURIComponent(apiKey)}`, rif);
  if (!res.ok) throw await errore(res);
  const d = (await res.json()) as { name?: string };
  return d.name ?? 'Foglio turni';
}

/** Scarica il foglio come .xlsx. Se su Drive c'è già un file Excel (non un foglio Google), lo scarica com'è. */
export async function scaricaFoglio(rif: RifFoglio, apiKey: string, f: typeof fetch = fetch): Promise<Uint8Array> {
  const key = encodeURIComponent(apiKey);
  const id = encodeURIComponent(rif.id);
  let res = await richiesta(f, `${DRIVE}/${id}/export?mimeType=${encodeURIComponent(XLSX_MIME)}&key=${key}`, rif);
  if (res.status === 403) {
    const d = await res.clone().json().catch(() => ({}));
    if (/fileNotExportable/.test(JSON.stringify(d))) res = await richiesta(f, `${DRIVE}/${id}?alt=media&supportsAllDrives=true&key=${key}`, rif);
  }
  if (!res.ok) throw await errore(res);
  return new Uint8Array(await res.arrayBuffer());
}

async function richiesta(f: typeof fetch, url: string, rif: RifFoglio): Promise<Response> {
  try {
    return await f(url, { headers: intestazioni(rif), cache: 'no-store' });
  } catch {
    throw new FoglioNonRaggiungibile('Nessuna connessione: riprovo quando sei online.', false);
  }
}
