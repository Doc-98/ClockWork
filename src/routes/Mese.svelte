<script lang="ts">
  import { dati } from '../lib/dati.svelte';
  import { router, type Rotta } from '../lib/router.svelte';
  import { isoDa, dataDa, oreDi, type Area } from '../lib/model';
  import { formatOre, formatEuro } from '../lib/ore';
  import { MESI } from '../lib/foglio/genera';
  import RigaTurno from '../components/RigaTurno.svelte';
  import Icona from '../components/Icona.svelte';
  import BannerCalendario from '../components/BannerCalendario.svelte';

  let { rotta }: { rotta: Extract<Rotta, { nome: 'mese' }> } = $props();

  const oggi = new Date();
  const ym = $derived.by(() => {
    const m = /^(\d{4})-(\d{2})$/.exec(rotta.ym ?? '');
    return m ? { year: Number(m[1]), month: Number(m[2]) } : { year: oggi.getFullYear(), month: oggi.getMonth() + 1 };
  });
  const oggiIso = isoDa(oggi);
  const giornoSel = $derived.by(() => {
    if (rotta.giorno) return rotta.giorno;
    const primo = `${ym.year}-${String(ym.month).padStart(2, '0')}-01`;
    return oggiIso.startsWith(primo.slice(0, 8)) ? oggiIso : primo;
  });

  const turniMese = $derived(dati.turniDelMese(ym.year, ym.month));
  const attivi = $derived(turniMese.filter((t) => !t.annullato));
  const oreTot = $derived(Math.round(attivi.reduce((s, t) => s + oreDi(t), 0) * 100) / 100);
  const nSost = $derived(attivi.filter((t) => t.sostituisce).length);

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

  function cambiaMese(delta: number) {
    const d = new Date(ym.year, ym.month - 1 + delta, 1);
    router.vai(`#/mese/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, true);
  }
  function scegli(iso: string) {
    router.vai(`#/mese/${iso.slice(0, 7)}?g=${iso}`, true);
  }
  const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const titoloGiorno = $derived.by(() => {
    const d = dataDa(giornoSel);
    return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()].toLowerCase()}`;
  });
</script>

<section class="page">
  <header class="head">
    <button class="icon-btn" aria-label="Mese precedente" onclick={() => cambiaMese(-1)}><Icona nome="sx" /></button>
    <div class="titolo">
      <h1 class="d">{MESI[ym.month - 1]} {ym.year}</h1>
      <div class="m muted small">
        {formatOre(oreTot)} h{nSost ? ` · ${attivi.length - nSost} da orari + ${nSost} sost.` : ` · ${attivi.length} turni`} · {formatEuro(oreTot * dati.impostazioni.tariffa).replace(',00', '')}
      </div>
    </div>
    <button class="icon-btn" aria-label="Mese successivo" onclick={() => cambiaMese(1)}><Icona nome="dx" /></button>
  </header>

  <BannerCalendario />

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
            aria-label={`${c.d}${c.punti.length ? `, ${c.punti.length} turni` : ''}`}
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
      <span><i style="--c: var(--area-m)"></i>Spogl. M</span>
      <span><i style="--c: var(--area-f)"></i>Spogl. F</span>
      <span><i style="--c: var(--area-p)"></i>Piccoli</span>
      <span><i class="quadro" style="--c: var(--area-a)"></i>Atrio</span>
      <span><i class="ring" style="--c: var(--muted)"></i>Sostituzione</span>
    </div>
  </div>

  <div class="giorno-head">
    <h2>{titoloGiorno}</h2>
    <span class="m muted small">{delGiorno.length ? `${delGiorno.length} ${delGiorno.length === 1 ? 'turno' : 'turni'}` : ''}</span>
  </div>

  {#each delGiorno as t (t.id)}
    <RigaTurno turno={t} mostraData={false} />
  {:else}
    <p class="muted small nessuno">Nessun turno.</p>
  {/each}

  <a class="btn aggiungi" href={`#/turno/nuovo?data=${giornoSel}`}><Icona nome="piu" /> Aggiungi turno o sostituzione</a>

  {#if dati.ultimaImportazione}
    <div class="ultimo muted small">
      <span>Importato il {new Date(dati.ultimaImportazione.quando).toLocaleDateString('it-IT')} da «{dati.ultimaImportazione.nomeFile}»</span>
      <a class="link small" href="#/importa">Aggiorna</a>
    </div>
  {/if}
</section>

<style>
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .titolo { text-align: center; min-width: 0; }
  h1 { margin: 0; font-size: var(--text-3xl); font-weight: 800; }
  .cal { padding: 12px; }
  .grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
  .wd { padding-bottom: 6px; text-align: center; }
  .wd .lbl { font-size: var(--text-2xs); }
  .cella { height: 50px; border: none; background: none; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; cursor: pointer; color: var(--ink); padding: 0; }
  .cella.oggi .num { color: var(--cloro); font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
  .cella.sel { background: var(--ink); color: var(--on-ink); }
  .cella.sel .num { color: var(--on-ink); }
  .num { font-size: var(--text-base); font-weight: 500; }
  .punti { display: flex; gap: 3px; height: 8px; align-items: center; }
  .punto { width: 7px; height: 7px; border-radius: 50%; background: var(--c); }
  .punto.ring { background: transparent; border: 2px solid var(--c); width: 8px; height: 8px; box-sizing: border-box; }
  /* Atrio: quadratino invece del pallino. Il suo viola e il blu del maschile si confondono
     (ΔE 16, 3 con protanopia): la forma li distingue anche senza colore. */
  .punto.quadro { border-radius: 2px; }
  .sel .punto { outline: 1.5px solid var(--on-ink); }
  .legenda { display: flex; flex-wrap: wrap; gap: 6px 12px; padding: 10px 4px 2px; font-size: var(--text-xs); color: var(--muted); }
  .legenda span { display: inline-flex; align-items: center; gap: 6px; }
  .legenda i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); display: inline-block; }
  .legenda i.quadro { border-radius: 2px; }
  .legenda i.ring { background: transparent; border: 2px solid var(--c); width: 9px; height: 9px; box-sizing: border-box; }
  .giorno-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: -6px; }
  h2 { margin: 0; font-size: var(--text-xl); }
  .nessuno { margin: 0; }
  .aggiungi { border: 1.5px dashed var(--line-dashed); background: transparent; color: var(--ink); text-decoration: none; }
  .ultimo { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .ultimo .link { white-space: nowrap; }
</style>
