import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icon.svg', 'push-sw.js', 'apple-touch-icon.png', 'favicon-32.png'],
    manifest: { name: 'Planner Diário', short_name: 'Planner', lang: 'pt-BR', id: '/', start_url: '/?v=2', display: 'standalone', background_color: '#ffffff', theme_color: '#4f46e5',
      icons: [{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png' }, { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' }, { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }, { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }] },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png}'], cacheId: 'planner-v2', importScripts: ['push-sw.js'], skipWaiting: true, clientsClaim: true }
  })]
})
