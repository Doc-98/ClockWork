<script lang="ts">
  import { gcal } from '../lib/gcal/stato.svelte';
  import Icona from './Icona.svelte';
  // Visibile quando ci sono modifiche non ancora sul calendario e serve un tocco per rientrare in Google
  const visibile = $derived(gcal.collegato && (gcal.stato.daSincronizzare || !!gcal.errore) && !gcal.lavoro);
</script>

{#if visibile}
  <div class="banner" role="status">
    <Icona nome="mese" />
    <span>{gcal.errore || 'Google Calendar da aggiornare.'}</span>
    <button class="btn btn-accent" onclick={() => gcal.sincronizzaDaTocco()}>Sincronizza</button>
  </div>
{:else if gcal.lavoro}
  <div class="banner" role="status"><Icona nome="mese" /><span>Aggiorno Google Calendar…</span></div>
{/if}

<style>
  .banner { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 12px; border-radius: 14px; background: var(--cloro-soft); color: #1d3a40; font-size: 13px; line-height: 1.3; min-height: 52px; }
  .banner span { flex-grow: 1; }
  .btn { height: 36px; padding: 0 14px; font-size: 13px; }
</style>
