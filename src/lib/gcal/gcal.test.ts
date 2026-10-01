import { describe, it, expect } from 'vitest';
import { pianoSync, eventoDaTurno, titoloTurno, inizioFinestra, applicaModello, testoPromemoria, type EventoGoogle } from './eventi';
import { generaIcs } from './ics';
import { completaImpostazioni, nomeArea, breveArea, type Impostazioni, type Turno } from '../model';

const t = (id: string, extra: Partial<Turno> = {}): Turno => ({
  id, data: '2026-10-02', area: 'maschile', postazione: 2, inizio: 900, fine: 1200, origine: 'import', ...extra,
});
const remoto = (turno: Turno, eventId: string, cambia?: Partial<EventoGoogle>): EventoGoogle => ({ ...eventoDaTurno(turno), id: eventId, ...cambia });

describe('eventi', () => {
  it('titolo e orari nel fuso di Roma', () => {
    const e = eventoDaTurno(t('a'));
    expect(e.summary).toBe('Leone · Spogl. M P2');
    expect(e.start).toEqual({ dateTime: '2026-10-02T15:00:00', timeZone: 'Europe/Rome' });
    expect(e.end.dateTime).toBe('2026-10-02T20:00:00');
    expect(e.extendedProperties?.private?.clockworkId).toBe('a');
  });
  it('titolo delle sostituzioni', () => {
    expect(titoloTurno(t('b', { area: 'piccoli', postazione: 5, sostituisce: 'Greta', origine: 'manuale' }))).toBe('Leone · Sost. Greta (Piccoli)');
  });
  it('la firma cambia se cambia l’orario', () => {
    const a = eventoDaTurno(t('a')).extendedProperties!.private!.clockworkFirma;
    const b = eventoDaTurno(t('a', { fine: 1170 })).extendedProperties!.private!.clockworkFirma;
    expect(a).not.toBe(b);
  });
  it('finestra dal mese precedente', () => {
    expect(inizioFinestra(new Date(2026, 9, 1))).toBe('2026-09-01');
    expect(inizioFinestra(new Date(2026, 0, 15))).toBe('2025-12-01');
  });
});

describe('piano di sincronizzazione', () => {
  it('crea, aggiorna, elimina e lascia stare il resto', () => {
    const uguale = t('uguale');
    const cambiato = t('cambiato', { data: '2026-10-09' });
    const nuovo = t('nuovo', { data: '2026-10-12', area: 'atrio', postazione: undefined });
    const annullato = t('annullato', { data: '2026-10-19', annullato: true });
    const remoti: EventoGoogle[] = [
      remoto(uguale, 'e1'),
      remoto({ ...cambiato, fine: 1140 }, 'e2'),
      remoto(annullato, 'e3'),
      remoto(t('sparito'), 'e4'),
      { id: 'mio', summary: 'Dentista', start: { dateTime: '2026-10-03T10:00:00', timeZone: 'Europe/Rome' }, end: { dateTime: '2026-10-03T11:00:00', timeZone: 'Europe/Rome' } },
      remoto(uguale, 'e1-doppione'),
    ];
    const p = pianoSync([uguale, cambiato, nuovo, annullato], remoti);
    expect(p.crea.map((c) => c.turno.id)).toEqual(['nuovo']);
    expect(p.aggiorna.map((a) => [a.turno.id, a.eventId])).toEqual([['cambiato', 'e2']]);
    expect(p.elimina.map((e) => e.eventId).sort()).toEqual(['e1-doppione', 'e3', 'e4']);
  });
  it('seconda sincronizzazione senza cambiamenti: niente da fare', () => {
    const turni = [t('a'), t('b', { data: '2026-10-03' })];
    const p = pianoSync(turni, turni.map((x, i) => remoto(x, `e${i}`)));
    expect(p.crea.length + p.aggiorna.length + p.elimina.length).toBe(0);
  });
});

describe('ics', () => {
  it('eventi con fuso orario e righe piegate', () => {
    const ics = generaIcs([t('a'), t('x', { annullato: true }), t('s', { data: '2026-10-17', sostituisce: 'Greta', nota: 'sost greta spogl piccoli, sabato' })], new Date('2026-10-01T00:00:00Z'));
    expect(ics).toContain('DTSTART;TZID=Europe/Rome:20261002T150000');
    expect(ics).toContain('UID:a@clockwork');
    expect(ics).not.toContain('UID:x@clockwork');
    expect(ics).toContain('sost greta spogl piccoli\\, sabato');
    for (const riga of ics.split('\r\n')) expect(new TextEncoder().encode(riga).length).toBeLessThanOrEqual(75);
    expect(ics.split('BEGIN:VEVENT').length - 1).toBe(2);
  });
});

