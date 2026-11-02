<script lang="ts">
  import { COLONNE_FOGLIO, type Mansione } from '../lib/model';
  import { formatEuro } from '../lib/ore';
  import Icona from './Icona.svelte';

  /**
   * Le mansioni che svolgi: una per colonna del foglio ore (C–T), con un nome tuo facoltativo e la
   * tariffa oraria. Ogni modifica si salva subito con `salva`.
   */
  let { mansioni, salva }: { mansioni: Mansione[]; salva: (m: Mansione[]) => void } = $props();

  const nomeColonna = (col: string) => COLONNE_FOGLIO.find((c) => c.col === col)?.nome ?? col;
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
  function nome(i: number, e: Event) {
    const v = (e.currentTarget as HTMLInputElement).value.trim();
    cambia(i, { nome: v && v !== nomeColonna(mansioni[i].col) ? v : undefined });
  }
  // La prima dell'elenco è quella proposta quando crei un turno
  function primaria(i: number) {
    salva([mansioni[i], ...mansioni.filter((_, j) => j !== i)]);
  }
  function togli(i: number) {
    salva(mansioni.filter((_, j) => j !== i));
  }

  // Aggiungi: una colonna non ancora usata e la sua tariffa
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

<div class="mansioni">
  {#each mansioni as m, i (m.col)}
    <div class="mans">
      <div class="testa-mans">
        <span class="lbl">Colonna {m.col}</span>
        {#if i === 0 && mansioni.length > 1}<span class="tag t-soft">principale</span>{/if}
        {#if mansioni.length > 1}
          <button class="icon-togli" aria-label="Togli {m.nome || nomeColonna(m.col)}" onclick={() => togli(i)}><Icona nome="chiudi" /></button>
        {/if}
      </div>
      <input class="inp" value={m.nome ?? ''} placeholder={nomeColonna(m.col)} aria-label="Nome della mansione, colonna {m.col}" onchange={(e) => nome(i, e)} />
      <div class="riga">
        <label class="tariffa">
          <span class="sr">Tariffa di {m.nome || nomeColonna(m.col)}</span>
          <input class="inp m" inputmode="decimal" value={testoTariffa(m.tariffa)} onchange={(e) => tariffa(i, e)} />
          <span class="unita">€/h</span>
        </label>
        {#if i > 0}<button class="link piccolo" onclick={() => primaria(i)}>Rendi principale</button>{/if}
      </div>
    </div>
  {/each}

  {#if libere.length}
    <div class="mans aggiungi">
      <label class="field">
        <span class="lbl">Aggiungi una mansione</span>
        <select class="inp" bind:value={nuova}>
          <option value="">Scegli dal foglio ore…</option>
          {#each libere as c (c.col)}
            <option value={c.col}>{c.col} · {c.nome}</option>
          {/each}
        </select>
      </label>
      {#if nuova}
        <div class="riga">
          <label class="tariffa">
            <span class="sr">Tariffa della nuova mansione</span>
            <input class="inp m" inputmode="decimal" bind:value={nuovaTariffa} placeholder="es. 15" onkeydown={(e) => e.key === 'Enter' && aggiungi()} />
            <span class="unita">€/h</span>
          </label>
          <button class="btn btn-secondary corto" disabled={!nuovaOk} onclick={aggiungi}>Aggiungi</button>
        </div>
      {/if}
    </div>
  {/if}
  <p class="muted small nomargin">Le ore di ogni turno finiscono nella colonna della sua mansione. Le tariffe servono solo a stimare il compenso{mansioni.length ? ` (es. ${formatEuro(mansioni[0].tariffa)}/h)` : ''}: non vanno nel foglio ore.</p>
</div>

<style>
  .mansioni { display: flex; flex-direction: column; gap: var(--space-12); }
  .mans { display: flex; flex-direction: column; gap: var(--space-8); padding-bottom: var(--space-12); border-bottom: 1px solid var(--line-soft); }
  .riga { display: flex; align-items: center; justify-content: space-between; gap: var(--space-8); }
  .tariffa { display: flex; align-items: center; gap: var(--space-8); }
  .tariffa .inp { width: 96px; text-align: right; }
  .unita { color: var(--muted); font-size: var(--text-md); white-space: nowrap; }
  .testa-mans { display: flex; align-items: center; gap: var(--space-8); min-height: 28px; }
  .testa-mans .tag { flex-shrink: 0; height: 22px; font-size: var(--text-2xs); }
  .icon-togli { margin-left: auto; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; margin-right: calc(var(--space-8) * -1); border: none; background: none; color: var(--muted); border-radius: var(--radius-sm); cursor: pointer; }
  .icon-togli :global(.ic) { width: 18px; height: 18px; }
  .piccolo { font-size: var(--text-sm); white-space: nowrap; }
  .corto { padding: 0 var(--space-16); height: 46px; white-space: nowrap; }
  .lbl { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
