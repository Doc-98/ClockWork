<script lang="ts">
  import { MAX_PROMEMORIA, type Promemoria } from '../lib/model';
  import { testoPromemoria } from '../lib/gcal/eventi';
  import Icona from './Icona.svelte';

  let { valore = $bindable(), etichetta = 'Promemoria' }: { valore: Promemoria[]; etichetta?: string } = $props();

  const PRESET = [0, 5, 10, 15, 30, 45, 60, 90, 120, 180, 1440, 2880, 10080];
  const opzioni = (attuale: number) => [...new Set([...PRESET, attuale])].sort((a, b) => a - b);

  function cambia(i: number, p: Partial<Promemoria>) {
    valore = valore.map((x, j) => (j === i ? { ...x, ...p } : x));
  }
  function aggiungi() {
    // il prossimo preset non ancora usato, partendo da un'ora prima
    const usati = new Set(valore.map((p) => p.minuti));
    const minuti = [60, 1440, 30, 15, 120, 10, 0].find((m) => !usati.has(m)) ?? 60;
    valore = [...valore, { metodo: 'popup', minuti }];
  }
</script>

<div class="editor" role="group" aria-label={etichetta}>
  {#each valore as p, i (i)}
    <div class="riga">
      <select class="inp" aria-label="Quando" value={p.minuti} onchange={(e) => cambia(i, { minuti: Number(e.currentTarget.value) })}>
        {#each opzioni(p.minuti) as m (m)}<option value={m}>{testoPromemoria(m)}</option>{/each}
      </select>
      <select class="inp metodo" aria-label="Come" value={p.metodo} onchange={(e) => cambia(i, { metodo: e.currentTarget.value as Promemoria['metodo'] })}>
        <option value="popup">Notifica</option>
        <option value="email">Email</option>
      </select>
      <button class="icon-btn plain" aria-label="Togli promemoria: {testoPromemoria(p.minuti)}" onclick={() => (valore = valore.filter((_, j) => j !== i))}><Icona nome="chiudi" /></button>
    </div>
  {:else}
    <p class="muted small vuoto">Nessun promemoria.</p>
  {/each}
  {#if valore.length < MAX_PROMEMORIA}
    <button class="link aggiungi" onclick={aggiungi}><Icona nome="piu" /> Aggiungi promemoria</button>
  {:else}
    <p class="muted small vuoto">Google Calendar ne permette al massimo {MAX_PROMEMORIA}.</p>
  {/if}
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: 8px; }
  .riga { display: grid; grid-template-columns: minmax(0, 1fr) 112px 44px; gap: 6px; align-items: center; }
  select.inp { padding: 0 10px; appearance: auto; }
  .vuoto { margin: 0; }
  .aggiungi { align-self: flex-start; gap: 6px; }
  .aggiungi :global(.ic) { width: 18px; height: 18px; }
</style>