describe('personalizzazione', () => {
  const imp = (p: Partial<Impostazioni> = {}) => completaImpostazioni(p);
  const leone = imp({
    aree: {
      maschile: { titolo: 'Leone 🔽' },
      atrio: { titolo: 'Leone ⏺️', luogo: 'Via Leone XIII 20, Milano', colore: '7', promemoria: [] },
      piccoli: { titolo: 'Leone 🍼', nome: 'Spogliatoio dei piccoli', breve: 'Bimbi', promemoria: [{ metodo: 'popup', minuti: 30 }] },
    },
  });

  it('predefiniti: stesso titolo di prima, luogo, notifica 1 ora prima', () => {
    const e = eventoDaTurno(t('a'));
    expect(e.summary).toBe('Leone · Spogl. M P2');
    expect(e.location).toBe('Leone XIII Sport');
    expect(e.reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] });
    expect(e.colorId).toBeUndefined();
  });

  it('titolo per area, anche per le sostituzioni', () => {
    expect(titoloTurno(t('a'), leone)).toBe('Leone 🔽');
    expect(titoloTurno(t('b', { area: 'piccoli', sostituisce: 'Greta' }), leone)).toBe('Leone 🍼');
    // area senza titolo: si usa il modello
    expect(titoloTurno(t('c', { area: 'femminile', postazione: undefined }), leone)).toBe('Leone · Spogl. F');
  });

  it('il nome del turno vince su tutto', () => {
    expect(titoloTurno(t('a', { nome: 'Gara regionale' }), leone)).toBe('Gara regionale');
  });

  it('modalità modello: segnaposto e pulizia dei vuoti', () => {
    const m = imp({ ...leone, calendario: { ...leone.calendario, modoTitolo: 'modello', modelloTurno: '{area} {postazione} · {inizio}–{fine}', modelloSost: 'Sost. {collega} [{postazione}]' } });
    expect(titoloTurno(t('a'), m)).toBe('Spogl. M P2 · 15:00–20:00');
    expect(titoloTurno(t('b', { sostituisce: 'Greta', postazione: undefined }), m)).toBe('Sost. Greta');
    expect(titoloTurno(t('c', { area: 'piccoli' }), m)).toBe('Bimbi P2 · 15:00–20:00');
    expect(applicaModello('{ore} · {sconosciuto}', t('a'))).toBe('5 h · {sconosciuto}');
    expect(applicaModello('Leone · {collega}', t('a'))).toBe('Leone');
  });

  it('promemoria: turno, poi area, poi predefiniti', () => {
    expect(eventoDaTurno(t('a', { area: 'piccoli' }), leone).reminders?.overrides).toEqual([{ method: 'popup', minutes: 30 }]);
    expect(eventoDaTurno(t('a', { area: 'atrio' }), leone).reminders?.overrides).toEqual([]);
    const tre = eventoDaTurno(t('a', { area: 'piccoli', promemoria: [{ metodo: 'popup', minuti: 15 }, { metodo: 'email', minuti: 1440 }, { metodo: 'popup', minuti: 15 }] }), leone);
    expect(tre.reminders?.overrides).toEqual([{ method: 'email', minutes: 1440 }, { method: 'popup', minutes: 15 }]);
  });

  it('luogo e colore per area', () => {
    const a = eventoDaTurno(t('a', { area: 'atrio' }), leone);
    expect(a.location).toBe('Via Leone XIII 20, Milano');
    expect(a.colorId).toBe('7');
    const tutti = imp({ ...leone, calendario: { ...leone.calendario, colore: '2', luogo: '' } });
    expect(eventoDaTurno(t('m'), tutti).colorId).toBe('2');
    expect(eventoDaTurno(t('m'), tutti).location).toBeUndefined();
    expect(eventoDaTurno(t('a', { area: 'atrio' }), tutti).colorId).toBe('7');
  });

  it('cambiare le impostazioni fa aggiornare gli eventi già creati', () => {
    const turni = [t('a'), t('b', { area: 'atrio' })];
    const remoti = turni.map((x, i) => remoto(x, `e${i}`));
    expect(pianoSync(turni, remoti).aggiorna).toHaveLength(0);
    expect(pianoSync(turni, remoti, leone).aggiorna.map((a) => a.evento.summary)).toEqual(['Leone 🔽', 'Leone ⏺️']);
  });

  it('nomi delle aree nell’app', () => {
    expect(nomeArea('piccoli', leone)).toBe('Spogliatoio dei piccoli');
    expect(breveArea('piccoli', leone)).toBe('Bimbi');
    expect(breveArea('maschile', leone)).toBe('Spogl. M');
  });

  it('testi dei promemoria', () => {
    expect(testoPromemoria(0)).toBe('All’inizio');
    expect(testoPromemoria(45)).toBe('45 min prima');
    expect(testoPromemoria(60)).toBe('1 ora prima');
    expect(testoPromemoria(1440)).toBe('1 giorno prima');
    expect(testoPromemoria(1530)).toBe('1 giorno e 1 ora e 30 min prima');
  });

  it('impostazioni vecchie completate con i predefiniti', () => {
    const vecchie = completaImpostazioni({ alias: ['Vincenzo'], tariffa: 9 } as Partial<Impostazioni>);
    expect(vecchie.calendario.modoTitolo).toBe('area');
    expect(vecchie.aree).toEqual({});
  });

  it('ics con allarmi', () => {
    const ics = generaIcs([t('a', { area: 'piccoli' })], new Date('2026-10-01T00:00:00Z'), leone);
    expect(ics).toContain('SUMMARY:Leone 🍼');
    expect(ics).toContain('TRIGGER:-PT30M');
  });
});
