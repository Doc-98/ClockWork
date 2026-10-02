<script lang="ts">
  import { dati } from '../lib/dati.svelte';
  import { router } from '../lib/router.svelte';
  import { scaricaFile } from '../lib/foglio/condividi';
  import { completaImpostazioni, ordinaTurni, type Turno } from '../lib/model';
  import { formatEuro } from '../lib/ore';
  import Icona from '../components/Icona.svelte';
  import CardCalendario from '../components/CardCalendario.svelte';
  import { gcal, NOME_CALENDARIO } from '../lib/gcal/stato.svelte';
  import { fonte } from '../lib/turni/fonte.svelte';
  import { tema, type SceltaTema } from '../lib/tema.svelte';

  const TEMI: { id: SceltaTema; label: string }[] = [
    { id: 'chiaro', label: 'Chiaro' },
    { id: 'scuro', label: 'Scuro' },
    { id: 'sistema', label: 'Sistema' },
  ];

  /** Una voce aperta alla volta */
  let aperta = $state<string | undefined>();
  const apri = (v: string) => {
    aperta = aperta === v ? undefined : v;
    messaggio = errore = '';
  };
  let messaggio = $state('');
  let errore = $state('');

  // Nome e cognome (foglio ore)
  let nome = $state(dati.impostazioni.nome);
  const nomeCambiato = $derived(nome.trim() !== dati.impostazioni.nome.trim() && !!nome.trim());
  async function salvaNome() {
    await dati.setImpostazioni({ ...dati.impostazioni, nome: nome.trim() });
    aperta = undefined;
  }

  // Compenso orario
  let tariffa = $state(String(dati.impostazioni.tariffa).replace('.', ','));
  const tariffaNum = $derived(Number(tariffa.replace(',', '.')));
  const tariffaCambiata = $derived(tariffa.trim() !== '' && tariffaNum >= 0 && tariffaNum !== dati.impostazioni.tariffa);
  async function salvaTariffa() {
    await dati.setImpostazioni({ ...dati.impostazioni, tariffa: tariffaNum });
    aperta = undefined;
  }

  function quando(iso?: string) {
    if (!iso) return '';
    const d = new Date(iso);
    const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? `oggi alle ${ora}` : `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} alle ${ora}`;
  }

  async function aggiornaTurni() {
    messaggio = errore = '';
    aperta = undefined;
    const piano = await fonte.controlla(true);
    if (!piano) return (errore = fonte.stato?.ultimoEsito ?? 'Non sono riuscito a controllare il foglio.');
    messaggio = fonte.stato?.avviso?.testo ?? 'Il foglio turni non ha novità.';
    if (fonte.stato?.avviso?.tipo !== 'rivedi') fonte.chiudiAvviso();
  }

  function esporta() {
    const backup = {
      app: 'ClockWork',
      versione: 1,
      esportatoIl: new Date().toISOString(),
      turni: $state.snapshot(dati.turni),
      impostazioni: $state.snapshot(dati.impostazioni),
      scelteOrari: $state.snapshot(dati.scelte),
      // così dopo un ripristino l'app ritrova lo stesso calendario invece di crearne un altro
      googleCalendarId: gcal.stato.calendarId ?? gcal.stato.calendarioPrecedente,
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
      if (b.impostazioni) await dati.setImpostazioni(completaImpostazioni({ ...dati.impostazioni, ...b.impostazioni }));
      if (b.scelteOrari) await dati.setScelte(b.scelteOrari);
      if (typeof b.googleCalendarId === 'string' && b.googleCalendarId) await gcal.adotta(b.googleCalendarId);
      nome = dati.impostazioni.nome;
      tariffa = String(dati.impostazioni.tariffa).replace('.', ',');
      errore = '';
      messaggio = `Ripristinati ${turni.length} turni.`;
    } catch {
      errore = 'Il file non è un backup di ClockWork valido.';
    }
  }
