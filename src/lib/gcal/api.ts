import type { EventoGoogle } from './eventi';

const BASE = 'https://www.googleapis.com/calendar/v3';

export class TokenScaduto extends Error {}
export class CalendarioSparito extends Error {}
export class ErroreGoogle extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

async function chiama<T>(token: string, metodo: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new TokenScaduto('Accesso a Google scaduto.');
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? res.statusText;
    throw new ErroreGoogle(res.status, msg);
  }
  return data as T;
}

export async function creaCalendario(token: string, nome: string): Promise<string> {
  const c = await chiama<{ id: string }>(token, 'POST', '/calendars', {
    summary: nome,
    description: 'Turni di lavoro, gestito da ClockWork. Le modifiche fatte qui possono essere sovrascritte.',
    timeZone: 'Europe/Rome',
  });
  return c.id;
}

/**
 * Controlla che il calendario esista ancora (l'utente potrebbe averlo eliminato).
 * Solo 404/410 vogliono dire «non c'è più». Un 403 (limite di richieste, account diverso, permesso
 * negato) NON lo è: trattarlo come sparito faceva creare un secondo calendario con gli eventi doppi.
 */
export async function esisteCalendario(token: string, id: string): Promise<boolean> {
  try {
    await chiama(token, 'GET', `/calendars/${encodeURIComponent(id)}`);
    return true;
  } catch (e) {
    if (e instanceof ErroreGoogle && (e.status === 404 || e.status === 410)) return false;
    if (e instanceof ErroreGoogle && e.status === 403) {
      throw new ErroreGoogle(403, 'Google non permette di aprire il calendario di ClockWork (accesso con un altro account, o troppe richieste). Riprova tra poco: non ne creo uno nuovo.');
    }
    throw e;
  }
}

export async function elencaEventi(token: string, calId: string, timeMin: string): Promise<EventoGoogle[]> {
  const out: EventoGoogle[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ timeMin, singleEvents: 'true', maxResults: '2500', showDeleted: 'false' });
    if (pageToken) q.set('pageToken', pageToken);
    try {
      const r = await chiama<{ items?: EventoGoogle[]; nextPageToken?: string }>(token, 'GET', `/calendars/${encodeURIComponent(calId)}/events?${q}`);
      out.push(...(r.items ?? []));
      pageToken = r.nextPageToken;
    } catch (e) {
      if (e instanceof ErroreGoogle && e.status === 404) throw new CalendarioSparito('Il calendario di ClockWork non esiste più.');
      throw e;
    }
  } while (pageToken);
  return out;
}

export function creaEvento(token: string, calId: string, e: EventoGoogle) {
  return chiama<EventoGoogle>(token, 'POST', `/calendars/${encodeURIComponent(calId)}/events`, e);
}

export function aggiornaEvento(token: string, calId: string, eventId: string, e: EventoGoogle) {
  return chiama<EventoGoogle>(token, 'PUT', `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, e);
}

export async function eliminaEvento(token: string, calId: string, eventId: string) {
  try {
    await chiama(token, 'DELETE', `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`);
  } catch (e) {
    // già eliminato: va bene così
    if (!(e instanceof ErroreGoogle && (e.status === 404 || e.status === 410))) throw e;
  }
}

export async function eliminaCalendario(token: string, calId: string) {
  try {
    await chiama(token, 'DELETE', `/calendars/${encodeURIComponent(calId)}`);
  } catch (e) {
    if (!(e instanceof ErroreGoogle && (e.status === 404 || e.status === 410))) throw e;
  }
}
