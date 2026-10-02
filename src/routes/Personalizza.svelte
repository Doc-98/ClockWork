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

  // «Salva» si accende solo quando le impostazioni salvate cambierebbero
  const stabile = (v: unknown) =>
    JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
  const cambiato = $derived(stabile(risultato) !== stabile(imp));

  /** Una voce aperta alla volta: 'titolo', 'luogo', 'colore', 'promemoria' o un'area */
  let voce = $state<string | undefined>();
  const apri = (v: string) => (voce = voce === v ? undefined : v);

  const ESEMPI: { area: Area; extra?: Partial<Turno>; ora: string }[] = [
    { area: 'maschile', ora: '16:30' },
    { area: 'femminile', ora: '16:00' },
    { area: 'atrio', ora: '15:30' },
    { area: 'piccoli', extra: { sostituisce: 'Greta' }, ora: '9:00' },
  ];
  const coloreEsempio = (area: Area) => COLORI_GOOGLE.find((c) => c.id === (risultato.aree[area]?.colore || risultato.calendario.colore))?.hex;

  async function salva() {
    if (!cambiato) return;
    await dati.setImpostazioni(risultato);
    router.indietro('#/impostazioni');
  }
</script>

<section class="page">
  <header class="bar">
    <button class="link" onclick={() => router.indietro('#/impostazioni')}>Annulla</button>
    <h1>Personalizza calendario</h1>
    <button class="link" disabled={!cambiato} onclick={salva}>Salva</button>
  </header>

  <p class="muted small nomargin">
    Come compaiono i turni su Google Calendar.{gcal.collegato ? ' Salvando aggiorno anche gli eventi già creati.' : ''}
  </p>

  <section class="card anteprima" aria-label="Anteprima">
    <span class="lbl">Come sarà sul calendario</span>
    {#each ESEMPI as e (e.area)}
      <div class="evento">
        <span class="m ora">{e.ora}</span>
        <span class="pallino" class:vuoto={!coloreEsempio(e.area)} style="background: {coloreEsempio(e.area) ?? 'transparent'}"></span>
        <span class="t">{anteprima(e.area, e.extra)}</span>
      </div>
    {/each}
  </section>

  <section class="gruppo">
    <h2 class="lbl">Struttura eventi</h2>
    <div class="card voci">
      <div>
        <button class="voce" aria-expanded={voce === 'titolo'} onclick={() => apri('titolo')}>
          <span class="voce-txt"><span class="voce-nome">Forma del titolo</span>{#if voce !== 'titolo'}<span class="voce-val"><span>{cal.modoTitolo === 'area' ? 'Per area' : `Tag: ${cal.modelloTurno || CALENDARIO_DEFAULT.modelloTurno}`}</span></span>{/if}</span>
          <Icona nome="giu" class="chev" />
        </button>
        {#if voce === 'titolo'}
          <div class="voce-corpo">
            <div class="seg due" role="group" aria-label="Forma del titolo">
              <button aria-pressed={cal.modoTitolo === 'area'} onclick={() => (cal.modoTitolo = 'area')}>Per area</button>
              <button aria-pressed={cal.modoTitolo === 'modello'} onclick={() => (cal.modoTitolo = 'modello')}>Tag</button>
            </div>
            {#if cal.modoTitolo === 'area'}
              <p class="muted small nomargin">Scorri verso il basso per personalizzare le varie aree.</p>
            {:else}
              <label class="field"><span class="lbl">Turni</span>
                <input class="inp" bind:value={cal.modelloTurno} onfocus={() => (campoModello = 'turno')} placeholder={CALENDARIO_DEFAULT.modelloTurno} /></label>
              <label class="field"><span class="lbl">Sostituzioni</span>
                <input class="inp" bind:value={cal.modelloSost} onfocus={() => (campoModello = 'sost')} placeholder={CALENDARIO_DEFAULT.modelloSost} /></label>
              <p class="muted small nomargin">Tocca un tag per aggiungerlo al campo che stai modificando.</p>
              <div class="chips">
                {#each SEGNAPOSTO as s (s.chiave)}
                  <button class="chip m" title={s.descrizione} aria-label="Aggiungi {s.chiave}: {s.descrizione}" onclick={() => inserisci(s.chiave)}>{s.chiave}</button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
      <div>
        <button class="voce" aria-expanded={voce === 'luogo'} onclick={() => apri('luogo')}>
          <span class="voce-txt"><span class="voce-nome">Luogo</span>{#if voce !== 'luogo'}<span class="voce-val"><span>{cal.luogo || 'Nessun luogo'}</span></span>{/if}</span>
          <Icona nome="giu" class="chev" />
        </button>
        {#if voce === 'luogo'}
          <div class="voce-corpo">
            <input class="inp" bind:value={cal.luogo} placeholder="es. Via Leone XIII 20, Milano" autocomplete="street-address" aria-label="Luogo" />
            <p class="muted small nomargin">Con un indirizzo completo, Google Calendar mostra la mappa e il tempo per arrivarci.</p>
          </div>
        {/if}
      </div>
      <div>
        <button class="voce" aria-expanded={voce === 'colore'} onclick={() => apri('colore')}>
          <span class="voce-txt"><span class="voce-nome">Colore</span>{#if voce !== 'colore'}<span class="voce-val"><span class="pallino" class:vuoto={!cal.colore} style="background: {COLORI_GOOGLE.find((c) => c.id === cal.colore)?.hex ?? 'transparent'}"></span><span>{nomeColore(cal.colore) ?? 'Colore del calendario'}</span></span>{/if}</span>
          <Icona nome="giu" class="chev" />
        </button>
        {#if voce === 'colore'}
          <div class="voce-corpo"><SceltaColore bind:valore={cal.colore} vuoto="Colore del calendario" etichetta="Colore degli eventi" /></div>
        {/if}
      </div>
      <div>
        <button class="voce" aria-expanded={voce === 'promemoria'} onclick={() => apri('promemoria')}>
          <span class="voce-txt"><span class="voce-nome">Promemoria</span>{#if voce !== 'promemoria'}<span class="voce-val"><span>{riepilogoPromemoria(cal.promemoria)}</span></span>{/if}</span>
          <Icona nome="giu" class="chev" />
        </button>
        {#if voce === 'promemoria'}
          <div class="voce-corpo"><EditorPromemoria bind:valore={cal.promemoria} etichetta="Promemoria predefiniti" /></div>
        {/if}
      </div>
    </div>
  </section>

  <section class="gruppo">
    <h2 class="lbl">Aree</h2>
    <div class="card voci">
      {#each AREE as a (a.id)}
        {@const b = aree[a.id]}
        <div>
          <button class="voce" aria-expanded={voce === a.id} onclick={() => apri(a.id)}>
            <span class="tag t-{a.id}">{b.breve.trim() || a.breve}</span>
            <span class="voce-txt">
              <span class="voce-nome">{b.nome.trim() || a.nome}</span>
              {#if voce !== a.id}
                <span class="voce-val"><span>{anteprima(a.id)}{nomeColore(b.colore) ? ` · ${nomeColore(b.colore)}` : ''}{b.promemoriaPropri ? ` · ${riepilogoPromemoria(b.promemoria)}` : ''}</span></span>
              {/if}
            </span>
            <Icona nome="giu" class="chev" />
          </button>
          {#if voce === a.id}
            <div class="voce-corpo">
              <div class="due-col">
                <label class="field"><span class="lbl">Nome nell'app</span>
                  <input class="inp" bind:value={b.nome} placeholder={a.nome} /></label>
                <label class="field"><span class="lbl">Nome breve</span>
                  <input class="inp" bind:value={b.breve} placeholder={a.breve} maxlength="16" /></label>
              </div>
              {#if cal.modoTitolo === 'area'}
                <label class="field"><span class="lbl">Titolo sul calendario</span>
                  <input class="inp" bind:value={b.titolo} placeholder={titoloTurno(esempio(a.id), { ...risultato, aree: { ...risultato.aree, [a.id]: { ...risultato.aree[a.id], titolo: undefined } } })} /></label>
                <p class="muted small nomargin">Vale anche per le sostituzioni in quest'area. Accetta i tag, es. «Leone · M {'{postazione}'}».</p>
              {/if}
              <label class="field"><span class="lbl">Luogo</span>
                <input class="inp" bind:value={b.luogo} placeholder={cal.luogo ? `Come gli altri: ${cal.luogo}` : 'Nessun luogo'} /></label>
              <div class="field">
                <span class="lbl">Colore</span>
                <SceltaColore bind:valore={b.colore} vuoto="Come gli altri eventi" etichetta="Colore degli eventi: {a.nome}" />
              </div>
              <div class="field">
                <label class="riga-switch">
                  <span>Promemoria diversi dagli altri</span>
                  <button class="switch" role="switch" aria-checked={b.promemoriaPropri} aria-label="Promemoria diversi dagli altri" onclick={() => { if (!b.promemoriaPropri) b.promemoria = [...cal.promemoria]; b.promemoriaPropri = !b.promemoriaPropri; }}><span></span></button>
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
    </div>
  </section>

  <p class="muted small nomargin">Nome e promemoria di un singolo turno si cambiano dal turno stesso.</p>
  <button class="link reset" onclick={ripristina}>{confermaReset ? 'Tocca di nuovo per tornare ai valori predefiniti' : 'Torna ai valori predefiniti'}</button>
</section>

<style>
  .anteprima { display: flex; flex-direction: column; gap: var(--space-10); padding: var(--space-16); }
  .evento { display: flex; align-items: center; gap: var(--space-10); font-size: var(--text-md); min-width: 0; }
  .evento .ora { width: 44px; color: var(--muted); font-size: var(--text-sm); flex-shrink: 0; }
  .evento .t { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pallino { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
  .pallino.vuoto { border: 1.5px dashed var(--line-dashed); }
  .seg.due { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .due-col { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: var(--space-10); }
  .voce .tag { min-width: 76px; justify-content: center; }
  .reset { align-self: center; color: var(--danger); }
</style>
