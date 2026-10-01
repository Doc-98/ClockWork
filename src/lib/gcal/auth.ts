/**
 * Accesso a Google senza server: flusso OAuth "implicito" in una finestra.
 * Su iPhone, in una PWA installata, window.open resta dentro l'app (a differenza di un redirect,
 * che finirebbe in Safari): la finestra torna su oauth.html, che passa il token all'app
 * tramite BroadcastChannel e si chiude.
 */

/** Creare il calendario di ClockWork e gestirne gli eventi (solo i calendari creati dall'app). */
export const SCOPE_CALENDARIO = 'https://www.googleapis.com/auth/calendar.app.created';
/**
 * Vedere l'elenco dei calendari (nomi, non eventi): serve a ritrovare il calendario di ClockWork
 * quando l'app non se lo ricorda (dati cancellati, reinstallazione, altro dispositivo) invece di crearne un doppione.
 */
export const SCOPE_ELENCO = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
export const SCOPE = `${SCOPE_CALENDARIO} ${SCOPE_ELENCO}`;
const CANALE = 'clockwork-oauth';

export interface TokenGoogle {
  accessToken: string;
  /** epoch ms */
  scade: number;
  /** Permessi concessi davvero (Google permette di togliere la spunta a quelli facoltativi) */
  scope?: string;
}

/** Il token permette di vedere l'elenco dei calendari? (i token delle versioni precedenti no) */
export function puoElencare(t: TokenGoogle | undefined): boolean {
  return !!t?.scope?.split(' ').includes(SCOPE_ELENCO);
}

export class AccessoNegato extends Error {}
export class FinestraBloccata extends Error {}

export function redirectUri(): string {
  return new URL('oauth.html', location.origin + import.meta.env.BASE_URL).href;
}

function casuale(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Va chiamata direttamente dal tocco dell'utente (altrimenti il browser blocca la finestra).
 * `suggerimento`: email dell'account da preselezionare, se nota.
 */
export function richiediToken(clientId: string, opzioni: { suggerimento?: string; silenzioso?: boolean } = {}): Promise<TokenGoogle> {
  const state = casuale();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state,
    prompt: opzioni.silenzioso ? 'none' : 'select_account',
  });
  if (opzioni.suggerimento) params.set('login_hint', opzioni.suggerimento);
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  const win = window.open(url, 'clockwork-google', 'popup,width=480,height=640');
  if (!win) return Promise.reject(new FinestraBloccata('Il browser ha bloccato la finestra di accesso.'));

  return new Promise((resolve, reject) => {
    const bc = new BroadcastChannel(CANALE);
    let chiuso = false;
    const fine = () => {
      chiuso = true;
      bc.close();
      window.removeEventListener('message', suMessaggio);
      clearInterval(controllo);
      clearTimeout(timeout);
    };
    const gestisci = (d: unknown) => {
      if (chiuso || !d || typeof d !== 'object') return;
      const m = d as Record<string, string>;
      if (m.tipo !== 'clockwork-oauth' || m.state !== state) return;
      fine();
      if (m.access_token) resolve({ accessToken: m.access_token, scade: Date.now() + (Number(m.expires_in) || 3600) * 1000 - 60_000, scope: m.scope });
      else reject(new AccessoNegato(m.error === 'access_denied' ? 'Accesso non autorizzato.' : `Accesso non riuscito (${m.error ?? 'errore'}).`));
    };
    const suMessaggio = (e: MessageEvent) => {
      if (e.origin === location.origin) gestisci(e.data);
    };
    bc.onmessage = (e) => gestisci(e.data);
    window.addEventListener('message', suMessaggio);
    // Se l'utente chiude la finestra senza completare
    const controllo = setInterval(() => {
      try {
        if (win.closed) {
          setTimeout(() => {
            if (!chiuso) {
              fine();
              reject(new AccessoNegato('Accesso annullato.'));
            }
          }, 800);
          clearInterval(controllo);
        }
      } catch {
        /* cross-origin: ignora */
      }
    }, 500);
    const timeout = setTimeout(() => {
      if (!chiuso) {
        fine();
        reject(new AccessoNegato('Tempo scaduto per l’accesso.'));
      }
    }, 5 * 60_000);
  });
}