</script>

<section class="page">
  <header class="bar">
    <button class="link" onclick={() => router.indietro('#/')}><Icona nome="sx" /> Indietro</button>
    <h1>Impostazioni</h1>
    <span class="muted small versione">Versione {__APP_VERSION__}</span>
  </header>

  {#if errore}<p class="msg err" role="alert">{errore}</p>{/if}
  {#if messaggio}<p class="msg ok" role="status">{messaggio}</p>{/if}

  <section class="gruppo">
    <h2 class="lbl">Tu</h2>
    <div class="card voci">
      <div>
        <button class="voce" aria-expanded={aperta === 'nome'} onclick={() => apri('nome')}>
          <span class="voce-ico"><Icona nome="persona" /></span>
          <span class="voce-txt"><span class="voce-nome">Nome e cognome</span>{#if aperta !== 'nome'}<span class="voce-val"><span>{dati.impostazioni.nome || '—'} · va nel foglio ore</span></span>{/if}</span>
          <Icona nome="giu" class="chev" />
        </button>
        {#if aperta === 'nome'}
          <div class="voce-corpo">
            <label class="field"><span class="lbl">Nome e cognome</span>
              <span class="row"><input class="inp grow" bind:value={nome} autocomplete="name" /><button class="btn btn-secondary corto" disabled={!nomeCambiato} onclick={salvaNome}>Salva</button></span></label>
            <p class="muted small nomargin">Lo scrivo in testa al foglio ore di ogni mese.</p>
          </div>
        {/if}
      </div>
      <div>
        <button class="voce" aria-expanded={aperta === 'tariffa'} onclick={() => apri('tariffa')}>
          <span class="voce-ico"><Icona nome="euro" /></span>
          <span class="voce-txt"><span class="voce-nome">Compenso orario</span>{#if aperta !== 'tariffa'}<span class="voce-val"><span>{formatEuro(dati.impostazioni.tariffa)}/h · solo per te</span></span>{/if}</span>
          <Icona nome="giu" class="chev" />
        </button>
        {#if aperta === 'tariffa'}
          <div class="voce-corpo">
            <label class="field"><span class="lbl">Euro all'ora</span>
              <span class="row"><input class="inp m grow" bind:value={tariffa} inputmode="decimal" /><button class="btn btn-secondary corto" disabled={!tariffaCambiata} onclick={salvaTariffa}>Salva</button></span></label>
            <p class="muted small nomargin">Serve solo a stimare il compenso: non finisce nel foglio ore.</p>
          </div>
        {/if}
      </div>
    </div>
  </section>

  <section class="gruppo">
    <h2 class="lbl">Turni</h2>
    <div class="card voci">
      <a class="voce" href="#/foglio-turni">
        <span class="voce-ico"><Icona nome="link" /></span>
        <span class="voce-txt"><span class="voce-nome">Impostazioni foglio turni</span><span class="voce-val"><span>{fonte.stato ? `Collegato · controllato ${quando(fonte.stato.ultimoControllo)}` : dati.ultimaImportazione ? `Caricato a mano · ${dati.ultimaImportazione.nomeFile}` : 'Non collegato'}</span></span></span>
        <Icona nome="dx" class="chev" />
      </a>
      {#if fonte.stato}
        <button class="voce azione" disabled={fonte.lavoro} onclick={aggiornaTurni}>
          <span class="voce-ico"><Icona nome="aggiorna" /></span>
          <span class="voce-txt"><span class="voce-nome">{fonte.lavoro ? 'Controllo il foglio…' : 'Aggiorna turni adesso'}</span></span>
        </button>
      {/if}
    </div>
  </section>

  <section class="gruppo">
    <h2 class="lbl">Calendario</h2>
    <div class="card voci">
      <div>
        <button class="voce" aria-expanded={aperta === 'calendario'} onclick={() => apri('calendario')}>
          <span class="voce-ico"><Icona nome="mese" /></span>
          <span class="voce-txt"><span class="voce-nome">Collega Google Calendar</span>{#if aperta !== 'calendario'}<span class="voce-val"><span>{gcal.collegato ? `Collegato · «${NOME_CALENDARIO}»` : 'Non collegato · o esporta un file .ics'}</span></span>{/if}</span>
          <Icona nome="giu" class="chev" />
        </button>
        {#if aperta === 'calendario'}
          <div class="voce-corpo"><CardCalendario /></div>
        {/if}
      </div>
      <a class="voce" href="#/personalizza">
        <span class="voce-ico"><Icona nome="matita" /></span>
        <span class="voce-txt"><span class="voce-nome">Personalizza calendario</span><span class="voce-val"><span>Titoli degli eventi, colori, promemoria</span></span></span>
        <Icona nome="dx" class="chev" />
      </a>
    </div>
  </section>

  <section class="gruppo">
    <h2 class="lbl">Foglio ore</h2>
    <div class="card voci">
      <label class="voce">
        <span class="voce-ico"><Icona nome="scambio" /></span>
        <span class="voce-txt">
          <span class="voce-nome">Coordina le schede <em><strong>Mese</strong></em> e <em><strong>Foglio ore</strong></em></span>
          <span class="voce-val"><span class="a-capo">Se scorri a gennaio in una scheda, anche l'altra è su gennaio</span></span>
        </span>
        <button class="switch" role="switch" aria-checked={dati.impostazioni.meseLegato} aria-label="Coordina le schede Mese e Foglio ore"
          onclick={() => dati.setImpostazioni({ ...dati.impostazioni, meseLegato: !dati.impostazioni.meseLegato })}><span></span></button>
      </label>
    </div>
  </section>

  <section class="gruppo">
    <h2 class="lbl" id="lbl-tema">Aspetto</h2>
    <div class="card aspetto">
      <div class="seg" style="grid-template-columns: repeat(3, minmax(0, 1fr))" role="group" aria-labelledby="lbl-tema">
        {#each TEMI as t (t.id)}
          <button aria-pressed={tema.scelta === t.id} onclick={() => tema.imposta(t.id)}>{t.label}</button>
        {/each}
      </div>
      <p class="muted small nomargin">«Sistema» segue il tema del telefono.</p>
    </div>
  </section>

  <section class="gruppo">
    <h2 class="lbl">Dati</h2>
    <div class="card voci">
      <div>
        <button class="voce" aria-expanded={aperta === 'backup'} onclick={() => apri('backup')}>
          <span class="voce-ico"><Icona nome="scarica" /></span>
          <span class="voce-txt"><span class="voce-nome">Backup</span>{#if aperta !== 'backup'}<span class="voce-val"><span>Turni, impostazioni e calendario: scarica o ripristina</span></span>{/if}</span>
          <Icona nome="giu" class="chev" />
        </button>
        {#if aperta === 'backup'}
          <div class="voce-corpo">
            <p class="muted small nomargin">Se cambi telefono o il browser cancella i dati, ripristini tutto da qui.</p>
            <div class="row">
              <button class="btn btn-secondary grow" onclick={esporta}>Scarica backup</button>
              <label class="btn btn-secondary upload grow">Ripristina
                <input type="file" accept=".json,application/json" onchange={ripristina} /></label>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </section>

  <p class="muted small fondo">I dati sono conservati unicamente su questo telefono e non vengono condivisi con nessuno.</p>
</section>

<style>
  .versione { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .corto { padding: 0 var(--space-16); height: 46px; }
  .aspetto { display: flex; flex-direction: column; gap: var(--space-8); padding: var(--space-12); }
  .a-capo { white-space: normal !important; }
  .voce em { font-style: italic; }
  .fondo { margin: 0; text-align: center; }
  .voce:disabled { opacity: 0.5; }
</style>
