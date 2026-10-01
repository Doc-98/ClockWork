<script lang="ts">
  import { dati } from '../lib/dati.svelte';
  import { router, type Rotta } from '../lib/router.svelte';
  import { generaFoglioOre, MESI } from '../lib/foglio/genera';
  import { vociDaTurni } from '../lib/foglio/daTurni';
  import { condividiFile, scaricaFile, fileCondivisibile, PDF_MIME } from '../lib/foglio/condividi';
  import { formatOre, formatEuro } from '../lib/ore';
  import Icona from '../components/Icona.svelte';

  let { rotta }: { rotta: Extract<Rotta, { nome: 'foglio' }> } = $props();

  const oggi = new Date();
  const ym = $derived.by(() => {
    const m = /^(\d{4})-(\d{2})$/.exec(rotta.ym ?? '');
    return m ? { year: Number(m[1]), month: Number(m[2]) } : { year: oggi.getFullYear(), month: oggi.getMonth() + 1 };
  });
  const GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

  const voci = $derived(vociDaTurni(dati.turni, ym.year, ym.month));
  const totale = $derived(Math.round(voci.reduce((s, v) => s + v.hours, 0) * 100) / 100);
  const turniMese = $derived(dati.turniDelMese(ym.year, ym.month).filter((t) => !t.annullato));
  const nSost = $derived(turniMese.filter((t) => t.sostituisce).length);

  let messaggio = $state('');
  let errore = $state('');
  let lavoro = $state(false);

  function cambiaMese(delta: number) {
    const d = new Date(ym.year, ym.month - 1 + delta, 1);
    messaggio = errore = '';
    router.vai(`#/foglio/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, true);
  }

  // Il file viene preparato in anticipo: al tocco su «Condividi» il menu deve aprirsi subito,
  // altrimenti il telefono considera la richiesta non partita dal tocco e la blocca.
  const pronto = $derived.by(() => {
    if (!dati.modello || !voci.length) return undefined;
    try {
      const out = generaFoglioOre(dati.modello.bytes, { year: ym.year, month: ym.month, voci });
      return { ...out, file: fileCondivisibile(out.bytes, out.nomeFile) };
    } catch (e) {
      return { errore: e instanceof Error ? e.message : 'Errore durante la creazione del file.' };
    }
  });

  // Letto dal template: così il file si prepara subito e non al momento del tocco
  const fileOk = $derived(!!pronto && !('errore' in pronto));
  const erroreFile = $derived(pronto && 'errore' in pronto ? pronto.errore : '');

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

  /** Cosa condivide il pulsante: Excel dove il sistema lo accetta (iPhone/iPad), altrimenti PDF */
  const formatoCondivisione = $derived.by((): 'xlsx' | 'pdf' | 'attesa' | 'nessuno' => {
    if (!pronto || 'errore' in pronto) return 'nessuno';
    if (pronto.file) return 'xlsx';
    if (pdf?.file) return 'pdf';
    if (pdfInCorso) return 'attesa';
    return 'nessuno';
  });

  let sceltaScarica = $state(false);

  async function condividi() {
    messaggio = errore = '';
    if (!dati.modello) return (errore = 'Carica prima il modello del foglio ore nelle impostazioni.');
    const p = pronto;
    if (!p || 'errore' in p) return (errore = p?.errore ?? 'Nessun turno da inserire.');
    const file = formatoCondivisione === 'xlsx' ? p.file : formatoCondivisione === 'pdf' ? pdf?.file : undefined;
    lavoro = true;
    const r = await condividiFile(file);
    lavoro = false;
    if (r.esito === 'condiviso') messaggio = formatoCondivisione === 'pdf' ? 'Foglio ore condiviso in PDF.' : 'Foglio ore condiviso.';
    else if (r.esito === 'non-supportato') {
      errore = `Non riesco ad aprire il menu Condividi (${r.motivo}). Usa «Scarica»: poi lo condividi dall'app File o dall'anteprima.`;
    }
  }

  function scarica(formato: 'xlsx' | 'pdf') {
    messaggio = errore = '';
    sceltaScarica = false;
    if (!dati.modello) return (errore = 'Carica prima il modello del foglio ore nelle impostazioni.');
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
  const isoGiorno = (d: number) => `${ym.year}-${String(ym.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const giornoPerNuovo = $derived(oggi.getFullYear() === ym.year && oggi.getMonth() + 1 === ym.month ? oggi.getDate() : 1);
</script>

<section class="page">
  <header>
    <div class="lbl">Foglio ore</div>
    <div class="mese">
      <button class="icon-btn plain" aria-label="Mese precedente" onclick={() => cambiaMese(-1)}><Icona nome="sx" /></button>
      <h1 class="d">{MESI[ym.month - 1]} {ym.year}</h1>
      <button class="icon-btn plain" aria-label="Mese successivo" onclick={() => cambiaMese(1)}><Icona nome="dx" /></button>
    </div>
  </header>

  <div class="kpis">
    <div class="card kpi">
      <div class="lbl">Totale</div>
      <div class="big"><span class="d">{formatOre(totale)}</span> <span class="muted">h</span></div>
      <div class="muted small">{turniMese.length} turni · {nSost} sost.</div>
    </div>
    <div class="kpi dark">
      <div class="lbl light">Compenso · solo tuo</div>
      <div class="m euro">{formatEuro(totale * dati.impostazioni.tariffa)}</div>
      <div class="light small">{formatOre(dati.impostazioni.tariffa)} €/h · non esportato</div>
    </div>
  </div>

  <div class="card tab">
    <div class="tr th"><span>Gg</span><span></span><span>Nota (col. R)</span><span class="r">Ore</span></div>
    {#each voci as v (v.day)}
      <a class="tr focus-inset" href={`#/mese/${isoGiorno(v.day).slice(0, 7)}?g=${isoGiorno(v.day)}`}>
        <span class="m b">{v.day}</span>
        <span class="muted">{giornoSett(v.day)}</span>
        <span class="nota">{v.note ?? '—'}</span>
        <span class="m r">{formatOre(v.hours)}</span>
      </a>
    {:else}
      <p class="muted small vuoto">Nessun turno in {MESI[ym.month - 1].toLowerCase()}. <a href="#/importa">Importa il foglio turni</a> o aggiungi i turni dal calendario.</p>
    {/each}
    <a class="tr add focus-inset" href={`#/turno/nuovo?tipo=sost&data=${isoGiorno(giornoPerNuovo)}`}><Icona nome="piu" /> Aggiungi sostituzione</a>
  </div>

  {#if errore || erroreFile}<p class="msg err" role="alert">{errore || erroreFile}</p>{/if}
  {#if messaggio}<p class="msg ok" role="status">{messaggio}</p>{/if}

  <div class="azioni">
    <div class="row">
      <button class="btn btn-accent grow" disabled={lavoro || !fileOk || formatoCondivisione === 'attesa'} onclick={condividi}>
        <Icona nome="condividi" /> Condividi foglio ore
        {#if formatoCondivisione === 'pdf'}<span class="fmt">PDF</span>{/if}
      </button>
      <button class="btn btn-secondary" disabled={lavoro || !fileOk} aria-expanded={sceltaScarica} onclick={() => (sceltaScarica = !sceltaScarica)}>Scarica</button>
    </div>
    {#if sceltaScarica}
      <div class="scelta" role="group" aria-label="Formato da scaricare">
        <button class="btn btn-secondary" onclick={() => scarica('xlsx')}><Icona nome="tabella" /> Excel (.xlsx)</button>
        <button class="btn btn-secondary" disabled={!pdf} onclick={() => scarica('pdf')}><Icona nome="foglio" /> {pdf ? 'PDF' : 'PDF…'}</button>
      </div>
    {/if}
    <p class="muted small nomargin">
      {formatoCondivisione === 'pdf'
        ? 'Questo telefono non permette di condividere file Excel: Condividi invia il PDF. L’Excel lo trovi in «Scarica».'
        : 'Dal tuo modello: ore in colonna Q, note in colonna R, colonne O–P e cella Q45 lasciate vuote.'}
    </p>
  </div>
</section>

<style>
  .mese { display: flex; align-items: center; margin-left: -12px; }
  h1 { margin: 0; font-size: var(--text-3xl); font-weight: 800; }
  .kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .kpi { padding: 12px 14px; border-radius: var(--radius); }
  .kpi.dark { background: var(--ink); color: var(--on-ink); }
  .big { display: flex; align-items: baseline; gap: 4px; margin-top: 2px; }
  .big .d { font-size: var(--text-4xl); font-weight: 800; }
  .euro { font-size: var(--text-2xl); font-weight: 600; margin-top: 6px; }
  .light { color: var(--on-ink-faint); }
  .tab { overflow: hidden; }
  .tr { display: grid; grid-template-columns: 30px 36px 1fr 52px; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; border-top: 1px solid var(--line-soft); font-size: var(--text-md); color: var(--ink); text-decoration: none; }
  .th { border-top: none; min-height: 32px; font-size: var(--text-2xs); font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .b { font-weight: 600; }
  .r { text-align: right; }
  .nota { font-size: var(--text-sm); color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .add { display: flex; justify-content: center; gap: 6px; color: var(--cloro); font-weight: 600; min-height: 44px; }
  .vuoto { padding: 12px 14px; margin: 0; }
  .azioni { display: flex; flex-direction: column; gap: 8px; }
  .fmt { font-size: var(--text-2xs); font-weight: 700; letter-spacing: .04em; background: var(--on-ink-badge); border-radius: 6px; padding: 2px 6px; }
  .scelta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }

</style>
