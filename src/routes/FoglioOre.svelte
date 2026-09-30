<script lang="ts">
  import { generaFoglioOre, MESI, type VoceGiorno } from '../lib/foglio/genera';
  import { condividiFile, scaricaFile } from '../lib/foglio/condividi';
  import { leggiVoci, salvaVoci, type ModelloSalvato } from '../lib/store';
  import { parseOre, formatOre, oreInParole, formatEuro } from '../lib/ore';

  interface Props {
    modello: ModelloSalvato;
    onimpostazioni: () => void;
  }
  let { modello, onimpostazioni }: Props = $props();

  const TARIFFA = 9; // €/h, solo per te: non finisce nel file
  const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

  interface Riga { day: number; input: string; note: string; apriNota: boolean }

  const oggi = new Date();
  let year = $state(oggi.getFullYear());
  let month = $state(oggi.getMonth() + 1);
  let righe = $state<Riga[]>([]);
  let caricato = $state(false);
  let messaggio = $state('');
  let errore = $state('');
  let lavoro = $state(false);

  const giorniNelMese = $derived(new Date(year, month, 0).getDate());
  const valori = $derived(righe.map((r) => parseOre(r.input)));
  const invalidi = $derived(valori.filter((v) => v !== null && Number.isNaN(v)).length);
  const totale = $derived(Math.round(valori.reduce<number>((s, v) => s + (v && !Number.isNaN(v) ? v : 0), 0) * 100) / 100);
  const giorniLavorati = $derived(valori.filter((v) => v && !Number.isNaN(v)).length);

  function weekday(d: number) {
    return GIORNI[new Date(year, month - 1, d).getDay()];
  }

  let ultimoCarica = 0;
  async function carica() {
    const token = ++ultimoCarica;
    caricato = false;
    const voci = await leggiVoci(year, month);
    if (token !== ultimoCarica) return; // nel frattempo è cambiato mese
    const n = new Date(year, month, 0).getDate();
    righe = Array.from({ length: n }, (_, i) => {
      const v = voci.find((x) => x.day === i + 1);
      return { day: i + 1, input: v?.hours ? formatOre(v.hours) : '', note: v?.note ?? '', apriNota: !!v?.note };
    });
    messaggio = '';
    errore = '';
    caricato = true;
  }

  function vociCorrenti(): VoceGiorno[] {
    const out: VoceGiorno[] = [];
    righe.forEach((r, i) => {
      const v = valori[i];
      const hours = v !== null && !Number.isNaN(v) && v > 0 ? v : 0;
      const note = r.note.trim() || undefined;
      if (hours > 0 || note) out.push({ day: r.day, hours, note });
    });
    return out;
  }

  // Ricarica quando cambia il mese
  $effect(() => {
    void year; void month;
    carica();
  });

  // Salvataggio immediato a ogni modifica: se chiudi l'app subito dopo, non si perde nulla.
  // Le scritture sono in coda, così l'ultima vince sempre.
  let coda: Promise<void> = Promise.resolve();
  $effect(() => {
    if (!caricato) return;
    const voci = $state.snapshot(vociCorrenti());
    const y = year, m = month;
    coda = coda.then(() => salvaVoci(y, m, voci)).catch(() => {
      errore = 'Non riesco a salvare sul telefono: controlla lo spazio disponibile.';
    });
  });

  function cambiaMese(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    year = d.getFullYear();
    month = d.getMonth() + 1;
  }

  async function genera(azione: 'condividi' | 'scarica') {
    errore = '';
    messaggio = '';
    if (invalidi) {
      errore = 'Correggi le ore segnate in rosso prima di generare il file.';
      return;
    }
    lavoro = true;
    try {
      const out = generaFoglioOre(modello.bytes, { year, month, voci: vociCorrenti() });
      if (azione === 'scarica') {
        scaricaFile(out.bytes, out.nomeFile);
        messaggio = `Scaricato: ${out.nomeFile}`;
      } else {
        const esito = await condividiFile(out.bytes, out.nomeFile);
        messaggio = esito === 'condiviso' ? 'Foglio ore condiviso.' : esito === 'scaricato' ? `Scaricato: ${out.nomeFile}` : '';
      }
    } catch (e) {
      errore = e instanceof Error ? e.message : 'Errore durante la creazione del file.';
    } finally {
      lavoro = false;
    }
  }
</script>

<header class="head">
  <div>
    <div class="lbl">Foglio ore</div>
    <div class="month">
      <button class="icon" aria-label="Mese precedente" onclick={() => cambiaMese(-1)}>
        <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <h1 class="d">{MESI[month - 1]} {year}</h1>
      <button class="icon" aria-label="Mese successivo" onclick={() => cambiaMese(1)}>
        <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
  </div>
  <button class="icon boxed" aria-label="Impostazioni" onclick={onimpostazioni}>
    <svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
  </button>
</header>

