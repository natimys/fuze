import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), VitePWA({
      registerType: 'prompt',
      includeAssets: ['brand/favicon.ico', 'brand/favicon-32.png'],
      manifest: {
        name: 'Fuze', short_name: 'Fuze', description: 'Your music, in one place',
        start_url: '/', scope: '/', display: 'standalone', orientation: 'any',
        theme_color: '#0a0a0b', background_color: '#0a0a0b',
        icons: [
          { src: '/brand/app-icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/brand/app-icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/brand/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
        runtimeCaching: [
          { urlPattern: ({ request }) => request.destination === 'image', handler: 'StaleWhileRevalidate', options: { cacheName: 'fuze-artwork-v1', expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [0, 200] } } },
        ],
      },
    })],
    resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
    server: {
      host: '127.0.0.1',
      port: 3000,
      strictPort: true,
      proxy: { '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true } },
    },
  }
})
