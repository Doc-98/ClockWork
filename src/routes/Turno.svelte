<script lang="ts">
  import { untrack } from 'svelte';
  import { dati } from '../lib/dati.svelte';
  import { router, type Rotta } from '../lib/router.svelte';
  import { AREE, daHHMM, type Promemoria, hhmm, isoDa, dataDa, notaSostituzione, nuovoId, nomeArea, breveArea, oreDi, segnaModifica, nomeMansione, MANSIONE_ASSISTENTE, type Area, type Turno } from '../lib/model';
  import { turniDelGiornoDalFile } from '../lib/turni/importa';
  import { normalizzaNome } from '../lib/turni/parse';
  import { formatOre, oreInParole } from '../lib/ore';
  import Icona from '../components/Icona.svelte';
  import EditorPromemoria from '../components/EditorPromemoria.svelte';
  import { titoloTurno, promemoriaDi, testoPromemoria } from '../lib/gcal/eventi';
  import { gcal } from '../lib/gcal/stato.svelte';

  let { rotta }: { rotta: Extract<Rotta, { nome: 'turno' }> } = $props();
  // La schermata viene ricreata a ogni cambio di rotta (vedi {#key} in App): qui basta il valore iniziale.
  const r = untrack(() => rotta);

  const esistente = dati.turni.find((t) => t.id === r.id);
  const nuovo = !esistente;

  let data = $state(esistente?.data ?? r.data ?? isoDa(new Date()));
  // Mansione (colonna del foglio ore): quella del turno, altrimenti la prima delle tue
  const imp = dati.impostazioni;
  let mansione = $state(esistente?.mansione ?? (imp.profilo === 'istruttore' ? imp.mansioni[0]?.col : undefined) ?? MANSIONE_ASSISTENTE);
  const opzioniMansione = $derived([...new Set([...imp.mansioni.map((m) => m.col), mansione])]);
  // La scelta serve se hai più mansioni (o una che non è quella degli assistenti); i turni del foglio sono da assistente
  const sceltaMansione = $derived(esistente?.origine !== 'import' && (imp.mansioni.length > 1 || mansione !== MANSIONE_ASSISTENTE));
  // Aree (spogliatoi, atrio) solo per gli assistenti spogliatoio
  const conAree = $derived(mansione === MANSIONE_ASSISTENTE);
  // Ripetizione: solo per un turno nuovo
  let ripeti = $state(false);
  let finoAl = $state('');
  let area = $state<Area>(esistente?.area ?? (imp.profilo === 'istruttore' ? 'altro' : 'maschile'));
  let postazione = $state<number | undefined>(esistente?.postazione);
  let inizio = $state(esistente ? hhmm(esistente.inizio).padStart(5, '0') : '');
  let fine = $state(esistente ? hhmm(esistente.fine).padStart(5, '0') : '');
  let sost = $state(esistente ? !!esistente.sostituisce : r.tipo === 'sost');
  let sostituisce = $state(esistente?.sostituisce ?? '');
  let nota = $state(esistente?.nota ?? '');
  // La nota automatica segue la sostituzione finché non la scrivi tu: per un turno salvato,
  // solo se era vuota o era ancora quella automatica
  const notaEraAuto = !!esistente?.sostituisce && esistente.nota === notaSostituzione(esistente.sostituisce, esistente.area);
  let notaToccata = $state(!!esistente?.nota && !notaEraAuto);
  let annullato = $state(!!esistente?.annullato);
  let nomeTurno = $state(esistente?.nome ?? '');
  let promemoriaPropri = $state(!!esistente?.promemoria);
  let promemoria = $state<Promemoria[]>(esistente?.promemoria ? [...esistente.promemoria] : []);
  let errore = $state('');
  let confermaElimina = $state(false);
  let suggerimento = $state('');

  // Chi era in turno quel giorno secondo il foglio (per precompilare la sostituzione)
  const colleghi = $derived.by(() => {
    const u = dati.ultimaImportazione;
    if (!u || !data) return [];
    const miei = new Set(dati.impostazioni.alias.map(normalizzaNome));
    try {
      return turniDelGiornoDalFile(u.bytes, data).filter((t) => !miei.has(normalizzaNome(t.nome)));
    } catch {
      return [];
    }
  });
  const nomiColleghi = $derived([...new Map(colleghi.map((c) => [normalizzaNome(c.nome), c.nome])).values()]);

  function scegliCollega(nome: string) {
    sostituisce = nome;
    const t = colleghi.find((c) => normalizzaNome(c.nome) === normalizzaNome(nome));
    if (t) {
      area = t.area;
      postazione = t.postazione;
      inizio = hhmm(t.inizio).padStart(5, '0');
      fine = hhmm(t.fine).padStart(5, '0');
      suggerimento = `Nel foglio turni ${t.nome} è in ${nomeArea(t.area, dati.impostazioni).toLowerCase()}${t.postazione ? `, postazione ${t.postazione}` : ''}, ${hhmm(t.inizio)}–${hhmm(t.fine)}${t.orarioDoppio ? ' (orario doppio: controlla)' : ''}. Ho compilato area e orario.`;
    } else suggerimento = '';
  }

  // «sost greta spogl piccoli» per gli assistenti; per le altre mansioni il nome della mansione
  const notaAuto = $derived(
    !sost || !sostituisce.trim() ? '' : conAree ? notaSostituzione(sostituisce, area) : `sost ${sostituisce.trim().toLowerCase()} ${nomeMansione(mansione, imp).toLowerCase()}`,
  );
  $effect(() => {
    if (!notaToccata) nota = notaAuto;
  });

  const minIni = $derived(daHHMM(inizio));
  const minFin = $derived(daHHMM(fine));
  const ore = $derived(minIni !== null && minFin !== null && minFin > minIni ? oreDi({ inizio: minIni, fine: minFin }) : null);

  // Come si chiamerebbe il turno senza un nome suo, e quali promemoria erediterebbe
  const bozza = $derived<Turno>({
    id: 'bozza', data, area: conAree ? area : 'altro', postazione: area === 'altro' || !conAree ? undefined : postazione, inizio: minIni ?? 0, fine: minFin ?? 0, origine: 'manuale',
    mansione: mansione === MANSIONE_ASSISTENTE ? undefined : mansione,
    sostituisce: sost && sostituisce.trim() ? sostituisce.trim() : undefined,
  });
  const titoloAuto = $derived(titoloTurno(bozza, dati.impostazioni));
  const promemoriaEreditati = $derived(promemoriaDi(bozza, dati.impostazioni));
  const testoEreditati = $derived(
    promemoriaEreditati.length ? promemoriaEreditati.map((p) => `${testoPromemoria(p.minuti).toLowerCase()}${p.metodo === 'email' ? ' (email)' : ''}`).join(', ') : 'nessun promemoria',
  );
  function attivaPromemoria() {
    if (!promemoriaPropri) promemoria = [...promemoriaEreditati];
    promemoriaPropri = !promemoriaPropri;
  }

  const GIORNI_SETT = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const titolo = nuovo ? (r.tipo === 'sost' ? 'Nuova sostituzione' : 'Nuovo turno') : esistente!.sostituisce ? 'Sostituzione' : esistente!.origine === 'import' ? 'Turno dal foglio' : 'Turno';

  // «Salva» si accende solo quando c'è qualcosa da salvare (e di valido)
  const statoForm = () => JSON.stringify({ data, mansione, ripeti, finoAl, area, postazione, inizio, fine, sost, sostituisce: sostituisce.trim(), nota: nota.trim(), annullato, nomeTurno: nomeTurno.trim(), promemoriaPropri, promemoria });
  const iniziale = statoForm();
  const cambiato = $derived(statoForm() !== iniziale);
  // Le date della ripetizione: ogni 7 giorni da quella scelta fino al «fino al» compreso (al massimo un anno)
  const date = $derived.by(() => {
    if (!nuovo || !ripeti || !data || !finoAl || finoAl < data) return data ? [data] : [];
    const out: string[] = [];
    for (let d = dataDa(data); isoDa(d) <= finoAl && out.length < 53; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) out.push(isoDa(d));
    return out;
  });
  const valido = $derived(!!data && ore !== null && (!sost || !!sostituisce.trim()) && (!ripeti || !nuovo || (!!finoAl && finoAl > data)));
  const salvabile = $derived(valido && (nuovo || cambiato));
  const erroreOrario = $derived(minIni !== null && minFin !== null && minFin <= minIni ? 'La fine deve essere dopo l’inizio.' : '');

  // Nota, nome e promemoria stanno in «Altro»: aperto se il turno ne ha già
  let altro = $state(!!(esistente?.nome || esistente?.promemoria || (esistente?.nota && !esistente.sostituisce)));
  const riassuntoAltro = $derived(
    [nota.trim() ? `Nota: ${nota.trim()}` : '', nomeTurno.trim() ? `Nome: ${nomeTurno.trim()}` : '', promemoriaPropri ? 'promemoria suoi' : `promemoria: ${testoEreditati}`, annullato ? 'annullato' : '']
      .filter(Boolean).join(' · '),
  );

  function salva() {
    errore = '';
    if (!salvabile || minIni === null || minFin === null) return;
    const base: Turno = esistente ? { ...$state.snapshot(esistente) } : { id: nuovoId(), data, area, inizio: minIni, fine: minFin, origine: 'manuale' };
    const t: Turno = {
      ...base,
      data,
      area: conAree ? area : 'altro',
      postazione: area === 'altro' || !conAree ? undefined : postazione,
      mansione: mansione === MANSIONE_ASSISTENTE ? undefined : mansione,
      inizio: minIni,
      fine: minFin,
      sostituisce: sost ? sostituisce.trim() : undefined,
      nota: nota.trim() || undefined,
      annullato: annullato || undefined,
      nome: nomeTurno.trim() || undefined,
      promemoria: promemoriaPropri ? $state.snapshot(promemoria) : undefined,
    };
    if (esistente) dati.salvaTurno(segnaModifica($state.snapshot(esistente) as Turno, t));
    else if (date.length > 1) {
      // Ogni settimana: un turno per data, legati dallo stesso id di serie
      const serie = nuovoId();
      dati.setTurni([...dati.turni, ...date.map((d) => ({ ...t, id: nuovoId(), data: d, serie }))]);
    } else dati.salvaTurno(t);
    router.indietro(`#/mese/${data.slice(0, 7)}?g=${data}`);
  }

  function elimina() {
    if (!esistente) return;
    if (!confermaElimina) {
      confermaElimina = true;
      return;
    }
    dati.eliminaTurno(esistente.id);
    router.indietro(`#/mese/${esistente.data.slice(0, 7)}`);
  }
