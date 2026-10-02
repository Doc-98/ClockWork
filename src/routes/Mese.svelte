<script lang="ts">
  import { dati } from '../lib/dati.svelte';
  import { router, type Rotta } from '../lib/router.svelte';
  import { isoDa, dataDa, breveArea, type Area } from '../lib/model';
  import { MESI } from '../lib/foglio/genera';
  import { vista, ymDa, ymOggi, ymStr, spostaYm, type Ym } from '../lib/vista.svelte';
  import TitoloMese from '../components/TitoloMese.svelte';
  import TurnoRapido from '../components/TurnoRapido.svelte';
  import Icona from '../components/Icona.svelte';

  let { rotta }: { rotta: Extract<Rotta, { nome: 'mese' }> } = $props();

  const oggiIso = isoDa(new Date());
  const ym = $derived(ymDa(rotta.ym) ?? ymOggi());
  $effect(() => vista.segna('mese', ym));

  const giornoSel = $derived.by(() => {
    if (rotta.giorno?.startsWith(ymStr(ym))) return rotta.giorno;
    return oggiIso.startsWith(ymStr(ym)) ? oggiIso : `${ymStr(ym)}-01`;
  });

  const turniMese = $derived(dati.turniDelMese(ym.year, ym.month));
  const attivi = $derived(turniMese.filter((t) => !t.annullato));
  const mesiConTurni = $derived(new Set(dati.turni.map((t) => t.data.slice(0, 7))));

  const COLORI: Record<Area, string> = {
    maschile: 'var(--area-m)', femminile: 'var(--area-f)', piccoli: 'var(--area-p)', atrio: 'var(--area-a)', altro: 'var(--area-x)',
  };

  const celle = $derived.by(() => {
    const primo = new Date(ym.year, ym.month - 1, 1);
    const offset = (primo.getDay() + 6) % 7; // lunedì = 0
    const giorni = new Date(ym.year, ym.month, 0).getDate();
    const n = Math.ceil((offset + giorni) / 7) * 7;
    return Array.from({ length: n }, (_, i) => {
      const d = i - offset + 1;
      if (d < 1 || d > giorni) return null;
      const iso = isoDa(new Date(ym.year, ym.month - 1, d));
      const ts = attivi.filter((t) => t.data === iso);
      return { d, iso, punti: ts.map((t) => ({ colore: COLORI[t.area], sost: !!t.sostituisce, quadro: t.area === 'atrio' })) };
    });
  });

  const delGiorno = $derived(turniMese.filter((t) => t.data === giornoSel));
  let aperto = $state<string | undefined>();

  function vai(dest: Ym) {
    aperto = undefined;
    const sel = dest.year === ymOggi().year && dest.month === ymOggi().month ? `?g=${oggiIso}` : '';
    router.vai(`#/mese/${ymStr(dest)}${sel}`, true);
  }
  function scegli(iso: string) {
    aperto = undefined;
    router.vai(`#/mese/${iso.slice(0, 7)}?g=${iso}`, true);
  }
  const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const titoloGiorno = $derived.by(() => {
    const d = dataDa(giornoSel);
    return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()].toLowerCase()}`;
  });
</script>

<section class="page">
  <TitoloMese {ym} sopra={String(ym.year)} {vai} {mesiConTurni}>
    {#snippet azioni()}
      <button class="icon-btn" aria-label="Mese precedente" onclick={() => vai(spostaYm(ym, -1))}><Icona nome="sx" /></button>
      <button class="icon-btn" aria-label="Mese successivo" onclick={() => vai(spostaYm(ym, 1))}><Icona nome="dx" /></button>
    {/snippet}
  </TitoloMese>

  <div class="card cal">
    <div class="grid wd">
      {#each ['L', 'M', 'M', 'G', 'V', 'S', 'D'] as g, i (i)}<div class="lbl">{g}</div>{/each}
    </div>
    <div class="grid">
      {#each celle as c, i (i)}
        {#if c}
          <button
            class="cella"
            class:sel={c.iso === giornoSel}
            class:oggi={c.iso === oggiIso}
            aria-pressed={c.iso === giornoSel}
            aria-label={`${c.d}${c.punti.length ? `, ${c.punti.length} ${c.punti.length === 1 ? 'turno' : 'turni'}` : ''}`}
            onclick={() => scegli(c.iso)}
          >
            <span class="m num">{c.d}</span>
            <span class="punti">
              {#each c.punti as p, j (j)}
                <span class="punto" class:ring={p.sost} class:quadro={p.quadro} style="--c: {p.colore}"></span>
              {/each}
            </span>
          </button>
        {:else}
          <div></div>
        {/if}
      {/each}
    </div>
    <div class="legenda">
      <span><i style="--c: var(--area-m)"></i>{breveArea('maschile', dati.impostazioni)}</span>
      <span><i style="--c: var(--area-f)"></i>{breveArea('femminile', dati.impostazioni)}</span>
      <span><i style="--c: var(--area-p)"></i>{breveArea('piccoli', dati.impostazioni)}</span>
      <span><i class="quadro" style="--c: var(--area-a)"></i>{breveArea('atrio', dati.impostazioni)}</span>
      <span><i class="ring" style="--c: var(--muted)"></i>Sostituzione</span>
    </div>
  </div>

  <div class="giorno-head">
    <h2>{titoloGiorno}</h2>
    {#if delGiorno.length > 1}<span class="m muted small">{delGiorno.length} turni</span>{/if}
  </div>

  {#each delGiorno as t (t.id)}
    <TurnoRapido turno={t} aperto={aperto === t.id} apri={(a) => (aperto = a ? t.id : undefined)} />
  {:else}
    <p class="muted small nessuno">Nessun turno in questo giorno.</p>
  {/each}
</section>

<style>
  .cal { padding: var(--space-12); }
  .grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--space-2); }
  .wd { padding-bottom: var(--space-6); text-align: center; }
  .wd .lbl { font-size: var(--text-2xs); }
  .cella { height: 50px; border: none; background: none; border-radius: var(--radius-md); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-4); cursor: pointer; color: var(--ink); padding: 0; }
  .cella.oggi .num { color: var(--cloro); font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
  .cella.sel { background: var(--fill); color: var(--on-fill); }
  .cella.sel .num { color: var(--on-fill); }
  .num { font-size: var(--text-base); font-weight: 500; }
  .punti { display: flex; gap: 3px; height: 8px; align-items: center; }
  .punto { width: 7px; height: 7px; border-radius: 50%; background: var(--c); }
  .punto.ring { background: transparent; border: 2px solid var(--c); width: 8px; height: 8px; box-sizing: border-box; }
  /* Atrio: quadratino invece del pallino. Il suo viola e il blu del maschile si confondono
     (ΔE 16, 3 con protanopia): la forma li distingue anche senza colore. */
  .punto.quadro { border-radius: 2px; }
  .sel .punto { outline: 1.5px solid var(--on-fill); }
  .legenda { display: flex; flex-wrap: wrap; gap: var(--space-6) var(--space-12); padding: var(--space-10) var(--space-4) var(--space-2); font-size: var(--text-xs); color: var(--muted); }
  .legenda span { display: inline-flex; align-items: center; gap: var(--space-6); }
  .legenda i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); display: inline-block; }
  .legenda i.quadro { border-radius: 2px; }
  .legenda i.ring { background: transparent; border: 2px solid var(--c); width: 9px; height: 9px; box-sizing: border-box; }
  .giorno-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: calc(var(--space-6) * -1); }
  h2 { margin: 0; font-size: var(--text-xl); }
  .nessuno { margin: 0; }
</style>