<div class="kpis">
  <div class="card kpi">
    <div class="lbl">Totale</div>
    <div class="big"><span class="d">{formatOre(totale)}</span> <span class="unit">h</span></div>
    <div class="muted">{giorniLavorati} {giorniLavorati === 1 ? 'giorno' : 'giorni'}</div>
  </div>
  <div class="kpi dark">
    <div class="lbl light">Compenso · solo tuo</div>
    <div class="m euro">{formatEuro(totale * TARIFFA)}</div>
    <div class="light small">{TARIFFA} €/h · non esportato</div>
  </div>
</div>

<div class="card list" aria-label="Ore per giorno">
  {#each righe as r, i (r.day)}
    {@const v = valori[i]}
    {@const bad = v !== null && Number.isNaN(v)}
    {@const weekend = weekday(r.day) === 'dom'}
    <div class="riga" class:has={v && !bad} class:weekend>
      <div class="gg"><span class="m num">{r.day}</span><span class="wd">{weekday(r.day)}</span></div>
      <input
        class="inp ore m"
        class:bad
        inputmode="decimal"
        placeholder="—"
        aria-label={`Ore del ${r.day}`}
        bind:value={r.input}
      />
      <div class="hint">
        {#if bad}<span class="errtxt">formato?</span>{:else if v}{oreInParole(v)}{/if}
      </div>
      <button class="nota-btn" class:on={r.apriNota || r.note} aria-expanded={r.apriNota} aria-label={`Nota del ${r.day}`} onclick={() => (r.apriNota = !r.apriNota)}>
        <svg viewBox="0 0 24 24"><path d="M5 19h4l10-10-4-4L5 15v4z" /></svg>
      </button>
    </div>
    {#if r.apriNota}
      <div class="nota">
        <input class="inp" placeholder="es. sost greta spogl piccoli" aria-label={`Nota del ${r.day} (colonna R)`} bind:value={r.note} />
      </div>
    {/if}
  {/each}
</div>

<div class="actions">
  {#if errore}<p class="msg err" role="alert">{errore}</p>{/if}
  {#if messaggio}<p class="msg ok" role="status">{messaggio}</p>{/if}
  <div class="btns">
    <button class="btn btn-accent grow" disabled={lavoro || giorniNelMese === 0} onclick={() => genera('condividi')}>
      <svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6" /></svg>
      Condividi foglio ore
    </button>
    <button class="btn btn-secondary" disabled={lavoro} onclick={() => genera('scarica')}>Scarica</button>
  </div>
  <p class="muted small">Ore in colonna Q, note in colonna R. Colonne O–P e cella Q45 lasciate vuote.</p>
</div>

<style>
  svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; }
  .month { display: flex; align-items: center; gap: 2px; margin-left: -10px; }
  h1 { margin: 0; font-size: 26px; font-weight: 800; min-width: 0; }
  .icon { width: 44px; height: 44px; border: none; background: none; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 12px; }
  .icon.boxed { border: 1px solid var(--line); background: var(--surface); }
  .kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
  .kpi { padding: 12px 14px; border-radius: var(--radius); }
  .kpi.dark { background: var(--ink); color: #fff; }
  .big { display: flex; align-items: baseline; gap: 4px; margin-top: 2px; }
  .big .d { font-size: 30px; font-weight: 800; }
  .unit { color: var(--muted); font-size: 14px; }
  .euro { font-size: 22px; font-weight: 600; margin-top: 6px; }
  .light { color: #aab7be; }
  .muted { color: var(--muted); font-size: 13px; margin: 0; }
  .small { font-size: 12px; }
  .list { overflow: hidden; }
  .riga { display: grid; grid-template-columns: 58px 84px 1fr 44px; align-items: center; gap: 8px; padding: 4px 8px 4px 14px; border-top: 1px solid var(--line-soft); min-height: 52px; }
  .riga:first-child { border-top: none; }
  .riga.weekend { background: #faf8f3; }
  .gg { display: flex; align-items: baseline; gap: 6px; }
  .num { font-weight: 600; width: 22px; text-align: right; }
  .wd { color: var(--muted); font-size: 13px; }
  .riga.has .num { color: var(--cloro); }
  .ore { height: 40px; text-align: center; padding: 0 8px; }
  .ore.bad { border-color: var(--danger); color: var(--danger); }
  .hint { font-size: 12px; color: var(--muted); }
  .errtxt { color: var(--danger); font-weight: 600; }
  .nota-btn { width: 44px; height: 44px; border: none; background: none; color: #6f7c83; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .nota-btn.on { color: var(--cloro); }
  .nota-btn svg { width: 18px; height: 18px; }
  .nota { padding: 0 14px 10px 80px; }
  .nota .inp { height: 40px; font-size: 14px; }
  .actions { position: sticky; bottom: 0; padding: 14px 0 calc(var(--safe-bottom) + 6px); background: var(--carta); border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
  .btns { display: flex; gap: 8px; }
  .grow { flex-grow: 1; }
  .msg { margin: 0; padding: 10px 14px; border-radius: 12px; font-size: 14px; }
  .msg.err { background: var(--warn-bg); color: var(--warn); }
  .msg.ok { background: var(--cloro-soft); color: #1d3a40; }
</style>
