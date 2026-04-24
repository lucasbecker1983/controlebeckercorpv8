import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'

// Certificados SSL
const sslOptions = {
    key: fs.readFileSync('/etc/letsencrypt/live/console.jacarezinho.cloud/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/console.jacarezinho.cloud/fullchain.pem'),
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
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
