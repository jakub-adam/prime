/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pkg from './package.json' with { type: 'json' };

function gitSha() {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'dev'; }
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? gitSha()),
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'icon-180.png', 'CNAME'],
      manifest: {
        name: 'Prime',
        short_name: 'Prime',
        description: 'Food, training, body and activity in one place.',
        start_url: './#today',
        scope: './',
        display: 'standalone',
        background_color: '#eef1f3',
        theme_color: '#c63f27',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'], globIgnores: ['**/*.woff'],
        navigateFallback: 'index.html',
        // A new version takes over open pages at once (autoUpdate then reloads them), instead of waiting for the next visit.
        skipWaiting: true,
        clientsClaim: true,
        // Data goes through the GitHub API and is cached by the app itself (localStorage), never by the service worker.
        runtimeCaching: [{ urlPattern: /^https:\/\/api\.github\.com\//, handler: 'NetworkOnly' }],
      },
    }),
  ],
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
