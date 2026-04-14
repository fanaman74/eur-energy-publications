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

// ── Claude AI summarize ───────────────────────────────────────────────────────
app.post('/api/summarize', async (req, res) => {
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const { title, date, type, subjects, agents } = req.body
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Write a concise 2-3 sentence factual summary for this EU energy publication based on its metadata. Do not include disclaimers — just write the summary directly.

Title: ${title}
Type: ${type || 'Publication'}
Date: ${date || 'Unknown'}
Subject areas: ${subjects?.join(', ') || 'Energy policy'}
Issuing body: ${agents?.join(', ') || 'European Commission'}`,
      }],
    })
    res.json({ summary: message.content[0].text })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── ENTSO-E cross-border electricity flows ────────────────────────────────────
const COUNTRY_EIC = {
  AT: '10YAT-APG------L', BE: '10YBE----------2', BG: '10YCA-BULGARIA-R',
  CH: '10YCH-SWISSGRIDZ', CZ: '10YCZ-CEPS-----N', DE: '10Y1001A1001A83F',
  DK: '10Y1001A1001A65H', EE: '10Y1001A1001A39I', ES: '10YES-REE------0',
  FI: '10YFI-1--------U',  FR: '10YFR-RTE------C', GB: '10YGB----------A',
  GR: '10YGR-HTSO-----Y',  HR: '10YHR-HEP------M', HU: '10YHU-MAVIR----U',
  IT: '10YIT-GRTN-----B',  LT: '10YLT-1001A0008Q', LU: '10YLU-CEGEDEL-NQ',
  LV: '10YLV-1001A00074',  NL: '10YNL----------L', NO: '10YNO-0--------C',
  PL: '10YPL-AREA-----S',  PT: '10YPT-REN------W', RO: '10YRO-TEL------P',
  RS: '10YCS-SERBIATSOV',  SE: '10YSE-1--------K', SI: '10YSI-ELES-----O',
  SK: '10YSK-SEPS-----K',
}

// Key European cross-border electricity interconnections
const FLOW_PAIRS = [
  ['DE','FR'], ['DE','NL'], ['DE','BE'], ['DE','AT'], ['DE','CH'],
  ['DE','CZ'], ['DE','PL'], ['DE','DK'],
  ['FR','ES'], ['FR','BE'], ['FR','IT'], ['FR','CH'], ['FR','GB'],
  ['ES','PT'], ['IT','AT'], ['IT','SI'], ['IT','GR'], ['IT','CH'],
  ['CH','AT'], ['AT','HU'], ['AT','SI'], ['AT','CZ'],
  ['HU','SK'], ['HU','RO'], ['HU','HR'], ['HU','RS'],
  ['CZ','SK'], ['PL','CZ'], ['PL','SK'], ['PL','LT'],
  ['SE','NO'], ['SE','FI'], ['SE','DK'], ['SE','LV'],
  ['FI','EE'], ['EE','LV'], ['LV','LT'], ['LT','PL'],
  ['NO','DK'], ['BE','NL'], ['BE','LU'], ['RO','BG'], ['BG','GR'],
  ['SI','HR'], ['HR','RS'],
]

let flowCache = { data: null, ts: 0 }

async function fetchEntsoeFlow(token, outCode, inCode, periodStart, periodEnd) {
  const eicOut = COUNTRY_EIC[outCode]
  const eicIn  = COUNTRY_EIC[inCode]
  if (!eicOut || !eicIn) return 0
  const params = new URLSearchParams({
    documentType: 'A09',
    out_Domain: eicOut,
    in_Domain:  eicIn,
    periodStart,
    periodEnd,
    securityToken: token,
  })
  try {
    const r = await fetch(`https://transparency.entsoe.eu/api?${params}`,
      { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return 0
    const xml = await r.text()
    const matches = [...xml.matchAll(/<quantity>(\d+\.?\d*)<\/quantity>/g)]
    if (!matches.length) return 0
    const vals = matches.map(m => parseFloat(m[1]))
    return vals.reduce((s, v) => s + v, 0) / vals.length  // avg MW over period
  } catch {
    return 0
  }
}

app.get('/api/energy-flows', async (req, res) => {
  try {
    const now = Date.now()
    if (flowCache.data && now - flowCache.ts < 30 * 60 * 1000) {
      return res.json(flowCache.data)
    }
    const token = process.env.ENTSOE_TOKEN
    if (!token) return res.json({ flows: null, live: false, reason: 'no_token' })

    // Query the hour that ended 1h ago (ensures data is published)
    const end = new Date()
    end.setUTCMinutes(0, 0, 0)
    end.setUTCHours(end.getUTCHours() - 1)
    const start = new Date(end.getTime() - 60 * 60 * 1000)
    const fmt = d => {
      const s = d.toISOString()
      return s.slice(0,4) + s.slice(5,7) + s.slice(8,10) + s.slice(11,13) + s.slice(14,16)
    }
    const ps = fmt(start), pe = fmt(end)

    // Fetch all pairs in both directions in parallel
    const fetches = FLOW_PAIRS.flatMap(([a, b]) => [
      fetchEntsoeFlow(token, a, b, ps, pe),
      fetchEntsoeFlow(token, b, a, ps, pe),
    ])
    const settled = await Promise.allSettled(fetches)

    const flows = []
    for (let i = 0; i < FLOW_PAIRS.length; i++) {
      const [a, b] = FLOW_PAIRS[i]
      const fwd = settled[2*i].status     === 'fulfilled' ? settled[2*i].value     : 0
      const rev = settled[2*i+1].status   === 'fulfilled' ? settled[2*i+1].value   : 0
      const net = fwd - rev  // positive = A→B
      if (Math.abs(net) > 20) flows.push({ from: a, to: b, mw: net })
    }

    const payload = { flows, live: true, periodEnd: end.toISOString() }
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
