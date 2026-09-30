<script lang="ts">
  import { validaModello, ModelloNonRiconosciuto } from '../lib/foglio/genera';
  import { salvaModello } from '../lib/store';
  import { dati } from '../lib/dati.svelte';
  import { router } from '../lib/router.svelte';
  import { scaricaFile } from '../lib/foglio/condividi';
  import { ordinaTurni, type Turno } from '../lib/model';
  import Icona from '../components/Icona.svelte';
  import CardCalendario from '../components/CardCalendario.svelte';

  let nome = $state(dati.impostazioni.alias.join(', '));
  let tariffa = $state(String(dati.impostazioni.tariffa).replace('.', ','));
  let messaggio = $state('');
  let errore = $state('');

  function salvaImpostazioni() {
    const alias = nome.split(',').map((s) => s.trim()).filter(Boolean);
    const t = Number(tariffa.replace(',', '.'));
    if (!alias.length) return (errore = 'Serve almeno un nome.');
    if (!(t >= 0)) return (errore = 'Tariffa non valida.');
    errore = '';
    dati.setImpostazioni({ alias, tariffa: t });
    messaggio = 'Impostazioni salvate.';
  }

  async function cambiaModello(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      validaModello(bytes);
      const m = { nomeFile: file.name, bytes, caricatoIl: new Date().toISOString() };
      await salvaModello(m);
      dati.modello = m;
      errore = '';
      messaggio = 'Modello sostituito.';
    } catch (err) {
      errore = err instanceof ModelloNonRiconosciuto ? `Questo file non sembra il modello. ${err.message}` : 'Non sono riuscito a leggere il file.';
    }
  }

  function esporta() {
    const backup = {
      app: 'ClockWork',
      versione: 1,
      esportatoIl: new Date().toISOString(),
      turni: $state.snapshot(dati.turni),
      impostazioni: $state.snapshot(dati.impostazioni),
      scelteOrari: $state.snapshot(dati.scelte),
    };
    const bytes = new TextEncoder().encode(JSON.stringify(backup, null, 1));
    const oggi = new Date().toISOString().slice(0, 10);
    scaricaFile(bytes, `clockwork-backup-${oggi}.json`, 'application/json');
    messaggio = 'Backup scaricato. Conservalo in File o in iCloud.';
  }

  async function ripristina(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const b = JSON.parse(await file.text());
      if (b?.app !== 'ClockWork' || !Array.isArray(b.turni)) throw new Error();
      const turni = (b.turni as Turno[]).filter((t) => t && typeof t.data === 'string' && typeof t.inizio === 'number' && typeof t.fine === 'number');
      await dati.setTurni(turni.sort(ordinaTurni));
      if (b.impostazioni) await dati.setImpostazioni({ ...dati.impostazioni, ...b.impostazioni });
      if (b.scelteOrari) await dati.setScelte(b.scelteOrari);
      nome = dati.impostazioni.alias.join(', ');
      errore = '';
      messaggio = `Ripristinati ${turni.length} turni.`;
    } catch {
      errore = 'Il file non è un backup di ClockWork valido.';
    }
  }
</script>

<section class="page">
  <div class="top">
    <button class="link" onclick={() => router.indietro('#/')}><Icona nome="sx" /> Indietro</button>
  </div>
  <h1 class="page-title">Impostazioni</h1>

  <div class="card box">
    <label class="field"><span class="lbl">Il tuo nome nel foglio turni</span>
      <input class="inp" bind:value={nome} placeholder="es. Vincenzo" /></label>
    <label class="field"><span class="lbl">Compenso orario (solo per te)</span>
      <input class="inp m" bind:value={tariffa} inputmode="decimal" /></label>
    <button class="btn btn-primary" onclick={salvaImpostazioni}>Salva</button>
  </div>

  <div class="card box">
    <div>
      <div class="lbl">Modello del foglio ore</div>
      <div class="file">{dati.modello?.nomeFile}</div>
      <div class="muted small">Caricato il {dati.modello ? new Date(dati.modello.caricatoIl).toLocaleDateString('it-IT') : '—'}</div>
    </div>
    <label class="btn btn-secondary upload">Sostituisci il modello
      <input type="file" accept=".xlsx" onchange={cambiaModello} /></label>
  </div>

  <CardCalendario />

  <div class="card box">
    <div>
      <div class="lbl">Backup</div>
      <p class="muted small">I dati stanno solo su questo telefono. Ogni tanto scarica un backup: se cambi telefono o il browser cancella i dati, lo ripristini da qui.</p>
    </div>
    <div class="row">
      <button class="btn btn-secondary grow" onclick={esporta}>Scarica backup</button>
      <label class="btn btn-secondary upload grow">Ripristina
        <input type="file" accept=".json,application/json" onchange={ripristina} /></label>
    </div>
  </div>

  {#if errore}<p class="msg err" role="alert">{errore}</p>{/if}
  {#if messaggio}<p class="msg ok" role="status">{messaggio}</p>{/if}

  <p class="muted small">ClockWork {__APP_VERSION__}</p>
</section>

<style>
  .top { min-height: 44px; display: flex; align-items: center; margin-bottom: -8px; }
  .box { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
  .file { font-weight: 600; margin-top: 4px; word-break: break-word; }
  p { margin: 4px 0 0; }
  .upload { position: relative; overflow: hidden; }
  .upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .row { display: flex; gap: 8px; }
  .grow { flex: 1; }
</style>
