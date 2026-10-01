<script lang="ts">
  import { breveArea, dataDa, hhmm, oreDi, type Turno } from '../lib/model';
  import { formatOre } from '../lib/ore';
  import Icona from './Icona.svelte';

  let { turno, mostraData = true }: { turno: Turno; mostraData?: boolean } = $props();
  const GG = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const d = $derived(dataDa(turno.data));
  const etichetta = $derived(
    turno.sostituisce ? `Sost. ${turno.sostituisce}` : `${breveArea(turno.area)}${turno.postazione ? ' · P' + turno.postazione : ''}${turno.presa ? ' · presa' : ''}`,
  );
</script>

<a class="riga card" class:annullato={turno.annullato} href={`#/turno/${turno.id}`}>
  {#if mostraData}
    <div class="data"><div class="gg">{GG[d.getDay()]}</div><div class="num d">{d.getDate()}</div></div>
  {/if}
  <div class="centro">
    <span class="m ora">{hhmm(turno.inizio)}–{hhmm(turno.fine)}</span>
    <span class="tag t-{turno.area}">{etichetta}</span>
  </div>
  <div class="m ore">{turno.annullato ? 'annullato' : `${formatOre(oreDi(turno))} h`}</div>
  <Icona nome="dx" class="chev" />
</a>

<style>
  .riga { display: flex; align-items: center; gap: 12px; padding: 10px 10px 10px 14px; color: var(--ink); text-decoration: none; min-height: 60px; }
  .data { width: 38px; text-align: center; flex-shrink: 0; }
  .gg { font-size: var(--text-2xs); font-weight: 600; color: var(--muted); text-transform: uppercase; }
  .num { font-size: var(--text-2xl); font-weight: 700; line-height: 1; }
  .centro { flex-grow: 1; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 8px; min-width: 0; }
  .ora { font-size: var(--text-base); font-weight: 500; }
  .ore { font-size: var(--text-sm); color: var(--muted); text-align: right; min-width: 48px; }
  .annullato .ora, .annullato .num { text-decoration: line-through; color: var(--muted); }
  :global(.chev) { color: var(--chevron); width: 18px; height: 18px; }
</style>
