import { describe, it, expect } from 'vitest';
import { rifDaLink, scaricaFoglio, FoglioNonRaggiungibile } from './remoto';

describe('link del foglio', () => {
  it('riconosce i link di Sheets e Drive', () => {
    expect(rifDaLink('https://docs.google.com/spreadsheets/d/13CFv39LKJP0n_jIMpMybRr-hAFFO4tRaDKzzJRNNAdU/edit?usp=drivesdk')).toEqual({ id: '13CFv39LKJP0n_jIMpMybRr-hAFFO4tRaDKzzJRNNAdU' });
    expect(rifDaLink('https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz12/edit?resourcekey=0-XyZ#gid=0')).toEqual({ id: 'abcdefghijklmnopqrstuvwxyz12', resourceKey: '0-XyZ' });
    expect(rifDaLink('https://drive.google.com/file/d/abcdefghijklmnopqrstuvwxyz12/view')).toEqual({ id: 'abcdefghijklmnopqrstuvwxyz12' });
    expect(rifDaLink('https://drive.google.com/open?id=abcdefghijklmnopqrstuvwxyz12')).toEqual({ id: 'abcdefghijklmnopqrstuvwxyz12' });
    expect(rifDaLink('  13CFv39LKJP0n_jIMpMybRr-hAFFO4tRaDKzzJRNNAdU ')).toEqual({ id: '13CFv39LKJP0n_jIMpMybRr-hAFFO4tRaDKzzJRNNAdU' });
  });
  it('rifiuta il resto', () => {
    expect(rifDaLink('https://example.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz12')).toBeNull();
    expect(rifDaLink('ciao')).toBeNull();
  });
});

describe('scaricamento', () => {
  const risposta = (status: number, body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  it('esporta in xlsx con la chiave e la resourcekey', async () => {
    const chiamate: { url: string; h: HeadersInit | undefined }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      chiamate.push({ url, h: init?.headers });
      return risposta(200, 'PK');
    }) as typeof fetch;
    const b = await scaricaFoglio({ id: 'abc', resourceKey: 'rk' }, 'KEY', f);
    expect(new TextDecoder().decode(b)).toBe('PK');
    expect(chiamate[0].url).toContain('/files/abc/export?mimeType=application%2Fvnd.openxmlformats');
    expect(chiamate[0].url).toContain('key=KEY');
    expect(chiamate[0].h).toEqual({ 'X-Goog-Drive-Resource-Keys': 'abc/rk' });
  });
  it('file Excel caricato su Drive: lo scarica com’è', async () => {
    const urls: string[] = [];
    const f = (async (url: string) => {
      urls.push(url);
      return url.includes('/export') ? risposta(403, { error: { errors: [{ reason: 'fileNotExportable' }] } }) : risposta(200, 'PK');
    }) as typeof fetch;
    await scaricaFoglio({ id: 'abc' }, 'K', f);
    expect(urls[1]).toContain('/files/abc?alt=media');
  });
  it('errori: definitivi e passeggeri', async () => {
    const prova = async (r: () => Response | Promise<Response>) => {
      try {
        await scaricaFoglio({ id: 'abc' }, 'K', (async () => r()) as typeof fetch);
      } catch (e) {
        return e as FoglioNonRaggiungibile;
      }
    };
    expect((await prova(() => risposta(404, {})))?.definitivo).toBe(true);
    expect((await prova(() => risposta(403, { error: { errors: [{ reason: 'forbidden' }] } })))?.definitivo).toBe(true);
    expect((await prova(() => risposta(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } })))?.definitivo).toBe(false);
    expect((await prova(() => { throw new TypeError('offline'); }))?.message).toMatch(/connessione/);
  });
});
