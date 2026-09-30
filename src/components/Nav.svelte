<script lang="ts">
  import Icona from './Icona.svelte';
  import { router } from '../lib/router.svelte';
  const voci = [
    { id: 'oggi', href: '#/', label: 'Oggi' },
    { id: 'mese', href: '#/mese', label: 'Mese' },
    { id: 'importa', href: '#/importa', label: 'Importa' },
    { id: 'foglio', href: '#/foglio', label: 'Foglio ore' },
  ];
  const attiva = $derived(router.rotta.nome === 'turno' ? 'mese' : router.rotta.nome);
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
    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
    padding-bottom: var(--safe-bottom);
    background: #fff; border-top: 1px solid var(--line);
  }
  a { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; min-height: 60px; font-size: 11px; font-weight: 600; color: var(--muted); text-decoration: none; }
  a.on { color: var(--cloro); }
</style>
