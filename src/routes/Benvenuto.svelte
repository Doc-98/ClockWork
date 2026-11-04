<script lang="ts">
  import { dati } from '../lib/dati.svelte';
  import { fonte } from '../lib/turni/fonte.svelte';
  import { FoglioNonRaggiungibile } from '../lib/turni/remoto';
  import { MESI } from '../lib/foglio/genera';
  import { router } from '../lib/router.svelte';
  import Icona from '../components/Icona.svelte';
  import EditorMansioni from '../components/EditorMansioni.svelte';
  import { MANSIONE_ASSISTENTE, type Mansione, type Profilo } from '../lib/model';

  // Assistente: turni dal foglio turni; istruttore: turni a mano, con le sue mansioni
  let profilo = $state<Profilo>(dati.impostazioni.profilo);
  const assistente = $derived(profilo === 'assistente');
  let mansioni = $state<Mansione[]>(
    dati.impostazioni.profilo === 'istruttore' ? dati.impostazioni.mansioni : [],
  );

  let nome = $state(dati.impostazioni.nome);
  let alias = $state(dati.impostazioni.alias.join(', '));
  let aliasToccato = $state(!!dati.impostazioni.alias.length);
  // Il nome nel foglio turni parte dal primo nome; lo cambi se lì sei scritto diversamente
  $effect(() => {
    const primo = nome.trim().split(/\s+/)[0] ?? '';
    if (!aliasToccato) alias = primo;
  });
  const aliasLista = $derived(alias.split(',').map((s) => s.trim()).filter(Boolean));
  const passo1 = $derived(nome.trim().split(/\s+/).length >= 2 && (!assistente || aliasLista.length > 0));
  // Solo il nome (una parola): avviso perché serve anche il cognome
  // L'avviso compare solo dopo che hai lasciato il campo, non mentre scrivi
  let nomeLasciato = $state(false);
  const soloNome = $derived(nomeLasciato && nome.trim() !== '' && nome.trim().split(/\s+/).length < 2);
  const passo2Istruttore = $derived(mansioni.length > 0);
  const pronto = $derived(passo1 && (assistente || passo2Istruttore));

  let link = $state('');
  let errore = $state('');
  let esito = $state('');

  async function collega() {
    errore = '';
    if (!aliasLista.length) return (errore = 'Prima scrivi come compari nel foglio turni.');
    // Il nome serve per trovare i tuoi turni nel foglio
    await dati.setImpostazioni({ ...dati.impostazioni, alias: aliasLista });
    try {
      const f = await fonte.collega(link);
      const piano = await fonte.controlla(true);
      fonte.chiudiAvviso();
      const oggi = new Date();
      const mese = piano?.find((m) => m.year === oggi.getFullYear() && m.month === oggi.getMonth() + 1) ?? piano?.[0];
      esito = mese ? `${f.nomeFile} · ${mese.confermati.length} turni tuoi a ${MESI[mese.month - 1].toLowerCase()}` : f.nomeFile;
      link = '';
    } catch (e) {
      errore = e instanceof FoglioNonRaggiungibile ? e.message : 'Non riesco a leggere il foglio: è quello dei turni?';
    }
  }

  async function inizia() {
    if (!pronto) return;
    await dati.setImpostazioni({
      ...dati.impostazioni,
      nome: nome.trim(),
      profilo,
      alias: assistente ? aliasLista : dati.impostazioni.alias,
      // L'assistente parte dalla sua mansione (colonna Q); l'istruttore da quelle che ha scelto
      mansioni: assistente
        ? dati.impostazioni.mansioni.some((m) => m.col === MANSIONE_ASSISTENTE) ? dati.impostazioni.mansioni : [{ col: MANSIONE_ASSISTENTE, tariffa: 9 }]
        : mansioni,
    });
    router.vai('#/', true);
  }
</script>

