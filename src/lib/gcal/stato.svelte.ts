import { get, set, del } from 'idb-keyval';
import { dati } from '../dati.svelte';
import { richiediToken, puoElencare, emailAccount, SCOPE_EMAIL, type TokenGoogle } from './auth';
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
  /** Calendario lasciato su Google dopo «Scollega e tieni»: ricollegando si riusa questo */
  calendarioPrecedente?: string;
  /** Account Google usato (email): ai prossimi accessi Google lo ripropone senza far scegliere */
  account?: string;
}

export const CLIENT_ID_BUILD: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

class Gcal {
  stato = $state<StatoGcal>({});
  token = $state<TokenGoogle | undefined>();
  lavoro = $state(false);
  errore = $state('');
  clientIdLocale = $state('');
  /** Altri calendari di ClockWork trovati sull'account, oltre a quello collegato (doppioni) */
  doppioni = $state<CalendarioClockWork[]>([]);
  /** Quanti eventi di ClockWork ha il calendario collegato (per confrontarlo coi doppioni) */
  eventiCollegato = $state(0);

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
    const t = await richiediToken(this.clientId, { suggerimento: this.stato.account });
    this.token = t;
    await set(K_TOKEN, t);
    if (t.scope?.split(' ').includes(SCOPE_EMAIL)) {
      const email = await emailAccount(t.accessToken);
      if (email && email !== this.stato.account) await this.salvaStato({ ...this.stato, account: email });
    }
    return t;
  }

  /** Collega: accesso, ricerca del calendario esistente (o creazione) e prima sincronizzazione. */
  async collega() {
    this.errore = '';
    this.lavoro = true;
    try {
      // Serve un token che possa vedere l'elenco dei calendari: quelli delle versioni precedenti no
      const t = this.tokenValido && puoElencare(this.token) ? this.token! : await this.accedi();
      // Un solo collegamento alla volta anche tra app installata e scheda del browser aperte insieme
      await esclusivo(async () => {
        await this.carica(); // l'altra istanza potrebbe averlo appena collegato
        let calId = this.stato.calendarId ?? this.stato.calendarioPrecedente;
        if (calId && !(await api.esisteCalendario(t.accessToken, calId))) calId = undefined;
        if (!calId && puoElencare(t)) {
          // L'app non se lo ricorda (dati cancellati, altro dispositivo…): cerca quelli già creati
          const trovati = await cercaCalendari(t.accessToken);
          calId = trovati[0]?.id; // il più pieno
        }
        calId ??= await api.creaCalendario(t.accessToken, NOME_CALENDARIO);
        await this.salvaStato({ ...this.stato, calendarId: calId, calendarioPrecedente: undefined });
      });
      await this.sincronizza();
      await this.controllaDoppioni();
    } catch (e) {
      this.errore = messaggio(e);
    } finally {
      this.lavoro = false;
    }
  }

  /** Cerca altri calendari di ClockWork oltre a quello collegato. Silenzioso se non si può. */
  async controllaDoppioni() {
    if (!this.collegato || !this.tokenValido || !puoElencare(this.token)) return;
    const trovati = await cercaCalendari(this.token!.accessToken);
    this.eventiCollegato = trovati.find((c) => c.id === this.stato.calendarId)?.eventi ?? this.eventiCollegato;
    this.doppioni = trovati.filter((c) => c.id !== this.stato.calendarId);
  }

  /**
   * Tiene solo il calendario indicato (quello collegato o uno dei doppioni) ed elimina gli altri di ClockWork.
   * Il permesso calendar.app.created basta: l'app elimina solo calendari creati da lei.
   */
  async tieniSolo(calendarId: string) {
    this.errore = '';
    this.lavoro = true;
    try {
      if (!this.tokenValido || !puoElencare(this.token)) await this.accedi();
      const token = this.token!.accessToken;
      await esclusivo(async () => {
        const tutti = await cercaCalendari(token);
        if (!tutti.some((c) => c.id === calendarId)) throw new Error('Quel calendario non esiste più: riprova.');
        await this.salvaStato({ ...this.stato, calendarId, daSincronizzare: true });
        for (const c of tutti) if (c.id !== calendarId) await api.eliminaCalendario(token, c.id);
      });
      this.doppioni = [];
      await this.sincronizza();
      await this.controllaDoppioni();
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
      if (!this.tokenValido || !puoElencare(this.token)) await this.accedi();
      await this.sincronizza();
      await this.controllaDoppioni();
    } catch (e) {
      this.errore = messaggio(e);
    } finally {
      this.lavoro = false;
    }
  }

  /** Ricollega a un calendario già esistente (es. dall'id salvato in un backup), senza crearne uno. */
  async adotta(calendarId: string) {
    if (this.collegato) return; // già collegato: non cambio calendario sotto i piedi
    await this.salvaStato({ ...this.stato, calendarioPrecedente: calendarId });
  }

  private sincronizza(): Promise<PianoSync> {
    return esclusivo(() => this.sincronizzaOra());
  }

  private async sincronizzaOra(): Promise<PianoSync> {
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
    const tenuto = eliminaCalendario ? undefined : this.stato.calendarId ?? this.stato.calendarioPrecedente;
    this.token = undefined;
    await del(K_TOKEN);
    await this.salvaStato(tenuto ? { calendarioPrecedente: tenuto } : {});
    this.doppioni = [];
  }
}

export interface CalendarioClockWork {
  id: string;
  nome: string;
  /** Eventi creati da ClockWork, dal mese scorso in avanti */
  eventi: number;
}

/**
 * Calendari di ClockWork sull'account, dal più pieno al più vuoto.
 * Tiene solo quelli creati dall'app: gli altri (un calendario chiamato «ClockWork» a mano)
 * con calendar.app.created non sono leggibili e vengono ignorati.
 */
async function cercaCalendari(token: string): Promise<CalendarioClockWork[]> {
  const elenco = await api.elencaCalendariClockWork(token);
  const da = `${inizioFinestra()}T00:00:00Z`;
  const out: CalendarioClockWork[] = [];
  for (const c of elenco) {
    try {
      const ev = await api.elencaEventi(token, c.id, da);
      out.push({ id: c.id, nome: c.summary ?? NOME_CALENDARIO, eventi: ev.filter((e) => e.extendedProperties?.private?.clockworkId).length });
    } catch (e) {
      if (e instanceof api.CalendarioSparito || (e instanceof api.ErroreGoogle && (e.status === 403 || e.status === 404))) continue;
      throw e;
    }
  }
  return out.sort((a, b) => b.eventi - a.eventi);
}

/** Esegue fn con un lucchetto condiviso tra tutte le finestre dell'app (Web Locks), se disponibile. */
function esclusivo<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('clockwork-gcal', fn);
  return fn();
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
