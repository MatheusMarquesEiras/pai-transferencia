import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendPort = process.env.BACKEND_PORT ?? '8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
        timeout: 0,        // sem timeout de socket
        proxyTimeout: 0,   // sem timeout aguardando resposta do backend
      },
    },
  },
})
