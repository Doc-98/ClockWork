<script lang="ts">
  const PATHS: Record<string, string> = {
    oggi: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    mese: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    importa: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    foglio: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
    impostazioni: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    sx: '<path d="M15 6l-6 6 6 6"/>',
    dx: '<path d="M9 6l6 6-6 6"/>',
    giu: '<path d="M6 9l6 6 6-6"/>',
    chiudi: '<path d="M6 6l12 12M18 6L6 18"/>',
    scambio: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
    check: '<path d="M5 12l4 4 10-10"/>',
    piu: '<path d="M12 5v14M5 12h14"/>',
    condividi: '<path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6"/>',
    tabella: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/>',
    matita: '<path d="M5 19h4l10-10-4-4L5 15v4z"/>',
  };
  let { nome, class: cls = '' }: { nome: string; class?: string } = $props();
</script>

<svg class="ic {cls}" viewBox="0 0 24 24" aria-hidden="true">{@html PATHS[nome] ?? ''}</svg>
