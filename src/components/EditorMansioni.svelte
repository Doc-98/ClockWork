<script lang="ts">
  import { COLONNE_FOGLIO, cambiaPaga, inizioCambio, turniDaCambiare, dataDa, GIORNI_PER_MESE_PRIMA, type Mansione, type Paga, type Turno } from '../lib/model';
  import { MESI } from '../lib/foglio/genera';
  import Icona from './Icona.svelte';

  /**
   * Le mansioni che svolgi, con la tariffa oraria di ognuna. La prima è la principale: è quella
   * proposta ogni volta che aggiungi un turno. Le altre restringono la scelta quando un turno è diverso.
   * Ogni mansione corrisponde a una colonna del foglio ore, ma all'utente non serve saperlo.
   * Ogni modifica si salva subito con `salva`. Con `turni` e `salvaTurni` cambiare il tipo di paga
   * di una mansione aggiorna anche i suoi turni dal mese corrente in poi.
   */
  let { mansioni, salva, turni, salvaTurni }: {
    mansioni: Mansione[];
    salva: (m: Mansione[]) => void;
    turni?: Turno[];
    salvaTurni?: (m: Mansione[], t: Turno[]) => void;
  } = $props();

  const nomeBase = (col: string) => COLONNE_FOGLIO.find((c) => c.col === col)?.nome ?? col;
  const nomeDi = (m: Mansione) => m.nome?.trim() || nomeBase(m.col);
  const numero = (s: string) => Number(s.trim().replace(',', '.'));
  const testoTariffa = (n: number) => String(n).replace('.', ',');
  const pagaDiM = (m: Mansione): Paga => m.paga ?? 'ore';
  const unita = (p: Paga) => (p === 'turno' ? '€ a turno' : '€/h');

  function cambia(i: number, v: Partial<Mansione>) {
    salva(mansioni.map((m, j) => (j === i ? { ...m, ...v } : m)));
  }
  function tariffa(i: number, e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const n = numero(input.value);
    if (input.value.trim() === '' || !(n >= 0)) {
      input.value = testoTariffa(mansioni[i].tariffa);
      return;
    }
    if (n !== mansioni[i].tariffa) cambia(i, { tariffa: n });
  }

  // Rinomina: il nome si mostra come testo; «Rinomina» apre il campo
  let inRinomina = $state<string | undefined>();
  let nomeNuovo = $state('');
  function apriRinomina(m: Mansione) {
    inRinomina = m.col;
    nomeNuovo = nomeDi(m);
  }
  function salvaNome(i: number) {
    const v = nomeNuovo.trim();
    cambia(i, { nome: v && v !== nomeBase(mansioni[i].col) ? v : undefined });
    inRinomina = undefined;
  }

  // La prima dell'elenco è la principale
  function principale(i: number) {
    salva([mansioni[i], ...mansioni.filter((_, j) => j !== i)]);
  }
  function togli(i: number) {
    salva(mansioni.filter((_, j) => j !== i));
  }

  // Aggiungi: una mansione non ancora scelta e la sua tariffa
  const libere = $derived(COLONNE_FOGLIO.filter((c) => !mansioni.some((m) => m.col === c.col)));
  let nuova = $state('');
  let nuovaTariffa = $state('');
  let nuovaPaga = $state<Paga>('ore');
  const nuovaOk = $derived(!!nuova && nuovaTariffa.trim() !== '' && numero(nuovaTariffa) >= 0);
  function aggiungi() {
    if (!nuovaOk) return;
    salva([...mansioni, { col: nuova, tariffa: numero(nuovaTariffa), ...(nuovaPaga === 'turno' ? { paga: 'turno' as const } : {}) }]);
    nuova = '';
    nuovaTariffa = '';
    nuovaPaga = 'ore';
  }

  // Cambio del tipo di paga: vale dal mese corrente in poi (nei primi giorni anche dal mese prima,
  // il cui foglio può non essere ancora consegnato); i mesi passati restano come li hai consegnati.
  const oggi = new Date();
  const primiGiorni = oggi.getDate() <= GIORNI_PER_MESE_PRIMA;
  const nomeMeseMin = (ym: string) => MESI[Number(ym.slice(5, 7)) - 1].toLowerCase();
  let cambio = $state<{ col: string; paga: Paga; tariffa: string; ancheMesePrima: boolean; ciascuno: number } | undefined>();
  const inCambio = $derived(cambio ? mansioni.find((m) => m.col === cambio!.col) : undefined);
  const daMese = $derived(inizioCambio(oggi, !!cambio?.ancheMesePrima));
  const toccati = $derived(cambio && turni ? turniDaCambiare(turni, cambio.col, daMese) : []);
  const ultimoToccato = $derived(toccati.map((t) => t.data).sort().at(-1));
  const meseCorrente = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}`;
  const tipoCambiato = $derived(!!cambio && !!inCambio && cambio.paga !== pagaDiM(inCambio));
  const tariffaCambioOk = $derived(!!cambio && cambio.tariffa.trim() !== '' && numero(cambio.tariffa) >= 0);
  // Da turno a ore si perde il numero di turni dei giorni già inseriti
  const perdeTurni = $derived(!!cambio && cambio.paga === 'ore' && toccati.some((t) => t.turni));

  function apriCambio(m: Mansione) {
    const altro: Paga = pagaDiM(m) === 'turno' ? 'ore' : 'turno';
    cambio = { col: m.col, paga: altro, tariffa: '', ancheMesePrima: true, ciascuno: 1 };
  }
  function confermaCambio() {
    if (!cambio || !tipoCambiato || !tariffaCambioOk) return;
    const nuova = { paga: cambio.paga, tariffa: numero(cambio.tariffa) };
    if (turni && salvaTurni) {
      const r = cambiaPaga(mansioni, turni, cambio.col, nuova, daMese, cambio.ciascuno);
      salvaTurni(r.mansioni, r.turni);
    } else {
      // Nessun turno (primo avvio): basta cambiare la mansione
      salva(mansioni.map((m) => {
        if (m.col !== cambio!.col) return m;
        const { paga: _p, ...resto } = m;
        return { ...resto, tariffa: nuova.tariffa, ...(nuova.paga === 'turno' ? { paga: 'turno' as const } : {}) };
      }));
    }
    cambio = undefined;
  }
  const dataLunga = (iso: string) => dataDa(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
  const oggiLungo = oggi.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
</script>

{#snippet scheda(m: Mansione, i: number)}
  <div class="mans" class:prima={i === 0}>
    <div class="testa">
      {#if inRinomina === m.col}
        <span class="row grow">
          <input class="inp grow" bind:value={nomeNuovo} aria-label="Nuovo nome di {nomeDi(m)}" placeholder={nomeBase(m.col)}
            onkeydown={(e) => e.key === 'Enter' && salvaNome(i)} />
          <button class="btn btn-secondary corto" onclick={() => salvaNome(i)}>Salva</button>
        </span>
      {:else}
        <span class="nome" class:lungo={nomeDi(m).length > 24} class:lunghissimo={nomeDi(m).length > 32}>{nomeDi(m)}</span>
        <button class="icona" aria-label="Rinomina {nomeDi(m)}" onclick={() => apriRinomina(m)}><Icona nome="matita" /></button>
        {#if mansioni.length > 1}
          <button class="icona" aria-label="Togli {nomeDi(m)}" onclick={() => togli(i)}><Icona nome="chiudi" /></button>
        {/if}
      {/if}
    </div>
    <div class="riga">
      <span class="riga-sx">
        <button class="tipo-paga" onclick={() => apriCambio(m)} aria-label="{pagaDiM(m) === 'turno' ? 'Pagata a turno' : 'Pagata a ore'}: cambia come vieni pagato per {nomeDi(m)}">
          {pagaDiM(m) === 'turno' ? 'A turno' : 'A ore'}<Icona nome="giu" />
        </button>
        <label class="tariffa">
          <span class="sr">Tariffa di {nomeDi(m)}</span>
          <input class="inp m" inputmode="decimal" value={testoTariffa(m.tariffa)} onchange={(e) => tariffa(i, e)} />
          <span class="unita">{unita(pagaDiM(m))}</span>
        </label>
      </span>
      {#if i > 0}<button class="link piccolo" onclick={() => principale(i)}>Rendi principale</button>{/if}
    </div>
  </div>
{/snippet}

<div class="mansioni">
  {#if mansioni.length}
    <section class="gruppo-m">
      <h3 class="lbl">Mansione principale</h3>
      {@render scheda(mansioni[0], 0)}
      <p class="muted small nomargin">Te la propongo ogni volta che aggiungi un turno.</p>
    </section>

    <section class="gruppo-m">
      <h3 class="lbl">Altre mansioni <span class="facoltative">facoltative</span></h3>
      <p class="muted small nomargin">Se a volte fai turni diversi, aggiungi qui le mansioni che ti servono: quando crei un turno scegli tra queste, senza scorrere tutto l'elenco.</p>
      {#each mansioni.slice(1) as m, j (m.col)}
        {@render scheda(m, j + 1)}
      {/each}
    </section>
  {/if}

  {#if libere.length}
    <div class="aggiungi">
      <label class="field">
        <span class="lbl">{mansioni.length ? 'Aggiungi un’altra mansione' : 'Scegli la tua mansione principale'}</span>
        <select class="inp" bind:value={nuova}>
          <option value="">Scegli…</option>
          {#each libere as c (c.col)}
            <option value={c.col}>{c.nome}</option>
          {/each}
        </select>
      </label>
      {#if nuova}
        <div class="field">
          <span class="lbl" id="lbl-paga-nuova">Come vieni pagato</span>
          <div class="seg due-seg" role="group" aria-labelledby="lbl-paga-nuova">
            <button aria-pressed={nuovaPaga === 'ore'} onclick={() => (nuovaPaga = 'ore')}>A ore</button>
            <button aria-pressed={nuovaPaga === 'turno'} onclick={() => (nuovaPaga = 'turno')}>A turno</button>
          </div>
        </div>
        <div class="riga">
          <label class="tariffa">
            <span class="sr">{nuovaPaga === 'turno' ? 'Paga per turno' : 'Tariffa oraria'} di {nomeBase(nuova)}</span>
            <input class="inp m" inputmode="decimal" bind:value={nuovaTariffa} placeholder={nuovaPaga === 'turno' ? '10' : '15'} onkeydown={(e) => e.key === 'Enter' && aggiungi()} />
            <span class="unita">{unita(nuovaPaga)}</span>
          </label>
          <button class="btn btn-secondary corto" disabled={!nuovaOk} onclick={aggiungi}>Aggiungi</button>
        </div>
        {#if nuovaPaga === 'turno'}
          <p class="muted small nomargin">A turno: quando aggiungi un turno mi dici quanti ne fai in quell’orario. Nel foglio ore scrivo il numero di turni, non le ore.</p>
        {/if}
      {/if}
    </div>
  {/if}
  <p class="muted small nomargin">Le tariffe servono solo a stimare il compenso: non finiscono nel foglio ore.</p>
</div>

{#if cambio && inCambio}
  <div class="velo" role="presentation" onclick={() => (cambio = undefined)}></div>
  <div class="foglio-cambio" role="dialog" aria-modal="true" aria-labelledby="titolo-cambio">
    <div class="maniglia" aria-hidden="true"></div>
    <div class="testa-cambio">
      <h2 id="titolo-cambio">Come vieni pagato</h2>
      <span class="muted small">{nomeDi(inCambio)} · {oggiLungo}</span>
    </div>

    <div class="riga-paga">
      <div class="seg due-seg grow" role="group" aria-label="Tipo di paga">
        <button aria-pressed={cambio.paga === 'ore'} onclick={() => (cambio!.paga = 'ore')}>A ore</button>
        <button aria-pressed={cambio.paga === 'turno'} onclick={() => (cambio!.paga = 'turno')}>A turno</button>
      </div>
      <label class="tariffa">
        <span class="sr">{cambio.paga === 'turno' ? 'Paga per turno' : 'Tariffa oraria'}</span>
        <input class="inp m" inputmode="decimal" bind:value={cambio.tariffa} placeholder={cambio.paga === 'turno' ? '10' : '15'} />
        <span class="unita">{unita(cambio.paga)}</span>
      </label>
    </div>

    {#if tipoCambiato}
      <div class="info-cambio">
        {#if primiGiorni}
          <label class="riga-switch">
            <span class="switch-txt">
              <span class="b">Anche {nomeMeseMin(inizioCambio(oggi, true))}</span>
              <span class="muted small">Se non hai ancora consegnato il foglio</span>
            </span>
            <button class="switch" role="switch" aria-checked={cambio.ancheMesePrima} aria-label="Anche {nomeMeseMin(inizioCambio(oggi, true))}" onclick={() => (cambio!.ancheMesePrima = !cambio!.ancheMesePrima)}><span></span></button>
          </label>
        {/if}
        <div class="punto">
          <Icona nome="mese" />
          <span>
            {#if toccati.length}
              Cambio anche {toccati.length === 1 ? 'il turno' : `i ${toccati.length} turni`} da {nomeMeseMin(daMese)} in poi{ultimoToccato && ultimoToccato.slice(0, 7) > meseCorrente ? `, compresi quelli fino al ${dataLunga(ultimoToccato)}` : ''}.
            {:else}
              Nessun turno da cambiare: vale per quelli che aggiungi da {nomeMeseMin(daMese)}.
            {/if}
          </span>
        </div>
        <div class="punto muted">
          <Icona nome="check" />
          <span>I mesi passati restano come li hai consegnati, compenso compreso.</span>
        </div>
      </div>

      {#if cambio.paga === 'turno' && toccati.length}
        <div class="ciascuno">
          <span class="ciascuno-txt">
            <span class="b">Turni per ciascuno</span>
            <span class="small">Poi li correggi giorno per giorno</span>
          </span>
          <span class="stepper">
            <button class="passo" aria-label="Uno in meno" disabled={cambio.ciascuno <= 1} onclick={() => (cambio!.ciascuno = Math.max(1, cambio!.ciascuno - 1))}><Icona nome="meno" /></button>
            <span class="d n" aria-live="polite">{cambio.ciascuno}</span>
            <button class="passo" aria-label="Uno in più" onclick={() => (cambio!.ciascuno = Math.min(30, cambio!.ciascuno + 1))}><Icona nome="piu" /></button>
          </span>
        </div>
      {/if}

      {#if perdeTurni}
        <p class="msg err nomargin" role="note">Per quei turni calcolo le ore dall’orario e perdo il numero di turni di ogni giorno: se poi torni a turno, andrà rimesso a mano.</p>
      {/if}
    {:else}
      <p class="muted small nomargin">È già pagata {cambio.paga === 'turno' ? 'a turno' : 'a ore'}: la tariffa la cambi direttamente nella scheda.</p>
    {/if}

    <div class="azioni">
      <button class="btn btn-secondary" onclick={() => (cambio = undefined)}>Annulla</button>
      <button class="btn btn-primary" disabled={!tipoCambiato || !tariffaCambioOk} onclick={confermaCambio}>Conferma</button>
    </div>
  </div>
{/if}

<style>
  .mansioni { display: flex; flex-direction: column; gap: var(--space-16); }
  .gruppo-m { display: flex; flex-direction: column; gap: var(--space-8); }
  .gruppo-m h3 { margin: 0; }
  .facoltative { text-transform: none; letter-spacing: 0; font-weight: 500; margin-left: var(--space-4); }
  .mans { display: flex; flex-direction: column; gap: var(--space-8); padding: var(--space-12); border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
  .mans.prima { border-color: var(--cloro); background: var(--cloro-soft); }
  .mans.prima .inp { background: var(--surface); }
  .testa { display: flex; align-items: center; gap: var(--space-2); min-height: 36px; margin-right: calc(var(--space-6) * -1); }
  .nome { font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* I nomi lunghi rimpiccioliscono invece di andare a capo o essere tagliati */
  .nome.lungo { font-size: var(--text-md); }
  .nome.lunghissimo { font-size: var(--text-sm); }
  .icona { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; margin: calc(var(--space-6) * -1) 0; border: none; background: none; color: var(--muted); border-radius: var(--radius-sm); cursor: pointer; flex-shrink: 0; }
  .icona :global(.ic) { width: 18px; height: 18px; }
  .riga { display: flex; align-items: center; justify-content: space-between; gap: var(--space-8); flex-wrap: wrap; }
  .riga-sx { display: flex; align-items: center; gap: var(--space-8); }
  .tipo-paga { display: inline-flex; align-items: center; gap: var(--space-2); height: 36px; padding: 0 var(--space-8) 0 var(--space-12); border-radius: var(--radius-pill); border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); font: inherit; font-size: var(--text-sm); font-weight: 600; white-space: nowrap; cursor: pointer; }
  .tipo-paga :global(.ic) { width: 16px; height: 16px; color: var(--muted); }
  .due-seg { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .velo { position: fixed; inset: 0; z-index: 40; background: rgb(0 0 0 / 0.35); }
  .foglio-cambio { position: fixed; left: 0; right: 0; bottom: 0; z-index: 41; max-width: 480px; margin: 0 auto; max-height: 92dvh; overflow-y: auto; box-sizing: border-box; display: flex; flex-direction: column; gap: var(--space-16);
    padding: var(--space-10) var(--space-20) calc(var(--safe-bottom, 0px) + var(--space-20)); border-radius: var(--radius-xl) var(--radius-xl) 0 0; background: var(--carta); }
  .maniglia { align-self: center; width: 40px; height: 5px; border-radius: 3px; background: var(--line-strong); }
  .testa-cambio { display: flex; flex-direction: column; gap: var(--space-2); }
  .testa-cambio h2 { margin: 0; font-family: var(--font-display); font-size: 22px; font-weight: 800; }
  .riga-paga { display: flex; align-items: center; gap: var(--space-8); }
  .riga-paga .tariffa .inp { width: 64px; }
  .info-cambio { display: flex; flex-direction: column; gap: var(--space-12); padding: var(--space-14); border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); }
  .info-cambio .riga-switch { padding-bottom: var(--space-12); border-bottom: 1px solid var(--line-soft); }
  .switch-txt { display: flex; flex-direction: column; min-width: 0; }
  .switch-txt > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .b { font-weight: 600; }
  .punto { display: flex; gap: var(--space-10); font-size: var(--text-sm); line-height: 1.45; }
  .punto :global(.ic) { flex-shrink: 0; width: 20px; height: 20px; color: var(--cloro); }
  .punto.muted :global(.ic) { color: var(--muted); }
  .ciascuno { display: flex; align-items: center; justify-content: space-between; gap: var(--space-10); padding: var(--space-10) var(--space-14); border: 1px solid var(--cloro); border-radius: var(--radius-lg); background: var(--cloro-soft); color: var(--cloro-ink); }
  .ciascuno-txt { display: flex; flex-direction: column; min-width: 0; }
  .ciascuno-txt > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stepper { display: flex; align-items: center; gap: var(--space-10); }
  .passo { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-md); border: 1px solid var(--line); background: var(--surface); color: var(--cloro); cursor: pointer; }
  .passo:disabled { opacity: 0.4; cursor: default; }
  .n { min-width: 20px; text-align: center; font-size: var(--text-2xl); font-weight: 800; color: var(--ink); }
  .azioni { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-8); }
  .tariffa { display: flex; align-items: center; gap: var(--space-8); }
  .tariffa .inp { width: 68px; text-align: right; }
  .unita { color: var(--muted); font-size: var(--text-md); white-space: nowrap; }
  .piccolo { font-size: var(--text-sm); white-space: nowrap; gap: var(--space-4); min-height: 36px; }
  .corto { padding: 0 var(--space-14); height: 46px; white-space: nowrap; }
  .aggiungi { display: flex; flex-direction: column; gap: var(--space-8); }
  .grow { flex: 1; min-width: 0; }
  .lbl { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
