import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.text({ type: 'application/x-www-form-urlencoded' }))

// ── SPARQL proxy ──────────────────────────────────────────────────────────────
app.post('/api/sparql', async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? req.body : new URLSearchParams(req.body).toString()
    const upstream = await fetch('http://publications.europa.eu/webapi/rdf/sparql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/sparql-results+json',
      },
      body,
    })
    const data = await upstream.json()
    res.json(data)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// ── ACER RSS proxy ────────────────────────────────────────────────────────────
app.get('/api/acer-rss', async (req, res) => {
  try {
    const upstream = await fetch('https://www.acer.europa.eu/rss.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EU-Energy-Explorer)' },
    })
    const text = await upstream.text()
    res.setHeader('Content-Type', 'application/xml')
    res.send(text)
  } catch (e) {
    res.status(502).send('')
  }
})

// ── AI summarize via OpenRouter (google/gemma-4-26b-a4b-it:free) ─────────────
app.post('/api/summarize', async (req, res) => {
  try {
    const { title, date, type, subjects, agents } = req.body
    const prompt = `Write a concise 2-3 sentence factual summary for this EU energy publication based on its metadata. Do not include disclaimers — just write the summary directly.

Title: ${title}
Type: ${type || 'Publication'}
Date: ${date || 'Unknown'}
Subject areas: ${subjects?.join(', ') || 'Energy policy'}
Issuing body: ${agents?.join(', ') || 'European Commission'}`

    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://eu-energy-explorer.app',
        'X-Title': 'EU Energy Explorer',
      },
      body: JSON.stringify({
        model: 'google/gemma-3-27b-it:free',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!upstream.ok) {
      const err = await upstream.text()
      return res.status(502).json({ error: `OpenRouter ${upstream.status}: ${err}` })
    }

    const data = await upstream.json()
    const summary = data.choices?.[0]?.message?.content?.trim()
    if (!summary) return res.status(502).json({ error: 'Empty response from model' })
    res.json({ summary })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Cross-border electricity flows — Energy-Charts API (Fraunhofer ISE, free) ──
// Docs: https://api.energy-charts.info/ — no registration, 15-min resolution, GW
const ECHARTS_NAME_TO_CODE = {
  'Austria': 'AT', 'Belgium': 'BE', 'Bulgaria': 'BG', 'Croatia': 'HR',
  'Czech Republic': 'CZ', 'Czechia': 'CZ', 'Denmark': 'DK', 'Estonia': 'EE',
  'Finland': 'FI', 'France': 'FR', 'Germany': 'DE', 'Great Britain': 'GB',
  'Greece': 'GR', 'Hungary': 'HU', 'Ireland': 'IE', 'Italy': 'IT',
  'Latvia': 'LV', 'Lithuania': 'LT', 'Luxembourg': 'LU', 'Netherlands': 'NL',
  'Norway': 'NO', 'Poland': 'PL', 'Portugal': 'PT', 'Romania': 'RO',
  'Serbia': 'RS', 'Slovakia': 'SK', 'Slovenia': 'SI', 'Spain': 'ES',
  'Sweden': 'SE', 'Switzerland': 'CH',
}

// Hub countries — querying each returns all its neighbors
const HUB_COUNTRIES = ['de','fr','it','es','pl','se','no','at','be','nl','cz','hu','ro','gr','fi']

let flowCache = { data: null, ts: 0 }

app.get('/api/energy-flows', async (req, res) => {
  try {
    const now = Date.now()
    if (flowCache.data && now - flowCache.ts < 30 * 60 * 1000) {
      return res.json(flowCache.data)
    }

    // Last 2 hours of 15-min cross-border physical flows
    const end   = new Date()
    const start = new Date(end.getTime() - 2 * 60 * 60 * 1000)
    const startStr = start.toISOString().slice(0, 19) + 'Z'
    const endStr   = end.toISOString().slice(0, 19) + 'Z'

    const fetches = HUB_COUNTRIES.map(async (country) => {
      try {
        const r = await fetch(
          `https://api.energy-charts.info/cbpf?country=${country}&start=${startStr}&end=${endStr}`,
          { signal: AbortSignal.timeout(8000) }
        )
        if (!r.ok) return null
        return { country: country.toUpperCase(), data: await r.json() }
      } catch { return null }
    })

    const settled = await Promise.allSettled(fetches)

    // Build canonical bilateral map: key "A-B" (A < B), value = avg GW A→B
    const flowMap = new Map()
    for (const s of settled) {
      if (s.status !== 'fulfilled' || !s.value) continue
      const { country: C, data } = s.value
      if (!data?.countries) continue

      for (const neighbor of data.countries) {
        const N = ECHARTS_NAME_TO_CODE[neighbor.name]
        if (!N || N === C) continue
        const vals = (neighbor.data || []).filter(v => v != null)
        if (!vals.length) continue
        // Average last 4 points (~1h); positive = import INTO C, i.e. N→C
        const recentGW = vals.slice(-4).reduce((s, v) => s + v, 0) / Math.min(vals.length, 4)
        // Canonicalise: A < B alphabetically, positive = A→B
        const [a, b] = [C, N].sort()
        const canonGW  = N < C ? recentGW : -recentGW
        const ex = flowMap.get(`${a}-${b}`) || { total: 0, count: 0 }
        flowMap.set(`${a}-${b}`, { total: ex.total + canonGW, count: ex.count + 1 })
      }
    }

    const flows = []
    for (const [key, { total, count }] of flowMap) {
      const avgGW = total / count
      if (Math.abs(avgGW) < 0.05) continue  // < 50 MW — skip noise
      const [a, b] = key.split('-')
      flows.push({
        from: avgGW > 0 ? a : b,
        to:   avgGW > 0 ? b : a,
        mw:   Math.round(Math.abs(avgGW) * 1000),  // GW → MW
      })
    }

    const payload = { flows, live: true, source: 'energy-charts.info', ts: end.toISOString() }
    flowCache = { data: payload, ts: now }
    res.json(payload)
  } catch (e) {
    res.status(200).json({ flows: null, live: false, error: e.message })
  }
})

// ── Serve React app ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist')))
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
