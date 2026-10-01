<script lang="ts">
  import { onMount } from 'svelte';
  import { registerSW } from 'virtual:pwa-register';
  import { dati } from './lib/dati.svelte';
  import { gcal } from './lib/gcal/stato.svelte';
  import { router } from './lib/router.svelte';
  import { chiediArchivioPersistente } from './lib/store';
  import { swipe, animaIngresso } from './lib/swipe';
  import Nav from './components/Nav.svelte';
  import Benvenuto from './routes/Benvenuto.svelte';
  import Oggi from './routes/Oggi.svelte';
  import Mese from './routes/Mese.svelte';
  import Importa from './routes/Importa.svelte';
  import TurnoView from './routes/Turno.svelte';
  import FoglioOre from './routes/FoglioOre.svelte';
  import Impostazioni from './routes/Impostazioni.svelte';
  import Personalizza from './routes/Personalizza.svelte';

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

  // Schede principali, nell'ordine della barra in basso
  const SCHEDE = [
    { nome: 'oggi', href: '#/' },
    { nome: 'mese', href: '#/mese' },
    { nome: 'importa', href: '#/importa' },
    { nome: 'foglio', href: '#/foglio' },
  ] as const;
  const indiceScheda = (nome: string) => SCHEDE.findIndex((s) => s.nome === nome);

  let mainEl = $state<HTMLElement>();
  let schedaPrecedente = router.rotta.nome as string;
  $effect(() => {
    const nome = router.rotta.nome;
    const a = indiceScheda(schedaPrecedente);
    const b = indiceScheda(nome);
    if (mainEl && a >= 0 && b >= 0 && a !== b) animaIngresso(mainEl, b > a ? 1 : -1);
    schedaPrecedente = nome;
  });

  function vaiScheda(direzione: -1 | 1): boolean {
    const i = indiceScheda(router.rotta.nome);
    const dest = SCHEDE[i + direzione];
    if (i < 0 || !dest) return false;
    router.vai(dest.href, true);
    return true;
  }

  const configurato = $derived(!!dati.modello && dati.impostazioni.alias.length > 0);
  // Le schermate con «Salva» non hanno la barra: si esce solo salvando o annullando
  const conNav = $derived(configurato && router.rotta.nome !== 'turno' && router.rotta.nome !== 'personalizza');
</script>

{#if aggiornamento}
  <div class="banner" role="status">
    <span>È disponibile una nuova versione.</span>
    <button class="btn btn-accent small-btn tap44" onclick={() => aggiornamento?.()}>Aggiorna</button>
  </div>
{/if}

{#if dati.erroreSalvataggio}
  <p class="msg err top-msg" role="alert">{dati.erroreSalvataggio}</p>
{/if}

<main class:con-nav={conNav} bind:this={mainEl} use:swipe={{ vai: vaiScheda, attivo: () => conNav && indiceScheda(router.rotta.nome) >= 0 }}>
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
  {:else if router.rotta.nome === 'personalizza'}
    <Personalizza />
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
    background: var(--cloro-soft); color: var(--cloro-ink); font-size: var(--text-md);
  }
  .small-btn { height: 36px; padding: 0 14px; font-size: var(--text-md); }
  .top-msg { max-width: 440px; margin: 12px auto 0; }
</style>
