<script lang="ts">
  import { untrack } from 'svelte';
  import { dati } from '../lib/dati.svelte';
  import { router, type Rotta } from '../lib/router.svelte';
  import { fonte } from '../lib/turni/fonte.svelte';
  import { leggiFileTurni, casiDoppi, applicaScelte, confronta, applicaRevisione, chiaveTurno, pianoAggiornamento, type SceltaOrario } from '../lib/turni/importa';
  import { breveArea, nomeArea, hhmm, dataDa, type Area } from '../lib/model';
  import { oreTurno } from '../lib/turni/parse';
  import { formatOre } from '../lib/ore';
  import { MESI } from '../lib/foglio/genera';
  import Icona from '../components/Icona.svelte';

  let { rotta }: { rotta: Extract<Rotta, { nome: 'rivedi' }> } = $props();
  const meseRichiesto = untrack(() => rotta.mese);

  const letto = $derived.by(() => {
    const u = dati.ultimaImportazione;
    if (!u) return undefined;
    try {
      return leggiFileTurni(u.bytes, dati.impostazioni.alias);
    } catch {
      return undefined;
    }
  });
  // Il mese chiesto, altrimenti il primo che ha qualcosa da rivedere
  const mese = $derived.by(() => {
    const l = letto;
    if (!l) return undefined;
    if (meseRichiesto) return l.mesi.find((m) => m.nome === meseRichiesto);
    const piano = pianoAggiornamento(l, dati.turni, dati.scelte, dati.esclusi);
    const nome = piano.find((p) => p.azione !== 'nessuna')?.nome;
    return l.mesi.find((m) => m.nome === nome) ?? l.mesi.at(-1);
  });

  // Orari doppi: quelli mai scelti vanno decisi qui, gli altri partono dalla scelta salvata
  let scelteLocali = $state<Record<string, SceltaOrario>>({});
  const casi = $derived(mese ? casiDoppi(mese.miei, dati.scelte) : []);
  const maiScelti = $derived(casi.some((c) => !dati.scelte[c.chiave]));
  const daDecidere = $derived(casi.filter((c) => !dati.scelte[c.chiave] && !scelteLocali[c.chiave]));
  const scelte = $derived({ ...dati.scelte, ...Object.fromEntries(casi.map((c) => [c.chiave, scelteLocali[c.chiave] ?? c.proposta])) });
  const risolti = $derived(mese ? applicaScelte(mese.miei, scelte) : []);
  const confronto = $derived(mese ? confronta(dati.turni, risolti, mese.year, mese.month) : undefined);
  const primaImportazione = $derived(!!mese && !dati.turniDelMese(mese.year, mese.month).some((t) => t.origine === 'import'));

  // Le tue scelte: chiavi data|area
  let escludi = $state<Set<string>>(new Set());
  let tieniVecchio = $state<Set<string>>(new Set());
  let tieni = $state<Set<string>>(new Set());
  // I turni che avevi escluso l'ultima volta restano esclusi
  $effect(() => {
    const m = mese;
    if (!m) return;
    const p = `${m.year}-${String(m.month).padStart(2, '0')}-`;
    const salvati = dati.esclusi.filter((k) => k.startsWith(p));
    untrack(() => (escludi = new Set(salvati)));
  });
  const togli = (s: Set<string>, k: string) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  };

  const nuovi = $derived(confronto?.righe.filter((r) => r.stato === 'nuovo') ?? []);
  const cambiati = $derived(confronto?.righe.filter((r) => r.stato === 'cambiato') ?? []);
  const uguali = $derived(confronto?.righe.filter((r) => r.stato === 'uguale') ?? []);
  const rimossi = $derived(confronto?.rimossi ?? []);
  const nCambiamenti = $derived((primaImportazione ? 0 : nuovi.length) + cambiati.length + rimossi.length);
  let mostraAltri = $state(false);

  // Come sarà il mese confermando adesso
  const risultato = $derived(
    mese ? applicaRevisione(dati.turni, risolti, mese.year, mese.month, { escludi, tieniVecchio, tieni }).filter((t) => t.data.startsWith(`${mese.year}-${String(mese.month).padStart(2, '0')}-`) && !t.annullato) : [],
  );
  const ore = $derived(Math.round(risultato.reduce((s, t) => s + (t.fine - t.inizio) / 60, 0) * 100) / 100);

  let lavoro = $state(false);
  async function conferma() {
    if (!mese || daDecidere.length) return;
    lavoro = true;
    await dati.setTurni(applicaRevisione(dati.turni, risolti, mese.year, mese.month, { escludi, tieniVecchio, tieni }));
    const daSalvare = { ...dati.scelte };
    for (const c of casi) daSalvare[c.chiave] = scelte[c.chiave];
    await dati.setScelte(daSalvare);
    await dati.setEsclusiMese(mese.year, mese.month, [...escludi].filter((k) => k.startsWith(`${mese.year}-${String(mese.month).padStart(2, '0')}-`)));
    if (fonte.stato?.avviso?.mese === mese.nome) fonte.chiudiAvviso();
    // Le scelte appena fatte (es. un orario doppio) possono sbloccare altri mesi in sospeso
    if (fonte.stato) fonte.controlla(false, true);
    lavoro = false;
    router.indietro('#/foglio-turni');
  }

  const GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const giorno = (iso: string) => `${GG[dataDa(iso).getDay()]} ${Number(iso.slice(8))}`;
  const orario = (t: { inizio: number; fine: number }) => `${hhmm(t.inizio)}–${hhmm(t.fine)}`;
  const etichetta = (t: { area: Area; postazione?: number; presa?: boolean }) =>
    `${breveArea(t.area, dati.impostazioni)}${t.postazione ? ' · P' + t.postazione : ''}${t.presa ? ' *' : ''}`;
  const giorniDi = (date: string[]) => {
    const d = date.map((x) => Number(x.slice(8)));
    return d.length === 1 ? `${GG[dataDa(date[0]).getDay()]} ${d[0]}` : `${d.slice(0, -1).join(', ')} e ${d.at(-1)}`;
  };
