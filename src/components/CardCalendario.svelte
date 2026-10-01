<script lang="ts">
  import { gcal, NOME_CALENDARIO, CLIENT_ID_BUILD } from '../lib/gcal/stato.svelte';
  import { redirectUri } from '../lib/gcal/auth';
  import { generaIcs } from '../lib/gcal/ics';
  import { inizioFinestra } from '../lib/gcal/eventi';
  import { scaricaFile } from '../lib/foglio/condividi';
  import { dati } from '../lib/dati.svelte';

  let confermaScollega = $state(false);
  let clientId = $state(gcal.clientIdLocale);
  let messaggio = $state('');

  function esportaIcs() {
    const da = inizioFinestra();
    const turni = dati.turni.filter((t) => t.data >= da);
    const bytes = new TextEncoder().encode(generaIcs(turni, new Date(), $state.snapshot(dati.impostazioni)));
    scaricaFile(bytes, 'ClockWork-turni.ics', 'text/calendar');
    messaggio = `Esportati ${turni.filter((t) => !t.annullato).length} turni. Aprendo il file, il calendario del telefono propone di aggiungerli.`;
  }
</script>

<div class="card box">
  <div>
    <div class="lbl">Google Calendar</div>
    {#if gcal.collegato}
      <p class="stato"><span class="dot"></span>Collegato al calendario «{NOME_CALENDARIO}»</p>
      <p class="muted small">
        {gcal.stato.ultimaSync ? `Ultima sincronizzazione: ${new Date(gcal.stato.ultimaSync).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })} · ${gcal.stato.ultimoEsito ?? ''}` : 'Non ancora sincronizzato.'}
      </p>
    {:else}
      <p class="muted small">
        L'app crea un calendario tutto suo, «{NOME_CALENDARIO}», e ci tiene allineati i tuoi turni dal mese scorso in avanti.
        Gli altri tuoi calendari non vengono né letti né toccati.
      </p>
    {/if}
  </div>

  {#if !gcal.clientId}
    <label class="field">
      <span class="lbl">Client ID Google (configurazione)</span>
      <input class="inp m" bind:value={clientId} placeholder="…apps.googleusercontent.com" />
    </label>
    <p class="muted small">URI di reindirizzamento da autorizzare: <span class="m">{redirectUri()}</span></p>
    <button class="btn btn-secondary" disabled={!clientId.trim()} onclick={() => gcal.setClientIdLocale(clientId)}>Salva Client ID</button>
  {:else if gcal.collegato}
    <div class="row">
      <button class="btn btn-accent grow" disabled={gcal.lavoro} onclick={() => gcal.sincronizzaDaTocco()}>{gcal.lavoro ? 'Sincronizzo…' : 'Sincronizza ora'}</button>
      <button class="btn btn-secondary" disabled={gcal.lavoro} onclick={() => (confermaScollega = !confermaScollega)}>Scollega</button>
    </div>
    {#if confermaScollega}
      <div class="scollega">
        <button class="btn btn-secondary" onclick={() => { gcal.scollega(false); confermaScollega = false; }}>Scollega e tieni il calendario</button>
        <button class="btn btn-danger" onclick={() => { gcal.scollega(true); confermaScollega = false; }}>Scollega ed elimina il calendario</button>
      </div>
    {/if}
  {:else}
    <button class="btn btn-primary" disabled={gcal.lavoro} onclick={() => gcal.collega()}>{gcal.lavoro ? 'Collego…' : 'Collega Google Calendar'}</button>
    {#if !CLIENT_ID_BUILD}
      <button class="link small" onclick={() => gcal.setClientIdLocale('')}>Cambia Client ID</button>
    {/if}
  {/if}

  {#if gcal.errore}<p class="msg err" role="alert">{gcal.errore}</p>{/if}

  <div class="sep"></div>
  <div>
    <div class="lbl">Senza Google</div>
    <p class="muted small">Esporta i turni in un file .ics per il calendario dell'iPhone o qualsiasi altro.</p>
  </div>
  <button class="btn btn-secondary" onclick={esportaIcs}>Esporta .ics</button>
  {#if messaggio}<p class="msg ok" role="status">{messaggio}</p>{/if}
</div>

<style>
  .box { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  p { margin: 4px 0 0; }
  .stato { display: flex; align-items: center; gap: 8px; font-weight: 600; margin-top: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); }
  .scollega { display: flex; flex-direction: column; gap: 8px; }
  .sep { height: 1px; background: var(--line-soft); margin: 4px 0; }
  .m { word-break: break-all; }
</style>
