import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable app that works offline: every built file is cached on the first visit.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'futmanager',
        short_name: 'futmanager',
        description: 'Gerencie seu time rumo à primeira divisão.',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#f3f8f4',
        theme_color: '#1d7a41',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        // The fantasy game's push notifications.
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    include: ['src/**/*.test.ts'],
    // The balance tests simulate thousands of matches; shared CI runners need more than the 5s default.
    testTimeout: 20_000,
  },
})
