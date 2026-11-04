<script lang="ts">
  import { COLONNE_FOGLIO, type Mansione } from '../lib/model';
  import Icona from './Icona.svelte';

  /**
   * Le mansioni che svolgi, con la tariffa oraria di ognuna. La prima è la principale: è quella
   * proposta ogni volta che aggiungi un turno. Le altre restringono la scelta quando un turno è diverso.
   * Ogni mansione corrisponde a una colonna del foglio ore, ma all'utente non serve saperlo.
   * Ogni modifica si salva subito con `salva`.
   */
  let { mansioni, salva }: { mansioni: Mansione[]; salva: (m: Mansione[]) => void } = $props();

  const nomeBase = (col: string) => COLONNE_FOGLIO.find((c) => c.col === col)?.nome ?? col;
  const nomeDi = (m: Mansione) => m.nome?.trim() || nomeBase(m.col);
  const numero = (s: string) => Number(s.trim().replace(',', '.'));
  const testoTariffa = (n: number) => String(n).replace('.', ',');

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
  const nuovaOk = $derived(!!nuova && nuovaTariffa.trim() !== '' && numero(nuovaTariffa) >= 0);
  function aggiungi() {
    if (!nuovaOk) return;
    salva([...mansioni, { col: nuova, tariffa: numero(nuovaTariffa) }]);
    nuova = '';
    nuovaTariffa = '';
  }
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
      <label class="tariffa">
        <span class="sr">Tariffa di {nomeDi(m)}</span>
        <input class="inp m" inputmode="decimal" value={testoTariffa(m.tariffa)} onchange={(e) => tariffa(i, e)} />
        <span class="unita">€/h</span>
      </label>
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
        <div class="riga">
          <label class="tariffa">
            <span class="sr">Tariffa oraria di {nomeBase(nuova)}</span>
            <input class="inp m" inputmode="decimal" bind:value={nuovaTariffa} placeholder="es. 15" onkeydown={(e) => e.key === 'Enter' && aggiungi()} />
            <span class="unita">€/h</span>
          </label>
          <button class="btn btn-secondary corto" disabled={!nuovaOk} onclick={aggiungi}>Aggiungi</button>
        </div>
      {/if}
    </div>
  {/if}
  <p class="muted small nomargin">Le tariffe servono solo a stimare il compenso: non finiscono nel foglio ore.</p>
</div>

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
  .tariffa { display: flex; align-items: center; gap: var(--space-8); }
  .tariffa .inp { width: 84px; text-align: right; }
  .unita { color: var(--muted); font-size: var(--text-md); white-space: nowrap; }
  .piccolo { font-size: var(--text-sm); white-space: nowrap; gap: var(--space-4); min-height: 36px; }
  .corto { padding: 0 var(--space-14); height: 46px; white-space: nowrap; }
  .aggiungi { display: flex; flex-direction: column; gap: var(--space-8); }
  .grow { flex: 1; min-width: 0; }
  .lbl { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
