<script lang="ts">
  const PATHS: Record<string, string> = {
    oggi: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    mese: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    importa: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    foglio: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
    impostazioni: '<path d="M10.26 5.01 L10.50 2.52 L13.50 2.52 L13.74 5.01 L15.71 5.83 L17.64 4.23 L19.77 6.36 L18.17 8.29 L18.99 10.26 L21.48 10.50 L21.48 13.50 L18.99 13.74 L18.17 15.71 L19.77 17.64 L17.64 19.77 L15.71 18.17 L13.74 18.99 L13.50 21.48 L10.50 21.48 L10.26 18.99 L8.29 18.17 L6.36 19.77 L4.23 17.64 L5.83 15.71 L5.01 13.74 L2.52 13.50 L2.52 10.50 L5.01 10.26 L5.83 8.29 L4.23 6.36 L6.36 4.23 L8.29 5.83 Z"/><circle cx="12" cy="12" r="3"/>',
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
    scarica: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    occhio: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    'occhio-no': '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
    persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    aggiorna: '<path d="M20 11a8 8 0 0 0-14.3-4.7L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.7l1.7-2.2M20 20v-4.5h-4.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    luna: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    euro: '<path d="M17 6.5A7 7 0 1 0 17 17.5M4 10h9M4 14h9"/>',
    freccia: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    salva: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  };
  let { nome, class: cls = '' }: { nome: string; class?: string } = $props();
</script>

<svg class="ic {cls}" viewBox="0 0 24 24" aria-hidden="true">{@html PATHS[nome] ?? ''}</svg>
