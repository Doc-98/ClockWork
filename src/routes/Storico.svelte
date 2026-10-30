<script lang="ts">
  import { dati } from '../lib/dati.svelte';
  import { router } from '../lib/router.svelte';
  import { MESI } from '../lib/foglio/genera';
  import { formatOre, formatEuro, parseOre } from '../lib/ore';
  import { ymOggi, ymStr } from '../lib/vista.svelte';
  import {
    leggiArchivio, riepilogoMese, riepilogoAnno, ultimiMesi, controlliArchivio, correggiOre, compensoAnno as calcolaCompenso,
    SOGLIA_INPS, SOGLIA_IRPEF, COSTO_CASELLARIO, type Controllo,
  } from '../lib/storico';
  import Icona from '../components/Icona.svelte';

  const oggi = ymStr(ymOggi());
  const anno = ymOggi().year;

  const mesi = $derived(ultimiMesi(oggi).map((ym) => riepilogoMese(ym, dati.turni, dati.archivio, dati.oreManuali)));
  const massimo = $derived(Math.max(10, ...mesi.map((m) => m.ore)));
  const totale12 = $derived(mesi.reduce((s, m) => s + m.ore, 0));
  const sost12 = $derived(mesi.reduce((s, m) => s + m.oreSost, 0));
  const nSost12 = $derived(mesi.reduce((s, m) => s + m.nSost, 0));

  // Le soglie contano i compensi per data di pagamento: il lavoro di dicembre si incassa a gennaio
  const annoSolare = $derived(riepilogoAnno(anno, oggi, dati.turni, dati.archivio, dati.oreManuali));
  const compenso = $derived(calcolaCompenso(annoSolare, dati.impostazioni.tariffa, dati.impostazioni.casellario, dati.turni, dati.archivio, dati.oreManuali));
  const compensoAnno = $derived(compenso.euro);
  /** La barra arriva a 15.000 €, o poco oltre se li hai superati */
  const scala = $derived(Math.max(SOGLIA_IRPEF, compensoAnno * 1.05));
  const pct = (euro: number) => `${Math.min(100, (euro / scala) * 100)}%`;
  const fascia = $derived(compensoAnno <= SOGLIA_INPS ? 'esente' : compensoAnno <= SOGLIA_IRPEF ? 'inps' : 'irpef');

  // Avviso dei mesi senza ore: si chiude con la × e torna solo se cambiano i mesi mancanti
  const chiaveMancanti = $derived(`mancanti|${annoSolare.anno}|${annoSolare.mancanti.join(',')}|${dati.archivio ? 'a' : '-'}`);
  const mostraMancanti = $derived(annoSolare.mancanti.length > 0 && !dati.avvisiChiusi.includes(chiaveMancanti));
  // Come nel Foglio ore: gli importi si vedono solo se li chiedi
  let euroVisibili = $state(false);

  let scelto = $state(oggi);
  const dettaglio = $derived(mesi.find((m) => m.ym === scelto) ?? mesi.at(-1)!);

  const controlli = $derived(dati.archivio ? controlliArchivio(dati.archivio, dati.oreManuali) : []);

  // Ore di un mese inserite a mano: per i mesi senza dati o con il foglio ore sbagliato
  let modifica = $state<string | undefined>();
  let oreInput = $state('');
  const oreNum = $derived(parseOre(oreInput));
  const oreValide = $derived(oreNum !== null && !Number.isNaN(oreNum) && oreNum >= 0 && oreNum <= 400);
  function apriModifica(ym: string) {
    modifica = ym;
    const r = mesi.find((m) => m.ym === ym) ?? riepilogoMese(ym, dati.turni, dati.archivio, dati.oreManuali);
    oreInput = r.fonte === 'nessuna' ? '' : formatOre(r.ore);
  }
  async function salvaOre() {
    if (!modifica || !oreValide) return;
    const ym = modifica;
    await dati.setOreMese(ym, oreNum!);
    modifica = undefined;
    messaggio = `${nomeMese(ym)}: ${formatOre(oreNum!)} h inserite a mano.`;
  }
  async function togliOre(ym: string) {
    await dati.setOreMese(ym, undefined);
    modifica = undefined;
  }

  const BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const meseNum = (ym: string) => Number(ym.slice(5, 7));
  const nomeMese = (ym: string) => `${MESI[meseNum(ym) - 1]} ${ym.slice(0, 4)}`;
  const breve = (ym: string) => `${BREVI[meseNum(ym) - 1]} ${ym.slice(2, 4)}`;
  const iniziale = (ym: string) => MESI[meseNum(ym) - 1][0];

  /** «gen–ago» oppure «dic 25 e feb» */
  function elencoMesi(yms: string[]): string {
    const k = yms.map((ym) => Number(ym.slice(0, 4)) * 12 + meseNum(ym));
    const consecutivi = k.every((x, i) => i === 0 || x === k[i - 1] + 1);
    const anni = new Set(yms.map((ym) => ym.slice(0, 4))).size > 1;
    const b = yms.map((ym) => (anni ? breve(ym) : BREVI[meseNum(ym) - 1]));
    if (b.length > 2 && consecutivi) return `${b[0]}–${b.at(-1)}`;
    return b.length === 1 ? b[0] : `${b.slice(0, -1).join(', ')} e ${b.at(-1)}`;
  }

  // Archivio dei fogli ore
  let messaggio = $state('');
  let errore = $state('');

  async function caricaArchivio(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    messaggio = errore = '';
    try {
      const esito = leggiArchivio(new Uint8Array(await file.arrayBuffer()));
      if (!esito.mesi.length) {
        errore = 'In questo file non trovo fogli ore: cerco la colonna «Assistente spogliatoio nuoto curricolare» con i giorni del mese.';
        return;
      }
      await dati.setArchivio({ nomeFile: file.name, caricatoIl: new Date().toISOString(), mesi: esito.mesi, ignorati: dati.archivio?.ignorati ?? [] });
      const da = breve(esito.mesi[0].ym);
      const a = breve(esito.mesi.at(-1)!.ym);
      messaggio = `Letti ${esito.mesi.length} ${esito.mesi.length === 1 ? 'mese' : 'mesi'}, da ${da} a ${a}.`;
      if (esito.doppi.length) messaggio += ` Ho saltato ${esito.doppi.map((d) => `«${d}»`).join(', ')}: mese già letto da un altro foglio.`;
    } catch {
      errore = 'Non riesco a leggere il file: dev’essere un .xlsx.';
    }
  }

  async function togliArchivio() {
    messaggio = errore = '';
    await dati.setArchivio(undefined);
    messaggio = 'Archivio tolto. I turni di ClockWork restano com’erano.';
  }

  function correggi(c: Extract<Controllo, { tipo: 'minuti' }>) {
    if (!dati.archivio) return;
    return dati.setArchivio(correggiOre(dati.archivio, c.ym, c.day, c.proposta));
  }

  function lascia(c: Controllo) {
    if (!dati.archivio) return;
    return dati.setArchivio({ ...dati.archivio, ignorati: [...dati.archivio.ignorati, c.chiave] });
  }
