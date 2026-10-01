<script lang="ts">
  import { dati } from '../lib/dati.svelte';
  import { untrack } from 'svelte';
  import { router, type Rotta } from '../lib/router.svelte';
  import { fonte } from '../lib/turni/fonte.svelte';
  import { API_KEY_BUILD, FoglioNonRaggiungibile } from '../lib/turni/remoto';
  import { leggiFileTurni, casiDoppi, applicaScelte, confronta, applicaImport, chiaveTurno, type SceltaOrario, type FoglioTurniLetto } from '../lib/turni/importa';
  import { breveArea, nomeArea, hhmm, dataDa } from '../lib/model';
  import { oreTurno } from '../lib/turni/parse';
  import { formatOre } from '../lib/ore';
  import { MESI } from '../lib/foglio/genera';
  import Icona from '../components/Icona.svelte';

  let { rotta }: { rotta: Extract<Rotta, { nome: 'importa' }> } = $props();
  const meseIniziale = untrack(() => rotta.mese);

  let file = $state<{ nomeFile: string; bytes: Uint8Array } | undefined>(
    dati.ultimaImportazione ? { nomeFile: dati.ultimaImportazione.nomeFile, bytes: dati.ultimaImportazione.bytes } : undefined,
  );
  let errore = $state('');
  let lavoro = $state(false);

  const letto = $derived.by((): FoglioTurniLetto | undefined => {
    if (!file) return undefined;
    try {
      return leggiFileTurni(file.bytes, dati.impostazioni.alias);
    } catch {
      return undefined;
    }
  });

  const oggi = new Date();
  let meseScelto = $state<string | undefined>(meseIniziale);
  const mesiConDati = $derived(letto?.mesi ?? []);
  const meseDefault = $derived.by(() => {
    const qui = mesiConDati.find((m) => m.year === oggi.getFullYear() && m.month === oggi.getMonth() + 1 && m.miei.length);
    return (qui ?? [...mesiConDati].reverse().find((m) => m.miei.length) ?? mesiConDati.at(-1))?.nome;
  });
  const mese = $derived(mesiConDati.find((m) => m.nome === (meseScelto ?? meseDefault)));

  // Orari doppi: una scelta per ogni caso, ricordata per le prossime volte
  let scelteLocali = $state<Record<string, SceltaOrario>>({});
  const casi = $derived(mese ? casiDoppi(mese.miei, dati.scelte) : []);
  const scelte = $derived({ ...dati.scelte, ...Object.fromEntries(casi.map((c) => [c.chiave, scelteLocali[c.chiave] ?? c.proposta])) });
  const risolti = $derived(mese ? applicaScelte(mese.miei, scelte) : []);
  const confronto = $derived(mese ? confronta(dati.turni, risolti, mese.year, mese.month) : undefined);

  let esclusi = $state<Set<string>>(new Set());
  // I turni che avevi tolto l'ultima volta restano tolti (anche per gli aggiornamenti automatici)
  $effect(() => {
    const m = mese;
    if (!m) return;
    const p = `${m.year}-${String(m.month).padStart(2, '0')}-`;
    const salvati = dati.esclusi.filter((k) => k.startsWith(p));
    untrack(() => (esclusi = new Set(salvati)));
  });
  const confermati = $derived(risolti.filter((t) => !esclusi.has(chiaveTurno(t))));
  const oreConfermate = $derived(Math.round(confermati.reduce((s, t) => s + oreTurno(t), 0) * 100) / 100);
  const conteggi = $derived.by(() => {
    const r = confronto?.righe ?? [];
    return { uguali: r.filter((x) => x.stato === 'uguale').length, nuovi: r.filter((x) => x.stato === 'nuovo').length, cambiati: r.filter((x) => x.stato === 'cambiato').length };
  });
  const primaImportazione = $derived(!!mese && !dati.turniDelMese(mese.year, mese.month).some((t) => t.origine === 'import'));

  function toggle(k: string) {
    const s = new Set(esclusi);
    if (s.has(k)) s.delete(k);
    else s.add(k);
    esclusi = s;
  }

  function scegliMese(nome: string) {
    meseScelto = nome;
    esclusi = new Set();
    scelteLocali = {};
  }

  async function scegliFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    errore = '';
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const l = leggiFileTurni(bytes, dati.impostazioni.alias);
      if (!l.mesi.length) throw new Error('nessun mese');
      file = { nomeFile: f.name, bytes };
      meseScelto = undefined;
      esclusi = new Set();
      scelteLocali = {};
    } catch {
      errore = 'Non riconosco questo file: dovrebbe essere il foglio turni con un foglio per mese (es. «Ottobre 26»).';
    }
  }

  async function conferma() {
    if (!mese || !file) return;
    lavoro = true;
    const nuovi = applicaImport(dati.turni, confermati, mese.year, mese.month);
    await dati.setTurni(nuovi);
    const daSalvare = { ...dati.scelte };
    for (const c of casi) daSalvare[c.chiave] = scelte[c.chiave];
    await dati.setScelte(daSalvare);
    await dati.setUltimaImportazione({ nomeFile: file.nomeFile, bytes: file.bytes, quando: new Date().toISOString() });
    await dati.setEsclusiMese(mese.year, mese.month, [...esclusi]);
    if (fonte.stato?.avviso?.mese === mese.nome) fonte.chiudiAvviso();
    // Le scelte appena fatte (es. un orario doppio) possono sbloccare altri mesi in sospeso
    if (fonte.stato) fonte.controlla(false, true);
    lavoro = false;
    router.vai(`#/mese/${mese.year}-${String(mese.month).padStart(2, '0')}`);
  }

  // Foglio Google collegato con il link
  let link = $state('');
  let chiave = $state('');
  // Una chiave API di Google: «AIza» + 35 caratteri. Evita di salvare per sbaglio il link del foglio.
  const chiaveValida = $derived(/^AIza[\w-]{35}$/.test(chiave.trim()));
  let erroreFonte = $state('');
  let messaggioFonte = $state('');
  let cambiaLink = $state(false);

  async function collegaFoglio() {
    erroreFonte = '';
    messaggioFonte = '';
    try {
      const f = await fonte.collega(link);
      file = f;
      meseScelto = undefined;
      scelteLocali = {};
      link = '';
      cambiaLink = false;
    } catch (e) {
      erroreFonte = e instanceof FoglioNonRaggiungibile ? e.message : 'Non riesco a leggere il foglio: è quello dei turni?';
      // Chiave inserita a mano e rifiutata da Google: la si toglie, così si può reinserire
      if (!API_KEY_BUILD && e instanceof FoglioNonRaggiungibile && /chiave API/.test(e.message)) await fonte.setChiaveLocale('');
    }
  }

  async function aggiornaTurni() {
    erroreFonte = '';
    messaggioFonte = '';
    const piano = await fonte.controlla(true);
    if (!piano) {
      erroreFonte = fonte.stato?.ultimoEsito ?? 'Non sono riuscito a controllare il foglio.';
      return;
    }
    const u = dati.ultimaImportazione;
    if (u) file = { nomeFile: u.nomeFile, bytes: u.bytes };
    const daRivedere = piano.find((m) => m.azione === 'rivedi');
    // l'esito si legge qui sotto: l'avviso in Oggi e Mese servirebbe solo a ripeterlo
    messaggioFonte = fonte.stato?.avviso?.testo ?? '';
    if (fonte.stato?.avviso?.tipo !== 'rivedi') fonte.chiudiAvviso();
    meseScelto = daRivedere?.nome ?? meseScelto;
    scelteLocali = {};
  }

  function quando(iso?: string) {
    if (!iso) return '';
    const d = new Date(iso);
    const oggiStr = new Date().toDateString();
    const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === oggiStr ? `oggi alle ${ora}` : `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} alle ${ora}`;
  }

  const GG = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const giorno = (iso: string) => `${GG[dataDa(iso).getDay()]} ${Number(iso.slice(8))}`;
  const breveMese = (nome: string) => nome.replace(/^(\w{3})\w*/, '$1');
