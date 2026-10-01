<script lang="ts">
  import { untrack } from 'svelte';
  import { dati } from '../lib/dati.svelte';
  import { router, type Rotta } from '../lib/router.svelte';
  import { AREE, daHHMM, hhmm, isoDa, notaSostituzione, nuovoId, nomeArea, oreDi, type Area, type Turno } from '../lib/model';
  import { turniDelGiornoDalFile } from '../lib/turni/importa';
  import { normalizzaNome } from '../lib/turni/parse';
  import { formatOre, oreInParole } from '../lib/ore';
  import Icona from '../components/Icona.svelte';

  let { rotta }: { rotta: Extract<Rotta, { nome: 'turno' }> } = $props();
  // La schermata viene ricreata a ogni cambio di rotta (vedi {#key} in App): qui basta il valore iniziale.
  const r = untrack(() => rotta);

  const esistente = dati.turni.find((t) => t.id === r.id);
  const nuovo = !esistente;

  let data = $state(esistente?.data ?? r.data ?? isoDa(new Date()));
  let area = $state<Area>(esistente?.area ?? 'maschile');
  let postazione = $state<number | undefined>(esistente?.postazione);
  let inizio = $state(esistente ? hhmm(esistente.inizio).padStart(5, '0') : '');
  let fine = $state(esistente ? hhmm(esistente.fine).padStart(5, '0') : '');
  let sost = $state(esistente ? !!esistente.sostituisce : r.tipo === 'sost');
  let sostituisce = $state(esistente?.sostituisce ?? '');
  let nota = $state(esistente?.nota ?? '');
  let notaToccata = $state(!!esistente?.nota);
  let annullato = $state(!!esistente?.annullato);
  let errore = $state('');
  let confermaElimina = $state(false);
  let suggerimento = $state('');

  // Chi era in turno quel giorno secondo il foglio (per precompilare la sostituzione)
  const colleghi = $derived.by(() => {
    const u = dati.ultimaImportazione;
    if (!u || !data) return [];
    const miei = new Set(dati.impostazioni.alias.map(normalizzaNome));
    try {
      return turniDelGiornoDalFile(u.bytes, data).filter((t) => !miei.has(normalizzaNome(t.nome)));
    } catch {
      return [];
    }
  });
  const nomiColleghi = $derived([...new Map(colleghi.map((c) => [normalizzaNome(c.nome), c.nome])).values()]);

  function scegliCollega(nome: string) {
    sostituisce = nome;
    const t = colleghi.find((c) => normalizzaNome(c.nome) === normalizzaNome(nome));
    if (t) {
      area = t.area;
      postazione = t.postazione;
      inizio = hhmm(t.inizio).padStart(5, '0');
      fine = hhmm(t.fine).padStart(5, '0');
      suggerimento = `Nel foglio turni ${t.nome} è in ${nomeArea(t.area).toLowerCase()}${t.postazione ? `, postazione ${t.postazione}` : ''}, ${hhmm(t.inizio)}–${hhmm(t.fine)}${t.orarioDoppio ? ' (orario doppio: controlla)' : ''}. Ho compilato area e orario.`;
    } else suggerimento = '';
  }

  const notaAuto = $derived(sost && sostituisce.trim() ? notaSostituzione(sostituisce, area) : '');
  $effect(() => {
    if (!notaToccata) nota = notaAuto;
  });

  const minIni = $derived(daHHMM(inizio));
  const minFin = $derived(daHHMM(fine));
  const ore = $derived(minIni !== null && minFin !== null && minFin > minIni ? oreDi({ inizio: minIni, fine: minFin }) : null);

  const titolo = nuovo ? (r.tipo === 'sost' ? 'Nuova sostituzione' : 'Nuovo turno') : esistente!.origine === 'import' ? 'Turno dal foglio' : esistente!.sostituisce ? 'Sostituzione' : 'Turno';

  function salva() {
    errore = '';
    if (!data) return (errore = 'Scegli il giorno.');
    if (minIni === null || minFin === null) return (errore = 'Inserisci inizio e fine.');
    if (minFin <= minIni) return (errore = 'La fine deve essere dopo l’inizio.');
    if (sost && !sostituisce.trim()) return (errore = 'Scrivi chi hai sostituito.');
    const base: Turno = esistente ? { ...$state.snapshot(esistente) } : { id: nuovoId(), data, area, inizio: minIni, fine: minFin, origine: 'manuale' };
    const t: Turno = {
      ...base,
      data,
      area,
      postazione: area === 'altro' ? undefined : postazione,
      inizio: minIni,
      fine: minFin,
      sostituisce: sost ? sostituisce.trim() : undefined,
      nota: nota.trim() || undefined,
      annullato: annullato || undefined,
    };
    if (esistente?.origine === 'import') {
      const cambiato = t.data !== esistente.data || t.area !== esistente.area || t.inizio !== esistente.inizio || t.fine !== esistente.fine || !!t.annullato !== !!esistente.annullato || t.sostituisce !== esistente.sostituisce;
      if (cambiato) t.modificato = true;
    }
    dati.salvaTurno(t);
    router.indietro(`#/mese/${data.slice(0, 7)}?g=${data}`);
  }

  function elimina() {
    if (!esistente) return;
    if (!confermaElimina) {
      confermaElimina = true;
      return;
    }
    dati.eliminaTurno(esistente.id);
    router.indietro(`#/mese/${esistente.data.slice(0, 7)}`);
  }
