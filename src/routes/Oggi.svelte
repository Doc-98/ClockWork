<script lang="ts">
  import { onMount } from 'svelte';
  import { dati } from '../lib/dati.svelte';
  import { nomeArea, hhmm, oreDi, isoDa, dataDa } from '../lib/model';
  import { formatOre, formatEuro } from '../lib/ore';
  import { MESI } from '../lib/foglio/genera';
  import RigaTurno from '../components/RigaTurno.svelte';
  import Icona from '../components/Icona.svelte';
  import BannerCalendario from '../components/BannerCalendario.svelte';
  import BannerTurni from '../components/BannerTurni.svelte';

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
  <header class="hdr">
    <div class="hdr-txt">
      <span class="hdr-sopra">{GIORNI[ora.getDay()]} {ora.getDate()} {MESI[ora.getMonth()].toLowerCase()}</span>
      <h1>Ciao, {dati.impostazioni.alias[0]}</h1>
    </div>
    <div class="hdr-azioni">
      <a class="icon-btn" href="#/impostazioni" aria-label="Impostazioni"><Icona nome="impostazioni" /></a>
    </div>
  </header>

  <BannerTurni />
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
        <div class="avanzamento scuro"><div style="width: {Math.round(progresso * 100)}%"></div></div>
      {/if}
      <div class="hero-foot m">{formatOre(oreDi(principale))} h</div>
    </a>
  {:else}
    <div class="card vuoto">
      <p>Nessun turno in arrivo.</p>
      <a class="link" href="#/foglio-turni">Collega o aggiorna il foglio turni</a>
    </div>
  {/if}

  <div class="azioni">
    <a class="btn coperto" href={`#/turno/nuovo?tipo=sost&data=${oggiIso}`}><Icona nome="scambio" /> Ho coperto</a>
    <a class="btn btn-secondary" href={`#/turno/nuovo?data=${oggiIso}`}><Icona nome="piu" /> Turno extra</a>
  </div>

  <section class="card mese" aria-label="{MESI[month - 1]}">
    <span class="lbl">{MESI[month - 1]}</span>
    <div class="stats">
      <div class="stat"><span class="v d">{formatOre(oreFatte)}<span class="u"> / {formatOre(oreMese)} h</span></span><span class="u">ore fatte</span></div>
      <div class="stat"><span class="v d">{delMese.length}</span><span class="u">{delMese.length === 1 ? 'turno' : 'turni'}{sost ? ` · ${sost} sost.` : ''}</span></div>
      <div class="stat"><span class="v m">{formatEuro(oreMese * dati.impostazioni.tariffa).replace(',00', '')}</span><span class="u">stima</span></div>
    </div>
    <div class="avanzamento"><div style="width: {oreMese ? Math.round((oreFatte / oreMese) * 100) : 0}%"></div></div>
  </section>

  {#if prossimi.length}
    <div class="lista">
      <h2 class="lbl">Prossimi turni</h2>
      {#each prossimi as t (t.id)}
        <RigaTurno turno={t} />
      {/each}
    </div>
  {/if}
</section>

<style>
  .hero { display: flex; flex-direction: column; gap: var(--space-6); padding: var(--space-20); border-radius: var(--radius-xl); background: var(--hero); color: var(--on-ink); text-decoration: none; }
  .hero-top { display: flex; justify-content: space-between; align-items: center; gap: var(--space-8); }
  .tag.live { background: var(--on-ink-veil); color: var(--on-ink); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--mint); }
  .sub { font-size: var(--text-sm); color: var(--on-ink-muted); }
  .orario { font-size: var(--text-5xl); font-weight: 600; letter-spacing: -0.02em; margin-top: var(--space-6); }
  .dove { font-size: var(--text-base); color: var(--on-ink-soft); }
  .hero-foot { font-size: var(--text-sm); color: var(--on-ink-muted); margin-top: var(--space-4); }
  .avanzamento { height: 6px; border-radius: 3px; background: var(--line-soft); overflow: hidden; }
  .avanzamento div { height: 100%; border-radius: 3px; background: var(--cloro); }
  .avanzamento.scuro { background: var(--on-ink-track); margin-top: var(--space-10); }
  .avanzamento.scuro div { background: var(--mint); }
  .vuoto { padding: var(--space-16) var(--space-20); display: flex; flex-direction: column; gap: var(--space-4); }
  .vuoto p { margin: 0; color: var(--muted); }
  .vuoto .link { align-self: flex-start; }
  .azioni { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-8); }
  .azioni .btn { padding: 0 var(--space-12); text-decoration: none; }
  .coperto { border: 1.5px solid var(--cloro); background: var(--surface); color: var(--cloro); }
  .mese { padding: var(--space-16); display: flex; flex-direction: column; gap: var(--space-14); }
  .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .stat { display: flex; flex-direction: column; gap: var(--space-2); padding: 0 var(--space-12); border-left: 1px solid var(--line-soft); min-width: 0; }
  .stat:first-child { border-left: none; padding-left: 0; }
  .v { font-size: var(--text-2xl); font-weight: 800; line-height: 1.15; white-space: nowrap; }
  .v.m { font-weight: 600; }
  .u { font-size: var(--text-sm); color: var(--muted); font-family: var(--font-body); font-weight: 400; letter-spacing: 0; }
  .lista { display: flex; flex-direction: column; gap: var(--space-8); }
  .lista h2 { margin: 0 0 calc(var(--space-2) * -1); }
</style>
