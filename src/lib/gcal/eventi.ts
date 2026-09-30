import { nomeArea, breveArea, type Turno } from '../model';

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

export function titoloTurno(t: Turno): string {
  if (t.sostituisce) return `Leone · Sost. ${t.sostituisce} (${breveArea(t.area)})`;
  return `Leone · ${breveArea(t.area)}${t.postazione ? ` P${t.postazione}` : ''}${t.presa ? ' · presa' : ''}`;
}

export function eventoDaTurno(t: Turno): EventoGoogle {
  const righe = [
    nomeArea(t.area) + (t.postazione ? `, postazione ${t.postazione}` : ''),
    t.sostituisce ? `Sostituzione di ${t.sostituisce}` : '',
    t.presa ? 'Presa (inizio anticipato)' : '',
    t.nota ? `Nota: ${t.nota}` : '',
    'Creato da ClockWork',
  ].filter(Boolean);
  const base = {
    summary: titoloTurno(t),
    description: righe.join('\n'),
    location: 'Leone XIII Sport',
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
export function pianoSync(turni: Turno[], remoti: EventoGoogle[]): PianoSync {
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
    const evento = eventoDaTurno(t);
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