</script>

<section class="page">
  <header class="bar">
    <button class="link" onclick={() => router.indietro('#/mese')}>Annulla</button>
    <h1>{titolo}</h1>
    <button class="link" disabled={!salvabile} onclick={salva}>Salva</button>
  </header>

  {#if esistente?.origine === 'import'}
    <p class="muted small nomargin">
      Viene dal foglio turni. Se ne cambi giorno, area o orario o lo annulli, gli aggiornamenti dal foglio lo lasceranno com'è.
    </p>
  {/if}

  <div class="seg tipo" role="group" aria-label="Tipo">
    <button aria-pressed={!sost} onclick={() => (sost = false)}>Turno</button>
    <button aria-pressed={sost} onclick={() => (sost = true)}>Sostituzione</button>
  </div>
  {#if esistente?.origine === 'import' && sost && !esistente.sostituisce}
    <p class="muted small nomargin">Lo segno come sostituzione e lo conto così nel foglio ore e nello Storico. Il foglio turni potrà continuare ad aggiornarne l'orario.</p>
  {/if}

  <label class="field">
    <span class="lbl">Giorno</span>
    <input class="inp" type="date" bind:value={data} />
  </label>

  {#if nuovo}
    <div class="field">
      <span class="lbl" id="lbl-ripeti">Quante volte</span>
      <div class="seg due-seg" role="group" aria-labelledby="lbl-ripeti">
        <button aria-pressed={!ripeti} onclick={() => (ripeti = false)}>Una volta</button>
        <button aria-pressed={ripeti} onclick={() => (ripeti = true)}>Ogni settimana</button>
      </div>
      {#if ripeti}
        <label class="field"><span class="lbl">Fino al</span>
          <input class="inp" type="date" bind:value={finoAl} min={data} /></label>
        <p class="muted small nomargin">{date.length > 1 ? `Creo ${date.length} turni, uno ogni ${GIORNI_SETT[dataDa(data).getDay()]}: poi li modifichi uno per uno.` : 'Scegli fino a quando si ripete.'}</p>
      {/if}
    </div>
  {/if}

  {#if sceltaMansione}
    <label class="field">
      <span class="lbl">Mansione</span>
      <select class="inp" bind:value={mansione}>
        {#each opzioniMansione as col (col)}
          <option value={col}>{nomeMansione(col, imp)}</option>
        {/each}
      </select>
    </label>
  {/if}

  {#if sost}
    <div class="field">
      <label class="lbl" for="chi">Chi sostituisci</label>
      {#if nomiColleghi.length}
        <div class="chips">
          {#each nomiColleghi as n (n)}
            <button class="chip" aria-pressed={normalizzaNome(n) === normalizzaNome(sostituisce)} onclick={() => scegliCollega(n)}>{n}</button>
          {/each}
        </div>
      {/if}
      <input id="chi" class="inp" bind:value={sostituisce} placeholder={nomiColleghi.length ? 'Oppure scrivi il nome' : 'Nome del collega'} oninput={() => (suggerimento = '')} />
      {#if suggerimento}
        <div class="hint"><Icona nome="check" /><span>{suggerimento}</span></div>
      {/if}
    </div>
  {/if}

  {#if conAree}
  <div class="field">
    <span class="lbl">Area</span>
    <div class="seg aree">
      {#each AREE as a (a.id)}
        <button aria-pressed={area === a.id} onclick={() => (area = a.id)}>{breveArea(a.id, dati.impostazioni)}</button>
      {/each}
    </div>
  </div>
  {/if}

  <div class="field">
    <span class="lbl">Orario</span>
    <div class="due">
      <input class="inp m" type="time" bind:value={inizio} aria-label="Inizio" />
      <input class="inp m" type="time" bind:value={fine} aria-label="Fine" />
    </div>
    <div class="durata"><span class="muted">Nel foglio ore</span><span class="m">{ore !== null ? (Number.isInteger(ore) ? `${formatOre(ore)} h` : `${formatOre(ore)} h · ${oreInParole(ore)}`) : '—'}</span></div>
    {#if erroreOrario}<p class="msg err">{erroreOrario}</p>{/if}
  </div>

  <div class="card voci">
    <button class="voce" aria-expanded={altro} onclick={() => (altro = !altro)}>
      <span class="voce-txt">
        <span class="voce-nome"><b>Altro</b></span>
        {#if !altro}<span class="voce-val"><span>{riassuntoAltro}</span></span>{/if}
      </span>
      <Icona nome="giu" class="chev" />
    </button>
    {#if altro}
      <div class="voce-corpo">
        <label class="field">
          <span class="lbl">Nota nel foglio ore (colonna R)</span>
          <input class="inp" bind:value={nota} oninput={() => (notaToccata = true)} placeholder={sost ? 'es. sost greta spogl piccoli' : 'facoltativa'} />
        </label>
        <div class="field">
          <label class="lbl" for="nome-turno">Nome del turno</label>
          <input id="nome-turno" class="inp" bind:value={nomeTurno} placeholder={titoloAuto} />
          <p class="muted small nomargin">Lo vedi nell'app{gcal.collegato ? ' e come titolo su Google Calendar' : ' e come titolo nel calendario'}. Vuoto: «{titoloAuto}».</p>
        </div>
        <div class="field">
          <label class="riga-switch">
            <span>Promemoria solo per questo turno</span>
            <button class="switch" role="switch" aria-checked={promemoriaPropri} aria-label="Promemoria solo per questo turno" onclick={attivaPromemoria}><span></span></button>
          </label>
          {#if promemoriaPropri}
            <EditorPromemoria bind:valore={promemoria} etichetta="Promemoria di questo turno" />
          {:else}
            <p class="muted small nomargin">Come gli altri: {testoEreditati}.</p>
          {/if}
        </div>
        {#if esistente}
          <label class="riga-switch">
            <span>Annullato, non conta nelle ore</span>
            <button class="switch" role="switch" aria-checked={annullato} aria-label="Annullato" onclick={() => (annullato = !annullato)}><span></span></button>
          </label>
        {/if}
      </div>
    {/if}
  </div>

  {#if errore}<p class="msg err" role="alert">{errore}</p>{/if}

  {#if esistente?.origine === 'manuale'}
    <button class="btn btn-danger" onclick={elimina}>{confermaElimina ? 'Tocca di nuovo per eliminare' : 'Elimina'}</button>
  {/if}
</section>

<style>
  .tipo, .due-seg { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .aree { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .aree button { font-size: var(--text-xs); }
  .durata { display: flex; justify-content: space-between; font-size: var(--text-sm); }
  .durata .m { font-weight: 600; }
</style>
