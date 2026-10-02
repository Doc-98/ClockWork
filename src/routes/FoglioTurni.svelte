<script lang="ts">
  import { dati } from '../lib/dati.svelte';
  import { router } from '../lib/router.svelte';
  import { fonte } from '../lib/turni/fonte.svelte';
  import { API_KEY_BUILD, FoglioNonRaggiungibile } from '../lib/turni/remoto';
  import { leggiFileTurni, pianoAggiornamento, type AggiornamentoMese } from '../lib/turni/importa';
  import { MESI } from '../lib/foglio/genera';
  import Icona from '../components/Icona.svelte';

  // Mesi del foglio (dal mese scorso in avanti) e cosa c'è da fare per ognuno
  const mesi = $derived.by((): AggiornamentoMese[] => {
    const u = dati.ultimaImportazione;
    if (!u || !dati.impostazioni.alias.length) return [];
    try {
      return pianoAggiornamento(leggiFileTurni(u.bytes, dati.impostazioni.alias), dati.turni, dati.scelte, dati.esclusi);
    } catch {
      return [];
    }
  });
  function descrivi(m: AggiornamentoMese): string {
    if (m.azione === 'rivedi') return `Da rivedere: ${m.motivo}`;
    if (m.azione === 'applica') {
      const p = [m.nuovi ? `${m.nuovi} ${m.nuovi === 1 ? 'turno nuovo' : 'turni nuovi'}` : '', m.cambiati ? `${m.cambiati} ${m.cambiati === 1 ? 'orario cambiato' : 'orari cambiati'}` : ''];
      return `Da confermare: ${p.filter(Boolean).join(', ')}`;
    }
    const n = m.confermati.length;
    const novita = fonte.stato?.novita?.[m.nome];
    return `${n} ${n === 1 ? 'turno' : 'turni'}${novita ? ` · ${novita}` : ''}`;
  }

  function quando(iso?: string) {
    if (!iso) return '';
    const d = new Date(iso);
    const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? `oggi alle ${ora}` : `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} alle ${ora}`;
  }

  let errore = $state('');
  let messaggio = $state('');

  async function aggiorna() {
    errore = messaggio = '';
    const piano = await fonte.controlla(true);
    if (!piano) return (errore = fonte.stato?.ultimoEsito ?? 'Non sono riuscito a controllare il foglio.');
    // L'esito si legge qui: l'avviso in Oggi servirebbe solo a ripeterlo
    messaggio = fonte.stato?.avviso?.testo ?? 'Il foglio turni non ha novità.';
    if (fonte.stato?.avviso?.tipo !== 'rivedi') fonte.chiudiAvviso();
  }

  // Nome nel foglio turni: l'unico posto dove si cambia
  let alias = $state(dati.impostazioni.alias.join(', '));
  const aliasNuovi = $derived(alias.split(',').map((s) => s.trim()).filter(Boolean));
  const aliasCambiato = $derived(aliasNuovi.join(',') !== dati.impostazioni.alias.join(','));
  async function salvaAlias() {
    if (!aliasNuovi.length) return;
    await dati.setImpostazioni({ ...dati.impostazioni, alias: aliasNuovi });
    alias = aliasNuovi.join(', ');
    if (fonte.stato) await aggiorna();
    else messaggio = 'Nome salvato.';
  }

  // Collegamento
  let cambiaLink = $state(false);
  let link = $state('');
  let confermaScollega = $state(false);
  const collegato = $derived(!!fonte.stato && !cambiaLink);
  async function collega() {
    errore = messaggio = '';
    try {
      await fonte.collega(link);
      link = '';
      cambiaLink = false;
      await aggiorna();
    } catch (e) {
      errore = e instanceof FoglioNonRaggiungibile ? e.message : 'Non riesco a leggere il foglio: è quello dei turni?';
      if (!API_KEY_BUILD && e instanceof FoglioNonRaggiungibile && /chiave API/.test(e.message)) await fonte.setChiaveLocale('');
    }
  }
  async function scollega() {
    if (!confermaScollega) return (confermaScollega = true);
    confermaScollega = false;
    await fonte.scollega();
  }

  // Configurazione per sviluppatori: solo se l'app è stata pubblicata senza la chiave
  let chiave = $state('');
  const chiaveValida = $derived(/^AIza[\w-]{35}$/.test(chiave.trim()));

  async function caricaFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    errore = messaggio = '';
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const l = leggiFileTurni(bytes, dati.impostazioni.alias);
      if (!l.mesi.length) throw new Error('nessun mese');
      await dati.setUltimaImportazione({ nomeFile: f.name, bytes, quando: new Date().toISOString() });
      messaggio = `Caricato «${f.name}». Rivedi i mesi qui sotto per importare i turni.`;
    } catch {
      errore = 'Non riconosco questo file: dovrebbe essere il foglio turni con un foglio per mese (es. «Ottobre 26»).';
    }
  }
  const nomeMese = (m: AggiornamentoMese) => MESI[m.month - 1];
</script>

