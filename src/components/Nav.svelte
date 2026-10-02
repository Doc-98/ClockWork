<script lang="ts">
  import Icona from './Icona.svelte';
  import { router } from '../lib/router.svelte';
  import { vista } from '../lib/vista.svelte';

  const voci = $derived([
    { id: 'oggi', href: '#/', label: 'Oggi' },
    { id: 'mese', href: vista.href('mese'), label: 'Mese' },
    { id: 'foglio', href: vista.href('foglio'), label: 'Foglio ore' },
  ]);
  const attiva = $derived(router.rotta.nome);
</script>

<nav aria-label="Sezioni">
  {#each voci as v (v.id)}
    <a href={v.href} class:on={attiva === v.id} aria-current={attiva === v.id ? 'page' : undefined}>
      <Icona nome={v.id} />
      <span>{v.label}</span>
    </a>
  {/each}
</nav>

<style>
  nav {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
    padding-bottom: var(--safe-bottom);
    background: var(--surface); border-top: 1px solid var(--line);
  }
  a { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; min-height: 60px; font-size: var(--text-2xs); font-weight: 600; color: var(--muted); text-decoration: none; }
  a.on { color: var(--cloro); }
  /* La voce attiva ha anche una barretta: si riconosce senza distinguere i colori */
  a.on::before { content: ''; position: absolute; top: 0; left: 50%; width: 28px; height: 3px; margin-left: calc(var(--space-14) * -1); border-radius: 0 0 3px 3px; background: var(--cloro); }
</style>
