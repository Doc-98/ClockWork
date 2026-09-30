<script lang="ts">
  import { onMount } from 'svelte';
  import { registerSW } from 'virtual:pwa-register';
  import FoglioOre from './routes/FoglioOre.svelte';
  import Impostazioni from './routes/Impostazioni.svelte';
  import { leggiModello, chiediArchivioPersistente, type ModelloSalvato } from './lib/store';

  let modello = $state<ModelloSalvato | undefined>();
  let pronto = $state(false);
  let vista = $state<'foglio' | 'impostazioni'>('foglio');
  let aggiornamento = $state<(() => Promise<void>) | undefined>();

  onMount(async () => {
    modello = await leggiModello();
    pronto = true;
    chiediArchivioPersistente();
    const update = registerSW({
      onNeedRefresh() {
        aggiornamento = () => update(true);
      },
    });
  });
</script>

{#if aggiornamento}
  <div class="banner" role="status">
    <span>È disponibile una nuova versione.</span>
    <button class="btn btn-accent small" onclick={() => aggiornamento?.()}>Aggiorna</button>
  </div>
{/if}

<main>
  {#if !pronto}
    <p class="lbl center">Caricamento…</p>
  {:else if vista === 'impostazioni' || !modello}
    <Impostazioni
      {modello}
      primoAvvio={!modello}
      onsalvato={(m) => { modello = m; vista = 'foglio'; }}
      onchiudi={() => (vista = 'foglio')}
    />
  {:else}
    <FoglioOre {modello} onimpostazioni={() => (vista = 'impostazioni')} />
  {/if}
</main>

<style>
  main {
    max-width: 480px;
    margin: 0 auto;
    padding: calc(env(safe-area-inset-top, 0px) + 20px) 20px calc(var(--safe-bottom) + 32px);
  }
  .center { text-align: center; margin-top: 40vh; }
  .banner {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: calc(env(safe-area-inset-top, 0px) + 10px) 20px 10px;
    background: var(--cloro-soft); color: #1d3a40; font-size: 14px;
  }
  .small { height: 36px; padding: 0 14px; font-size: 14px; }
</style>
