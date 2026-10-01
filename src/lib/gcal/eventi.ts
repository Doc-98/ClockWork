import { nomeArea, breveArea, hhmm, oreDi, IMPOSTAZIONI_DEFAULT, type Impostazioni, type Promemoria, type Turno } from '../model';

/**
 * Dai turni agli eventi del calendario, e confronto con ciò che c'è già su Google.
 * Tutto qui è puro (niente rete): è la parte da testare.
 */

export const FUSO = 'Europe/Rome';

export interface EventoGoogle {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  colorId?: string;
  reminders?: { useDefault: boolean; overrides?: { method: 'popup' | 'email'; minutes: number }[] };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  extendedProperties?: { private?: Record<string, string> };
}

function dt(data: string, minuti: number): string {
  const h = String(Math.floor(minuti / 60)).padStart(2, '0');
  const m = String(minuti % 60).padStart(2, '0');
  return `${data}T${h}:${m}:00`;
}

/** Hash breve e stabile (djb2) per capire se un evento va aggiornato. */
export function firma(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** I colori che Google Calendar permette per i singoli eventi (colorId → nome e tinta). */
export const COLORI_GOOGLE: { id: string; nome: string; hex: string }[] = [
  { id: '1', nome: 'Lavanda', hex: '#7986cb' },
  { id: '2', nome: 'Salvia', hex: '#33b679' },
  { id: '3', nome: 'Uva', hex: '#8e24aa' },
  { id: '4', nome: 'Fenicottero', hex: '#e67c73' },
  { id: '5', nome: 'Banana', hex: '#f6bf26' },
  { id: '6', nome: 'Mandarino', hex: '#f4511e' },
  { id: '7', nome: 'Pavone', hex: '#039be5' },
  { id: '8', nome: 'Grafite', hex: '#616161' },
  { id: '9', nome: 'Mirtillo', hex: '#3f51b5' },
  { id: '10', nome: 'Basilico', hex: '#0b8043' },
  { id: '11', nome: 'Pomodoro', hex: '#d50000' },
];

/** Segnaposto utilizzabili nei titoli, con la spiegazione per l'utente. */
export const SEGNAPOSTO: { chiave: string; descrizione: string }[] = [
  { chiave: '{area}', descrizione: 'nome breve dell’area' },
  { chiave: '{postazione}', descrizione: 'es. P2 (vuoto se non c’è)' },
  { chiave: '{collega}', descrizione: 'chi sostituisci' },
  { chiave: '{inizio}', descrizione: 'ora di inizio' },
  { chiave: '{fine}', descrizione: 'ora di fine' },
  { chiave: '{ore}', descrizione: 'durata, es. 4,5 h' },
];

/** Sostituisce i segnaposto e ripulisce ciò che resta vuoto (spazi doppi, parentesi vuote, separatori in coda). */
export function applicaModello(modello: string, t: Turno, imp: Pick<Impostazioni, 'aree'> = IMPOSTAZIONI_DEFAULT): string {
  const valori: Record<string, string> = {
    area: breveArea(t.area, imp),
    postazione: t.postazione ? `P${t.postazione}` : '',
    collega: t.sostituisce ?? '',
    inizio: hhmm(t.inizio),
    fine: hhmm(t.fine),
    ore: `${String(oreDi(t)).replace('.', ',')} h`,
  };
  return modello
    .replace(/\{(\w+)\}/g, (tutto, k: string) => (k in valori ? valori[k] : tutto))
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s·\-–|,]+|[\s·\-–|,]+$/g, '')
    .trim();
}

/** Titolo dell'evento: nome del turno, poi titolo dell'area (se scelto «per area»), poi il modello. */
export function titoloTurno(t: Turno, imp: Pick<Impostazioni, 'aree' | 'calendario'> = IMPOSTAZIONI_DEFAULT): string {
  if (t.nome?.trim()) return t.nome.trim();
  const cal = imp.calendario;
  const titoloArea = cal.modoTitolo === 'area' ? imp.aree[t.area]?.titolo?.trim() : '';
  const modello = titoloArea || (t.sostituisce ? cal.modelloSost : cal.modelloTurno);
  return applicaModello(modello, t, imp) || breveArea(t.area, imp);
}

/** Promemoria che valgono per il turno: quelli del turno, poi quelli dell'area, poi i predefiniti. */
export function promemoriaDi(t: Turno, imp: Pick<Impostazioni, 'aree' | 'calendario'> = IMPOSTAZIONI_DEFAULT): Promemoria[] {
  return t.promemoria ?? imp.aree[t.area]?.promemoria ?? imp.calendario.promemoria;
}
export function luogoDi(t: Turno, imp: Pick<Impostazioni, 'aree' | 'calendario'> = IMPOSTAZIONI_DEFAULT): string {
  return imp.aree[t.area]?.luogo?.trim() || imp.calendario.luogo.trim();
}
export function coloreDi(t: Turno, imp: Pick<Impostazioni, 'aree' | 'calendario'> = IMPOSTAZIONI_DEFAULT): string | undefined {
  return imp.aree[t.area]?.colore || imp.calendario.colore || undefined;
}

