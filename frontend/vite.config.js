import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'

// Certificados SSL
const sslOptions = {
    key: fs.readFileSync('/etc/letsencrypt/live/console.jacarezinho.cloud/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/console.jacarezinho.cloud/fullchain.pem'),
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      selfDestroying: true,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'becker-logo.svg'],
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      manifest: {
        name: 'Controle Becker Corp V8',
        short_name: 'Becker V8',
        description: 'Centro de Comando Operacional Becker Corp',
        theme_color: '#020617', // Cor da barra de status do Android (Dark)
        background_color: '#020617',
        display: 'standalone', // Remove a barra de URL (Aparência de App)
        orientation: 'portrait',
        start_url: '/', // O App começa no Dashboard principal
        icons: [
          {
            src: 'becker-logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 6777,
    allowedHosts: ['console.jacarezinho.cloud', 'all'],
    https: sslOptions,
    hmr: {
      protocol: 'wss',
      host: 'console.jacarezinho.cloud',
      clientPort: 443,
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 6777,
    allowedHosts: ['console.jacarezinho.cloud', 'all'],
    https: sslOptions
  },
  build: {
    chunkSizeWarningLimit: 1600
  }
})
