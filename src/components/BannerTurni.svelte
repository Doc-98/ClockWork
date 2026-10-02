<script lang="ts">
  import { fonte } from '../lib/turni/fonte.svelte';
  import Icona from './Icona.svelte';
  const avviso = $derived(fonte.stato?.avviso);
</script>

{#if avviso}
  <div class="banner" class:warn={avviso.tipo !== 'ok'} role="status">
    <Icona nome="tabella" />
    <span>{avviso.testo}</span>
    {#if avviso.tipo === 'rivedi' && avviso.mese}
      <a class="btn btn-accent tap44" href={`#/rivedi?mese=${encodeURIComponent(avviso.mese)}`}>Rivedi</a>
    {:else if avviso.tipo === 'errore'}
      <a class="btn btn-secondary tap44" href="#/foglio-turni">Apri</a>
    {/if}
    <button class="icon-btn plain chiudi" aria-label="Chiudi avviso" onclick={() => fonte.chiudiAvviso()}><Icona nome="chiudi" /></button>
  </div>
{/if}

<style>
  .banner { display: flex; align-items: center; gap: 10px; padding: 4px 4px 4px 12px; border-radius: 14px; background: var(--cloro-soft); color: var(--cloro-ink); font-size: var(--text-sm); line-height: 1.3; min-height: 52px; }
  .banner.warn { background: var(--warn-bg); color: var(--warn); }
  .banner span { flex-grow: 1; padding: 6px 0; }
  .btn { height: 36px; padding: 0 14px; font-size: var(--text-sm); text-decoration: none; flex-shrink: 0; }
  .chiudi { color: inherit; flex-shrink: 0; }
  .chiudi :global(.ic) { width: 18px; height: 18px; }
</style>
