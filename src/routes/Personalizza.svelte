<script lang="ts">
  import { dati } from '../lib/dati.svelte';
  import { router } from '../lib/router.svelte';
  import { gcal } from '../lib/gcal/stato.svelte';
  import { AREE, CALENDARIO_DEFAULT, type Area, type Impostazioni, type PersonalizzazioneArea, type Promemoria, type Turno } from '../lib/model';
  import { titoloTurno, testoPromemoria, SEGNAPOSTO, COLORI_GOOGLE } from '../lib/gcal/eventi';
  import EditorPromemoria from '../components/EditorPromemoria.svelte';
  import SceltaColore from '../components/SceltaColore.svelte';
  import Icona from '../components/Icona.svelte';

  /** Bozza di un'area: stringhe sempre presenti per i campi, promemoria solo se personalizzati. */
  interface BozzaArea {
    nome: string;
    breve: string;
    titolo: string;
    luogo: string;
    colore?: string;
    promemoriaPropri: boolean;
    promemoria: Promemoria[];
  }

  const imp = $state.snapshot(dati.impostazioni);
  let cal = $state({ ...imp.calendario, promemoria: [...imp.calendario.promemoria] });
  const bozzaDa = (p: PersonalizzazioneArea = {}): BozzaArea => ({
    nome: p.nome ?? '',
    breve: p.breve ?? '',
    titolo: p.titolo ?? '',
    luogo: p.luogo ?? '',
    colore: p.colore,
    promemoriaPropri: !!p.promemoria,
    promemoria: p.promemoria ? [...p.promemoria] : [...imp.calendario.promemoria],
  });
  let aree = $state(Object.fromEntries(AREE.map((a) => [a.id, bozzaDa(imp.aree[a.id])])) as Record<Area, BozzaArea>);
  let aperta = $state<Area | undefined>();
  let campoModello = $state<'turno' | 'sost'>('turno');
  let confermaReset = $state(false);

  function pulisci(b: BozzaArea): PersonalizzazioneArea {
    const p: PersonalizzazioneArea = {};
    if (b.nome.trim()) p.nome = b.nome.trim();
    if (b.breve.trim()) p.breve = b.breve.trim();
    if (b.titolo.trim()) p.titolo = b.titolo.trim();
    if (b.luogo.trim()) p.luogo = b.luogo.trim();
    if (b.colore) p.colore = b.colore;
    if (b.promemoriaPropri) p.promemoria = b.promemoria;
    return p;
  }

  /** Le impostazioni come sarebbero salvando adesso: servono anche per le anteprime. */
  const risultato = $derived.by((): Impostazioni => {
    const a: Impostazioni['aree'] = {};
    for (const { id } of AREE) {
      const p = pulisci(aree[id]);
      if (Object.keys(p).length) a[id] = p;
    }
    return { ...imp, aree: a, calendario: { ...cal, modelloTurno: cal.modelloTurno.trim(), modelloSost: cal.modelloSost.trim(), luogo: cal.luogo.trim() } };
  });

  const esempio = (area: Area, extra: Partial<Turno> = {}): Turno => ({
    id: 'esempio', data: '2026-10-02', area, postazione: area === 'atrio' || area === 'altro' ? undefined : 2, inizio: 900, fine: 1200, origine: 'import', ...extra,
  });
  const anteprima = (area: Area, extra: Partial<Turno> = {}) => titoloTurno(esempio(area, extra), risultato);

  function inserisci(chiave: string) {
    if (campoModello === 'turno') cal.modelloTurno = `${cal.modelloTurno.trimEnd()} ${chiave}`.trimStart();
    else cal.modelloSost = `${cal.modelloSost.trimEnd()} ${chiave}`.trimStart();
  }

  function riepilogoPromemoria(p: Promemoria[]) {
    if (!p.length) return 'nessun promemoria';
    return p.map((x) => `${testoPromemoria(x.minuti).toLowerCase()}${x.metodo === 'email' ? ' (email)' : ''}`).join(', ');
  }
  const nomeColore = (id?: string) => COLORI_GOOGLE.find((c) => c.id === id)?.nome;

  function ripristina() {
    if (!confermaReset) return (confermaReset = true);
    cal = { ...CALENDARIO_DEFAULT, promemoria: [...CALENDARIO_DEFAULT.promemoria] };
    aree = Object.fromEntries(AREE.map((a) => [a.id, bozzaDa()])) as Record<Area, BozzaArea>;
    for (const id of Object.keys(aree) as Area[]) aree[id].promemoria = [...CALENDARIO_DEFAULT.promemoria];
    confermaReset = false;
  }

  async function salva() {
    await dati.setImpostazioni(risultato);
    router.indietro('#/impostazioni');
  }
