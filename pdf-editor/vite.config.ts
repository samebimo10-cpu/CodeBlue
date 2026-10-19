import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base so the same build works from a web server, GitHub Pages
// sub-path, or inside the Android/iOS app (Capacitor).
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 3000 },
  worker: { format: 'es' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icons/*.png', 'icons/*.svg', 'standard_fonts/*', 'cmaps/*'],
      manifest: {
        name: 'InkDesk PDF',
        short_name: 'InkDesk',
        description: 'Offline PDF editor with smart erasers, handwriting and a receipt designer.',
        theme_color: '#1f4fd1',
        background_color: '#f4f6fb',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        file_handlers: [{ action: './', accept: { 'application/pdf': ['.pdf'] } }],
      },
      workbox: {
        // Precache everything so the whole app works with no connection.
        globPatterns: ['**/*.{js,mjs,css,html,woff2,png,svg,ico,bcmap,pfb,ttf,json}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
    }),
  ],
  test: { environment: 'jsdom' },
} as any);
