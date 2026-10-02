<script lang="ts">
  import type { Snippet } from 'svelte';
  import { MESI } from '../lib/foglio/genera';
  import { ymOggi, type Ym } from '../lib/vista.svelte';
  import Icona from './Icona.svelte';

  /**
   * Intestazione delle schede Mese e Foglio ore: il nome del mese si tocca per scegliere
   * mese e anno da una griglia, «Oggi» riporta al mese corrente. Il nome resta su una riga:
   * se non ci sta con «Oggi» e le azioni, rimpicciolisce invece di andare a capo.
   */
  let { ym, sopra, vai, azioni, mesiConTurni }: {
    ym: Ym;
    sopra: string;
    vai: (ym: Ym) => void;
    azioni: Snippet;
    /** Mesi da evidenziare nella griglia come «con turni», chiave YYYY-MM */
    mesiConTurni?: Set<string>;
  } = $props();

  const BREVI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const oggi = ymOggi();
  const fuori = $derived(ym.year !== oggi.year || ym.month !== oggi.month);

  let aperta = $state(false);
  let annoGriglia = $state(0);
  function apri() {
    annoGriglia = ym.year;
    aperta = !aperta;
  }
  function scegli(month: number) {
    aperta = false;
    vai({ year: annoGriglia, month });
  }

  // Adatta il nome del mese allo spazio: dal 28px in giù, fino a 18px
  let riga = $state<HTMLElement>();
  let nome = $state<HTMLElement>();
  let taglia = $state(28);
  function adatta() {
    if (!riga || !nome) return;
    let t = 28;
    nome.style.fontSize = `${t}px`;
    while (riga.scrollWidth > riga.clientWidth + 0.5 && t > 18) {
      t -= 1;
      nome.style.fontSize = `${t}px`;
    }
    taglia = t;
  }
  $effect(() => {
    void ym.month; void ym.year; void fuori;
    adatta();
  });
  $effect(() => {
    if (!riga) return;
    const ro = new ResizeObserver(() => adatta());
    ro.observe(riga);
    return () => ro.disconnect();
  });
</script>

<header class="hdr">
  <div class="hdr-txt">
    <span class="hdr-sopra">{sopra}</span>
    <div class="titolo" bind:this={riga}>
      <h1>
        <button class="nome" bind:this={nome} style="font-size: {taglia}px" aria-expanded={aperta} aria-label="{MESI[ym.month - 1]} {ym.year}: scegli il mese" onclick={apri}>
          {MESI[ym.month - 1]}<Icona nome="giu" class="giu" />
        </button>
      </h1>
      {#if fuori}
        <button class="oggi" onclick={() => { aperta = false; vai(oggi); }}><Icona nome="oggi" />Oggi</button>
      {/if}
    </div>
  </div>
  <div class="hdr-azioni">{@render azioni()}</div>
</header>

{#if aperta}
  <div class="card griglia">
    <div class="anno">
      <button class="icon-btn plain" aria-label="Anno precedente" onclick={() => annoGriglia--}><Icona nome="sx" /></button>
      <strong class="d">{annoGriglia}</strong>
      <button class="icon-btn plain" aria-label="Anno successivo" onclick={() => annoGriglia++}><Icona nome="dx" /></button>
    </div>
    <div class="mesi">
      {#each BREVI as b, i (b)}
        {@const k = `${annoGriglia}-${String(i + 1).padStart(2, '0')}`}
        <button
          class:corrente={annoGriglia === oggi.year && i + 1 === oggi.month}
          class:vuoto={mesiConTurni && !mesiConTurni.has(k)}
          aria-pressed={annoGriglia === ym.year && i + 1 === ym.month}
          aria-label="{MESI[i]} {annoGriglia}"
          onclick={() => scegli(i + 1)}>{b}</button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .titolo { display: flex; align-items: center; gap: var(--space-10); flex-wrap: nowrap; min-width: 0; overflow: hidden; }
  h1 { margin: 0; min-width: 0; }
  .nome { display: inline-flex; align-items: center; gap: var(--space-4); min-height: 44px; padding: 0; border: none; background: none; color: var(--ink); cursor: pointer; white-space: nowrap;
    font-family: var(--font-display); font-weight: 800; line-height: 1.1; letter-spacing: -0.01em; }
  .nome :global(.giu) { width: 20px; height: 20px; color: var(--muted); transition: transform 0.15s; }
  .nome[aria-expanded='true'] :global(.giu) { transform: rotate(180deg); }
  .oggi { position: relative; flex-shrink: 0; height: 32px; padding: 0 var(--space-12); border: none; border-radius: var(--radius-pill); background: var(--cloro-soft); color: var(--cloro-ink); font-size: var(--text-sm); font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: var(--space-4); }
  .oggi::after { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 44px; transform: translateY(-50%); }
  .oggi :global(.ic) { width: 16px; height: 16px; }
  .griglia { display: flex; flex-direction: column; gap: var(--space-12); padding: var(--space-12); }
  .anno { display: flex; align-items: center; justify-content: space-between; }
  .anno strong { font-size: var(--text-xl); }
  .mesi { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-6); }
  .mesi button { min-height: 44px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); color: var(--ink); font-weight: 600; font-size: var(--text-sm); cursor: pointer; }
  .mesi button.vuoto { color: var(--muted); }
  .mesi button.corrente { border-color: var(--cloro); color: var(--cloro); }
  .mesi button[aria-pressed='true'] { background: var(--fill); border-color: var(--fill); color: var(--on-fill); }
</style>
