<script lang="ts">
  import { validaModello, ModelloNonRiconosciuto } from '../lib/foglio/genera';
  import { salvaModello, type ModelloSalvato } from '../lib/store';

  interface Props {
    modello?: ModelloSalvato;
    primoAvvio: boolean;
    onsalvato: (m: ModelloSalvato) => void;
    onchiudi: () => void;
  }
  let { modello, primoAvvio, onsalvato, onchiudi }: Props = $props();

  let errore = $state('');
  let caricamento = $state(false);

  async function scegliFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    errore = '';
    caricamento = true;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      validaModello(bytes);
      const m: ModelloSalvato = { nomeFile: file.name, bytes, caricatoIl: new Date().toISOString() };
      await salvaModello(m);
      onsalvato(m);
    } catch (err) {
      errore = err instanceof ModelloNonRiconosciuto
        ? `Questo file non sembra il modello del foglio ore. ${err.message}`
        : 'Non sono riuscito a leggere il file.';
    } finally {
      caricamento = false;
    }
  }
</script>

<section class="wrap">
  {#if primoAvvio}
    <div class="lbl">Benvenuto in ClockWork</div>
    <h1 class="d">Carica il modello del foglio ore</h1>
    <p class="muted">
      Scegli il file <b>FOGLIO ORE – … – GENERICO.xlsx</b>. Resta solo su questo telefono: ogni mese
      l'app ne fa una copia e compila la colonna delle ore.
    </p>
  {:else}
    <div class="top">
      <button class="link" onclick={onchiudi}>‹ Foglio ore</button>
    </div>
    <h1 class="d">Impostazioni</h1>
    <div class="card row">
      <div>
        <div class="lbl">Modello in uso</div>
        <div class="file">{modello?.nomeFile}</div>
        <div class="muted small">Caricato il {modello ? new Date(modello.caricatoIl).toLocaleDateString('it-IT') : ''}</div>
      </div>
    </div>
  {/if}

  <label class="btn btn-primary upload" class:disabled={caricamento}>
    {caricamento ? 'Controllo il file…' : primoAvvio ? 'Scegli il file .xlsx' : 'Sostituisci il modello'}
    <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange={scegliFile} disabled={caricamento} />
  </label>

  {#if errore}
    <p class="err" role="alert">{errore}</p>
  {/if}

  <p class="muted small note">
    Per installare l'app su iPhone: apri questa pagina in Safari, tocca Condividi e poi
    «Aggiungi alla schermata Home».
  </p>
</section>

<style>
  .wrap { display: flex; flex-direction: column; gap: 16px; }
  h1 { margin: 0; font-size: 28px; font-weight: 800; line-height: 1.1; }
  .muted { color: var(--muted); margin: 0; }
  .small { font-size: 13px; }
  .row { padding: 14px 16px; }
  .file { font-weight: 600; margin-top: 4px; word-break: break-word; }
  .upload { position: relative; overflow: hidden; }
  .upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .disabled { opacity: 0.6; }
  .err { margin: 0; padding: 12px 14px; border-radius: 12px; background: var(--warn-bg); color: var(--warn); font-size: 14px; }
  .note { margin-top: 12px; }
  .top { min-height: 44px; display: flex; align-items: center; }
  .link { background: none; border: none; padding: 0; color: var(--cloro); font-weight: 600; font-size: 15px; cursor: pointer; min-height: 44px; }
</style>