</script>

<section class="page">
  <header class="bar">
    <button class="link" onclick={() => router.indietro('#/mese')}>Annulla</button>
    <h1>{titolo}</h1>
    <span></span>
  </header>

  {#if esistente?.origine === 'import'}
    <p class="muted small nomargin">
      Viene dal foglio turni. Se lo modifichi o lo annulli, le prossime importazioni lo lasceranno com'è.
    </p>
  {/if}

  <label class="field">
    <span class="lbl">Giorno</span>
    <input class="inp" type="date" bind:value={data} />
  </label>

  {#if nuovo || esistente?.origine === 'manuale'}
    <label class="riga-switch">
      <span>È una sostituzione</span>
      <button class="switch" role="switch" aria-checked={sost} aria-label="È una sostituzione" onclick={() => (sost = !sost)}><span></span></button>
    </label>
  {/if}

  {#if sost}
    <div class="field">
      <label class="lbl" for="chi">Chi sostituisci</label>
      <input id="chi" class="inp" bind:value={sostituisce} placeholder="Nome del collega" oninput={() => (suggerimento = '')} />
      {#if nomiColleghi.length}
        <div class="chips">
          {#each nomiColleghi as n (n)}
            <button class="chip tap44" aria-pressed={normalizzaNome(n) === normalizzaNome(sostituisce)} onclick={() => scegliCollega(n)}>{n}</button>
          {/each}
        </div>
      {/if}
      {#if suggerimento}
        <div class="hint"><Icona nome="check" /><span>{suggerimento}</span></div>
      {/if}
    </div>
  {/if}

  <div class="field">
    <span class="lbl">Area</span>
    <div class="seg aree">
      {#each AREE as a (a.id)}
        <button aria-pressed={area === a.id} onclick={() => (area = a.id)}>{a.breve}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span class="lbl">Orario</span>
    <div class="orari">
      <label class="sub">Inizio<input class="inp m" type="time" bind:value={inizio} /></label>
      <label class="sub">Fine<input class="inp m" type="time" bind:value={fine} /></label>
    </div>
    <div class="durata"><span class="muted">Nel foglio ore</span><span class="m">{ore !== null ? (Number.isInteger(ore) ? `${formatOre(ore)} h` : `${formatOre(ore)} h · ${oreInParole(ore)}`) : '—'}</span></div>
  </div>

  <label class="field">
    <span class="lbl">Nota nel foglio ore (colonna R)</span>
    <input class="inp" bind:value={nota} oninput={() => (notaToccata = true)} placeholder={sost ? 'es. sost greta spogl piccoli' : 'facoltativa'} />
  </label>

  {#if esistente}
    <label class="riga-switch">
      <span>Annullato (non conta nelle ore)</span>
      <button class="switch" role="switch" aria-checked={annullato} aria-label="Annullato" onclick={() => (annullato = !annullato)}><span></span></button>
    </label>
  {/if}

  {#if errore}<p class="msg err" role="alert">{errore}</p>{/if}

  <div class="azioni">
    <button class="btn btn-primary" onclick={salva}>{nuovo ? (sost ? 'Salva sostituzione' : 'Salva turno') : 'Salva modifiche'}</button>
    {#if esistente?.origine === 'manuale'}
      <button class="btn danger" onclick={elimina}>{confermaElimina ? 'Tocca di nuovo per eliminare' : 'Elimina'}</button>
    {/if}
  </div>
</section>

<style>
  .bar { display: grid; grid-template-columns: 80px 1fr 80px; align-items: center; min-height: 44px; }
  h1 { margin: 0; text-align: center; font-size: 16px; font-weight: 700; }
  .nomargin { margin: 0; }
  .riga-switch { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; font-size: 15px; font-weight: 500; cursor: pointer; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; } /* 36px + 8px: le aree da 44px delle righe si toccano senza sovrapporsi */
  .chip { min-height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); background: #fff; font-size: 13px; font-weight: 500; cursor: pointer; }
  .chip[aria-pressed='true'] { background: var(--ink); border-color: var(--ink); color: #fff; }
  .hint { display: flex; gap: 8px; align-items: flex-start; background: var(--cloro-soft); color: #1d3a40; border-radius: 12px; padding: 10px 12px; font-size: 13px; line-height: 1.4; }
  .hint :global(.ic) { width: 18px; height: 18px; margin-top: 1px; }
  .aree { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .aree button { font-size: 12px; }
  .orari { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .sub { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
  .durata { display: flex; justify-content: space-between; font-size: 13px; }
  .durata .m { font-weight: 600; }
  .azioni { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .danger { background: transparent; color: var(--danger); border: 1px solid #e8c4c0; }
</style>