</script>

<section class="page">
  <div>
    <div class="lbl">Importa orari</div>
    <h1 class="page-title">{mese ? 'Verifica i turni' : 'Carica il foglio turni'}</h1>
  </div>

  {#if fonte.stato && !cambiaLink}
    <div class="card fonte">
      <div class="file">
        <div class="file-ic"><Icona nome="tabella" /></div>
        <div class="file-txt">
          <div class="nome">{fonte.stato.nome}</div>
          <div class="muted small">Foglio Google collegato · controllato {quando(fonte.stato.ultimoControllo)}</div>
        </div>
      </div>
      <button class="btn btn-accent" disabled={fonte.lavoro} onclick={aggiornaTurni}>
        <Icona nome="scambio" /> {fonte.lavoro ? 'Controllo il foglio…' : 'Aggiorna turni'}
      </button>
      <p class="muted small nomargin">
        L'app lo ricontrolla da sola quando la apri in un mese nuovo o dopo qualche ora: le novità chiare le aggiunge,
        per orari doppi e turni spariti ti chiede di rivedere. Cerco «{dati.impostazioni.alias.join('», «')}» · <a class="inline" href="#/impostazioni">cambia</a>
      </p>
      <div class="row link-azioni">
        <button class="link small" onclick={() => (cambiaLink = true)}>Cambia link</button>
        <button class="link small" onclick={() => fonte.scollega()}>Scollega</button>
      </div>
    </div>
    {#if messaggioFonte}<p class="msg ok" role="status">{messaggioFonte}</p>{/if}
    {#if erroreFonte}<p class="msg err" role="alert">{erroreFonte}</p>{/if}
  {:else}
    <div class="card fonte">
      <div>
        <div class="nome">Collega il foglio Google</div>
        <p class="muted small nomargin">Incolla il link del foglio turni condiviso dalla società: dopo, l'app controlla da sola i turni nuovi ogni mese.</p>
      </div>
      {#if !fonte.chiave}
        <!-- Succede solo se l'app è stata pubblicata senza la variabile GOOGLE_API_KEY -->
        <p class="msg err nomargin">Il collegamento ai fogli Google non è ancora attivo in questa versione dell'app. Per ora carica il file qui sotto.</p>
        <details class="config">
          <summary class="link small">Configurazione per sviluppatori</summary>
          <label class="field">
            <span class="lbl">Chiave API Google</span>
            <input class="inp m" bind:value={chiave} placeholder="AIza…" autocomplete="off" />
          </label>
          <p class="muted small nomargin">Non è il link del foglio: è la chiave del progetto Google (inizia con «AIza»). Di solito arriva già con l'app.</p>
          <button class="btn btn-secondary" disabled={!chiaveValida} onclick={() => fonte.setChiaveLocale(chiave)}>Salva chiave</button>
        </details>
      {:else}
        <label class="field">
          <span class="lbl">Link del foglio turni</span>
          <input class="inp" type="url" bind:value={link} placeholder="https://docs.google.com/spreadsheets/d/…" autocomplete="off" />
        </label>
        <div class="row">
          <button class="btn btn-primary grow" disabled={!link.trim() || fonte.lavoro} onclick={collegaFoglio}>{fonte.lavoro ? 'Leggo il foglio…' : 'Collega'}</button>
          {#if cambiaLink}<button class="btn btn-secondary" onclick={() => (cambiaLink = false)}>Annulla</button>{/if}
        </div>
      {/if}
      {#if erroreFonte}<p class="msg err" role="alert">{erroreFonte}</p>{/if}
    </div>

    <div class="oppure muted small"><span>oppure carica il file</span></div>

  <div class="card file solo">
    <div class="file-ic"><Icona nome="tabella" /></div>
    <div class="file-txt">
      {#if file}
        <div class="nome">{file.nomeFile}</div>
        <div class="muted small">Cerco «{dati.impostazioni.alias.join('», «')}» · <a class="inline" href="#/impostazioni">cambia</a></div>
      {:else}
        <div class="nome">Nessun file</div>
        <div class="muted small">Scegli il file «Assistenti Spogliatoio» ricevuto dalla società.</div>
      {/if}
    </div>
    <label class="btn {file ? 'btn-secondary' : 'btn-primary'} upload scegli">
      {file ? 'Cambia' : 'Scegli'}
      <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange={scegliFile} />
    </label>
  </div>

  {/if}

  {#if errore}<p class="msg err" role="alert">{errore}</p>{/if}

  {#if letto && mesiConDati.length}
    <div class="chips" role="group" aria-label="Mese">
      {#each mesiConDati as m (m.nome)}
        <button class="chip" class:vuoto={!m.miei.length} aria-pressed={m.nome === mese?.nome} onclick={() => scegliMese(m.nome)}>
          {breveMese(m.nome)}{m.miei.length ? '' : ' · —'}
        </button>
      {/each}
    </div>
  {/if}

  {#if mese && confronto}
    {#if !mese.miei.length}
      <p class="msg err">In «{mese.nome}» non trovo turni a nome «{dati.impostazioni.alias.join(', ')}». Se nel foglio sei scritto diversamente, aggiungi la variante nelle impostazioni.</p>
    {:else}
      <div class="riepilogo">
        <div><span class="d n">{confermati.length} turni</span><span class="m"> · {formatOre(oreConfermate)} h</span></div>
        <div class="tags">
          {#if primaImportazione}
            <span class="tag t-soft">prima importazione</span>
          {:else}
            {#if conteggi.uguali}<span class="tag t-soft">{conteggi.uguali} uguali</span>{/if}
            {#if conteggi.nuovi}<span class="tag t-warn">{conteggi.nuovi} nuovi</span>{/if}
            {#if conteggi.cambiati}<span class="tag t-warn">{conteggi.cambiati} cambiati</span>{/if}
          {/if}
        </div>
      </div>

      {#each casi as c (c.chiave)}
        {@const s = scelte[c.chiave]}
        <div class="card doppio">
          <div>
            <div class="doppio-tit">Orario doppio · {nomeArea(c.area, dati.impostazioni)}</div>
            <div class="muted small">Nel foglio: <span class="m">{c.grezzo}</span> · {c.date.map(giorno).join(', ')}</div>
            <div class="muted small">Quale fai tu? Lo ricordo per le prossime volte.</div>
          </div>
          {#if c.opzioniInizio[0] !== c.opzioniInizio[1]}
          <div class="doppio-row">
            <span class="lbl">Inizio</span>
            <div class="seg" style="grid-template-columns: repeat(2, minmax(0, 1fr))">
              {#each c.opzioniInizio as o, i (i)}
                <button aria-pressed={s.inizio === o} onclick={() => (scelteLocali = { ...scelteLocali, [c.chiave]: { ...s, inizio: o } })}>{hhmm(o)}</button>
              {/each}
            </div>
          </div>
          {/if}
          {#if c.opzioniFine[0] !== c.opzioniFine[1]}
          <div class="doppio-row">
            <span class="lbl">Fine</span>
            <div class="seg" style="grid-template-columns: repeat(2, minmax(0, 1fr))">
              {#each c.opzioniFine as o, i (i)}
                <button aria-pressed={s.fine === o} onclick={() => (scelteLocali = { ...scelteLocali, [c.chiave]: { ...s, fine: o } })}>{hhmm(o)}</button>
              {/each}
            </div>
          </div>
          {/if}
        </div>
      {/each}

      <div class="card lista">
        {#each confronto.righe as r (chiaveTurno(r.letto))}
          {@const k = chiaveTurno(r.letto)}
          <label class="riga" class:evid={!primaImportazione && r.stato !== 'uguale'}>
            <input type="checkbox" checked={!esclusi.has(k)} onchange={() => toggle(k)} />
            <div class="riga-main">
              <div class="riga-top">
                <span class="gg">{giorno(r.letto.data)}</span>
                <span class="tag t-{r.letto.area}">{breveArea(r.letto.area, dati.impostazioni)}{r.letto.postazione ? ' · P' + r.letto.postazione : ''}{r.letto.presa ? ' *' : ''}</span>
                <span class="m ora">{hhmm(r.letto.inizio)}–{hhmm(r.letto.fine)}</span>
              </div>
              {#if !primaImportazione && r.stato === 'nuovo'}
                <span class="nota-riga">Nuovo rispetto all'ultima importazione</span>
              {:else if r.stato === 'cambiato' && r.precedente}
                <span class="nota-riga">Prima: {hhmm(r.precedente.inizio)}–{hhmm(r.precedente.fine)}</span>
              {/if}
            </div>
            <span class="m ore">{formatOre(oreTurno(r.letto))}</span>
          </label>
        {/each}
      </div>

      {#if confronto.rimossi.length}
        <p class="msg err">
          Non più nel foglio, verranno tolti: {confronto.rimossi.map((t) => `${giorno(t.data)} ${breveArea(t.area, dati.impostazioni)}`).join(', ')}.
        </p>
      {/if}
      {#if confronto.protetti.length}
        <p class="muted small nomargin">
          {confronto.protetti.length === 1 ? "1 turno che hai modificato resta com'è: l'importazione non lo tocca." : `${confronto.protetti.length} turni che hai modificato restano come sono: l'importazione non li tocca.`}
        </p>
      {/if}

      <div class="azioni">
        <p class="muted small nomargin">Le sostituzioni e i turni aggiunti a mano restano come sono: il foglio turni non li contiene.</p>
        <button class="btn btn-primary" disabled={lavoro || !confermati.length} onclick={conferma}>
          Conferma {confermati.length} turni di {MESI[mese.month - 1].toLowerCase()}
        </button>
      </div>
    {/if}
  {/if}
</section>

<style>
  .file { display: flex; align-items: center; gap: var(--space-12); }
  .file.solo { padding: 12px 14px; }
  .fonte { padding: 14px; display: flex; flex-direction: column; gap: 12px; }
  .fonte .nome { white-space: normal; }
  .config { display: flex; flex-direction: column; gap: 10px; }
  .config[open] { gap: 12px; }
  .config summary { cursor: pointer; list-style: none; }
  .config > :not(summary) { margin-top: 10px; }
  .link-azioni { gap: 20px; margin: -8px 0 -10px; }
  .oppure { display: flex; align-items: center; gap: 10px; margin: -4px 0; }
  .oppure::before, .oppure::after { content: ''; flex: 1; height: 1px; background: var(--line); }
  .file-ic { width: 40px; height: 40px; border-radius: var(--radius-sm); background: var(--cloro-soft); color: var(--cloro); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .file-txt { flex-grow: 1; min-width: 0; }
  .nome { font-size: var(--text-md); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .inline { color: var(--cloro); font-weight: 600; }
  .scegli { height: 44px; padding: 0 var(--space-14); font-size: var(--text-md); }
  .chips { flex-wrap: nowrap; overflow-x: auto; margin: 0 calc(var(--space-20) * -1); padding: var(--space-4) var(--space-20); scrollbar-width: none; }
  .chip { flex-shrink: 0; }
  .riepilogo { display: flex; align-items: center; justify-content: space-between; gap: var(--space-8); flex-wrap: wrap; background: var(--cloro-soft); border-radius: var(--radius-lg); padding: var(--space-12) var(--space-14); }
  .n { font-size: var(--text-2xl); font-weight: 800; }
  .tags { display: flex; gap: var(--space-6); flex-wrap: wrap; }
  .tags .tag { background: var(--surface); }
  .tags .t-warn { background: var(--warn-bg); }
  .doppio { padding: var(--space-14); display: flex; flex-direction: column; gap: var(--space-10); border-color: var(--warn-line); }
  .doppio-tit { font-weight: 700; font-size: var(--text-base); }
  .doppio-row { display: grid; grid-template-columns: 52px 1fr; align-items: center; gap: var(--space-8); }
  .lista { overflow: hidden; }
  .riga { display: flex; align-items: center; gap: var(--space-10); padding: var(--space-8) var(--space-14); min-height: 52px; border-top: 1px solid var(--line-soft); cursor: pointer; }
  .riga:first-child { border-top: none; }
  .riga.evid { background: var(--warn-bg); }
  .riga input { width: 20px; height: 20px; accent-color: var(--cloro); margin: 0; flex-shrink: 0; }
  .riga-main { flex-grow: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .riga-top { display: flex; align-items: center; gap: var(--space-8); }
  .gg { width: 48px; font-size: var(--text-sm); font-weight: 600; flex-shrink: 0; }
  .ora { margin-left: auto; font-size: var(--text-sm); }
  .nota-riga { font-size: var(--text-xs); color: var(--warn); padding-left: 56px; }
  .ore { width: 36px; text-align: right; font-size: var(--text-sm); color: var(--muted); }
  .azioni { display: flex; flex-direction: column; gap: var(--space-10); }
</style>
