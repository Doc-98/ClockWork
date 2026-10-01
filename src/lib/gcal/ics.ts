import { eventoDaTurno } from './eventi';
import { IMPOSTAZIONI_DEFAULT, type Impostazioni, type Turno } from '../model';

/**
 * File .ics con i turni: funziona con qualunque calendario (Apple, Google, Outlook), senza accesso.
 * Ogni turno ha un UID stabile: reimportando, i calendari che lo supportano aggiornano invece di duplicare.
 */

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Righe max 75 ottetti (RFC 5545), continuazione con spazio. */
function piega(riga: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of riga) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > 73) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

const locale = (data: string, min: number) =>
  `${data.replace(/-/g, '')}T${String(Math.floor(min / 60)).padStart(2, '0')}${String(min % 60).padStart(2, '0')}00`;

export function generaIcs(turni: Turno[], ora = new Date(), imp: Pick<Impostazioni, 'aree' | 'calendario'> = IMPOSTAZIONI_DEFAULT): string {
  const stamp = ora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const righe = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ClockWork//Turni Leone XIII//IT',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:ClockWork · Leone XIII',
    'X-WR-TIMEZONE:Europe/Rome',
    // Definizione del fuso orario italiano (ora legale dall'ultima domenica di marzo a quella di ottobre)
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Rome',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
  for (const t of turni) {
    if (t.annullato) continue;
    const e = eventoDaTurno(t, imp);
    // Le notifiche diventano allarmi; quelli via email in un .ics richiederebbero un destinatario, quindi restano fuori
    const allarmi = (e.reminders?.overrides ?? [])
      .filter((r) => r.method === 'popup')
      .flatMap((r) => ['BEGIN:VALARM', 'ACTION:DISPLAY', piega(`DESCRIPTION:${esc(e.summary)}`), `TRIGGER:-PT${r.minutes}M`, 'END:VALARM']);
    righe.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@clockwork`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Rome:${locale(t.data, t.inizio)}`,
      `DTEND;TZID=Europe/Rome:${locale(t.data, t.fine)}`,
      piega(`SUMMARY:${esc(e.summary)}`),
      piega(`DESCRIPTION:${esc(e.description ?? '')}`),
      ...(e.location ? [piega(`LOCATION:${esc(e.location)}`)] : []),
      ...allarmi,
      'END:VEVENT',
    );
  }
  righe.push('END:VCALENDAR');
  return righe.join('\r\n') + '\r\n';
}
