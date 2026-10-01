<script lang="ts">
  import { COLORI_GOOGLE } from '../lib/gcal/eventi';
  import Icona from './Icona.svelte';

  let { valore = $bindable(), vuoto, etichetta }: { valore: string | undefined; vuoto: string; etichetta: string } = $props();
  const scelto = $derived(COLORI_GOOGLE.find((c) => c.id === valore));
</script>

<div class="scelta" role="radiogroup" aria-label={etichetta}>
  <button class="nessuno" role="radio" aria-checked={!valore} aria-label={vuoto} title={vuoto} onclick={() => (valore = undefined)}>
    {#if !valore}<Icona nome="check" />{/if}
  </button>
  {#each COLORI_GOOGLE as c (c.id)}
    <button class="colore" class:chiaro={c.id === '5'} role="radio" aria-checked={valore === c.id} aria-label={c.nome} title={c.nome} style="--c: {c.hex}" onclick={() => (valore = c.id)}>
      {#if valore === c.id}<Icona nome="check" />{/if}
    </button>
  {/each}
</div>
<p class="muted small nome">{scelto ? scelto.nome : vuoto}</p>

<style>
  .scelta { display: flex; flex-wrap: wrap; gap: 8px; }
  button { position: relative; width: 36px; height: 36px; border-radius: 50%; border: none; padding: 0; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
  /* area di tocco da 44px, come i chip */
  button::after { content: ''; position: absolute; inset: -4px; }
  .colore { background: var(--c); color: #fff; }
  .colore.chiaro { color: #10212b; }
  .colore[aria-checked='true'] { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--ink); }
  /* «nessun colore»: cerchio tratteggiato, il colore lo decide il calendario */
  .nessuno { background: transparent; border: 1.5px dashed var(--line-strong); color: var(--ink); }
  .nessuno[aria-checked='true'] { border-style: solid; border-color: var(--ink); }
  button :global(.ic) { width: 18px; height: 18px; stroke-width: 2.6; }
  .nome { margin: -6px 0 0; }
</style>
