<script lang="ts">
  import { onMount } from 'svelte';
  import { registerSW } from 'virtual:pwa-register';
  import { dati } from './lib/dati.svelte';
  import { gcal } from './lib/gcal/stato.svelte';
  import { router } from './lib/router.svelte';
  import { chiediArchivioPersistente } from './lib/store';
  import Nav from './components/Nav.svelte';
  import Benvenuto from './routes/Benvenuto.svelte';
  import Oggi from './routes/Oggi.svelte';
  import Mese from './routes/Mese.svelte';
  import Importa from './routes/Importa.svelte';
  import TurnoView from './routes/Turno.svelte';
  import FoglioOre from './routes/FoglioOre.svelte';
  import Impostazioni from './routes/Impostazioni.svelte';

  let aggiornamento = $state<(() => Promise<void>) | undefined>();

  onMount(async () => {
    await Promise.all([dati.carica(), gcal.carica()]);
    dati.suCambioTurni(() => gcal.segnaModifica());
    chiediArchivioPersistente();
    const update = registerSW({
      onNeedRefresh() {
        aggiornamento = () => update(true);
      },
    });
  });

  const configurato = $derived(!!dati.modello && dati.impostazioni.alias.length > 0);
  const conNav = $derived(configurato && router.rotta.nome !== 'turno');
</script>

{#if aggiornamento}
  <div class="banner" role="status">
    <span>È disponibile una nuova versione.</span>
    <button class="btn btn-accent small-btn" onclick={() => aggiornamento?.()}>Aggiorna</button>
  </div>
{/if}

{#if dati.erroreSalvataggio}
  <p class="msg err top-msg" role="alert">{dati.erroreSalvataggio}</p>
{/if}

<main class:con-nav={conNav}>
  {#if !dati.pronto}
    <p class="lbl center">Caricamento…</p>
  {:else if !configurato}
    <Benvenuto />
  {:else if router.rotta.nome === 'oggi'}
    <Oggi />
  {:else if router.rotta.nome === 'mese'}
    <Mese rotta={router.rotta} />
  {:else if router.rotta.nome === 'importa'}
    <Importa />
  {:else if router.rotta.nome === 'turno'}
    {#key router.rotta}
      <TurnoView rotta={router.rotta} />
    {/key}
  {:else if router.rotta.nome === 'foglio'}
    <FoglioOre rotta={router.rotta} />
  {:else if router.rotta.nome === 'impostazioni'}
    <Impostazioni />
  {/if}
</main>

{#if conNav}
  <Nav />
{/if}

<style>
  main {
    max-width: 480px;
    margin: 0 auto;
    padding: calc(env(safe-area-inset-top, 0px) + 20px) 20px calc(var(--safe-bottom) + 32px);
  }
  main.con-nav { padding-bottom: calc(var(--safe-bottom) + 96px); }
  .center { text-align: center; margin-top: 40vh; }
  .banner {
    position: sticky; top: 0; z-index: 30;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: calc(env(safe-area-inset-top, 0px) + 10px) 20px 10px;
    background: var(--cloro-soft); color: #1d3a40; font-size: 14px;
  }
  .small-btn { height: 36px; padding: 0 14px; font-size: 14px; }
  .top-msg { max-width: 440px; margin: 12px auto 0; }
</style>
