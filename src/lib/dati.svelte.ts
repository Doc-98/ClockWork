import { get, set, del } from 'idb-keyval';
import { IMPOSTAZIONI_DEFAULT, completaImpostazioni, ordinaTurni, type Impostazioni, type Turno } from './model';
import { leggiFileTurni, tuttiITurni, chiCeraPrima, chiaveTurno, type ScelteOrari } from './turni/importa';
import { leggiModello } from './store';
import { caricaModello } from './foglio/modello';
import { nomeCollaboratore } from './foglio/genera';
import type { Archivio, OreManuali } from './storico';

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
  avvisiChiusi: 'avvisi-chiusi',
  oreManuali: 'ore-mesi-a-mano',
  chiCeraPrima: 'chi-cera-prima',
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
  /** Avvisi che hai chiuso con la ×: non tornano finché non cambia quello che dicono */
  avvisiChiusi = $state<string[]>([]);
  /** Ore totali inserite a mano per i mesi senza turni o con il foglio ore sbagliato */
  oreManuali = $state<OreManuali>({});
  /**
   * Turni comparsi o cambiati nel foglio a mese iniziato: chi li aveva nella versione precedente
   * (chiave data|area → nome). Serve a proporre «sostituisci Greta?» in Rivedi.
   */
  chiCeraPrima = $state<Record<string, string>>({});
  erroreSalvataggio = $state('');

  private coda: Promise<unknown> = Promise.resolve();
  private ascoltatori: (() => void)[] = [];

  /** Chiamata dopo ogni modifica ai turni (es. per aggiornare Google Calendar). */
  suCambioTurni(fn: () => void) {
    this.ascoltatori.push(fn);
  }

  async carica() {
    const [turni, imp, scelte, ultima, esclusi, archivio, avvisiChiusi, oreManuali, prima] = await Promise.all([
      get<Turno[]>(K.turni),
      get<Impostazioni>(K.impostazioni),
      get<ScelteOrari>(K.scelte),
      get<UltimaImportazione>(K.import),
      get<string[]>(K.esclusi),
      get<Archivio>(K.archivio),
      get<string[]>(K.avvisiChiusi),
      get<OreManuali>(K.oreManuali),
      get<Record<string, string>>(K.chiCeraPrima),
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
    this.avvisiChiusi = avvisiChiusi ?? [];
    this.oreManuali = oreManuali ?? {};
    this.chiCeraPrima = prima ?? {};
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

  async setUltimaImportazione(u: UltimaImportazione) {
    const vecchio = this.ultimaImportazione?.bytes;
    if (vecchio && vecchio !== u.bytes) await this.annotaChiCeraPrima(vecchio, u.bytes);
    this.ultimaImportazione = u;
    return this.salva(K.import, u);
  }

  /** Confronta il foglio nuovo con quello di prima: per i tuoi turni comparsi o cambiati, chi c'era al tuo posto */
  private async annotaChiCeraPrima(vecchio: Uint8Array, nuovo: Uint8Array) {
    try {
      const alias = this.impostazioni.alias;
      const prima = tuttiITurni(vecchio);
      const mieiPrima = new Map(leggiFileTurni(vecchio, alias).mesi.flatMap((m) => m.miei).map((t) => [chiaveTurno(t), t]));
      const scorso = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
      const dal = `${scorso.getFullYear()}-${String(scorso.getMonth() + 1).padStart(2, '0')}`; // dal mese scorso in avanti
      const next: Record<string, string> = Object.fromEntries(Object.entries(this.chiCeraPrima).filter(([k]) => k.slice(0, 7) >= dal));
      for (const t of leggiFileTurni(nuovo, alias).mesi.flatMap((m) => m.miei)) {
        const k = chiaveTurno(t);
        const p = mieiPrima.get(k);
        if (next[k] || (p && p.inizio === t.inizio && p.fine === t.fine)) continue;
        const chi = chiCeraPrima(prima, t, alias);
        if (chi) next[k] = chi;
      }
      this.chiCeraPrima = next;
      await this.salva(K.chiCeraPrima, next);
    } catch {
      // Un file che non si legge non deve bloccare l'aggiornamento
    }
  }

  /** Archivio dei fogli ore: undefined lo toglie */
  async setArchivio(a: Archivio | undefined) {
    this.archivio = a;
    if (a) await this.salva(K.archivio, a);
    else await del(K.archivio).catch(() => undefined);
  }

  /** Ore totali di un mese inserite a mano; undefined toglie la correzione */
  setOreMese(ym: string, ore: number | undefined) {
    const next = { ...this.oreManuali };
    if (ore === undefined) delete next[ym];
    else next[ym] = ore;
    return this.setOreManuali(next);
  }

  setOreManuali(o: OreManuali) {
    this.oreManuali = o;
    return this.salva(K.oreManuali, o);
  }

  chiudiAvviso(chiave: string) {
    if (this.avvisiChiusi.includes(chiave)) return;
    this.avvisiChiusi = [...this.avvisiChiusi, chiave];
    return this.salva(K.avvisiChiusi, this.avvisiChiusi);
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
