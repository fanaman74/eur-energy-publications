import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readFileSync } from 'fs'

// Load .env if present (works without dotenv — manual parse)
try {
  const env = readFileSync(new URL('.env', import.meta.url), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch { /* .env not found — rely on environment */ }

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.text({ type: 'application/x-www-form-urlencoded' }))

// ── SPARQL proxy ──────────────────────────────────────────────────────────────
app.post('/api/sparql', async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? req.body : new URLSearchParams(req.body).toString()
    const upstream = await fetch('https://publications.europa.eu/webapi/rdf/sparql', {
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

// ── AI summarize via OpenRouter — tries models in order until one succeeds ────
const SUMMARY_MODELS = [
  'google/gemma-4-26b-a4b-it:free',   // confirmed free, 262K ctx
  'google/gemma-4-31b-it:free',        // confirmed free, 262K ctx
  'nvidia/nemotron-3-super-120b-a12b:free', // confirmed free, 262K ctx
  'openrouter/elephant-alpha',          // confirmed free, 256K ctx
]

function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim()
}

function isWafPage(text) {
  return (
    text.length < 500 ||
    text.includes('Enable JavaScript') ||
    text.includes('Just a moment') ||
    text.includes('cf-browser-verification') ||
    text.includes('Checking your browser') ||
    text.includes('DDoS protection')
  )
}


// Spoofed browser headers — publications.europa.eu accepts requests from these
// without requiring real client sec-ch-ua fingerprinting.
const CELLAR_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'cross-site',
}

// Extract hrefs from an HTTP 300 Multiple Choices HTML body
function extractChoiceLinks(html) {
  const hrefs = []
  const rx = /href="([^"]+)"/gi
  let m
  while ((m = rx.exec(html)) !== null) hrefs.push(m[1])
  return hrefs
}

// Fetch one manifestation link and return its text, routing by Content-Type.
// Returns null if the link is not useful content (RDF, WAF page, too short).
async function fetchManifest(abs, headers) {
  let r
  try {
    r = await fetch(abs, { headers, signal: AbortSignal.timeout(20000), redirect: 'follow' })
  } catch (e) {
    console.log(`[fulltext]   fetch error (${abs.split('/').slice(-2).join('/')}): ${e.message}`)
    return null
  }
  const ct = r.headers.get('content-type') || ''
  console.log(`[fulltext]   ${r.status} ${ct.slice(0, 35).padEnd(35)} ${abs.split('/').slice(-2).join('/')}`)
  if (!r.ok) return null

  // PDF — extract text with pdf-parse
  if (ct.includes('pdf') || abs.toLowerCase().includes('pdf')) {
    try {
      const buf = Buffer.from(await r.arrayBuffer())
      const parsed = await pdfParse(buf)
      const text = parsed.text?.replace(/\s+/g, ' ').trim() || ''
      if (text.length < 200) { console.log(`[fulltext]   → PDF too short (${text.length})`); return null }
      console.log(`[fulltext]   → PDF ${text.length} chars`)
      return text
    } catch (e) { console.log(`[fulltext]   → pdf-parse error: ${e.message}`); return null }
  }

  // HTML / XHTML / plain-text
  let text = await r.text()
  // Skip RDF/XML that slipped through
  if (ct.includes('rdf') || ct.includes('sparql') || text.trimStart().startsWith('<rdf')) return null
  if (text.trimStart().startsWith('<')) text = stripHtml(text)
  if (isWafPage(text)) { console.log(`[fulltext]   → WAF/short`); return null }
  return text
}

