import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

const sslKeyPath = process.env.VITE_SSL_KEY_PATH || '/etc/letsencrypt/live/console.jacarezinho.cloud/privkey.pem'
const sslCertPath = process.env.VITE_SSL_CERT_PATH || '/etc/letsencrypt/live/console.jacarezinho.cloud/fullchain.pem'
const hmrHost = process.env.VITE_HMR_HOST || 'console.jacarezinho.cloud'
const allowedHosts = [hmrHost, 'all']
const sslOptions = (
  fs.existsSync(path.resolve(sslKeyPath)) && fs.existsSync(path.resolve(sslCertPath))
    ? {
        key: fs.readFileSync(path.resolve(sslKeyPath)),
        cert: fs.readFileSync(path.resolve(sslCertPath)),
      }
    : false
)

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    host: '0.0.0.0',
    port: 6777,
    allowedHosts,
    https: sslOptions,
    hmr: {
      protocol: sslOptions ? 'wss' : 'ws',
      host: hmrHost,
      clientPort: sslOptions ? 443 : 6777,
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 6777,
    allowedHosts,
    https: sslOptions
  },
  build: {
    chunkSizeWarningLimit: 1600
  }
})