</script>

{#snippet editorOre(ym: string, togli: boolean)}
  <div class="editor">
    <label class="field"><span class="lbl">Ore lavorate a {MESI[meseNum(ym) - 1].toLowerCase()} {ym.slice(0, 4)}</span>
      <span class="row">
        <input class="inp m grow" bind:value={oreInput} inputmode="decimal" placeholder="es. 48,5 o 48:30"
          onkeydown={(e) => e.key === 'Enter' && salvaOre()} />
        <button class="btn btn-secondary corto" disabled={!oreValide} onclick={salvaOre}>Salva</button>
      </span>
    </label>
    <div class="editor-piede">
      <span class="muted small">Il totale del mese basta: lo uso al posto dell’archivio.</span>
      {#if togli}
        <button class="link small-link" onclick={() => togliOre(ym)}>Togli</button>
      {:else}
        <button class="link small-link" onclick={() => (modifica = undefined)}>Annulla</button>
      {/if}
    </div>
  </div>
{/snippet}

<section class="page">
  <header class="bar">
    <button class="link" onclick={() => router.indietro('#/foglio')}><Icona nome="sx" /> Foglio ore</button>
    <h1>Storico</h1>
    <span></span>
  </header>

  <div class="card anno">
    <div class="riga">
      <span class="lbl">Compensi pagati nel {annoSolare.anno}</span>
      <button class="occhio" aria-pressed={euroVisibili} onclick={() => (euroVisibili = !euroVisibili)}>
        <Icona nome={euroVisibili ? 'occhio-no' : 'occhio'} />
        <span class="sr">{euroVisibili ? 'Nascondi gli importi' : 'Mostra gli importi'}</span>
      </button>
    </div>
    <div class="cifre">
      <span class="d grande">{euroVisibili ? formatEuro(compensoAnno) : '••• €'}</span>
      <span class="m muted">{formatOre(annoSolare.ore)} h</span>
    </div>
    <p class="muted small nomargin">Lavoro da {breve(annoSolare.mesi[0])} a {breve(annoSolare.mesi.at(-1)!)}: ogni mese si incassa il mese dopo.</p>
    {#if euroVisibili}
      <div class="soglie">
        <div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax={SOGLIA_IRPEF} aria-valuenow={Math.round(compensoAnno)} aria-label="Compensi dell'anno rispetto alle soglie">
          <div class="riempi {fascia}" style="width: {pct(compensoAnno)}"></div>
          <span class="tacca" style="left: {pct(SOGLIA_INPS)}"></span>
        </div>
        <div class="etichette m">
          <span style="left: {pct(SOGLIA_INPS)}">5.000</span>
          <span class="fine" style="left: {pct(SOGLIA_IRPEF)}">15.000</span>
        </div>
      </div>
      <p class="small nomargin stato {fascia}">
        {#if fascia === 'esente'}
          Sotto i 5.000 €: niente contributi né tasse · mancano {formatEuro(SOGLIA_INPS - compensoAnno)}
        {:else if fascia === 'inps'}
          Oltre i 5.000 €: contributi INPS sulla parte in più · mancano {formatEuro(SOGLIA_IRPEF - compensoAnno)} ai 15.000
        {:else}
          Oltre i 15.000 €: sulla parte in più anche l’IRPEF
        {/if}
      </p>
      {#if compenso.detrazioni}
        <p class="muted small nomargin">Già tolti {formatEuro(compenso.detrazioni)} del casellario giudiziario.</p>
      {/if}
      <p class="muted small nomargin">Le soglie sommano i compensi sportivi di tutte le società con cui lavori.</p>
    {:else}
      <p class="muted small nomargin">Tocca l’occhio per vedere gli importi e le soglie dei 5.000 e 15.000 €.</p>
    {/if}
    {#if mostraMancanti}
      <div class="mancanti small">
        <p class="nomargin">
          {dati.archivio
            ? `Nessuna ora per ${elencoMesi(annoSolare.mancanti)}: se hai lavorato, mancano anche nell’archivio.`
            : `Non ho le ore di ${elencoMesi(annoSolare.mancanti)}: carica l’archivio qui sotto per avere il totale dell’anno.`}
        </p>
        <button class="chiudi" aria-label="Chiudi l’avviso" onclick={() => dati.chiudiAvviso(chiaveMancanti)}><Icona nome="chiudi" /></button>
      </div>
    {/if}
  </div>

  <div class="card grafico">
    <div class="riga">
      <span class="lbl">Ore per mese</span>
      <span class="m muted small">{breve(mesi[0].ym)} – {breve(mesi.at(-1)!.ym)}</span>
    </div>
    <div class="colonne">
      {#each mesi as m (m.ym)}
        <button class="col" class:sel={m.ym === dettaglio.ym} aria-pressed={m.ym === dettaglio.ym}
          aria-label="{nomeMese(m.ym)}: {m.fonte === 'nessuna' ? 'nessun dato' : `${formatOre(m.ore)} ore, ${m.nSost} sostituzioni`}"
          onclick={() => (scelto = m.ym)}>
          <span class="pila">
            {#if m.fonte === 'nessuna'}
              <span class="vuota"></span>
            {:else}
              <span class="base" class:corrente={m.ym === oggi} style="height: {((m.ore - m.oreSost) / massimo) * 100}%"></span>
              {#if m.oreSost}<span class="sost" style="height: {(m.oreSost / massimo) * 100}%"></span>{/if}
            {/if}
          </span>
          <span class="ml">{iniziale(m.ym)}</span>
          <span class="sn m">{m.nSost || '–'}</span>
        </button>
      {/each}
    </div>
    <div class="legenda">
      <span><i class="q base-c"></i>Turni</span>
      <span><i class="q sost-c"></i>Sostituzioni (n°)</span>
    </div>
    <div class="dettaglio">
      <div class="det-riga">
        <div class="det-txt">
          <span class="det-nome">{nomeMese(dettaglio.ym)}</span>
          <span class="muted small">
            {#if dettaglio.fonte === 'nessuna'}
              Nessun dato per questo mese
            {:else}
              {`${formatOre(dettaglio.ore)} h`}{dettaglio.nSost ? ` · ${dettaglio.nSost} ${dettaglio.nSost === 1 ? 'sostituzione' : 'sostituzioni'} (${formatOre(dettaglio.oreSost)} h)` : ''}{` · ${dettaglio.fonte === 'app' ? 'da ClockWork' : dettaglio.fonte === 'manuale' ? 'inserite a mano' : 'dall’archivio'}`}
            {/if}
          </span>
        </div>
        {#if dettaglio.fonte === 'app'}
          <a class="link small-link" href={`#/foglio/${dettaglio.ym}`}>Foglio ore <Icona nome="dx" /></a>
        {:else if modifica !== dettaglio.ym}
          <button class="link small-link" onclick={() => apriModifica(dettaglio.ym)}>
            <Icona nome="matita" /> {dettaglio.fonte === 'nessuna' ? 'Inserisci ore' : 'Correggi'}
          </button>
        {/if}
      </div>
      {#if modifica === dettaglio.ym && dettaglio.fonte !== 'app'}
        {@render editorOre(dettaglio.ym, dettaglio.fonte === 'manuale')}
      {/if}
    </div>
    <div class="piede">
      <span class="muted nowrap">12 mesi</span>
      <span class="b tot">{`${formatOre(totale12)} h`}{nSost12 ? ` · di cui ${formatOre(sost12)} h in ${nSost12} sost.` : ''}</span>
    </div>
  </div>

  {#if controlli.length}
    <section class="card avviso" aria-labelledby="titolo-controlli">
      <h2 id="titolo-controlli">Da controllare nell’archivio</h2>
      {#each controlli as c (c.chiave)}
        <div class="controllo">
          {#if c.tipo === 'minuti'}
            <p class="nomargin"><b>{MESI[meseNum(c.ym) - 1]} {c.ym.slice(0, 4)}, giorno {c.day}:</b> scritto «{String(c.scritto)}». Volevi dire {Math.floor(c.scritto)} h {Math.round((c.scritto % 1) * 100)} min ({formatOre(c.proposta)})?</p>
            <div class="azioni">
              <button class="btn btn-warn" onclick={() => correggi(c)}>Correggi in {formatOre(c.proposta)}</button>
              <button class="btn btn-warn-ghost" onclick={() => lascia(c)}>Lascia</button>
            </div>
          {:else}
            <p class="nomargin"><b>{nomeMese(c.a)} e {nomeMese(c.b)}</b> hanno le stesse ore giorno per giorno: uno dei due fogli sembra una copia dell’altro.</p>
            {#if modifica === c.a || modifica === c.b}
              <div class="seg scelta" style="grid-template-columns: repeat(2, minmax(0, 1fr))" role="group" aria-label="Mese da correggere">
                <button aria-pressed={modifica === c.a} onclick={() => apriModifica(c.a)}>{nomeMese(c.a)}</button>
                <button aria-pressed={modifica === c.b} onclick={() => apriModifica(c.b)}>{nomeMese(c.b)}</button>
              </div>
              {@render editorOre(modifica, false)}
            {:else}
              <div class="azioni">
                <button class="btn btn-warn" onclick={() => apriModifica(c.b)}>Correggi le ore</button>
                <button class="btn btn-warn-ghost" onclick={() => lascia(c)}>Va bene così</button>
              </div>
            {/if}
          {/if}
        </div>
      {/each}
      <p class="small nomargin nota-avviso">Le correzioni valgono qui nello Storico: il file originale non lo tocco. Se non hai più il foglio giusto, basta il totale delle ore del mese.</p>
    </section>
  {/if}

  {#if errore}<p class="msg err" role="alert">{errore}</p>{/if}
  {#if messaggio}<p class="msg ok" role="status">{messaggio}</p>{/if}

  <section class="gruppo">
    <h2 class="lbl">Mesi prima di ClockWork</h2>
    <div class="card archivio">
      {#if dati.archivio}
        <div class="arch-riga">
          <span class="voce-ico"><Icona nome="tabella" /></span>
          <span class="arch-txt">
            <span class="b">{dati.archivio.mesi.length} {dati.archivio.mesi.length === 1 ? 'mese' : 'mesi'} · {breve(dati.archivio.mesi[0].ym)} – {breve(dati.archivio.mesi.at(-1)!.ym)}</span>
            <span class="muted small nome-file">{dati.archivio.nomeFile}</span>
          </span>
        </div>
        <p class="muted small nomargin">Dove ClockWork ha già i turni del mese, valgono quelli.</p>
        <div class="row">
          <label class="btn btn-secondary upload grow">Sostituisci
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange={caricaArchivio} /></label>
          <button class="btn btn-secondary grow" onclick={togliArchivio}>Togli</button>
        </div>
      {:else}
        <p class="muted small nomargin">Carica il file con i fogli ore che hai già consegnato, un foglio per mese: leggo le ore della colonna Q e le note della R. Resta solo su questo telefono.</p>
        <label class="btn btn-secondary upload">Carica archivio (.xlsx)
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange={caricaArchivio} /></label>
      {/if}
    </div>
  </section>
</section>

<style>
  .riga { display: flex; justify-content: space-between; align-items: center; gap: var(--space-8); }
  .anno, .grafico, .archivio { display: flex; flex-direction: column; gap: var(--space-10); padding: var(--space-16); }
  .occhio { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; margin: calc(var(--space-12) * -1) calc(var(--space-12) * -1) calc(var(--space-12) * -1) 0; border: none; background: none; color: var(--muted); border-radius: var(--radius-sm); cursor: pointer; }
  .cifre { display: flex; align-items: baseline; gap: var(--space-8); flex-wrap: wrap; }
  .grande { font-size: var(--text-3xl); font-weight: 800; line-height: 1.1; }
  .soglie { display: flex; flex-direction: column; gap: var(--space-4); }
  .barra { position: relative; height: 8px; border-radius: var(--radius-pill); background: var(--line-soft); overflow: hidden; }
  .riempi { height: 100%; border-radius: var(--radius-pill); background: var(--cloro); }
  .riempi.irpef { background: var(--warn); }
  .tacca { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--surface); }
  .etichette { position: relative; height: 14px; font-size: var(--text-2xs); color: var(--muted); }
  .etichette span { position: absolute; transform: translateX(-50%); }
  .etichette span.fine { transform: translateX(-100%); }
  .stato { font-weight: 600; color: var(--cloro-ink); }
  .stato.irpef { color: var(--warn); }
  .mancanti { display: flex; align-items: flex-start; gap: var(--space-8); padding: var(--space-8) var(--space-4) var(--space-8) var(--space-12); border-radius: var(--radius-md); background: var(--warn-bg); color: var(--warn); line-height: 1.4; }
  .mancanti p { flex: 1; padding-top: var(--space-2); }
  .chiudi { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 36px; height: 36px; margin: calc(var(--space-6) * -1) 0; border: none; background: none; color: inherit; border-radius: var(--radius-sm); cursor: pointer; }
  .chiudi :global(.ic) { width: 18px; height: 18px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

  .colonne { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--space-4); align-items: end; }
  .col { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); padding: var(--space-4) 0; border: none; background: none; border-radius: var(--radius-sm); cursor: pointer; color: var(--muted); min-width: 0; }
  .col.sel { background: var(--surface-sunken); color: var(--ink); }
  .pila { height: 120px; width: 70%; display: flex; flex-direction: column-reverse; justify-content: flex-start; gap: 2px; }
  .pila > span { border-radius: 3px; min-height: 2px; }
  .base { background: color-mix(in srgb, var(--cloro) 45%, var(--surface)); }
  .base.corrente { background: var(--cloro); }
  .sost { background: var(--ink); }
  .vuota { height: 2px; background: var(--line); }
  .ml { font-family: var(--font-mono); font-size: var(--text-2xs); }
  .sn { font-size: var(--text-2xs); font-weight: 600; color: var(--ink); }
  .col.sel .ml { font-weight: 700; color: var(--cloro); }
  .legenda { display: flex; gap: var(--space-14); flex-wrap: wrap; font-size: var(--text-sm); color: var(--muted); }
  .legenda span { display: inline-flex; align-items: center; gap: var(--space-6); }
  .q { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .base-c { background: color-mix(in srgb, var(--cloro) 45%, var(--surface)); }
  .sost-c { background: var(--ink); }
  .dettaglio { display: flex; flex-direction: column; gap: var(--space-10); padding: var(--space-10) var(--space-12); border-radius: var(--radius-md); background: var(--surface-sunken); }
  .det-riga { display: flex; justify-content: space-between; align-items: center; gap: var(--space-8); }
  .editor { display: flex; flex-direction: column; gap: var(--space-6); }
  .editor .inp { background: var(--surface); }
  .editor-piede { display: flex; justify-content: space-between; align-items: center; gap: var(--space-8); }
  .editor-piede .small-link { min-height: 36px; }
  .corto { padding: 0 var(--space-16); height: 46px; }
  .avviso .editor .lbl { color: inherit; }
  .avviso .editor .muted { color: inherit; opacity: 0.85; }
  .avviso .editor .link { color: inherit; }
  .scelta { background: color-mix(in srgb, var(--warn) 12%, transparent); }
  .det-txt { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
  .det-nome { font-weight: 600; }
  .small-link { font-size: var(--text-sm); gap: var(--space-2); white-space: nowrap; }
  .small-link :global(.ic) { width: 18px; height: 18px; }
  .small-link :global(.ic:first-child) { margin-right: var(--space-4); }
  .piede { display: flex; justify-content: space-between; gap: var(--space-8); padding-top: var(--space-10); border-top: 1px solid var(--line-soft); font-size: var(--text-md); }
  .b { font-weight: 600; }
  .nowrap { white-space: nowrap; }
  .tot { text-align: right; font-variant-numeric: tabular-nums; }

  .avviso { display: flex; flex-direction: column; gap: var(--space-10); padding: var(--space-14) var(--space-16); background: var(--warn-bg); border-color: var(--warn-line); color: var(--warn); }
  .avviso h2 { margin: 0; font-size: var(--text-base); font-weight: 700; }
  .controllo { display: flex; flex-direction: column; gap: var(--space-8); font-size: var(--text-md); line-height: 1.4; }
  .controllo + .controllo { padding-top: var(--space-10); border-top: 1px solid var(--warn-line); }
  .azioni { display: flex; gap: var(--space-8); flex-wrap: wrap; }
  .azioni .btn { height: 40px; padding: 0 var(--space-14); font-size: var(--text-md); }
  .btn-warn { background: var(--warn); color: var(--warn-bg); }
  .btn-warn-ghost { background: transparent; color: var(--warn); border: 1px solid var(--warn-line); }
  .nota-avviso { opacity: 0.85; }

  .arch-riga { display: flex; align-items: center; gap: var(--space-10); }
  .arch-txt { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
  .nome-file { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