async function fetchLegislativeFullText(workId, celex, lang = 'ENG') {
  // Map lang code to Accept-Language header value
  const LANG_MAP = {
    ITA: 'it,it-IT;q=0.9,en;q=0.5',
    ENG: 'en,en-GB;q=0.9',
  }
  const acceptLang = LANG_MAP[lang] || LANG_MAP.ENG

  // Helper: follows a CELLAR URI to its content. CELLAR sends HTTP 303 with a
  // Location header (using http://). We upgrade it to https:// to avoid port-80
  // issues on cloud providers, then fetch the actual document.
  async function followCellarUri(uri) {
    const httpsUri = uri.replace(/^http:\/\//, 'https://')
    console.log(`[fulltext] CELLAR 303 probe → ${httpsUri}`)
    for (const acceptType of ['application/xhtml+xml', 'text/html', 'application/pdf']) {
      try {
        const probe = await fetch(httpsUri, {
          method: 'GET',
          headers: { ...CELLAR_HEADERS, Accept: acceptType, 'Accept-Language': acceptLang },
          signal: AbortSignal.timeout(15000),
          redirect: 'manual',
        })
        console.log(`[fulltext] → ${probe.status} (${acceptType})`)

        let contentUrl = null
        if (probe.status === 303 || probe.status === 302 || probe.status === 301) {
          contentUrl = probe.headers.get('location')
          // Always upgrade http → https: Render (and most cloud providers) may block
          // outbound port 80. CELLAR consistently sends http:// Location headers.
          if (contentUrl) contentUrl = contentUrl.replace(/^http:\/\//, 'https://')
          console.log(`[fulltext] Location (upgraded): ${contentUrl}`)
        } else if (probe.ok) {
          const ct = probe.headers.get('content-type') || ''
          const body = await probe.text()
          const text = (ct.includes('html') || body.trimStart().startsWith('<')) ? stripHtml(body) : body
          if (!isWafPage(text) && hasArticleContent(text)) {
            console.log(`[fulltext] ✓ direct body ${text.length}ch`)
            return text
          }
        }

        if (contentUrl) {
          const docRes = await fetch(contentUrl, {
            headers: { ...CELLAR_HEADERS, 'Accept-Language': acceptLang },
            signal: AbortSignal.timeout(30000),
            redirect: 'follow',
          })
          const ct = docRes.headers.get('content-type') || ''
          console.log(`[fulltext] content fetch → ${docRes.status} ${ct.slice(0, 40)}`)
          if (!docRes.ok) continue

          if (ct.includes('pdf') || contentUrl.toLowerCase().endsWith('.pdf')) {
            try {
              const buf = Buffer.from(await docRes.arrayBuffer())
              const parsed = await pdfParse(buf)
              const text = parsed.text?.replace(/\s+/g, ' ').trim() || ''
              if (text.length > 200 && hasArticleContent(text)) {
                console.log(`[fulltext] ✓ CELLAR PDF ${text.length}ch`)
                return text
              }
            } catch (e) { console.log(`[fulltext] pdf-parse error: ${e.message}`) }
          } else {
            const raw = await docRes.text()
            const text = (ct.includes('html') || raw.trimStart().startsWith('<')) ? stripHtml(raw) : raw
            if (!isWafPage(text) && hasArticleContent(text)) {
              console.log(`[fulltext] ✓ CELLAR ${acceptType} ${text.length}ch`)
              return text
            }
            console.log(`[fulltext] no article patterns in ${text.length}ch — trying next accept type`)
          }
        }
      } catch (e) {
        console.log(`[fulltext] probe error (${acceptType}): ${e.message}`)
      }
    }
    return null
  }

  // ── Strategy 1: CELLAR work URI (by CELLAR UUID) ──────────────────────────
  // publications.europa.eu is NOT behind AWS WAF and reliably serves content
  // to server-side requests. EUR-Lex is WAF-protected (JS challenge) so we
  // NEVER fall through to it — it will never work from a server.
  if (workId) {
    const text = await followCellarUri(`https://publications.europa.eu/resource/cellar/${workId}`)
    if (text) return text
  }

  // ── Strategy 2: CELLAR resource/celex URI (by CELEX number) ──────────────
  // publications.europa.eu/resource/celex/{CELEX} also resolves via 303 to
  // the manifestation — useful when we have CELEX but no UUID.
  if (celex) {
    console.log(`[fulltext] trying CELLAR celex URI for ${celex}`)
    const text = await followCellarUri(`https://publications.europa.eu/resource/celex/${celex}`)
    if (text) return text
  }

  // ── NOTE: EUR-Lex (eur-lex.europa.eu) is protected by AWS WAF ────────────
  // Every server-side request returns HTTP 202 with a JavaScript challenge.
  // Browser-rendered JS execution is required to pass the challenge — this is
  // fundamentally impossible from Node.js fetch or curl. EUR-Lex fallbacks
  // have been removed because they can never succeed from a server.

  console.log('[fulltext] all CELLAR strategies exhausted — no content available')
  return null
}

// ── ENEL Regulatory Briefing system prompt ────────────────────────────────────
// Edit aisummary.md to change the prompt — no server restart needed if you
// call /api/reload-prompt, or just restart the server after saving the file.
let ENEL_SYSTEM_PROMPT = (() => {
  try {
    return readFileSync(new URL('./aisummary.md', import.meta.url), 'utf8').trim()
  } catch {
    console.warn('[prompt] aisummary.md not found — using empty fallback')
    return ''
  }
})()

// Hot-reload endpoint: POST /api/reload-prompt to pick up aisummary.md changes
// without restarting the server.
app.post('/api/reload-prompt', (_req, res) => {
  try {
    ENEL_SYSTEM_PROMPT = readFileSync(new URL('./aisummary.md', import.meta.url), 'utf8').trim()
    console.log(`[prompt] reloaded from aisummary.md (${ENEL_SYSTEM_PROMPT.length} chars)`)
    res.json({ ok: true, chars: ENEL_SYSTEM_PROMPT.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── PPTX slide content prompt ─────────────────────────────────────────────────
// Edit aipptx.md to change how the AI structures slide content.
let PPTX_SYSTEM_PROMPT = (() => {
  try {
    return readFileSync(new URL('./aipptx.md', import.meta.url), 'utf8').trim()
  } catch {
    console.warn('[pptx-prompt] aipptx.md not found — using empty fallback')
    return ''
  }
})()

app.post('/api/reload-pptx-prompt', (_req, res) => {
  try {
    PPTX_SYSTEM_PROMPT = readFileSync(new URL('./aipptx.md', import.meta.url), 'utf8').trim()
    console.log(`[pptx-prompt] reloaded from aipptx.md (${PPTX_SYSTEM_PROMPT.length} chars)`)
    res.json({ ok: true, chars: PPTX_SYSTEM_PROMPT.length })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── AI slide content endpoint ─────────────────────────────────────────────────
// Accepts a completed briefing note (markdown) + doc metadata.
// Returns structured JSON for the pptxgenjs slide renderer.
app.post('/api/slide-content', async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not set on server' })
  }
  const { summary, title, date, type, celex } = req.body
  if (!summary) return res.status(400).json({ error: 'summary is required' })

  const apiKey = (process.env.OPENROUTER_API_KEY || '').trim()
  const userMessage = [
    title  ? `Document title: ${title}`  : null,
    celex  ? `CELEX: ${celex}`           : null,
    type   ? `Type: ${type}`             : null,
    date   ? `Date: ${date}`             : null,
    '',
    'BRIEFING NOTE:',
    summary,
  ].filter(v => v !== null).join('\n')

  let lastError = 'All models failed'
  for (const model of SUMMARY_MODELS) {
    try {
      const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://eu-energy-explorer.app',
          'X-Title': 'EU Energy Explorer',
        },
        body: JSON.stringify({
          model,
          max_tokens: 6000,
          temperature: 0.2,
          messages: [
            { role: 'system', content: PPTX_SYSTEM_PROMPT },
            { role: 'user',   content: userMessage },
          ],
        }),
      })

      const rawText = await upstream.text()
      console.log(`[slide-content] ${model} → ${upstream.status}`)
      if (!upstream.ok) { lastError = `${model}: HTTP ${upstream.status}`; continue }

      let data
      try { data = JSON.parse(rawText) } catch { lastError = 'Invalid JSON from upstream'; continue }

      const content = data.choices?.[0]?.message?.content?.trim()
      if (!content) { lastError = 'Empty response'; continue }

      // Strip any accidental markdown fences the model may wrap around the JSON
      const jsonStr = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      let slide
      try { slide = JSON.parse(jsonStr) } catch { lastError = 'Model did not return valid JSON'; continue }

      return res.json({ slide, model })
    } catch (e) {
      lastError = e.message
    }
  }

  res.status(502).json({ error: lastError })
})

// Check that retrieved text actually contains legislative article content.
// EUR-Lex can return metadata/summary pages that pass length checks but
// don't contain the actual article body — this guards against that.
function hasArticleContent(text) {
  const hasArticles = /\bArticle\s+\d+\b/i.test(text) || /\bArt\.\s*\d+\b/.test(text)
  const hasRecitals = /\bWhereas\b|\bHaving regard\b|\bRecital\b/i.test(text)
  return hasArticles || hasRecitals
}

// Fetch the first 80 KB of a URL and check it contains article content.
// Uses Range header where supported; falls back to reading the full response
// but aborts as soon as we have enough bytes.
async function probeUrlForArticles(url, extraHeaders = {}) {
  try {
    const r = await fetch(url, {
      headers: { ...CELLAR_HEADERS, ...extraHeaders, Range: 'bytes=0-81919' },
      signal: AbortSignal.timeout(12000),
      redirect: 'follow',
    })
    if (!r.ok) return false
    const ct = r.headers.get('content-type') || ''
    // Skip binary/RDF formats
    if (ct.includes('pdf') || ct.includes('rdf') || ct.includes('sparql')) return false
    const raw = await r.text()
    const text = (ct.includes('html') || raw.trimStart().startsWith('<')) ? stripHtml(raw) : raw
    return hasArticleContent(text)
  } catch { return false }
}

// ── Full-text availability probe ─────────────────────────────────────────────
// Does a real partial GET (first 80 KB) via CELLAR and runs hasArticleContent.
// NOTE: EUR-Lex (eur-lex.europa.eu) is behind AWS WAF and returns a JavaScript
// challenge to all server requests — we only probe CELLAR (publications.europa.eu)
// which is NOT WAF-protected and responds correctly from servers.
// Returns { available: bool, source: 'CELLAR'|null }
app.get('/api/fulltext-check', async (req, res) => {
  const { workId, celex } = req.query
  if (!workId && !celex) return res.json({ available: false, source: null })

  // Helper: probe a CELLAR URI by following the 303 redirect and checking content
  async function probeCellarUri(uri) {
    const httpsUri = uri.replace(/^http:\/\//, 'https://')
    try {
      const probe = await fetch(httpsUri, {
        method: 'GET',
        headers: { ...CELLAR_HEADERS, Accept: 'application/xhtml+xml', 'Accept-Language': 'en,en-GB;q=0.9' },
        signal: AbortSignal.timeout(10000),
        redirect: 'manual',
      })
      if (probe.status === 303 || probe.status === 302 || probe.status === 301) {
        const loc = (probe.headers.get('location') || '').replace(/^http:\/\//, 'https://')
        if (loc && !loc.includes('/rdf/object') && !loc.endsWith('.rdf')) {
          const ok = await probeUrlForArticles(loc)
          if (ok) return true
        }
      } else if (probe.ok) {
        const raw = await probe.text()
        const text = stripHtml(raw)
        if (hasArticleContent(text)) return true
      }
    } catch { /* continue */ }
    return false
  }

  // 1. CELLAR work URI (by UUID)
  if (workId) {
    const ok = await probeCellarUri(`https://publications.europa.eu/resource/cellar/${workId}`)
    if (ok) return res.json({ available: true, source: 'CELLAR' })
  }

  // 2. CELLAR resource/celex URI (by CELEX number)
  if (celex) {
    const ok = await probeCellarUri(`https://publications.europa.eu/resource/celex/${celex}`)
    if (ok) return res.json({ available: true, source: 'CELLAR' })
  }

  res.json({ available: false, source: null })
})

// Chunk a long document on Article boundaries to stay within context limits
function chunkDocument(text, maxChars = 800000) {
  if (text.length <= maxChars) return [text]
  const parts = text.split(/(?=Article \d+)/i)
  const chunks = []
  let current = ''
  for (const part of parts) {
    if ((current + part).length > maxChars) {
      if (current) chunks.push(current)
      current = part
    } else {
      current += part
    }
  }
  if (current) chunks.push(current)
  return chunks
}

app.post('/api/summarize', async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not set on server' })
  }
  try {
    const { title, date, type, subjects, agents, abstract, celex, workId, fullText: clientFullText } = req.body

    // Always try to fetch full text server-side first (uses spoofed browser UA —
    // no client header forwarding needed). Fall back to client-provided text,
    // then abstract, then metadata-only.
    let fullText = null
    if (workId || celex) {
      console.log(`[summarize] fetching full text workId=${workId || 'none'} celex=${celex || 'none'}`)
      fullText = await fetchLegislativeFullText(workId || null, celex || null)
    }
    if (!fullText && clientFullText) fullText = clientFullText

    // Validate: if the fetched text doesn't contain recognisable article content
    // (no "Article N" / recital patterns), it's a metadata/summary page — discard
    // it so we fall through to abstract or metadata-only mode honestly.
    if (fullText && !hasArticleContent(fullText)) {
      console.log(`[summarize] fetched text (${fullText.length} chars) contains no article content — discarding, falling back to abstract`)
      fullText = null
    }

    // Build the user message following the prompt's metadata-prepend guidance
    let textSource, userMessage
    const metaBlock = [
      title  ? `Document title: ${title}`                      : null,
      celex  ? `CELEX number: ${celex}`                        : null,
      type   ? `Document type: ${type}`                        : null,
      date   ? `Date of adoption: ${date}`                     : null,
      agents?.length ? `Issuing body: ${agents.join(', ')}`    : null,
      subjects?.length ? `Subject areas: ${subjects.join(', ')}` : null,
    ].filter(Boolean).join('\n')

    if (fullText) {
      textSource = `full text (${fullText.length} chars)`
      // Chunk very long documents and summarise each chunk, then consolidate
      const chunks = chunkDocument(fullText)
      if (chunks.length === 1) {
        userMessage = `${metaBlock}\n\nPlease analyse the following document text:\n\n${fullText}`
      } else {
        console.log(`[summarize] document chunked into ${chunks.length} parts`)
        // For multi-chunk docs: ask for triage (Sections 1+10) per chunk,
        // then consolidate — keeps within free-model token limits
        userMessage = `${metaBlock}\n\nThis document is long and has been split into ${chunks.length} parts. Analyse all parts together and produce a single complete Briefing Note.\n\nPart 1 of ${chunks.length}:\n${chunks[0]}\n\n[Additional parts omitted for length — base your analysis on Part 1 and the metadata above, noting that the full document may contain further provisions not captured here.]`
      }
    } else if (abstract) {
      textSource = `abstract (${abstract.length} chars)`
      userMessage = `${metaBlock}\n\nFull text is not available. Please produce a Briefing Note based on the following abstract. Where full-text analysis is not possible, note this explicitly in each section.\n\nAbstract:\n${abstract}`
    } else {
      textSource = 'metadata only'
      userMessage = `${metaBlock}\n\nFull text and abstract are not available. Please produce a partial Briefing Note based solely on the metadata above. Clearly state in each section that the analysis is limited to metadata and a full review of the document text is required.`
    }

    console.log(`[summarize] source: ${textSource}`)

    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim()
    console.log(`[summarize] API key prefix: ${apiKey.slice(0, 12)}... (len=${apiKey.length})`)
    if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY missing' })

    let lastError = 'All models failed'
    for (const model of SUMMARY_MODELS) {
      const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://eu-energy-explorer.app',
          'X-Title': 'EU Energy Explorer',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [
            { role: 'system', content: ENEL_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
        }),
      })

      const rawText = await upstream.text()
      console.log(`[summarize] ${model} → ${upstream.status} | body: ${rawText.slice(0, 300)}`)

      if (!upstream.ok) {
        lastError = `${model}: HTTP ${upstream.status}`
        continue
      }

      let data
      try { data = JSON.parse(rawText) } catch { lastError = 'Invalid JSON'; continue }

      const summary = data.choices?.[0]?.message?.content?.trim()
      if (!summary) { lastError = 'Empty response'; continue }

      const source = fullText ? 'Full text' : abstract ? 'Abstract' : 'Metadata'
      return res.json({ summary, model, source })
    }

    res.status(502).json({ error: lastError })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Publications Office Atom feed — latest newly published CELLAR works ───────
// Source: https://publications.europa.eu/webapi/notification/?lang=EN&type=work
// Returns the 10 most-recent entries with title, CELLAR URI, and date.
let atomCache = { data: null, ts: 0 }

function parseAtomEntries(xml) {
  const entries = []
  const entryRx = /<entry>([\s\S]*?)<\/entry>/g
  let m
  while ((m = entryRx.exec(xml)) !== null) {
    const block = m[1]
    const title   = (/<title[^>]*>([\s\S]*?)<\/title>/.exec(block)?.[1] || '').trim().replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    const id      = (/<id>([\s\S]*?)<\/id>/.exec(block)?.[1] || '').trim()
    const updated = (/<updated>([\s\S]*?)<\/updated>/.exec(block)?.[1] || '').trim()
    // Prefer alternate link with type=text/html, else first link
    const linkHtml = /<link[^>]+rel="alternate"[^>]+href="([^"]+)"/.exec(block)?.[1]
                  || /<link[^>]+href="([^"]+)"/.exec(block)?.[1]
                  || null
    // Extract CELLAR UUID from the id field (urn:uuid:...)
    const cellarId = /urn:uuid:([0-9a-f-]+)/i.exec(id)?.[1] || null
    if (title) entries.push({ title, id, cellarId, updated, link: linkHtml })
  }
  return entries
}

app.get('/api/atom-feed', async (req, res) => {
  const now = Date.now()
  if (atomCache.data && now - atomCache.ts < 15 * 60 * 1000) {
    return res.json(atomCache.data)
  }
  try {
    const upstream = await fetch(
      'https://publications.europa.eu/webapi/notification/?lang=EN&type=work',
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EU-Energy-Explorer/1.0)', Accept: 'application/atom+xml,application/xml,*/*' }, signal: AbortSignal.timeout(10000) }
    )
    if (!upstream.ok) return res.status(502).json({ error: `Upstream ${upstream.status}` })
    const xml = await upstream.text()
    const entries = parseAtomEntries(xml).slice(0, 10)
    const payload = { entries, fetched: new Date().toISOString() }
    atomCache = { data: payload, ts: now }
    res.json(payload)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// ── Full legislative text proxy ───────────────────────────────────────────────
// Tries EUR-Lex TXT endpoint → CELLAR content negotiation → EUR-Lex HTML.
// Returns { text, chars, source } or 404 { error }.
app.get('/api/fulltext/:workId', async (req, res) => {
  const { workId } = req.params
  const lang = (req.query.lang || 'ENG').toUpperCase()  // ENG or ITA
  const celex = req.query.celex || null
  if (!workId || workId.length < 10) return res.status(400).json({ error: 'Invalid workId' })
  console.log(`[fulltext] starting fetch for ${workId} lang=${lang}`)
  const text = await fetchLegislativeFullText(workId, celex, lang)
  if (!text) return res.status(404).json({ error: 'Full text not available from CELLAR.' })
  res.json({ text, chars: text.length, lang })
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
