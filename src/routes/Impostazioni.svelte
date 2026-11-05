<script lang="ts">
  import { dati } from '../lib/dati.svelte';
  import { router } from '../lib/router.svelte';
  import { scaricaFile } from '../lib/foglio/condividi';
  import { completaImpostazioni, ordinaTurni, nomeMansione, MANSIONE_ASSISTENTE, type Mansione, type Profilo, type Turno } from '../lib/model';
  import { formatEuro } from '../lib/ore';
  import Icona from '../components/Icona.svelte';
  import CardCalendario from '../components/CardCalendario.svelte';
  import EditorMansioni from '../components/EditorMansioni.svelte';
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
  // Va in testa al foglio ore: servono nome e cognome
  const unaParola = $derived(nome.trim() !== '' && nome.trim().split(/\s+/).length < 2);
  // L'avviso compare solo dopo che hai lasciato il campo, non mentre scrivi
  let nomeLasciato = $state(false);
  const soloNome = $derived(nomeLasciato && unaParola);
  const nomeCambiato = $derived(nome.trim() !== dati.impostazioni.nome.trim() && !!nome.trim() && !unaParola);
  async function salvaNome() {
    await dati.setImpostazioni({ ...dati.impostazioni, nome: nome.trim() });
    aperta = undefined;
  }

  // Mansioni e tariffe
  const testoMansioni = $derived(
    dati.impostazioni.mansioni.length === 1
      ? `${formatEuro(dati.impostazioni.mansioni[0].tariffa)}/h · ${nomeMansione(dati.impostazioni.mansioni[0].col, dati.impostazioni)}`
      : `${dati.impostazioni.mansioni.length} mansioni · tariffe solo per te`,
  );
  const salvaMansioni = (mansioni: Mansione[]) => dati.setImpostazioni({ ...dati.impostazioni, mansioni });
  // Cambio del tipo di paga: cambiano anche i turni della mansione dal mese corrente
  async function salvaMansioniETurni(mansioni: Mansione[], turni: Turno[]) {
    await dati.setImpostazioni({ ...dati.impostazioni, mansioni });
    await dati.setTurni(turni);
  }

  // Assistente o istruttore: cosa ti serve dell'app
  function setProfilo(profilo: Profilo) {
    const imp = { ...dati.impostazioni, profilo };
    if (profilo === 'assistente') {
      // Gli assistenti prendono i turni dal foglio turni: serve la mansione Q e un nome con cui cercarsi
      // e diventa la proposta per i nuovi turni (la prima dell'elenco)
      const q = imp.mansioni.find((m) => m.col === MANSIONE_ASSISTENTE) ?? { col: MANSIONE_ASSISTENTE, tariffa: 9 };
      imp.mansioni = [q, ...imp.mansioni.filter((m) => m.col !== MANSIONE_ASSISTENTE)];
      if (!imp.alias.length && imp.nome.trim()) imp.alias = [imp.nome.trim().split(/\s+/)[0]];
    }
    dati.setImpostazioni(imp);
  }

  // Casellario giudiziario: mese dello stipendio da cui la società toglie i 5 €
  const MESI_STIPENDIO = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const lavoroDi = (m: number) => MESI_STIPENDIO[(m + 10) % 12];
  const casellarioTxt = $derived(dati.impostazioni.casellario ? `5 € dallo stipendio di ${MESI_STIPENDIO[dati.impostazioni.casellario - 1]}` : 'Nessuna detrazione');
  function setCasellario(e: Event) {
    const v = Number((e.currentTarget as HTMLSelectElement).value);
    dati.setImpostazioni({ ...dati.impostazioni, casellario: v });
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
      archivio: $state.snapshot(dati.archivio),
      oreManuali: $state.snapshot(dati.oreManuali),
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
      if (b.oreManuali && typeof b.oreManuali === 'object') await dati.setOreManuali(b.oreManuali);
      if (b.archivio && Array.isArray(b.archivio.mesi)) await dati.setArchivio({ ...b.archivio, ignorati: b.archivio.ignorati ?? [] });
      nome = dati.impostazioni.nome;
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
              <span class="row"><input class="inp grow" bind:value={nome} autocomplete="name" onblur={() => (nomeLasciato = true)} /><button class="btn btn-secondary corto" disabled={!nomeCambiato} onclick={salvaNome}>Salva</button></span></label>
            {#if soloNome}
              <p class="msg err nomargin" role="alert">Scrivi nome e cognome: li riporto così in testa al foglio ore.</p>
            {:else}
              <p class="muted small nomargin">Lo scrivo in testa al foglio ore di ogni mese.</p>
            {/if}
          </div>
        {/if}
      </div>
      <div class="voce-corpo profilo">
        <span class="lbl" id="lbl-profilo">Ruolo principale</span>
        <div class="seg" style="grid-template-columns: repeat(2, minmax(0, 1fr))" role="group" aria-labelledby="lbl-profilo">
          <button aria-pressed={dati.impostazioni.profilo === 'assistente'} onclick={() => setProfilo('assistente')}>Assistente spogliatoio</button>
          <button aria-pressed={dati.impostazioni.profilo === 'istruttore'} onclick={() => setProfilo('istruttore')}>Istruttore</button>
        </div>
        <p class="muted small nomargin">{dati.impostazioni.profilo === 'assistente'
          ? 'Prendo i tuoi turni dal foglio turni della società; quelli in più li aggiungi a mano.'
          : 'Inserisci i tuoi turni a mano.'} Non ti limita: in «Mansioni e tariffe» aggiungi tutto ciò che fai e lo scegli turno per turno.</p>
      </div>
      <div>
        <button class="voce" aria-expanded={aperta === 'mansioni'} onclick={() => apri('mansioni')}>
          <span class="voce-ico"><Icona nome="euro" /></span>
          <span class="voce-txt"><span class="voce-nome">Mansioni e tariffe</span>{#if aperta !== 'mansioni'}<span class="voce-val"><span>{testoMansioni}</span></span>{/if}</span>
          <Icona nome="giu" class="chev" />
        </button>
        {#if aperta === 'mansioni'}
          <div class="voce-corpo">
            <EditorMansioni mansioni={dati.impostazioni.mansioni} salva={salvaMansioni} turni={dati.turni} salvaTurni={salvaMansioniETurni} />
          </div>
        {/if}
      </div>
      <div>
        <button class="voce" aria-expanded={aperta === 'casellario'} onclick={() => apri('casellario')}>
          <span class="voce-ico"><Icona nome="foglio" /></span>
          <span class="voce-txt"><span class="voce-nome">Casellario giudiziario</span>{#if aperta !== 'casellario'}<span class="voce-val"><span>{casellarioTxt}</span></span>{/if}</span>
          <Icona nome="giu" class="chev" />
        </button>
        {#if aperta === 'casellario'}
          <div class="voce-corpo">
            <label class="field"><span class="lbl">Stipendio da cui la società toglie i 5 €</span>
              <select class="inp" value={dati.impostazioni.casellario} onchange={setCasellario}>
                {#each MESI_STIPENDIO as m, i (m)}
                  <option value={i + 1}>{m[0].toUpperCase() + m.slice(1)} (lavoro di {lavoroDi(i + 1).slice(0, 3)})</option>
                {/each}
                <option value={0}>Nessuna detrazione</option>
              </select></label>
            <p class="muted small nomargin">Il certificato si rinnova ogni stagione e costa 5 €: di solito li tolgono dallo stipendio di ottobre. Lo sottraggo dal compenso nel Foglio ore e nello Storico.</p>
          </div>
        {/if}
      </div>
    </div>
  </section>

  {#if dati.impostazioni.profilo === 'assistente' || dati.impostazioni.mansioni.some((m) => m.col === MANSIONE_ASSISTENTE)}
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
  {/if}

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
          <span class="voce-txt"><span class="voce-nome">Backup</span>{#if aperta !== 'backup'}<span class="voce-val"><span>Turni, impostazioni, calendario e archivio: scarica o ripristina</span></span>{/if}</span>
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
  .profilo { display: flex; flex-direction: column; gap: var(--space-8); border-top: none; }
  .profilo .seg button { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
