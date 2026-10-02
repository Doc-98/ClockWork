import { get, set, del } from 'idb-keyval';
import { dati } from '../dati.svelte';
import { leggiFileTurni, pianoAggiornamento, applicaImport, type AggiornamentoMese } from './importa';
import { rifDaLink, scaricaFoglio, nomeFoglio, FoglioNonRaggiungibile, API_KEY_BUILD, type RifFoglio } from './remoto';
import { MESI } from '../foglio/genera';

/**
 * Il foglio turni collegato con un link: l'app lo ricontrolla da sola (all'avvio, al primo uso
 * in un mese nuovo o dopo qualche ora) e applica le novità senza ambiguità; il resto lo fa rivedere.
 */

const K = 'fonte-turni';
const K_CHIAVE = 'google-api-key';
/** Tra un controllo automatico e l'altro, nello stesso mese */
const INTERVALLO = 6 * 3600_000;

export interface Avviso {
  tipo: 'ok' | 'rivedi' | 'errore';
  testo: string;
  /** Mese da rivedere in Importa, es. «Novembre 26» */
  mese?: string;
}

export interface StatoFonte {
  link: string;
  rif: RifFoglio;
  nome: string;
  ultimoControllo?: string;
  ultimoEsito?: string;
  avviso?: Avviso;
  /** Ultime novità applicate da sole, per mese del foglio (es. «Ottobre 26» → «2 orari cambiati») */
  novita?: Record<string, string>;
}

class Fonte {
  stato = $state<StatoFonte | undefined>();
  lavoro = $state(false);
  chiaveLocale = $state('');

  get chiave(): string {
    return API_KEY_BUILD || this.chiaveLocale;
  }

  async carica() {
    const [s, k] = await Promise.all([get<StatoFonte>(K), get<string>(K_CHIAVE)]);
    this.stato = s;
    this.chiaveLocale = k ?? '';
  }

  async setChiaveLocale(k: string) {
    this.chiaveLocale = k.trim();
    await set(K_CHIAVE, this.chiaveLocale);
  }

  private async salva(s: StatoFonte | undefined) {
    this.stato = s;
    if (s) await set(K, $state.snapshot(s));
    else await del(K);
  }

  /** Collega il link e scarica il foglio. Subito dopo, controlla() applica i turni che non hanno dubbi. */
  async collega(link: string): Promise<{ nomeFile: string; bytes: Uint8Array }> {
    const rif = rifDaLink(link);
    if (!rif) throw new FoglioNonRaggiungibile('Questo non sembra un link di Google Sheets.', true);
    if (!this.chiave) throw new FoglioNonRaggiungibile('Manca la chiave API di Google.', true);
    this.lavoro = true;
    try {
      const [nome, bytes] = await Promise.all([nomeFoglio(rif, this.chiave), scaricaFoglio(rif, this.chiave)]);
      const letto = leggiFileTurni(bytes, dati.impostazioni.alias);
      if (!letto.mesi.length) throw new FoglioNonRaggiungibile('Il foglio collegato non sembra quello dei turni: non trovo fogli con il nome di un mese (es. «Ottobre 26»).', true);
      await this.salva({ link: link.trim(), rif, nome, ultimoControllo: new Date().toISOString(), ultimoEsito: 'Collegato' });
      return { nomeFile: nome, bytes };
    } finally {
      this.lavoro = false;
    }
  }

  async scollega() {
    await this.salva(undefined);
  }

  chiudiAvviso() {
    if (this.stato?.avviso) this.salva({ ...this.stato, avviso: undefined });
  }

  /** Va controllato adesso? Primo avvio in un mese nuovo, oppure ultimo controllo di qualche ora fa. */
  daControllare(ora = new Date()): boolean {
    const u = this.stato?.ultimoControllo ? new Date(this.stato.ultimoControllo) : undefined;
    if (!u) return true;
    if (u.getFullYear() !== ora.getFullYear() || u.getMonth() !== ora.getMonth()) return true;
    return ora.getTime() - u.getTime() > INTERVALLO;
  }