<section class="page">
  <header class="bar">
    <button class="link" onclick={() => router.indietro('#/impostazioni')}><Icona nome="sx" /> Indietro</button>
    <h1>Foglio turni</h1>
    <span></span>
  </header>

  {#if collegato && fonte.stato}
    <div class="card fonte">
      <div class="file">
        <span class="voce-ico grande"><Icona nome="tabella" /></span>
        <span class="file-txt"><span class="nome">{fonte.stato.nome}</span><span class="muted small">Foglio Google · controllato {quando(fonte.stato.ultimoControllo)}</span></span>
      </div>
      <button class="btn btn-accent" disabled={fonte.lavoro} onclick={aggiorna}><Icona nome="aggiorna" /> {fonte.lavoro ? 'Controllo il foglio…' : 'Aggiorna turni'}</button>
    </div>
    <p class="muted small nomargin">Lo ricontrollo da solo quando apri l'app in un mese nuovo o dopo 6 ore. Le novità chiare le applico subito, il resto te lo faccio rivedere.</p>
  {:else}
    <div class="card fonte">
      <div class="testa"><span class="nome">Collega il foglio Google</span><span class="muted small">Incolla il link del foglio turni condiviso dalla società. Dopo, controllo io i turni nuovi ogni mese.</span></div>
      {#if !fonte.chiave}
        <p class="msg err">Il collegamento ai fogli Google non è attivo in questa versione dell'app. Per ora carica il file qui sotto.</p>
        <details class="config">
          <summary class="link small">Configurazione per sviluppatori</summary>
          <label class="field"><span class="lbl">Chiave API Google</span><input class="inp m" bind:value={chiave} placeholder="AIza…" autocomplete="off" /></label>
          <button class="btn btn-secondary" disabled={!chiaveValida} onclick={() => fonte.setChiaveLocale(chiave)}>Salva chiave</button>
        </details>
      {:else}
        <label class="field"><span class="lbl">Link del foglio turni</span><input class="inp" type="url" bind:value={link} placeholder="https://docs.google.com/spreadsheets/d/…" autocomplete="off" /></label>
        <div class="row">
          <button class="btn btn-primary grow" disabled={!link.trim() || fonte.lavoro} onclick={collega}>{fonte.lavoro ? 'Leggo il foglio…' : 'Collega'}</button>
          {#if cambiaLink}<button class="btn btn-secondary" onclick={() => (cambiaLink = false)}>Annulla</button>{/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if errore}<p class="msg err" role="alert">{errore}</p>{/if}
  {#if messaggio}<p class="msg ok" role="status">{messaggio}</p>{/if}

  {#if mesi.length}
    <section class="gruppo">
      <h2 class="lbl">Mesi nel foglio</h2>
      <div class="card voci">
        {#each mesi as m (m.nome)}
          {#if m.azione === 'nessuna'}
            <div class="voce fissa">
              <span class="voce-ico"><Icona nome="mese" /></span>
              <span class="voce-txt"><span class="voce-nome">{nomeMese(m)}</span><span class="voce-val"><span>{descrivi(m)}</span><span class="ok-badge" role="img" aria-label="aggiornato"><Icona nome="check" /></span></span></span>
            </div>
          {:else}
            <a class="voce" href={`#/rivedi?mese=${encodeURIComponent(m.nome)}`}>
              <span class="voce-ico warn"><Icona nome="mese" /></span>
              <span class="voce-txt"><span class="voce-nome">{nomeMese(m)}</span><span class="voce-val"><span>{descrivi(m)}</span></span></span>
              <span class="tag t-warn">Rivedi</span>
            </a>
          {/if}
        {/each}
      </div>
    </section>
  {/if}

  <section class="gruppo">
    <h2 class="lbl">Come ti cerco</h2>
    <div class="card nome-box">
      <label class="field">
        <span class="lbl">Il tuo nome nel foglio turni</span>
        <span class="row"><input class="inp grow" bind:value={alias} placeholder="es. Vincenzo" autocomplete="given-name" /><button class="btn btn-secondary" disabled={!aliasCambiato || !aliasNuovi.length} onclick={salvaAlias}>Salva</button></span>
      </label>
      <span class="muted small">Se nel foglio usano più varianti, separale con una virgola.{fonte.stato ? ' Cambiandolo, ricontrollo il foglio.' : ''}</span>
    </div>
  </section>

  <section class="gruppo">
    <h2 class="lbl">{collegato ? 'Collegamento' : 'Senza collegamento'}</h2>
    <div class="card voci">
      {#if collegato}
        <button class="voce" onclick={() => { cambiaLink = true; errore = messaggio = ''; }}>
          <span class="voce-ico"><Icona nome="link" /></span>
          <span class="voce-txt"><span class="voce-nome">Cambia link</span><span class="voce-val"><span>Per l'anno prossimo o un foglio nuovo</span></span></span>
          <Icona nome="dx" class="chev" />
        </button>
      {/if}
      <label class="voce upload">
        <span class="voce-ico"><Icona nome="foglio" /></span>
        <span class="voce-txt"><span class="voce-nome">Carica un file a mano</span><span class="voce-val"><span>{collegato ? 'Se il foglio non si raggiunge: il file .xlsx' : 'Il file «Assistenti Spogliatoio» ricevuto dalla società'}</span></span></span>
        <Icona nome="dx" class="chev" />
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange={caricaFile} />
      </label>
      {#if collegato}
        <button class="voce danger" onclick={scollega}>
          <span class="voce-ico nessuno"><Icona nome="chiudi" /></span>
          <span class="voce-txt"><span class="voce-nome">{confermaScollega ? 'Tocca di nuovo per scollegare' : 'Scollega'}</span></span>
        </button>
      {/if}
    </div>
  </section>
</section>

<style>
  .fonte { display: flex; flex-direction: column; gap: var(--space-14); padding: var(--space-16); }
  .file { display: flex; align-items: center; gap: var(--space-12); }
  .grande { width: 44px; height: 44px; }
  .grande :global(.ic) { width: 22px; height: 22px; }
  .file-txt, .testa { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
  .nome { font-weight: 600; }
  .config { display: flex; flex-direction: column; gap: var(--space-10); }
  .config summary { cursor: pointer; list-style: none; }
  .nome-box { display: flex; flex-direction: column; gap: var(--space-8); padding: var(--space-14); }
  .nome-box .btn { padding: 0 var(--space-16); height: 46px; }
  .nessuno { background: transparent; color: var(--danger); }
</style>
