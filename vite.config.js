import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // ── CELLAR SPARQL endpoint ─────────────────────────────────────────────
      '/api/sparql': {
        target: 'http://publications.europa.eu',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/sparql/, '/webapi/rdf/sparql'),
      },
      // ── All other /api/* routes → Express server on port 3000 ─────────────
      // Run `node server.js` alongside `npm run dev` for these to work.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
})
