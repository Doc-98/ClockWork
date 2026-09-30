<script lang="ts">
  import { validaModello, ModelloNonRiconosciuto } from '../lib/foglio/genera';
  import { salvaModello } from '../lib/store';
  import { dati } from '../lib/dati.svelte';

  let errore = $state('');
  let lavoro = $state(false);
  let nome = $state(dati.impostazioni.alias.join(', '));

  async function scegliModello(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    errore = '';
    lavoro = true;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { nome: collaboratore } = validaModello(bytes);
      const m = { nomeFile: file.name, bytes, caricatoIl: new Date().toISOString() };
      await salvaModello(m);
      dati.modello = m;
      if (!nome && collaboratore) nome = collaboratore.split(/\s+/)[0];
    } catch (err) {
      errore = err instanceof ModelloNonRiconosciuto
        ? `Questo file non sembra il modello del foglio ore. ${err.message}`
        : 'Non sono riuscito a leggere il file.';
    } finally {
      lavoro = false;
    }
  }

  function conferma() {
    const alias = nome.split(',').map((s) => s.trim()).filter(Boolean);
    if (!alias.length) {
      errore = 'Scrivi come compare il tuo nome nel foglio turni.';
      return;
    }
    dati.setImpostazioni({ ...dati.impostazioni, alias });
    location.hash = '#/importa';
  }
</script>

<section class="page">
  <div>
    <div class="lbl">Benvenuto in ClockWork</div>
    <h1 class="page-title">Due cose e sei pronto</h1>
  </div>

  <div class="card step" class:done={!!dati.modello}>
    <div class="n">1</div>
    <div class="body">
      <h2>Il modello del foglio ore</h2>
      {#if dati.modello}
        <p class="muted small">✓ {dati.modello.nomeFile}</p>
      {:else}
        <p class="muted small">Il file <b>FOGLIO ORE – … – GENERICO.xlsx</b>. Resta solo su questo telefono: ogni mese l'app ne compila una copia.</p>
      {/if}
      <label class="btn {dati.modello ? 'btn-secondary' : 'btn-primary'} upload">
        {lavoro ? 'Controllo il file…' : dati.modello ? 'Cambia file' : 'Scegli il file .xlsx'}
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange={scegliModello} disabled={lavoro} />
      </label>
    </div>
  </div>

  <div class="card step">
    <div class="n">2</div>
    <div class="body">
      <h2>Il tuo nome nel foglio turni</h2>
      <p class="muted small">Come compari nelle colonne delle postazioni. Se usano più varianti, separale con una virgola.</p>
      <input class="inp" bind:value={nome} placeholder="es. Vincenzo" autocomplete="given-name" aria-label="Il tuo nome nel foglio turni" />
    </div>
  </div>

  {#if errore}<p class="msg err" role="alert">{errore}</p>{/if}

  <button class="btn btn-primary" disabled={!dati.modello || !nome.trim()} onclick={conferma}>Continua: importa i turni</button>

  <p class="muted small">Per installare l'app su iPhone: apri questa pagina in Safari, tocca Condividi e poi «Aggiungi alla schermata Home».</p>
</section>

<style>
  .step { display: flex; gap: 14px; padding: 16px; }
  .n { width: 28px; height: 28px; border-radius: 50%; background: var(--ink); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
  .done .n { background: var(--ok); }
  .body { display: flex; flex-direction: column; gap: 10px; flex-grow: 1; min-width: 0; }
  h2 { margin: 2px 0 0; font-size: 16px; }
  p { margin: 0; }
  .upload { position: relative; overflow: hidden; }
  .upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
</style>
