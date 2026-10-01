<script lang="ts">
  import { onMount } from 'svelte';
  import { dati } from '../lib/dati.svelte';
  import { nomeArea, hhmm, oreDi, isoDa, dataDa } from '../lib/model';
  import { formatOre, formatEuro } from '../lib/ore';
  import { MESI } from '../lib/foglio/genera';
  import RigaTurno from '../components/RigaTurno.svelte';
  import Icona from '../components/Icona.svelte';
  import BannerCalendario from '../components/BannerCalendario.svelte';

  let ora = $state(new Date());
  onMount(() => {
    const t = setInterval(() => (ora = new Date()), 30_000);
    return () => clearInterval(t);
  });

  const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const oggiIso = $derived(isoDa(ora));
  const minutiOra = $derived(ora.getHours() * 60 + ora.getMinutes());
  const attivi = $derived(dati.turni.filter((t) => !t.annullato));

  /** Turno di oggi non ancora finito, altrimenti il prossimo */
  const principale = $derived(
    attivi.find((t) => t.data === oggiIso && t.fine > minutiOra) ?? attivi.find((t) => t.data > oggiIso),
  );
  const stato = $derived.by(() => {
    const t = principale;
    if (!t || t.data !== oggiIso) return 'prossimo';
    return minutiOra >= t.inizio ? 'in-corso' : 'oggi';
  });
  const progresso = $derived(principale && stato === 'in-corso' ? (minutiOra - principale.inizio) / (principale.fine - principale.inizio) : 0);
  const prossimi = $derived(attivi.filter((t) => t.data >= oggiIso && t !== principale && !(t.data === oggiIso && t.fine <= minutiOra)).slice(0, 3));

  const year = $derived(ora.getFullYear());
  const month = $derived(ora.getMonth() + 1);
  const delMese = $derived(dati.turniDelMese(year, month).filter((t) => !t.annullato));
  const oreMese = $derived(Math.round(delMese.reduce((s, t) => s + oreDi(t), 0) * 100) / 100);
  const oreFatte = $derived(
    Math.round(delMese.filter((t) => t.data < oggiIso || (t.data === oggiIso && t.fine <= minutiOra)).reduce((s, t) => s + oreDi(t), 0) * 100) / 100,
  );
  const sost = $derived(delMese.filter((t) => t.sostituisce).length);

  function durata(min: number) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
  }
  function quando(iso: string) {
    const d = dataDa(iso);
    const domani = isoDa(new Date(ora.getFullYear(), ora.getMonth(), ora.getDate() + 1));
    if (iso === domani) return 'Domani';
    return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()].toLowerCase()}`;
  }
</script>

<section class="page">
  <header class="head">
    <div>
      <div class="muted data">{GIORNI[ora.getDay()]} {ora.getDate()} {MESI[ora.getMonth()].toLowerCase()}</div>
      <h1 class="page-title">Ciao, {dati.impostazioni.alias[0]}</h1>
    </div>
    <a class="icon-btn" href="#/impostazioni" aria-label="Impostazioni"><Icona nome="impostazioni" /></a>
  </header>

  <BannerCalendario />

  {#if principale}
    <a class="hero" href={`#/turno/${principale.id}`}>
      <div class="hero-top">
        {#if stato === 'in-corso'}
          <span class="tag live"><span class="dot"></span>In corso</span>
          <span class="m sub">fine tra {durata(principale.fine - minutiOra)}</span>
        {:else if stato === 'oggi'}
          <span class="tag live">Oggi</span>
          <span class="m sub">tra {durata(principale.inizio - minutiOra)}</span>
        {:else}
          <span class="tag live">Prossimo turno</span>
          <span class="sub">{quando(principale.data)}</span>
        {/if}
      </div>
      <div class="m orario">{hhmm(principale.inizio)}–{hhmm(principale.fine)}</div>
      <div class="dove">
        {principale.sostituisce ? `Sostituzione di ${principale.sostituisce} · ` : ''}{principale.nome?.trim() ? `${principale.nome.trim()} · ` : ''}{nomeArea(principale.area, dati.impostazioni)}{principale.postazione ? ` · Postazione ${principale.postazione}` : ''}{principale.presa ? ' · presa' : ''}
      </div>
      {#if stato === 'in-corso'}
        <div class="bar"><div style="width: {Math.round(progresso * 100)}%"></div></div>
      {/if}
      <div class="hero-foot m">{formatOre(oreDi(principale))} h</div>
    </a>
  {:else}
    <div class="card empty">
      <p>Nessun turno in arrivo.</p>
      <a class="btn btn-primary" href="#/importa"><Icona nome="importa" /> Importa il foglio turni</a>
    </div>
  {/if}

  <a class="btn cover" href={`#/turno/nuovo?tipo=sost&data=${oggiIso}`}><Icona nome="scambio" /> Ho coperto un turno</a>

  <a class="card mese" href="#/foglio">
    <div class="mese-top">
      <div>
        <div class="lbl">{MESI[month - 1]} {year}</div>
        <div class="big"><span class="d">{formatOre(oreFatte)}</span> <span class="muted">di {formatOre(oreMese)} h</span></div>
      </div>
      <div class="right">
        <div class="lbl">Compenso stimato</div>
        <div class="m euro">{formatEuro(oreMese * dati.impostazioni.tariffa)}</div>
      </div>
    </div>
    <div class="bar light"><div style="width: {oreMese ? Math.round((oreFatte / oreMese) * 100) : 0}%"></div></div>
    <div class="mese-foot">
      <span class="muted small">{delMese.length} turni{sost ? ` · ${sost} ${sost === 1 ? 'sostituzione' : 'sostituzioni'}` : ''}</span>
      <span class="link small">Foglio ore →</span>
    </div>
  </a>

  {#if prossimi.length}
    <div class="lista">
      <div class="lista-head"><h2 class="lbl">Poi</h2><a class="link small" href="#/mese">Tutto il mese</a></div>
      {#each prossimi as t (t.id)}
        <RigaTurno turno={t} />
      {/each}
    </div>
  {/if}
</section>

<style>
  .head { display: flex; justify-content: space-between; align-items: flex-start; }
  .data { font-size: var(--text-md); font-weight: 500; }
  .hero { display: flex; flex-direction: column; gap: 6px; padding: 20px; border-radius: 22px; background: var(--hero); color: var(--on-ink); text-decoration: none; }
  .hero-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .tag.live { background: var(--on-ink-veil); color: var(--on-ink); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--mint); }
  .sub { font-size: var(--text-sm); color: var(--on-ink-muted); }
  .orario { font-size: var(--text-5xl); font-weight: 600; letter-spacing: -0.02em; margin-top: 6px; }
  .dove { font-size: var(--text-base); color: var(--on-ink-soft); }
  .hero-foot { font-size: var(--text-sm); color: var(--on-ink-muted); margin-top: 4px; }
  .bar { height: 6px; border-radius: 3px; background: var(--on-ink-track); overflow: hidden; margin-top: 10px; }
  .bar div { height: 100%; background: var(--mint); border-radius: 3px; }
  .bar.light { background: var(--line-soft); margin-top: 0; }
  .bar.light div { background: var(--cloro); }
  .empty { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  .empty p { margin: 0; color: var(--muted); }
  .cover { border: 1.5px solid var(--cloro); background: var(--surface); color: var(--cloro); text-decoration: none; margin-top: -4px; }
  .mese { padding: 16px; display: flex; flex-direction: column; gap: 12px; color: var(--ink); text-decoration: none; }
  .mese-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 8px; }
  .big { display: flex; align-items: baseline; gap: 6px; margin-top: 4px; }
  .big .d { font-size: var(--text-4xl); font-weight: 800; }
  .right { text-align: right; }
  .euro { font-size: var(--text-2xl); font-weight: 600; margin-top: 6px; }
  .mese-foot { display: flex; justify-content: space-between; align-items: center; }
  .mese-foot .link { min-height: 0; }
  .lista { display: flex; flex-direction: column; gap: 8px; }
  .lista-head { display: flex; justify-content: space-between; align-items: center; }
  .lista-head h2 { margin: 0; }
</style>
