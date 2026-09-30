/**
 * Lettura e piccola estensione di xl/styles.xml.
 * Serve per "togliere i bordi" a una cella senza toccare font, allineamento, formato.
 */

function cellXfsBlock(styles: string): { full: string; inner: string; open: string } {
  const m = /(<cellXfs\b[^>]*>)([\s\S]*?)<\/cellXfs>/.exec(styles);
  if (!m) throw new Error('styles.xml senza cellXfs');
  return { full: m[0], open: m[1], inner: m[2] };
}

export function listXfs(styles: string): string[] {
  const { inner } = cellXfsBlock(styles);
  return inner.match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) ?? [];
}

/** Forma canonica di un xf (attributi ordinati) per confrontare due stili. */
function canonical(xf: string, overrides: Record<string, string | null> = {}): string {
  const openEnd = xf.indexOf('>');
  const selfClosing = xf[openEnd - 1] === '/';
  const open = xf.slice(0, selfClosing ? openEnd - 1 : openEnd);
  const body = selfClosing ? '' : xf.slice(openEnd + 1, xf.lastIndexOf('</xf>'));
  const attrs: Record<string, string> = {};
  for (const m of open.matchAll(/\s([\w:]+)="([^"]*)"/g)) attrs[m[1]] = m[2];
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) delete attrs[k];
    else attrs[k] = v;
  }
  const keys = Object.keys(attrs).sort();
  return keys.map((k) => `${k}=${attrs[k]}`).join(' ') + '|' + body.replace(/\s+/g, ' ').trim();
}

/**
 * Restituisce l'indice di uno stile identico a `styleIndex` ma senza bordi.
 * Se esiste già lo riusa; altrimenti lo aggiunge in coda a cellXfs.
 */
export function borderlessStyle(styles: string, styleIndex: number): { styles: string; index: number } {
  const xfs = listXfs(styles);
  const src = xfs[styleIndex];
  if (!src) throw new Error(`Stile ${styleIndex} inesistente`);
  const wanted = canonical(src, { borderId: '0', applyBorder: null });
  const found = xfs.findIndex((xf) => canonical(xf, { applyBorder: null }) === wanted);
  if (found >= 0) return { styles, index: found };

  const newXf = src
    .replace(/\sborderId="\d+"/, ' borderId="0"')
    .replace(/\sapplyBorder="[^"]*"/, '');
  const block = cellXfsBlock(styles);
  const count = xfs.length + 1;
  const newOpen = block.open.replace(/count="\d+"/, `count="${count}"`);
  const newBlock = `${newOpen}${block.inner}${newXf}</cellXfs>`;
  return { styles: styles.replace(block.full, newBlock), index: xfs.length };
}
