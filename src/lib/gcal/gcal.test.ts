import { describe, it, expect } from 'vitest';
import { pianoSync, eventoDaTurno, titoloTurno, inizioFinestra, type EventoGoogle } from './eventi';
import { generaIcs } from './ics';
import type { Turno } from '../model';

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
