<script lang="ts">
  import { dati } from '../lib/dati.svelte';
  import { breveArea, daHHMM, hhmm, oreDi, segnaModifica, type Turno } from '../lib/model';
  import { formatOre } from '../lib/ore';
  import Icona from './Icona.svelte';

  /**
   * Un turno del giorno nella scheda Mese: toccandolo si apre sotto una modifica veloce
   * (orario, nota, annullato). Il resto si cambia da «Tutti i dettagli».
   */
  let { turno, aperto, apri }: { turno: Turno; aperto: boolean; apri: (aperto: boolean) => void } = $props();

  const etichetta = $derived(
    turno.nome?.trim() || (turno.sostituisce ? `Sost. ${turno.sostituisce}` : `${breveArea(turno.area, dati.impostazioni)}${turno.postazione ? ' · P' + turno.postazione : ''}${turno.presa ? ' · presa' : ''}`),
  );

  const iniziale = () => ({ inizio: hhmm(turno.inizio).padStart(5, '0'), fine: hhmm(turno.fine).padStart(5, '0'), nota: turno.nota ?? '', annullato: !!turno.annullato });
  let f = $state(iniziale());
  // Riaprendo si riparte dal turno com'è salvato
  $effect(() => {
    if (aperto) f = iniziale();
  });

  const minIni = $derived(daHHMM(f.inizio));
  const minFin = $derived(daHHMM(f.fine));
  const valido = $derived(minIni !== null && minFin !== null && minFin > minIni);
  const cambiato = $derived(JSON.stringify(f) !== JSON.stringify(iniziale()));

  function salva() {
    if (!valido || minIni === null || minFin === null) return;
    const prima = $state.snapshot(turno) as Turno;
    const dopo: Turno = { ...prima, inizio: minIni, fine: minFin, nota: f.nota.trim() || undefined, annullato: f.annullato || undefined };
    dati.salvaTurno(segnaModifica(prima, dopo));
    apri(false);
  }
</script>

<div class="card turno" class:annullato={turno.annullato}>
  <button class="riga" aria-expanded={aperto} onclick={() => apri(!aperto)}>
    <span class="centro">
      <span class="m ora">{hhmm(turno.inizio)}–{hhmm(turno.fine)}</span>
      <span class="tag t-{turno.area}">{etichetta}</span>
    </span>
    <span class="m ore">{turno.annullato ? 'annullato' : `${formatOre(oreDi(turno))} h`}</span>
    <Icona nome="giu" class="chev" />
  </button>
  {#if aperto}
    <div class="corpo">
      <div class="due">
        <label class="field"><span class="lbl">Inizio</span><input class="inp m" type="time" bind:value={f.inizio} /></label>
        <label class="field"><span class="lbl">Fine</span><input class="inp m" type="time" bind:value={f.fine} /></label>
      </div>
      {#if minIni !== null && minFin !== null && minFin <= minIni}<p class="msg err">La fine deve essere dopo l’inizio.</p>{/if}
      <label class="field"><span class="lbl">Nota nel foglio ore</span><input class="inp" bind:value={f.nota} placeholder="facoltativa" /></label>
      <label class="riga-switch">
        <span>Annullato, non conta nelle ore</span>
        <button class="switch" role="switch" aria-checked={f.annullato} aria-label="Annullato" onclick={() => (f.annullato = !f.annullato)}><span></span></button>
      </label>
      <div class="due">
        <a class="btn btn-secondary" href={`#/turno/${turno.id}`}>Tutti i dettagli</a>
        <button class="btn btn-primary" disabled={!cambiato || !valido} onclick={salva}>Salva</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .turno { overflow: hidden; }
  .riga { width: 100%; display: flex; align-items: center; gap: var(--space-12); padding: var(--space-10) var(--space-10) var(--space-10) var(--space-14); min-height: 60px; border: none; background: none; color: var(--ink); text-align: left; cursor: pointer; }
  .centro { flex-grow: 1; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-6) var(--space-8); min-width: 0; }
  .ora { font-size: var(--text-base); }
  .ore { font-size: var(--text-sm); color: var(--muted); text-align: right; min-width: 48px; }
  .annullato .ora { text-decoration: line-through; color: var(--muted); }
  .riga :global(.chev) { transition: transform 0.15s; }
  .riga[aria-expanded='true'] :global(.chev) { transform: rotate(180deg); }
  .corpo { display: flex; flex-direction: column; gap: var(--space-14); padding: var(--space-14) var(--space-16) var(--space-16); border-top: 1px solid var(--line-soft); }
  .corpo .btn { padding: 0 var(--space-12); text-decoration: none; }
</style>
