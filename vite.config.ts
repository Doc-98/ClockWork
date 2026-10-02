/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Su GitHub Pages il sito vive in /<nome-repo>/: il workflow passa BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ClockWork',
        short_name: 'ClockWork',
        description: 'Turni e foglio ore per Leone XIII Sport',
        lang: 'it',
        // identità esplicita e diversa dallo start_url: Chrome Android aveva un record
        // "già installata" fantasma legato all'identità implicita (= start_url)
        id: `${base}?app=clockwork`,
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F4F1EA',
        theme_color: '#10212B',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // C-orologio all'86%: arriva a 165px dal centro, ben dentro il cerchio sicuro (205px) che Android non ritaglia
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // xlsx: il modello del foglio ore, serve anche offline
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,xlsx}'],
        navigateFallback: 'index.html',
        // la pagina di ritorno dal login Google non deve essere sostituita dall'app
        navigateFallbackDenylist: [/oauth\.html/],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
