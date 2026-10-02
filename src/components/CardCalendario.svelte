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

  // Doppioni: quale calendario tenere (di base il più pieno) e conferma col secondo tocco
  const calendariTrovati = $derived(
    gcal.doppioni.length
      ? [{ id: gcal.stato.calendarId!, eventi: gcal.eventiCollegato, collegato: true }, ...gcal.doppioni.map((d) => ({ id: d.id, eventi: d.eventi, collegato: false }))]
      : [],
  );
  let daTenere = $state<string | undefined>();
  let confermaPulizia = $state(false);
  const scelto = $derived(daTenere && calendariTrovati.some((c) => c.id === daTenere) ? daTenere : [...calendariTrovati].sort((a, b) => b.eventi - a.eventi)[0]?.id);
  async function pulisci() {
    if (!scelto) return;
    if (!confermaPulizia) return (confermaPulizia = true);
    confermaPulizia = false;
    await gcal.tieniSolo(scelto);
    if (!gcal.errore) messaggio = 'Fatto: ora c’è un solo calendario di ClockWork.';
  }

  function esportaIcs() {
    const da = inizioFinestra();
    const turni = dati.turni.filter((t) => t.data >= da);
    const bytes = new TextEncoder().encode(generaIcs(turni, new Date(), $state.snapshot(dati.impostazioni)));
    scaricaFile(bytes, 'ClockWork-turni.ics', 'text/calendar');
    messaggio = `Esportati ${turni.filter((t) => !t.annullato).length} turni. Aprendo il file, il calendario del telefono propone di aggiungerli.`;
  }
</script>

<div class="box">
  <div>
    {#if gcal.collegato}
      <p class="stato"><span class="dot"></span>Collegato al calendario «{NOME_CALENDARIO}»</p>
      <p class="muted small">
        {gcal.stato.ultimaSync ? `Ultima sincronizzazione: ${new Date(gcal.stato.ultimaSync).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })} · ${gcal.stato.ultimoEsito ?? ''}` : 'Non ancora sincronizzato.'}
      </p>
    {:else}
      <p class="muted small">
        L'app usa un calendario tutto suo, «{NOME_CALENDARIO}», e ci tiene allineati i tuoi turni dal mese scorso in avanti.
        Se ne hai già uno creato da ClockWork lo ritrova, invece di crearne un altro: per questo chiede di vedere
        l'elenco dei tuoi calendari (solo i nomi). Gli eventi degli altri calendari non vengono né letti né toccati.
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

  {#if calendariTrovati.length}
    <div class="doppioni" role="group" aria-labelledby="tit-doppioni">
      <p class="tit" id="tit-doppioni">Hai {calendariTrovati.length} calendari di ClockWork</p>
      <p class="small">Probabilmente creati da una versione precedente o da un altro dispositivo. Scegli quale tenere: gli altri vengono eliminati, compresi eventuali eventi aggiunti a mano lì dentro.</p>
      {#each calendariTrovati as c, i (c.id)}
        <label class="opzione">
          <input type="radio" name="tieni" checked={scelto === c.id} onchange={() => { daTenere = c.id; confermaPulizia = false; }} />
          <span class="grow">Calendario {i + 1}{c.collegato ? ' · in uso' : ''}</span>
          <span class="m small">{c.eventi} {c.eventi === 1 ? 'turno' : 'turni'}</span>
        </label>
      {/each}
      <button class="btn btn-danger" disabled={gcal.lavoro} onclick={pulisci}>
        {confermaPulizia ? `Tocca di nuovo: elimino ${calendariTrovati.length - 1} ${calendariTrovati.length - 1 === 1 ? 'calendario' : 'calendari'}` : 'Tieni questo ed elimina gli altri'}
      </button>
    </div>
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
  .box { display: flex; flex-direction: column; gap: var(--space-12); }
  p { margin: var(--space-4) 0 0; }
  .stato { display: flex; align-items: center; gap: var(--space-8); font-weight: 600; margin-top: var(--space-6); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); }
  .scollega { display: flex; flex-direction: column; gap: var(--space-8); }
  .sep { height: 1px; background: var(--line-soft); margin: var(--space-4) 0; }
  .m { word-break: break-all; }
  .doppioni { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 12px; background: var(--warn-bg); color: var(--warn); border: 1px solid var(--warn-line); }
  .doppioni .tit { font-weight: 700; margin: 0; }
  .doppioni .small { margin: 0; }
  .opzione { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 12px; border-radius: 10px; background: var(--surface); color: var(--ink); cursor: pointer; }
  .opzione input { width: 20px; height: 20px; accent-color: var(--cloro); margin: 0; }
  .opzione .m { word-break: normal; color: var(--muted); }
  .doppioni .btn-danger { background: var(--surface); }
</style>