/** «1 ora prima», «All'inizio», «2 giorni prima» */
export function testoPromemoria(minuti: number): string {
  if (minuti === 0) return 'All’inizio';
  const parti: string[] = [];
  const g = Math.floor(minuti / 1440);
  const h = Math.floor((minuti % 1440) / 60);
  const m = minuti % 60;
  if (g) parti.push(g === 1 ? '1 giorno' : `${g} giorni`);
  if (h) parti.push(h === 1 ? '1 ora' : `${h} ore`);
  if (m) parti.push(`${m} min`);
  return `${parti.join(' e ')} prima`;
}

export function eventoDaTurno(t: Turno, imp: Pick<Impostazioni, 'aree' | 'calendario'> = IMPOSTAZIONI_DEFAULT): EventoGoogle {
  const righe = [
    nomeArea(t.area, imp) + (t.postazione ? `, postazione ${t.postazione}` : ''),
    t.sostituisce ? `Sostituzione di ${t.sostituisce}` : '',
    t.presa ? 'Presa (inizio anticipato)' : '',
    t.nota ? `Nota: ${t.nota}` : '',
    'Creato da ClockWork',
  ].filter(Boolean);
  // Al massimo 5 promemoria, senza doppioni, dal più lontano al più vicino
  const visti = new Set<string>();
  const overrides = promemoriaDi(t, imp)
    .filter((p) => Number.isFinite(p.minuti) && p.minuti >= 0)
    .map((p) => ({ method: p.metodo, minutes: Math.min(Math.round(p.minuti), 40320) }))
    .filter((p) => !visti.has(`${p.method}${p.minutes}`) && !!visti.add(`${p.method}${p.minutes}`))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);
  const luogo = luogoDi(t, imp);
  const colore = coloreDi(t, imp);
  const base: EventoGoogle = {
    summary: titoloTurno(t, imp),
    description: righe.join('\n'),
    ...(luogo ? { location: luogo } : {}),
    ...(colore ? { colorId: colore } : {}),
    reminders: { useDefault: false, overrides },
    start: { dateTime: dt(t.data, t.inizio), timeZone: FUSO },
    end: { dateTime: dt(t.data, t.fine), timeZone: FUSO },
  };
  return {
    ...base,
    extendedProperties: { private: { clockworkId: t.id, clockworkFirma: firma(JSON.stringify(base)) } },
  };
}

export interface PianoSync {
  crea: { turno: Turno; evento: EventoGoogle }[];
  aggiorna: { turno: Turno; evento: EventoGoogle; eventId: string }[];
  elimina: { eventId: string; summary: string }[];
}

/**
 * Confronta i turni (nella finestra considerata) con gli eventi remoti creati da ClockWork.
 * Gli eventi senza clockworkId (aggiunti a mano da te nel calendario) non vengono toccati.
 */
export function pianoSync(
  turni: Turno[],
  remoti: EventoGoogle[],
  imp: Pick<Impostazioni, 'aree' | 'calendario'> = IMPOSTAZIONI_DEFAULT,
): PianoSync {
  const perTurno = new Map<string, EventoGoogle>();
  const duplicati: EventoGoogle[] = [];
  for (const e of remoti) {
    const id = e.extendedProperties?.private?.clockworkId;
    if (!id || !e.id) continue;
    if (perTurno.has(id)) duplicati.push(e);
    else perTurno.set(id, e);
  }
  const piano: PianoSync = { crea: [], aggiorna: [], elimina: [] };
  const voluti = new Set<string>();
  for (const t of turni) {
    if (t.annullato) continue;
    voluti.add(t.id);
    const evento = eventoDaTurno(t, imp);
    const remoto = perTurno.get(t.id);
    if (!remoto) piano.crea.push({ turno: t, evento });
    else if (remoto.extendedProperties?.private?.clockworkFirma !== evento.extendedProperties!.private!.clockworkFirma) {
      piano.aggiorna.push({ turno: t, evento, eventId: remoto.id! });
    }
  }
  for (const [id, e] of perTurno) if (!voluti.has(id)) piano.elimina.push({ eventId: e.id!, summary: e.summary });
  for (const e of duplicati) piano.elimina.push({ eventId: e.id!, summary: e.summary });
  return piano;
}

/** Primo giorno del mese precedente: da lì in avanti il calendario viene tenuto allineato. */
export function inizioFinestra(oggi = new Date()): string {
  const d = new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
