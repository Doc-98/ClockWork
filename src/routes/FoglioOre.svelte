<script lang="ts">
  import { dati } from '../lib/dati.svelte';
  import { router, type Rotta } from '../lib/router.svelte';
  import { generaFoglioOre, MESI } from '../lib/foglio/genera';
  import { vociDaTurni } from '../lib/foglio/daTurni';
  import { condividiFile, scaricaFile, fileCondivisibile, PDF_MIME } from '../lib/foglio/condividi';
  import { formatOre, formatEuro } from '../lib/ore';
  import { vista, ymDa, ymOggi, ymStr, spostaYm, type Ym } from '../lib/vista.svelte';
  import TitoloMese from '../components/TitoloMese.svelte';
  import Icona from '../components/Icona.svelte';

  let { rotta }: { rotta: Extract<Rotta, { nome: 'foglio' }> } = $props();

  const ym = $derived(ymDa(rotta.ym) ?? ymOggi());
  $effect(() => vista.segna('foglio', ym));
  const GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

  const voci = $derived(vociDaTurni(dati.turni, ym.year, ym.month));
  const totale = $derived(Math.round(voci.reduce((s, v) => s + v.hours, 0) * 100) / 100);
  const turniMese = $derived(dati.turniDelMese(ym.year, ym.month).filter((t) => !t.annullato));
  const nSost = $derived(turniMese.filter((t) => t.sostituisce).length);
  const mesiConTurni = $derived(new Set(dati.turni.map((t) => t.data.slice(0, 7))));

  let messaggio = $state('');
  let errore = $state('');
  let lavoro = $state(false);
  let menuScarica = $state(false);
  // Il compenso si vede solo se lo chiedi: il foglio si mostra anche ad altri
  let compensoVisibile = $state(false);

  function vai(dest: Ym) {
    messaggio = errore = '';
    menuScarica = false;
    router.vai(`#/foglio/${ymStr(dest)}`, true);
  }

  // Il file viene preparato in anticipo: al tocco su «Condividi» il menu deve aprirsi subito,
  // altrimenti il telefono considera la richiesta non partita dal tocco e la blocca.
  const pronto = $derived.by(() => {
    if (!dati.modello || !voci.length) return undefined;
    try {
      const out = generaFoglioOre(dati.modello, { year: ym.year, month: ym.month, voci, nome: dati.impostazioni.nome });
      return { ...out, file: fileCondivisibile(out.bytes, out.nomeFile) };
    } catch (e) {
      return { errore: e instanceof Error ? e.message : 'Errore durante la creazione del file.' };
    }
  });

  const fileOk = $derived(!!pronto && !('errore' in pronto));
  const erroreFile = $derived(pronto && 'errore' in pronto ? pronto.errore : dati.erroreModello);

  // PDF: preparato anche lui in anticipo (serve dove il telefono non condivide file Excel, es. Android)
  interface Pdf { bytes: Uint8Array; nomeFile: string; file?: File }
  let pdf = $state<Pdf | undefined>();
  let pdfInCorso = $state(false);
  let ultimoPdf = 0;
  $effect(() => {
    const p = pronto;
    pdf = undefined;
    if (!p || 'errore' in p) return;
    const token = ++ultimoPdf;
    pdfInCorso = true;
    import('../lib/foglio/pdf')
      .then(({ generaPdfFoglio }) => generaPdfFoglio(p.bytes))
      .then((bytes) => {
        if (token !== ultimoPdf) return;
        const nomeFile = p.nomeFile.replace(/\.xlsx$/i, '.pdf');
        pdf = { bytes, nomeFile, file: fileCondivisibile(bytes, nomeFile, [PDF_MIME]) };
      })
      .catch(() => {
        if (token === ultimoPdf) pdf = undefined;
      })
      .finally(() => {
        if (token === ultimoPdf) pdfInCorso = false;
      });
  });

  /** Il telefono ha rifiutato l'Excel: da qui in poi Condividi manda il PDF */
  let soloPdf = $state(false);

  /** Cosa condivide il pulsante: Excel dove il sistema lo accetta (iPhone/iPad), altrimenti PDF */
  const formatoCondivisione = $derived.by((): 'xlsx' | 'pdf' | 'attesa' | 'nessuno' => {
    if (!pronto || 'errore' in pronto) return 'nessuno';
    if (pronto.file && !soloPdf) return 'xlsx';
    if (pdf?.file) return 'pdf';
    if (pdfInCorso) return 'attesa';
    return 'nessuno';
  });

  async function condividi() {
    messaggio = errore = '';
    menuScarica = false;
    const p = pronto;
    if (!p || 'errore' in p) return (errore = p?.errore ?? 'Nessun turno da inserire.');
    const file = formatoCondivisione === 'xlsx' ? p.file : formatoCondivisione === 'pdf' ? pdf?.file : undefined;
    lavoro = true;
    const r = await condividiFile(file);
    lavoro = false;
    if (r.esito === 'condiviso') messaggio = formatoCondivisione === 'pdf' ? 'Foglio ore condiviso in PDF.' : 'Foglio ore condiviso.';
    else if (r.esito === 'non-supportato') {
      if (formatoCondivisione === 'xlsx' && pdf?.file) {
        // Riprovare subito non si può (serve un nuovo tocco): si prepara il PDF per il prossimo
        soloPdf = true;
        errore = 'Questo telefono non accetta il file Excel nel menu Condividi. Tocca di nuovo Condividi: invio il PDF.';
      } else {
        errore = `Non riesco ad aprire il menu Condividi: ${r.motivo}. Scaricalo con il pulsante qui accanto e condividilo dall'app File.`;
      }
    }
  }

  function scarica(formato: 'xlsx' | 'pdf') {
    messaggio = errore = '';
    menuScarica = false;
    const p = pronto;
    if (!p || 'errore' in p) return (errore = p?.errore ?? 'Nessun turno da inserire.');
    if (formato === 'pdf') {
      if (!pdf) return (errore = 'Sto ancora preparando il PDF, riprova tra un attimo.');
      scaricaFile(pdf.bytes, pdf.nomeFile, PDF_MIME);
      messaggio = `Scaricato: ${pdf.nomeFile}`;
    } else {
      scaricaFile(p.bytes, p.nomeFile);
      messaggio = `Scaricato: ${p.nomeFile}`;
    }
  }

  const giornoSett = (d: number) => GG[new Date(ym.year, ym.month - 1, d).getDay()];
  const isoGiorno = (d: number) => `${ymStr(ym)}-${String(d).padStart(2, '0')}`;
  const prima = $derived(spostaYm(ym, -1));
  const dopo = $derived(spostaYm(ym, 1));