  /**
   * Scarica il foglio e applica le novità.
   * manuale = tocco su «Aggiorna turni»: avvisa anche se non c'è niente di nuovo, e anche degli errori passeggeri.
   */
  async controlla(manuale: boolean, forza = false): Promise<AggiornamentoMese[] | undefined> {
    const s = this.stato;
    if (!s || !this.chiave || this.lavoro) return;
    if (!manuale && ((!forza && !this.daControllare()) || (typeof navigator !== 'undefined' && navigator.onLine === false))) return;
    if (!dati.impostazioni.alias.length) return;
    this.lavoro = true;
    try {
      const bytes = await scaricaFoglio(s.rif, this.chiave);
      const letto = leggiFileTurni(bytes, dati.impostazioni.alias);
      const piano = pianoAggiornamento(letto, dati.turni, dati.scelte, dati.esclusi);
      let turni = dati.turni;
      for (const m of piano.filter((x) => x.azione === 'applica')) turni = applicaImport(turni, m.confermati, m.year, m.month);
      const applicati = piano.filter((x) => x.azione === 'applica');
      if (applicati.length) await dati.setTurni(turni);
      // Il file aggiornato serve anche a Importa e alle sostituzioni (chi era in turno quel giorno)
      await dati.setUltimaImportazione({ nomeFile: s.nome, bytes, quando: new Date().toISOString() });
      const avviso = avvisoDa(piano, manuale);
      const novita = { ...s.novita };
      for (const m of applicati) novita[m.nome] = parti(m).join(', ');
      await this.salva({
        ...s,
        novita,
        ultimoControllo: new Date().toISOString(),
        ultimoEsito: applicati.length ? riassunto(applicati) : piano.some((x) => x.azione === 'rivedi') ? 'Novità da rivedere' : 'Nessuna novità',
        avviso: avviso ?? (manuale ? undefined : s.avviso),
      });
      return piano;
    } catch (e) {
      const def = e instanceof FoglioNonRaggiungibile && e.definitivo;
      const testo = e instanceof FoglioNonRaggiungibile ? e.message : 'Non sono riuscito a leggere il foglio turni.';
      // In automatico gli errori passeggeri (offline, troppe richieste) non disturbano
      await this.salva({ ...s, ultimoEsito: testo, avviso: manuale || def ? { tipo: 'errore', testo } : s.avviso });
      return undefined;
    } finally {
      this.lavoro = false;
    }
  }
}

const nomeMese = (m: Pick<AggiornamentoMese, 'month'>) => MESI[m.month - 1];

function parti(m: AggiornamentoMese): string[] {
  return [m.nuovi ? `${m.nuovi} ${m.nuovi === 1 ? 'turno aggiunto' : 'turni aggiunti'}` : '', m.cambiati ? `${m.cambiati} ${m.cambiati === 1 ? 'orario cambiato' : 'orari cambiati'}` : ''].filter(Boolean);
}

function riassunto(applicati: AggiornamentoMese[]): string {
  return applicati.map((m) => `${nomeMese(m)}: ${parti(m).join(', ')}`).join(' · ');
}

export function avvisoDa(piano: AggiornamentoMese[], manuale: boolean): Avviso | undefined {
  const applicati = piano.filter((m) => m.azione === 'applica');
  const daRivedere = piano.filter((m) => m.azione === 'rivedi');
  if (daRivedere.length) {
    const r = daRivedere[0];
    const prima = applicati.length ? `${riassunto(applicati)}. ` : '';
    const altri = daRivedere.slice(1).map(nomeMese);
    const anche = altri.length ? ` Da rivedere anche ${altri.length === 1 ? altri[0] : `${altri.slice(0, -1).join(', ')} e ${altri.at(-1)}`}.` : '';
    return { tipo: 'rivedi', testo: `${prima}${nomeMese(r)}: ${r.motivo}.${anche}`, mese: r.nome };
  }
  if (applicati.length) return { tipo: 'ok', testo: `Turni aggiornati dal foglio. ${riassunto(applicati)}.` };
  if (manuale) return { tipo: 'ok', testo: 'Il foglio turni non ha novità.' };
  return undefined;
}

export const fonte = new Fonte();