</script>

<section class="page">
  <header class="bar">
    <button class="link" onclick={() => router.indietro('#/impostazioni')}>Annulla</button>
    <h1>Personalizza</h1>
    <span></span>
  </header>

  <p class="muted small nomargin">
    Come si chiamano i turni nell'app e come compaiono su Google Calendar.
    {gcal.collegato ? 'Salvando, anche gli eventi già creati vengono aggiornati.' : ''}
  </p>

  <h2 class="lbl sez">Eventi del calendario</h2>
  <div class="card box">
    <div class="field">
      <span class="lbl" id="lbl-titolo">Titolo degli eventi</span>
      <div class="seg due" role="group" aria-labelledby="lbl-titolo">
        <button aria-pressed={cal.modoTitolo === 'area'} onclick={() => (cal.modoTitolo = 'area')}>Un nome per area</button>
        <button aria-pressed={cal.modoTitolo === 'modello'} onclick={() => (cal.modoTitolo = 'modello')}>Modello</button>
      </div>
      {#if cal.modoTitolo === 'area'}
        <p class="muted small nomargin">Scegli il titolo di ogni area qui sotto, in «Aree» (es. «Leone 🔽»). Le aree senza titolo usano il modello.</p>
      {:else}
        <p class="muted small nomargin">Lo stesso modello per tutte le aree. Tocca un segnaposto per aggiungerlo al campo che stai modificando.</p>
      {/if}
    </div>

    {#if cal.modoTitolo === 'modello'}
      <label class="field"><span class="lbl">Turni</span>
        <input class="inp" bind:value={cal.modelloTurno} onfocus={() => (campoModello = 'turno')} placeholder={CALENDARIO_DEFAULT.modelloTurno} /></label>
      <label class="field"><span class="lbl">Sostituzioni</span>
        <input class="inp" bind:value={cal.modelloSost} onfocus={() => (campoModello = 'sost')} placeholder={CALENDARIO_DEFAULT.modelloSost} /></label>
      <div class="chips">
        {#each SEGNAPOSTO as s (s.chiave)}
          <button class="chip m" title={s.descrizione} aria-label="Aggiungi {s.chiave}: {s.descrizione}" onclick={() => inserisci(s.chiave)}>{s.chiave}</button>
        {/each}
      </div>
    {/if}

    <div class="anteprima">
      <span class="lbl">Anteprima</span>
      <ul>
        <li><span class="tag t-maschile">{anteprima('maschile')}</span></li>
        <li><span class="tag t-atrio">{anteprima('atrio')}</span></li>
        <li><span class="tag t-piccoli">{anteprima('piccoli', { sostituisce: 'Greta' })}</span><span class="muted small">sostituzione</span></li>
      </ul>
    </div>

    <div class="sep"></div>

    <label class="field"><span class="lbl">Luogo</span>
      <input class="inp" bind:value={cal.luogo} placeholder="es. Via Leone XIII 20, Milano" autocomplete="street-address" /></label>
    <p class="muted small nomargin">Con un indirizzo completo, Google Calendar mostra la mappa e il tempo per arrivarci.</p>

    <div class="field">
      <span class="lbl">Colore</span>
      <SceltaColore bind:valore={cal.colore} vuoto="Colore del calendario" etichetta="Colore degli eventi" />
    </div>

    <div class="field">
      <span class="lbl">Promemoria</span>
      <EditorPromemoria bind:valore={cal.promemoria} etichetta="Promemoria predefiniti" />
    </div>
  </div>

  <h2 class="lbl sez">Aree</h2>
  <p class="muted small nomargin">Ogni area può avere nome, titolo, luogo, colore e promemoria suoi. I campi vuoti seguono i predefiniti.</p>

  {#each AREE as a (a.id)}
    {@const b = aree[a.id]}
    <div class="card area">
      <button class="area-head focus-inset" aria-expanded={aperta === a.id} onclick={() => (aperta = aperta === a.id ? undefined : a.id)}>
        <span class="tag t-{a.id}">{b.breve.trim() || a.breve}</span>
        <span class="area-info">
          <span class="area-nome">{b.nome.trim() || a.nome}</span>
          <span class="muted small">
            {anteprima(a.id)}{nomeColore(b.colore) ? ` · ${nomeColore(b.colore)}` : ''}{b.promemoriaPropri ? ` · ${riepilogoPromemoria(b.promemoria)}` : ''}
          </span>
        </span>
        <Icona nome="giu" class={aperta === a.id ? 'chev su' : 'chev'} />
      </button>

      {#if aperta === a.id}
        <div class="area-body">
          <div class="due-col">
            <label class="field"><span class="lbl">Nome nell'app</span>
              <input class="inp" bind:value={b.nome} placeholder={a.nome} /></label>
            <label class="field"><span class="lbl">Nome breve</span>
              <input class="inp" bind:value={b.breve} placeholder={a.breve} maxlength="16" /></label>
          </div>

          {#if cal.modoTitolo === 'area'}
            <label class="field"><span class="lbl">Titolo sul calendario</span>
              <input class="inp" bind:value={b.titolo} placeholder={titoloTurno(esempio(a.id), { ...risultato, aree: { ...risultato.aree, [a.id]: { ...risultato.aree[a.id], titolo: undefined } } })} /></label>
            <p class="muted small nomargin">Vale anche per le sostituzioni in quest'area. Accetta i segnaposto, es. «Leone 🔽 {'{postazione}'}».</p>
          {/if}

          <label class="field"><span class="lbl">Luogo</span>
            <input class="inp" bind:value={b.luogo} placeholder={cal.luogo || 'Nessun luogo'} /></label>

          <div class="field">
            <span class="lbl">Colore</span>
            <SceltaColore bind:valore={b.colore} vuoto="Come gli altri eventi" etichetta="Colore degli eventi: {a.nome}" />
          </div>

          <div class="field">
            <label class="riga-switch">
              <span>Promemoria diversi dai predefiniti</span>
              <button class="switch" role="switch" aria-checked={b.promemoriaPropri} aria-label="Promemoria diversi dai predefiniti" onclick={() => { if (!b.promemoriaPropri) b.promemoria = [...cal.promemoria]; b.promemoriaPropri = !b.promemoriaPropri; }}><span></span></button>
            </label>
            {#if b.promemoriaPropri}
              <EditorPromemoria bind:valore={b.promemoria} etichetta="Promemoria: {a.nome}" />
            {:else}
              <p class="muted small nomargin">Come gli altri: {riepilogoPromemoria(cal.promemoria)}.</p>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/each}

  <p class="muted small nomargin">Per un singolo turno puoi scegliere nome e promemoria aprendolo dal calendario dell'app.</p>

  <div class="azioni">
    <button class="btn btn-primary" onclick={salva}>Salva</button>
    <button class="btn btn-secondary" onclick={ripristina}>{confermaReset ? 'Tocca di nuovo per tornare ai predefiniti' : 'Torna ai valori predefiniti'}</button>
  </div>
</section>

<style>
  .bar { display: grid; grid-template-columns: 80px 1fr 80px; align-items: center; min-height: 44px; }
  h1 { margin: 0; text-align: center; font-size: var(--text-lg); font-weight: 700; }
  .sez { margin: var(--space-8) 0 calc(var(--space-6) * -1); }
  .box { padding: var(--space-16); display: flex; flex-direction: column; gap: var(--space-14); }
  .seg.due { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sep { height: 1px; background: var(--line-soft); }
  .anteprima ul { list-style: none; margin: var(--space-8) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-6); }
  .anteprima li { display: flex; align-items: center; gap: var(--space-8); min-width: 0; }
  .anteprima .tag { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .area { overflow: hidden; }
  .area-head { width: 100%; min-height: 64px; display: flex; align-items: center; gap: var(--space-12); padding: var(--space-10) var(--space-12) var(--space-10) var(--space-14); background: none; border: none; color: var(--ink); text-align: left; cursor: pointer; }
  .area-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .area-info .small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .area-nome { font-weight: 600; }
  .area-head :global(.chev) { color: var(--chevron); width: 20px; height: 20px; transition: transform 0.15s; }
  .area-head :global(.chev.su) { transform: rotate(180deg); }
  .area-body { display: flex; flex-direction: column; gap: var(--space-14); padding: var(--space-4) var(--space-16) var(--space-16); border-top: 1px solid var(--line-soft); padding-top: var(--space-14); }
  .due-col { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: var(--space-10); }
  .riga-switch { display: flex; align-items: center; justify-content: space-between; gap: var(--space-12); font-size: var(--text-base); font-weight: 500; cursor: pointer; min-height: 44px; }
  .azioni { display: flex; flex-direction: column; gap: var(--space-8); margin-top: var(--space-4); }
</style>
