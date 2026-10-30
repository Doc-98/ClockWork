import { get, set, del } from 'idb-keyval';
import { IMPOSTAZIONI_DEFAULT, completaImpostazioni, ordinaTurni, type Impostazioni, type Turno } from './model';
import type { ScelteOrari } from './turni/importa';
import { leggiModello } from './store';
import { caricaModello } from './foglio/modello';
import { nomeCollaboratore } from './foglio/genera';
import type { Archivio } from './storico';

/**
 * Stato dell'app, condiviso tra le schermate e salvato sul telefono (IndexedDB).
 * Ogni modifica passa da qui e viene scritta subito.
 */

export interface UltimaImportazione {
  nomeFile: string;
  quando: string;
  /** Il file stesso: permette di cambiare mese senza ricaricarlo */
  bytes: Uint8Array;
}

const K = {
  turni: 'turni',
  impostazioni: 'impostazioni',
  scelte: 'scelte-orari',
  import: 'ultima-importazione',
  esclusi: 'turni-esclusi',
  archivio: 'archivio-fogli-ore',
};

class Dati {
  pronto = $state(false);
  turni = $state<Turno[]>([]);
  impostazioni = $state<Impostazioni>({ ...IMPOSTAZIONI_DEFAULT });
  scelte = $state<ScelteOrari>({});
  /** Il modello del foglio ore, che viaggia con l'app */
  modello = $state<Uint8Array | undefined>();
  erroreModello = $state('');
  ultimaImportazione = $state<UltimaImportazione | undefined>();
  /** Turni del foglio che hai tolto in importazione (chiave data|area): gli aggiornamenti automatici non li rimettono */
  esclusi = $state<string[]>([]);
  /** Fogli ore dei mesi prima di ClockWork, per lo Storico */
  archivio = $state<Archivio | undefined>();
  erroreSalvataggio = $state('');

  private coda: Promise<unknown> = Promise.resolve();
  private ascoltatori: (() => void)[] = [];

  /** Chiamata dopo ogni modifica ai turni (es. per aggiornare Google Calendar). */
  suCambioTurni(fn: () => void) {
    this.ascoltatori.push(fn);
  }

  async carica() {
    const [turni, imp, scelte, ultima, esclusi, archivio] = await Promise.all([
      get<Turno[]>(K.turni),
      get<Impostazioni>(K.impostazioni),
      get<ScelteOrari>(K.scelte),
      get<UltimaImportazione>(K.import),
      get<string[]>(K.esclusi),
      get<Archivio>(K.archivio),
    ]);
    this.turni = (turni ?? []).sort(ordinaTurni);
    this.impostazioni = completaImpostazioni(imp);
    this.scelte = scelte ?? {};
    // Fino alla 0.7 il modello lo caricava ognuno, con il suo nome in E5: da lì prendo nome e cognome
    if (!this.impostazioni.nome.trim()) {
      const vecchio = await leggiModello().catch(() => undefined);
      const nome = vecchio ? nomeCollaboratore(vecchio.bytes) : undefined;
      if (nome) await this.setImpostazioni({ ...this.impostazioni, nome });
    }
    caricaModello()
      .then((m) => (this.modello = m))
      .catch(() => (this.erroreModello = 'Non riesco a caricare il modello del foglio ore: riprova con la connessione attiva.'));
    this.ultimaImportazione = ultima;
    this.esclusi = esclusi ?? [];
    this.archivio = archivio;
    this.pronto = true;
  }

  private salva(key: string, value: unknown) {
    const snap = $state.snapshot(value);
    this.coda = this.coda
      .then(() => set(key, snap))
      .then(() => (this.erroreSalvataggio = ''))
      .catch(() => (this.erroreSalvataggio = 'Non riesco a salvare sul telefono: controlla lo spazio disponibile.'));
    return this.coda;
  }

  async setTurni(turni: Turno[]) {
    this.turni = [...turni].sort(ordinaTurni);
    await this.salva(K.turni, this.turni);
    for (const fn of this.ascoltatori) fn();
  }

  salvaTurno(t: Turno) {
    const i = this.turni.findIndex((x) => x.id === t.id);
    const next = [...this.turni];
    if (i >= 0) next[i] = t;
    else next.push(t);
    return this.setTurni(next);
  }

  eliminaTurno(id: string) {
    return this.setTurni(this.turni.filter((t) => t.id !== id));
  }

  async setImpostazioni(imp: Impostazioni) {
    // Nomi delle aree e opzioni del calendario cambiano gli eventi: va avvisato chi li sincronizza
    const pesa = (i: Impostazioni) => JSON.stringify([i.aree, i.calendario]);
    const cambiaEventi = pesa($state.snapshot(this.impostazioni)) !== pesa(imp);
    this.impostazioni = imp;
    await this.salva(K.impostazioni, imp);
    if (cambiaEventi) for (const fn of this.ascoltatori) fn();
  }

  setScelte(s: ScelteOrari) {
    this.scelte = s;
    return this.salva(K.scelte, s);
  }

  /** Sostituisce gli esclusi di un mese (YYYY-MM) con quelli nuovi */
  setEsclusiMese(year: number, month: number, chiavi: string[]) {
    const p = `${year}-${String(month).padStart(2, '0')}-`;
    this.esclusi = [...this.esclusi.filter((k) => !k.startsWith(p)), ...chiavi];
    return this.salva(K.esclusi, this.esclusi);
  }

  setUltimaImportazione(u: UltimaImportazione) {
    this.ultimaImportazione = u;
    return this.salva(K.import, u);
  }

  /** Archivio dei fogli ore: undefined lo toglie */
  async setArchivio(a: Archivio | undefined) {
    this.archivio = a;
    if (a) await this.salva(K.archivio, a);
    else await del(K.archivio).catch(() => undefined);
  }

  turniDelMese(year: number, month: number): Turno[] {
    const p = `${year}-${String(month).padStart(2, '0')}-`;
    return this.turni.filter((t) => t.data.startsWith(p));
  }

  turniDelGiorno(iso: string): Turno[] {
    return this.turni.filter((t) => t.data === iso);
  }
}

export const dati = new Dati();
