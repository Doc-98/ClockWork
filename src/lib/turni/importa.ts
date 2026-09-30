import { leggiFoglioTurni, meseDalNomeFoglio, turniDi, type TurnoLetto } from './parse';
import { readWorkbook } from '../xlsx/read';
import { nuovoId, type Turno } from '../model';

/** Scelta dell'utente per un orario doppio, ricordata tra un'importazione e l'altra. */
export interface SceltaOrario {
  inizio: number;
  fine: number;
}
export type ScelteOrari = Record<string, SceltaOrario>;

/** Lo stesso caso di orario doppio: stessa area e stesso testo nelle celle. */
export function chiaveDoppio(t: Pick<TurnoLetto, 'area' | 'grezzo'>): string {
  return `${t.area}|${t.grezzo ?? ''}`;
}

export interface CasoDoppio {
  chiave: string;
  area: TurnoLetto['area'];
  grezzo: string;
  opzioniInizio: [number, number];
  opzioniFine: [number, number];
  /** date dei tuoi turni con questo orario */
  date: string[];
  /** proposta iniziale: scelta già salvata, altrimenti in base all'asterisco */
  proposta: SceltaOrario;
}

export function casiDoppi(miei: TurnoLetto[], scelte: ScelteOrari): CasoDoppio[] {
  const map = new Map<string, CasoDoppio>();
  for (const t of miei) {
    if (!t.orarioDoppio || !t.opzioniInizio || !t.opzioniFine) continue;
    const k = chiaveDoppio(t);
    const c = map.get(k);
    if (c) c.date.push(t.data);
    else
      map.set(k, {
        chiave: k,
        area: t.area,
        grezzo: t.grezzo ?? '',
        opzioniInizio: t.opzioniInizio,
        opzioniFine: t.opzioniFine,
        date: [t.data],
        proposta: scelte[k] ?? { inizio: t.inizio, fine: t.fine },
      });
  }
  return [...map.values()];
}

/** Applica le scelte sugli orari doppi. */
export function applicaScelte(miei: TurnoLetto[], scelte: ScelteOrari): TurnoLetto[] {
  return miei.map((t) => {
    const s = t.orarioDoppio ? scelte[chiaveDoppio(t)] : undefined;
    return s ? { ...t, inizio: s.inizio, fine: s.fine } : t;
  });
}

/** Chiave per riconoscere lo stesso turno tra due importazioni */
export function chiaveTurno(t: { data: string; area: string }): string {
  return `${t.data}|${t.area}`;
}

export type StatoConfronto = 'nuovo' | 'uguale' | 'cambiato';

export interface RigaConfronto {
  stato: StatoConfronto;
  letto: TurnoLetto;
  precedente?: Turno;
}

export interface Confronto {
  righe: RigaConfronto[];
  /** Turni importati in precedenza che non ci sono più nel foglio */
  rimossi: Turno[];
  /** Turni importati che avevi modificato a mano: restano come sono */
  protetti: Turno[];
}

function inMese(data: string, year: number, month: number): boolean {
  return data.startsWith(`${year}-${String(month).padStart(2, '0')}-`);
}

export function confronta(esistenti: Turno[], letti: TurnoLetto[], year: number, month: number): Confronto {
  const importati = esistenti.filter((t) => t.origine === 'import' && inMese(t.data, year, month));
  const perChiave = new Map(importati.map((t) => [chiaveTurno(t), t]));
  const visti = new Set<string>();
  const righe: RigaConfronto[] = [];
  const protetti: Turno[] = [];
  for (const l of letti) {
    const k = chiaveTurno(l);
    visti.add(k);
    const p = perChiave.get(k);
    if (p?.modificato) {
      protetti.push(p);
      continue;
    }
    if (!p) righe.push({ stato: 'nuovo', letto: l });
    else if (p.inizio === l.inizio && p.fine === l.fine && (p.postazione ?? null) === (l.postazione ?? null)) {
      righe.push({ stato: 'uguale', letto: l, precedente: p });
    } else righe.push({ stato: 'cambiato', letto: l, precedente: p });
  }
  const rimossi = importati.filter((t) => !visti.has(chiaveTurno(t)) && !t.modificato);
  return { righe, rimossi, protetti };
}

/**
 * Nuovo elenco completo dei turni dopo l'importazione di un mese:
 * i turni importati (non modificati) del mese vengono sostituiti da quelli confermati;
 * sostituzioni e turni aggiunti a mano restano sempre.
 */
export function applicaImport(esistenti: Turno[], confermati: TurnoLetto[], year: number, month: number): Turno[] {
  const restano = esistenti.filter((t) => !(t.origine === 'import' && !t.modificato && inMese(t.data, year, month)));
  const protetti = new Set(
    esistenti.filter((t) => t.origine === 'import' && t.modificato && inMese(t.data, year, month)).map(chiaveTurno),
  );
  const precedenti = new Map(esistenti.filter((t) => t.origine === 'import').map((t) => [chiaveTurno(t), t]));
  const nuovi: Turno[] = confermati
    .filter((l) => !protetti.has(chiaveTurno(l)))
    .map((l) => {
      const prima = precedenti.get(chiaveTurno(l));
      return {
        id: prima?.id ?? nuovoId(),
        data: l.data,
        area: l.area,
        postazione: l.postazione,
        inizio: l.inizio,
        fine: l.fine,
        origine: 'import',
        presa: l.presa || undefined,
        calendarEventId: prima?.calendarEventId,
      };
    });
  return [...restano, ...nuovi];
}

export interface FoglioTurniLetto {
  mesi: { nome: string; year: number; month: number; turni: TurnoLetto[]; miei: TurnoLetto[]; avvisi: string[] }[];
}

/** Legge l'intero file dei turni e trova i turni della persona per ogni mese. */
export function leggiFileTurni(bytes: Uint8Array, alias: string[]): FoglioTurniLetto {
  const wb = readWorkbook(bytes);
  const mesi: FoglioTurniLetto['mesi'] = [];
  for (const s of wb) {
    const m = meseDalNomeFoglio(s.name);
    if (!m) continue;
    const e = leggiFoglioTurni(s);
    const miei = turniDi(e.turni, alias);
    const nomiMiei = new Set(miei.map((t) => t.riga));
    mesi.push({
      nome: s.name,
      year: m.year,
      month: m.month,
      turni: e.turni,
      miei,
      // solo gli avvisi che riguardano righe con i tuoi turni
      avvisi: e.avvisi.filter((a) => [...nomiMiei].some((r) => a.includes(`riga ${r}:`))),
    });
  }
  mesi.sort((a, b) => a.year - b.year || a.month - b.month);
  return { mesi };
}

let cache: { bytes: Uint8Array; tutti: TurnoLetto[] } | undefined;

/** Tutti i turni (di chiunque) di una data, dal file dei turni: serve a precompilare una sostituzione. */
export function turniDelGiornoDalFile(bytes: Uint8Array, iso: string): TurnoLetto[] {
  if (cache?.bytes !== bytes) {
    const tutti = readWorkbook(bytes)
      .filter((s) => meseDalNomeFoglio(s.name))
      .flatMap((s) => leggiFoglioTurni(s).turni);
    cache = { bytes, tutti };
  }
  return cache.tutti.filter((t) => t.data === iso && !t.prova);
}
