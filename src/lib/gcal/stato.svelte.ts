import { get, set, del } from 'idb-keyval';
import { dati } from '../dati.svelte';
import { richiediToken, type TokenGoogle } from './auth';
import * as api from './api';
import { pianoSync, inizioFinestra, type PianoSync } from './eventi';

/**
 * Stato del collegamento con Google Calendar e sincronizzazione.
 * Il calendario è uno solo, creato dall'app ("ClockWork · Leone XIII"): i tuoi altri calendari
 * non vengono letti né toccati (permesso calendar.app.created).
 */

const K_STATO = 'gcal-stato';
const K_TOKEN = 'gcal-token';
export const NOME_CALENDARIO = 'ClockWork · Leone XIII';

export interface StatoGcal {
  calendarId?: string;
  ultimaSync?: string;
  /** C'è una modifica non ancora mandata al calendario */
  daSincronizzare?: boolean;
  ultimoEsito?: string;
}

export const CLIENT_ID_BUILD: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

class Gcal {
  stato = $state<StatoGcal>({});
  token = $state<TokenGoogle | undefined>();
  lavoro = $state(false);
  errore = $state('');
  clientIdLocale = $state('');

  get clientId(): string {
    return CLIENT_ID_BUILD || this.clientIdLocale;
  }
  get collegato(): boolean {
    return !!this.stato.calendarId;
  }
  get tokenValido(): boolean {
    return !!this.token && this.token.scade > Date.now();
  }

  async carica() {
    const [s, t, cid] = await Promise.all([get<StatoGcal>(K_STATO), get<TokenGoogle>(K_TOKEN), get<string>('gcal-client-id')]);
    this.stato = s ?? {};
    this.token = t && t.scade > Date.now() ? t : undefined;
    this.clientIdLocale = cid ?? '';
  }

  async setClientIdLocale(id: string) {
    this.clientIdLocale = id.trim();
    await set('gcal-client-id', this.clientIdLocale);
  }

  private async salvaStato(s: StatoGcal) {
    this.stato = s;
    await set(K_STATO, $state.snapshot(s));
  }

  /** Da chiamare dal tocco dell'utente. */
  async accedi(): Promise<TokenGoogle> {
    if (!this.clientId) throw new Error('Manca il Client ID di Google.');
    const t = await richiediToken(this.clientId);
    this.token = t;
    await set(K_TOKEN, t);
    return t;
  }

  /** Collega: accesso + creazione (o verifica) del calendario + prima sincronizzazione. */
  async collega() {
    this.errore = '';
    this.lavoro = true;
    try {
      const t = this.tokenValido ? this.token! : await this.accedi();
      let calId = this.stato.calendarId;
      if (!calId || !(await api.esisteCalendario(t.accessToken, calId))) {
        calId = await api.creaCalendario(t.accessToken, NOME_CALENDARIO);
      }
      await this.salvaStato({ ...this.stato, calendarId: calId });
      await this.sincronizza();
    } catch (e) {
      this.errore = messaggio(e);
    } finally {
      this.lavoro = false;
    }
  }

  /** Segna che il calendario va aggiornato; se l'accesso è ancora valido, aggiorna subito. */
  async segnaModifica() {
    if (!this.collegato) return;
    await this.salvaStato({ ...this.stato, daSincronizzare: true });
    if (this.tokenValido && !this.lavoro) {
      this.lavoro = true;
      try {
        await this.sincronizza();
      } catch (e) {
        this.errore = messaggio(e);
      } finally {
        this.lavoro = false;
      }
    }
  }

  /** Sincronizza ora. Se serve l'accesso lo chiede (quindi chiamare da un tocco). */
  async sincronizzaDaTocco() {
    this.errore = '';
    this.lavoro = true;
    try {
      if (!this.tokenValido) await this.accedi();
      await this.sincronizza();
    } catch (e) {
      this.errore = messaggio(e);
    } finally {
      this.lavoro = false;
    }
  }

  private async sincronizza(): Promise<PianoSync> {
    const calId = this.stato.calendarId;
    if (!calId || !this.token) throw new Error('Google Calendar non collegato.');
    const token = this.token.accessToken;
    try {
      const da = inizioFinestra();
      const remoti = await api.elencaEventi(token, calId, `${da}T00:00:00Z`);
      const turni = dati.turni.filter((t) => t.data >= da);
      const piano = pianoSync(turni, remoti, $state.snapshot(dati.impostazioni));
      const lavori: (() => Promise<unknown>)[] = [
        ...piano.crea.map((c) => () => api.creaEvento(token, calId, c.evento)),
        ...piano.aggiorna.map((a) => () => api.aggiornaEvento(token, calId, a.eventId, a.evento)),
        ...piano.elimina.map((x) => () => api.eliminaEvento(token, calId, x.eventId)),
      ];
      await inParallelo(lavori, 4);
      const n = piano.crea.length + piano.aggiorna.length + piano.elimina.length;
      await this.salvaStato({
        ...this.stato,
        daSincronizzare: false,
        ultimaSync: new Date().toISOString(),
        ultimoEsito: n ? `${piano.crea.length} aggiunti, ${piano.aggiorna.length} aggiornati, ${piano.elimina.length} tolti` : 'Già tutto allineato',
      });
      return piano;
    } catch (e) {
      if (e instanceof api.TokenScaduto) {
        this.token = undefined;
        await del(K_TOKEN);
      }
      if (e instanceof api.CalendarioSparito) {
        await this.salvaStato({ ...this.stato, calendarId: undefined });
      }
      throw e;
    }
  }

  async scollega(eliminaCalendario: boolean) {
    this.errore = '';
    if (eliminaCalendario && this.stato.calendarId) {
      this.lavoro = true;
      try {
        if (!this.tokenValido) await this.accedi();
        await api.eliminaCalendario(this.token!.accessToken, this.stato.calendarId);
      } catch (e) {
        this.errore = messaggio(e);
        this.lavoro = false;
        return;
      }
      this.lavoro = false;
    }
    this.token = undefined;
    await del(K_TOKEN);
    await this.salvaStato({});
  }
}

async function inParallelo(lavori: (() => Promise<unknown>)[], n: number) {
  let i = 0;
  const worker = async () => {
    while (i < lavori.length) await lavori[i++]();
  };
  await Promise.all(Array.from({ length: Math.min(n, lavori.length) }, worker));
}

export function messaggio(e: unknown): string {
  if (e instanceof api.TokenScaduto) return 'L’accesso a Google è scaduto: tocca «Sincronizza» per rientrare.';
  if (e instanceof api.CalendarioSparito) return 'Il calendario di ClockWork è stato eliminato da Google Calendar: ricollegalo per ricrearlo.';
  if (e instanceof TypeError) return 'Nessuna connessione: riprova quando sei online.';
  if (e instanceof Error) return e.message;
  return 'Errore con Google Calendar.';
}

export const gcal = new Gcal();