<section class="page">
  <div class="testa">
    <img class="logo" src="favicon.svg" alt="" width="64" height="64" />
    <div>
      <div class="lbl">Benvenuto in ClockWork</div>
      <h1 class="page-title">Due cose e sei pronto</h1>
    </div>
  </div>

  <div class="field">
    <span class="lbl" id="lbl-profilo">Il tuo ruolo principale</span>
    <div class="seg profilo" role="group" aria-labelledby="lbl-profilo">
      <button aria-pressed={assistente} onclick={() => (profilo = 'assistente')}>Assistente spogliatoio</button>
      <button aria-pressed={!assistente} onclick={() => (profilo = 'istruttore')}>Istruttore</button>
    </div>
    <p class="muted small nomargin">{assistente
      ? 'Prendo i tuoi turni dal foglio turni della società.'
      : 'Inserisci i tuoi turni a mano; il foglio ore lo compilo io.'} È il ruolo proposto quando aggiungi un turno: se fai anche altro, aggiungi le altre mansioni {assistente ? 'dalle impostazioni' : 'qui sotto'} e le scegli turno per turno.</p>
  </div>

  <div class="card step" class:done={passo1}>
    <div class="n">{#if passo1}<Icona nome="check" />{:else}1{/if}</div>
    <div class="body">
      <h2>Come ti chiami</h2>
      <label class="field"><span class="lbl">Nome e cognome</span>
        <input class="inp" bind:value={nome} placeholder="es. Mario Rossi" autocomplete="name" onblur={() => (nomeLasciato = true)} /></label>
      {#if soloNome}
        <p class="msg err nomargin" role="alert">Scrivi nome e cognome: li riporto così in testa al foglio ore di ogni mese.</p>
      {:else}
        <p class="muted small">Va in testa al foglio ore di ogni mese, quindi servono nome e cognome.</p>
      {/if}
      {#if assistente}
        <label class="field"><span class="lbl">Nel foglio turni compari come</span>
          <input class="inp" bind:value={alias} oninput={() => (aliasToccato = true)} placeholder="es. Mario" /></label>
        <p class="muted small">Se usano più varianti, separale con una virgola.</p>
      {/if}
    </div>
  </div>

  {#if !assistente}
    <div class="card step" class:done={passo2Istruttore}>
      <div class="n">{#if passo2Istruttore}<Icona nome="check" />{:else}2{/if}</div>
      <div class="body">
        <h2>Le tue mansioni</h2>
        <p class="muted small">Scegli cosa fai alla Leone e quanto ti pagano all'ora. Le ore di ogni turno le metto io al posto giusto nel foglio ore.</p>
        <EditorMansioni {mansioni} salva={(m) => (mansioni = m)} />
      </div>
    </div>
  {:else}
  <div class="card step" class:done={!!fonte.stato}>
    <div class="n">{#if fonte.stato}<Icona nome="check" />{:else}2{/if}</div>
    <div class="body">
      <h2>Il foglio turni<span class="facoltativo">facoltativo</span></h2>
      {#if fonte.stato}
        <p class="muted small">{esito || fonte.stato.nome}</p>
      {:else if !fonte.chiave}
        <p class="muted small">Potrai caricare il file del foglio turni dalle impostazioni.</p>
      {:else}
        <p class="muted small">Incolla il link del foglio condiviso dalla società: da lì prendo i tuoi turni, ogni mese.</p>
        <input class="inp" type="url" bind:value={link} placeholder="https://docs.google.com/spreadsheets/d/…" aria-label="Link del foglio turni" autocomplete="off" />
        <button class="btn btn-secondary" disabled={!link.trim() || fonte.lavoro} onclick={collega}>{fonte.lavoro ? 'Leggo il foglio…' : 'Collega'}</button>
      {/if}
    </div>
  </div>

  {/if}

  {#if errore}<p class="msg err" role="alert">{errore}</p>{/if}

  <button class="btn btn-primary" disabled={!pronto} onclick={inizia}>Inizia</button>
  {#if assistente}<p class="muted small nomargin">Il foglio turni puoi collegarlo anche dopo, dalle impostazioni.</p>{/if}
  <p class="muted small nomargin">Su iPhone: apri questa pagina in Safari, tocca Condividi e poi «Aggiungi alla schermata Home».</p>
</section>

<style>
  .testa { display: flex; flex-direction: column; gap: var(--space-12); }
  .logo { width: 64px; height: 64px; border-radius: 16px; display: block; }
  .step { display: flex; gap: var(--space-14); padding: var(--space-16); }
  .n { width: 30px; height: 30px; border-radius: 50%; background: var(--surface-sunken); color: var(--ink); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: var(--text-sm); flex-shrink: 0; }
  .done .n { background: var(--cloro); color: var(--on-cloro); }
  .n :global(.ic) { width: 16px; height: 16px; stroke-width: 2.6; }
  .body { display: flex; flex-direction: column; gap: var(--space-10); flex-grow: 1; min-width: 0; }
  h2 { margin: 3px 0 0; font-size: var(--text-lg); }
  p { margin: 0; }
  .profilo { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .profilo button { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .facoltativo { font-size: var(--text-xs); font-weight: 600; color: var(--muted); margin-left: var(--space-6); }
</style>
