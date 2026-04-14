import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function summarizeApiPlugin(anthropicApiKey) {
  return {
    name: 'summarize-api',
    configureServer(server) {
      server.middlewares.use('/api/summarize', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }

        let body = ''
        req.on('data', (chunk) => { body += chunk.toString() })
        req.on('end', async () => {
          try {
            const { default: Anthropic } = await import('@anthropic-ai/sdk')
            const { title, date, type, subjects, agents } = JSON.parse(body)

            const client = new Anthropic({ apiKey: anthropicApiKey })
            const message = await client.messages.create({
              model: 'claude-haiku-4-5',
              max_tokens: 300,
              messages: [
                {
                  role: 'user',
                  content: `Write a concise 2-3 sentence factual summary for this EU energy publication based on its metadata. Do not include disclaimers or say you are summarizing from metadata — just write the summary directly.

Title: ${title}
Type: ${type || 'Publication'}
Date: ${date || 'Unknown'}
Subject areas: ${subjects?.join(', ') || 'Energy policy'}
Issuing body: ${agents?.join(', ') || 'European Commission'}`,
                },
              ],
            })

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ summary: message.content[0].text }))
          } catch (e) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: e.message }))
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), summarizeApiPlugin(env.ANTHROPIC_API_KEY)],
    server: {
      proxy: {
        '/api/sparql': {
          target: 'http://publications.europa.eu',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/sparql/, '/webapi/rdf/sparql'),
        },
        '/api/opsearch': {
          target: 'https://op.europa.eu',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/opsearch/, '/en/search-results'),
        },
        '/api/opendata': {
          target: 'https://data.europa.eu',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/opendata/, '/api/hub/search'),
        },
        '/api/acer-rss': {
          target: 'https://www.acer.europa.eu',
          changeOrigin: true,
          rewrite: () => '/rss.xml',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EU-Energy-Explorer)' },
        },
      },
    },
  }
})
