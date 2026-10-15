import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Веб-разработка: прокси к открытой базе и сервисам анализа фото.
// поэтому dev-сервер проксирует их. На iOS запросы идут нативно через CapacitorHttp.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: { ignored: ['**/ios/**', '**/build/**', '**/dist/**', '**/*.tsbuildinfo'] },
    proxy: {
      // Сервер BodyTrain (npm run server:dev)
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
      '/proxy/groq': {
        target: 'https://api.groq.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/groq/, ''),
      },
      '/proxy/openrouter': {
        target: 'https://openrouter.ai',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/openrouter/, ''),
      },
      '/proxy/cloudflare': {
        target: 'https://api.cloudflare.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/cloudflare/, ''),
      },
    },
  },
})