</script>

<section class="page">
  <header class="bar">
    <button class="link" onclick={() => router.indietro('#/foglio-turni')}>Annulla</button>
    <h1>{mese ? MESI[mese.month - 1] : 'Rivedi i turni'}</h1>
    <span></span>
  </header>

  {#if !dati.ultimaImportazione}
    <p class="msg err">Non ho ancora il foglio turni: collegalo o caricalo da <a href="#/foglio-turni">Impostazioni foglio turni</a>.</p>
  {:else if !mese}
    <p class="msg err">Nel foglio turni non trovo {meseRichiesto ? `«${meseRichiesto}»` : 'mesi da rivedere'}.</p>
  {:else if !mese.miei.length && !rimossi.length}
    <p class="msg err">In «{mese.nome}» non trovo turni a nome «{dati.impostazioni.alias.join(', ')}». Se nel foglio sei scritto diversamente, cambialo in <a href="#/foglio-turni">Impostazioni foglio turni</a>.</p>
  {:else}
    <div class="sommario">
      <div class="d totale">{risultato.length} turni · <span class="m">{daDecidere.length ? '…' : formatOre(ore)} h</span></div>
      <div class="chips">
        {#if daDecidere.length}<span class="tag t-warn">{daDecidere.length} da decidere</span>{/if}
        {#if primaImportazione}<span class="tag t-soft">prima importazione</span>
        {:else if nCambiamenti}<span class="tag t-warn">{nCambiamenti} {nCambiamenti === 1 ? 'cambiamento' : 'cambiamenti'}</span>{/if}
      </div>
    </div>

    {#if casi.length}
      <section class="gruppo">
        <h2 class="lbl">{maiScelti ? 'Da decidere' : 'Orari doppi'}</h2>
        {#each casi as c (c.chiave)}
          {@const s = scelte[c.chiave]}
          <div class="card doppio">
            <div class="testa">
              <span class="tit">Orario doppio · {nomeArea(c.area, dati.impostazioni)}</span>
              <span class="muted small">Nel foglio: <span class="m">{c.grezzo}</span> · {giorniDi(c.date)}</span>
            </div>
            {#if c.opzioniInizio[0] !== c.opzioniInizio[1]}
              <div class="field">
                <span class="lbl">Tu inizi alle</span>
                <div class="seg due-seg" role="group" aria-label="Inizio">
                  {#each c.opzioniInizio as o, i (i)}
                    <button aria-pressed={(scelteLocali[c.chiave] || dati.scelte[c.chiave]) ? s.inizio === o : false} onclick={() => (scelteLocali = { ...scelteLocali, [c.chiave]: { ...s, inizio: o } })}>{hhmm(o)}</button>
                  {/each}
                </div>
              </div>
            {/if}
            {#if c.opzioniFine[0] !== c.opzioniFine[1]}
              <div class="field">
                <span class="lbl">Tu finisci alle</span>
                <div class="seg due-seg" role="group" aria-label="Fine">
                  {#each c.opzioniFine as o, i (i)}
                    <button aria-pressed={(scelteLocali[c.chiave] || dati.scelte[c.chiave]) ? s.fine === o : false} onclick={() => (scelteLocali = { ...scelteLocali, [c.chiave]: { ...s, fine: o } })}>{hhmm(o)}</button>
                  {/each}
                </div>
              </div>
            {/if}
            <span class="muted small">Lo ricordo per le prossime volte.</span>
          </div>
        {/each}
      </section>
    {/if}

    {#if primaImportazione}
      <section class="gruppo">
        <h2 class="lbl">Turni del mese</h2>
        <div class="card voci">
          {#each nuovi as r (chiaveTurno(r.letto))}
            {@const k = chiaveTurno(r.letto)}
            <label class="camb">
              <input type="checkbox" checked={!escludi.has(k)} onchange={() => (escludi = togli(escludi, k))} />
              <span class="txt">
                <span class="top"><span class="gg">{giorno(r.letto.data)}</span><span class="tag t-{r.letto.area}">{etichetta(r.letto)}</span></span>
                <span class="orari"><span class="m">{orario(r.letto)}</span></span>
              </span>
              <span class="m ore">{formatOre(oreTurno(r.letto))}</span>
            </label>
          {/each}
        </div>
      </section>
    {:else if nCambiamenti}
      <section class="gruppo">
        <h2 class="lbl">Cambiamenti</h2>
        <div class="card voci">
          {#each cambiati as r (chiaveTurno(r.letto))}
            {@const k = chiaveTurno(r.letto)}
            {@const applica = !tieniVecchio.has(k)}
            <label class="camb" class:scartato={!applica}>
              <input type="checkbox" checked={applica} aria-label="Usa il nuovo orario, {giorno(r.letto.data)}" onchange={() => (tieniVecchio = togli(tieniVecchio, k))} />
              <span class="txt">
                <span class="top"><span class="gg">{giorno(r.letto.data)}</span><span class="tag t-{r.letto.area}">{etichetta(r.letto)}</span></span>
                <span class="orari"><span class="m vecchio">{orario(r.precedente!)}</span><Icona nome="freccia" class="freccia" /><span class="m nuovo">{orario(r.letto)}</span></span>
                <span class="cosa">{applica ? 'Orario cambiato: uso il nuovo' : 'Orario cambiato: tengo il vecchio'}</span>
              </span>
            </label>
          {/each}
          {#each rimossi as t (t.id)}
            {@const k = chiaveTurno(t)}
            {@const via = !tieni.has(k)}
            <label class="camb" class:tolto={via}>
              <input type="checkbox" checked={via} aria-label="Togli {giorno(t.data)}" onchange={() => (tieni = togli(tieni, k))} />
              <span class="txt">
                <span class="top"><span class="gg">{giorno(t.data)}</span><span class="tag t-{t.area}">{etichetta(t)}</span></span>
                <span class="orari"><span class="m">{orario(t)}</span></span>
                <span class="cosa">{via ? 'Tolto dal foglio: lo tolgo anche qui' : 'Tolto dal foglio: lo tengo'}</span>
              </span>
            </label>
          {/each}
          {#each nuovi as r (chiaveTurno(r.letto))}
            {@const k = chiaveTurno(r.letto)}
            {@const aggiungi = !escludi.has(k)}
            <label class="camb" class:scartato-nuovo={!aggiungi}>
              <input type="checkbox" checked={aggiungi} aria-label="Aggiungi {giorno(r.letto.data)}" onchange={() => (escludi = togli(escludi, k))} />
              <span class="txt">
                <span class="top"><span class="gg">{giorno(r.letto.data)}</span><span class="tag t-{r.letto.area}">{etichetta(r.letto)}</span></span>
                <span class="orari"><span class="m nuovo">{orario(r.letto)}</span></span>
                <span class="cosa">{aggiungi ? 'Nuovo nel foglio: lo aggiungo' : 'Nuovo nel foglio: non lo aggiungo'}</span>
              </span>
            </label>
          {/each}
        </div>
      </section>
    {/if}

    {#if uguali.length}
      <button class="link altri" aria-expanded={mostraAltri} onclick={() => (mostraAltri = !mostraAltri)}>{mostraAltri ? 'Nascondi gli altri turni' : 'Mostra gli altri turni'}</button>
      {#if mostraAltri}
        <div class="card voci">
          {#each uguali as r (chiaveTurno(r.letto))}
            <div class="camb fisso">
              <span class="txt">
                <span class="top"><span class="gg">{giorno(r.letto.data)}</span><span class="tag t-{r.letto.area}">{etichetta(r.letto)}</span><span class="m">{orario(r.letto)}</span></span>
              </span>
              <span class="m ore">{formatOre(oreTurno(r.letto))}</span>
            </div>
          {/each}
        </div>
      {/if}
    {/if}

    {#if confronto?.protetti.length}
      <p class="muted small nomargin">
        {confronto.protetti.length === 1 ? "1 turno che hai modificato resta com'è." : `${confronto.protetti.length} turni che hai modificato restano come sono.`}
      </p>
    {/if}
    <p class="muted small nomargin">Sostituzioni e turni aggiunti a mano restano come sono: il foglio turni non li contiene.</p>

    <div class="fondo">
      {#if daDecidere.length}<span class="muted small">Scegli {daDecidere.length === 1 ? "l'orario doppio" : 'gli orari doppi'} per confermare.</span>{/if}
      <button class="btn btn-primary" disabled={lavoro || daDecidere.length > 0} onclick={conferma}>Conferma {risultato.length} turni di {MESI[mese.month - 1].toLowerCase()}</button>
    </div>
  {/if}
</section>

<style>
  .page { padding-bottom: 120px; }
  .sommario { display: flex; flex-direction: column; gap: var(--space-8); }
  .totale { font-size: var(--text-3xl); font-weight: 800; line-height: 1.1; }
  .totale .m { font-weight: 600; }
  .doppio { display: flex; flex-direction: column; gap: var(--space-12); padding: var(--space-16); }
  .testa { display: flex; flex-direction: column; gap: var(--space-4); }
  .tit { font-weight: 600; }
  .due-seg { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .camb { display: flex; align-items: flex-start; gap: var(--space-12); padding: var(--space-12) var(--space-14); border-top: 1px solid var(--line-soft); cursor: pointer; }
  .camb:first-child { border-top: none; }
  .camb.fisso { cursor: default; align-items: center; }
  .camb input { width: 22px; height: 22px; accent-color: var(--cloro); flex-shrink: 0; margin: 1px 0 0; }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-6); }
  .top { display: flex; align-items: center; gap: var(--space-8); flex-wrap: wrap; }
  .gg { font-weight: 600; min-width: 48px; }
  .orari { display: flex; align-items: center; gap: var(--space-6); flex-wrap: wrap; font-size: var(--text-md); }
  .vecchio { color: var(--muted); }
  .orari :global(.freccia) { width: 16px; height: 16px; color: var(--muted); }
  .nuovo { font-weight: 600; }
  .cosa { font-size: var(--text-xs); color: var(--muted); }
  .ore { font-size: var(--text-sm); color: var(--muted); }
  /* Tolto dal foglio: sbiadito e barrato; togliendo la spunta torna normale */
  .camb.tolto .top, .camb.tolto .orari { opacity: 0.5; }
  .camb.tolto .orari span, .camb.tolto .gg { text-decoration: line-through; }
  /* Orario cambiato che non applichi: il nuovo resta barrato */
  .camb.scartato .nuovo, .camb.scartato-nuovo .nuovo { text-decoration: line-through; color: var(--muted); font-weight: 500; }
  .altri { align-self: flex-start; }
  .fondo { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; display: flex; flex-direction: column; gap: var(--space-8); align-items: stretch; text-align: center;
    padding: var(--space-12) max(var(--space-20), calc((100% - 440px) / 2)) calc(var(--safe-bottom) + var(--space-12)); background: var(--carta); border-top: 1px solid var(--line); }
</style>