</script>

<section class="page">
  <TitoloMese {ym} sopra="Foglio ore · {ym.year}" {vai} {mesiConTurni}>
    {#snippet azioni()}
      <button class="icon-btn" aria-label="Scarica" aria-expanded={menuScarica} disabled={!fileOk} onclick={() => (menuScarica = !menuScarica)}><Icona nome="scarica" /></button>
      <button class="icon-btn accent" aria-label={formatoCondivisione === 'pdf' ? 'Condividi foglio ore in PDF' : 'Condividi foglio ore'} disabled={lavoro || !fileOk || formatoCondivisione === 'attesa'} onclick={condividi}><Icona nome="condividi" /></button>
    {/snippet}
  </TitoloMese>

  {#if menuScarica}
    <div class="card menu" role="group" aria-label="Formato da scaricare">
      <button onclick={() => scarica('xlsx')}><Icona nome="tabella" /> Scarica Excel (.xlsx)</button>
      <button disabled={!pdf} onclick={() => scarica('pdf')}><Icona nome="foglio" /> {pdf ? 'Scarica PDF' : 'Preparo il PDF…'}</button>
    </div>
  {/if}

  <div class="vicini">
    <button class="link" onclick={() => vai(prima)}><Icona nome="sx" />{MESI[prima.month - 1]}</button>
    <button class="link" onclick={() => vai(dopo)}>{MESI[dopo.month - 1]}<Icona nome="dx" /></button>
  </div>

  <div class="card riepilogo">
    <div class="stats">
      <div class="stat"><span class="v d">{formatOre(totale)}<span class="u"> h</span></span><span class="u">totale</span></div>
      <div class="stat"><span class="v d">{turniMese.length}</span><span class="u">{turniMese.length === 1 ? 'turno' : 'turni'}</span></div>
      <div class="stat"><span class="v d">{nSost}</span><span class="u">{nSost === 1 ? 'sostituzione' : 'sostituzioni'}</span></div>
    </div>
    <button class="compenso" aria-pressed={compensoVisibile} onclick={() => (compensoVisibile = !compensoVisibile)}>
      <span class="compenso-txt">
        <span class="compenso-lbl">Compenso · solo tuo, non esportato</span>
        <span class="m">{compensoVisibile ? formatEuro(totale * dati.impostazioni.tariffa) : '••• €'}</span>
      </span>
      <Icona nome={compensoVisibile ? 'occhio-no' : 'occhio'} />
      <span class="sr">{compensoVisibile ? 'Nascondi il compenso' : 'Mostra il compenso'}</span>
    </button>
  </div>

  <div class="card tab">
    <div class="tr th"><span>Gg</span><span></span><span>Nota (col. R)</span><span class="r">Ore</span></div>
    {#each voci as v (v.day)}
      <a class="tr focus-inset" href={`#/mese/${ymStr(ym)}?g=${isoGiorno(v.day)}`}>
        <span class="m b">{v.day}</span>
        <span class="muted">{giornoSett(v.day)}</span>
        <span class="nota">{v.note ?? '—'}</span>
        <span class="m r">{formatOre(v.hours)}</span>
      </a>
    {:else}
      <p class="muted small vuoto">Nessun turno in {MESI[ym.month - 1].toLowerCase()}.</p>
    {/each}
  </div>

  {#if errore || erroreFile}<p class="msg err" role="alert">{errore || erroreFile}</p>{/if}
  {#if messaggio}<p class="msg ok" role="status">{messaggio}</p>{/if}

  <p class="muted small nomargin">
    {formatoCondivisione === 'pdf'
      ? 'Questo telefono non permette di condividere file Excel: Condividi invia il PDF. L’Excel lo scarichi con il pulsante accanto.'
      : 'Compilato sul modello della società: ore in colonna Q, note in colonna R, il tuo nome e il mese in testa.'}
  </p>
</section>

<style>
  .icon-btn.accent { background: var(--cloro); border-color: var(--cloro); color: var(--on-cloro); }
  .icon-btn:disabled { opacity: 0.4; cursor: default; }
  .menu { display: flex; flex-direction: column; padding: var(--space-6); margin-top: calc(var(--space-8) * -1); }
  .menu button { display: flex; align-items: center; gap: var(--space-10); min-height: 44px; padding: 0 var(--space-10); border: none; background: none; border-radius: var(--radius-sm); color: var(--ink); text-align: left; cursor: pointer; font-weight: 500; }
  .menu button:disabled { opacity: 0.5; }
  .vicini { display: flex; justify-content: space-between; margin: calc(var(--space-8) * -1) 0; }
  .vicini .link { font-size: var(--text-sm); gap: var(--space-2); }
  .vicini .link :global(.ic) { width: 18px; height: 18px; }
  .riepilogo { display: flex; flex-direction: column; gap: var(--space-14); padding: var(--space-16); }
  .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .stat { display: flex; flex-direction: column; gap: var(--space-2); padding: 0 var(--space-12); border-left: 1px solid var(--line-soft); min-width: 0; }
  .stat:first-child { border-left: none; padding-left: 0; }
  .v { font-size: var(--text-2xl); font-weight: 800; line-height: 1.15; white-space: nowrap; }
  .u { font-size: var(--text-sm); color: var(--muted); font-family: var(--font-body); font-weight: 400; letter-spacing: 0; }
  .compenso { display: flex; align-items: center; justify-content: space-between; gap: var(--space-10); min-height: 52px; padding: var(--space-6) var(--space-14); border: none; border-radius: var(--radius-md); background: var(--hero); color: var(--on-ink); cursor: pointer; text-align: left; }
  .compenso-txt { display: flex; flex-direction: column; gap: var(--space-2); }
  .compenso-lbl { font-size: var(--text-xs); color: var(--on-ink-faint); }
  .compenso .m { font-weight: 600; }
  .compenso :global(.ic) { color: var(--on-ink-muted); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .tab { overflow: hidden; }
  .tr { display: grid; grid-template-columns: 30px 36px 1fr 52px; align-items: center; gap: var(--space-6); min-height: 44px; padding: 0 var(--space-14); border-top: 1px solid var(--line-soft); font-size: var(--text-md); color: var(--ink); text-decoration: none; }
  .th { border-top: none; min-height: 32px; font-size: var(--text-2xs); font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .b { font-weight: 600; }
  .r { text-align: right; }
  .nota { font-size: var(--text-sm); color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vuoto { padding: var(--space-12) var(--space-14); margin: 0; }
</style>
