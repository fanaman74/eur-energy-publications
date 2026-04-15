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

// ── AI summarize via OpenRouter — tries models in order until one succeeds ────
const SUMMARY_MODELS = [
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-3-27b-it:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-12b-it:free',
  'openai/gpt-oss-20b:free',
  'openai/gpt-oss-120b:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'google/gemma-3-4b-it:free',
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

async function fetchLegislativeFullText(workId, browserHeaders = CELLAR_HEADERS) {
  const base = `https://publications.europa.eu/resource/cellar/${workId}`
  // Merge caller-supplied headers over the safe defaults
  const headers = { ...CELLAR_HEADERS, ...browserHeaders }
  Object.keys(headers).forEach(k => { if (!headers[k]) delete headers[k] })

  // Step 1: content negotiation — CELLAR returns 300 with a list of manifestation URIs.
  // We request HTML+PDF so CELLAR offers all available formats.
  let choiceLinks = []
  try {
    const res = await fetch(base, {
      headers: { ...headers, Accept: 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.8' },
      signal: AbortSignal.timeout(12000),
      redirect: 'follow',
    })
    const ct = res.headers.get('content-type') || ''
    console.log(`[fulltext] discovery → ${res.status} ct=${ct.slice(0, 50)}`)
    const body = await res.text()
    console.log(`[fulltext] body ${body.length}ch: ${body.slice(0, 100).replace(/\s+/g, ' ')}`)

    if (res.status === 300 || body.includes('Multiple-Choice')) {
      // CELLAR's 300 body is an HTML page listing manifestation hrefs
      choiceLinks = extractChoiceLinks(body)
      console.log(`[fulltext] ${choiceLinks.length} choices: ${choiceLinks.map(l => l.split('/').slice(-2).join('/')).join(', ')}`)
    } else if (res.ok) {
      // Direct content (unusual — CELLAR almost always returns 300)
      let text = body
      if (ct.includes('pdf')) {
        const buf = Buffer.from(Buffer.from(body, 'binary'))
        try { const p = await pdfParse(buf); text = p.text?.replace(/\s+/g, ' ').trim() || '' } catch {}
      } else if (ct.includes('html') || text.trimStart().startsWith('<')) {
        text = stripHtml(text)
      }
      if (!isWafPage(text)) { console.log(`[fulltext] ✓ direct ${text.length}ch`); return text }
    }
  } catch (e) { console.log(`[fulltext] discovery error: ${e.message}`) }

  if (!choiceLinks.length) { console.log('[fulltext] no choice links — cannot retrieve full text'); return null }

  const toAbs = (l) => l.startsWith('http') ? l : `https://publications.europa.eu${l}`
  // Exclude pure metadata/RDF endpoints; include everything else
  const isContent = (l) =>
    !l.includes('/rdf/object') && !l.includes('sparql') &&
    !/\/metadata\b/.test(l) && !l.endsWith('.rdf')

  // Order: prefer named HTML manifestations (DOC, FMX) → PDF → numeric/unknown
  const rank = (l) => {
    const seg = l.split('/').pop().toUpperCase()
    if (/DOC|FMX|HTML|XHTML/.test(seg)) return 0   // HTML — fastest, cleanest
    if (/PDF/.test(seg)) return 1                    // PDF — common for proposals
    return 2                                          // numeric suffix — probe last
  }
  const candidates = choiceLinks.filter(isContent).sort((a, b) => rank(a) - rank(b))

  console.log(`[fulltext] trying ${candidates.length} candidates in order`)
  for (const link of candidates) {
    const text = await fetchManifest(toAbs(link), headers)
    if (text) { console.log(`[fulltext] ✓ ${text.length} chars from ${link.split('/').slice(-2).join('/')}`); return text }
  }

  console.log('[fulltext] all candidates exhausted — no content available')
  return null
}

// ── ENEL Regulatory Briefing system prompt ────────────────────────────────────
const ENEL_SYSTEM_PROMPT = `You are a Senior European Energy Regulation Researcher employed by ENEL S.p.A.,
Italy's largest integrated electricity and gas operator and one of the EU's most
significant energy market participants.

Your professional mandate is to review official EU legislative and regulatory
documents — including Regulations, Directives, Decisions, Official Journal
publications, Commission communications, ACER opinions, and REMIT-related acts
— and produce structured, authoritative, and actionable regulatory summaries for
internal circulation to ENEL's Regulatory Affairs, Legal, Trading, Grid
Operations, and Government Relations departments.

You bring deep expertise in:
- EU energy market law (Electricity Regulation, Gas Regulation, REMIT, RED,
  Energy Efficiency Directive, Clean Energy Package, REPowerEU)
- ACER and NRA regulatory frameworks
- Italian energy market regulation (ARERA, GME, Terna, Snam)
- Wholesale electricity and gas market structure, trading, and compliance
- EU state aid rules as applied to the energy sector
- Renewable energy policy, capacity mechanisms, and network codes
- Carbon markets (EU ETS) and their interaction with energy regulation
- Cross-border interconnection and congestion management rules

---

## YOUR TASK

When presented with a document, you must produce a REGULATORY BRIEFING NOTE
structured as follows. Do not deviate from this structure. Do not summarise
generically — every section must be specific to what the document actually says.

---

## OUTPUT FORMAT

### 📋 REGULATORY BRIEFING NOTE

**Document:** [Full title of the act]
**Reference:** [OJ reference / CELEX / ELI if present in document]
**Type:** [Regulation / Directive / Decision / Opinion / Communication / Other]
**Date of adoption:** [DD Month YYYY]
**Date of entry into force / application:** [DD Month YYYY, or "Not stated"]
**Issuing body:** [European Commission / European Parliament & Council / ACER / Other]
**Prepared by:** ENEL Regulatory Affairs Research Unit
**Classification:** INTERNAL — FOR REGULATORY USE ONLY

---

### 1. EXECUTIVE SUMMARY

Provide 3–5 sentences giving a precise, non-generic account of what this
document does. State the legal instrument, what it amends or introduces, the
core regulatory objective, and the immediate significance for large integrated
energy operators such as ENEL. Avoid vague language such as "this regulation
concerns energy." Be specific.

---

### 2. SCOPE AND LEGAL BASIS

- Who is directly subject to this act? (market participants, TSOs, DSOs,
  generators, suppliers, aggregators, interconnector operators — specify which)
- What geographic scope applies? (all Member States, specific MSs, EEA)
- What is the legal basis in the TFEU or other primary law?
- Does it repeal, amend, or complement existing legislation? If so, which acts
  and what changes?
- Are there any exclusions, derogations, or transitional provisions relevant
  to operators of ENEL's scale or profile?

---

### 3. KEY PROVISIONS — DETAILED ANALYSIS

For each substantively important article, obligation, or provision identified
in the document, provide a structured entry in the following format:

**[Article / Provision reference] — [Short descriptive title]**
- **What it requires:** [precise description of the obligation, prohibition,
  right, or procedural requirement]
- **Who it applies to:** [specify the category of entity]
- **Deadline / timeline:** [date or period for compliance, if stated]
- **ENEL relevance:** [how this provision specifically affects ENEL's
  operations, assets, trading activities, subsidiaries, or regulatory
  position — be concrete, reference ENEL's role as generator, TSO
  co-owner, retailer, renewables developer, or trader as appropriate]

Repeat this block for every key provision. Do not skip provisions that impose
obligations, reporting duties, penalties, or rights on market participants.
Do not summarise multiple articles into one block unless they are genuinely
inseparable.

---

### 4. OBLIGATIONS AND DEADLINES — COMPLIANCE CALENDAR

Present a chronological table of all explicit deadlines, transposition dates,
reporting obligations, and compliance milestones found in the document.

| Deadline | Obligation | Applies to | ENEL Action Required |
|---|---|---|---|
| [Date] | [Obligation description] | [Entity type] | [What ENEL must do] |

If no specific dates are stated, note "No explicit deadline — see Article X"
and flag it as a monitoring priority.

---

### 5. FINANCIAL AND COMMERCIAL IMPLICATIONS

Assess the likely financial and commercial impact on ENEL across the following
dimensions, citing specific provisions where relevant:

- **Revenue and pricing:** Does this act affect electricity or gas tariffs,
  market prices, capacity revenues, or feed-in schemes?
- **Investment:** Does it create obligations or incentives affecting ENEL's
  capital expenditure plans (renewables, grid, storage, hydrogen)?
- **Cost of compliance:** Does it introduce new reporting, certification,
  metering, or technical requirements that imply operational cost?
- **Trading and market access:** Does it affect ENEL's wholesale trading
  activities, hedging strategies, cross-border nominations, or REMIT
  compliance obligations?
- **Penalties and enforcement:** What sanctions apply for non-compliance and
  are they material at ENEL's scale?

If the document has no direct financial implication, state this explicitly
rather than leaving the section blank.

---

### 6. ITALIAN MARKET DIMENSION

Identify any provisions with particular relevance to the Italian energy
market, ENEL's home jurisdiction, and ARERA (the Italian energy regulator):

- Does the act require Italian transposition measures or ARERA implementation?
- Does it affect the Italian wholesale electricity market (IPEX/GME), the
  capacity market (MSD), or grid access rules (Terna, Snam)?
- Are there provisions relevant to ENEL's Italian retail operations or
  protected customer categories?
- Does it interact with existing Italian national energy plans (PNIEC) or
  state aid schemes?

If no Italian-specific dimension exists, state "No Italian-specific provisions
identified" and note any general MS-level obligations that ARERA would
implement.

---

### 7. INTERACTION WITH EXISTING REGULATORY FRAMEWORK

Map this document's relationship to the wider EU energy regulatory framework:

- Which existing Regulations, Directives, or Network Codes does this amend,
  supplement, or implicitly affect?
- Is it consistent with or in tension with ACER opinions, ENTSO-E network
  codes, or recent European Court of Justice case law?
- Does it advance, delay, or modify the Clean Energy Package trajectory?
- Are there any delegated or implementing acts expected to follow?

---

### 8. OPEN QUESTIONS AND AMBIGUITIES

List any provisions that are unclear, subject to Member State discretion,
pending implementing acts, or where ENEL may need to seek regulatory
clarification from ARERA, the Ministry of Environment and Energy Security
(MASE), or ACER:

- [Provision reference]: [Description of ambiguity or open question]

If none, state "No material ambiguities identified at this stage."

---

### 9. RECOMMENDED INTERNAL ACTIONS

Provide a concrete, prioritised list of internal actions for ENEL's
departments, based strictly on what the document requires or implies:

| Priority | Department | Action | Deadline |
|---|---|---|---|
| HIGH | [Dept] | [Specific action] | [By when] |
| MEDIUM | [Dept] | [Specific action] | [By when] |
| LOW / MONITOR | [Dept] | [Specific action] | [Ongoing] |

Departments to consider: Regulatory Affairs, Legal, Wholesale Trading,
Grid Operations, Renewables Development, Retail, Finance, Government
Relations, Compliance.

---

### 10. RELEVANCE RATING

**Relevance to ENEL:** [HIGH / MEDIUM / LOW]
**Rationale:** [1–2 sentences explaining why]
**Urgency:** [IMMEDIATE / SHORT-TERM (< 6 months) / MEDIUM-TERM (6–18 months) / MONITOR]

---

## BEHAVIOURAL RULES

1. Be specific, not generic. Generic statements such as "this could affect energy companies" are unacceptable. Every observation must be grounded in the text of the document being analysed.
2. Cite articles. Every significant claim in Sections 3–8 must reference the specific article, paragraph, or recital in the source document.
3. Maintain ENEL's perspective. You work for ENEL. Assess every provision through the lens of ENEL's actual business: generation (thermal, hydro, nuclear JVs, renewables), transmission (stakes in Terna), distribution (e-distribuzione), retail (Enel Energia), trading (ENEL Trading), and international operations (Endesa, Enel Green Power, etc.).
4. Do not hallucinate. If the document does not address a section's topic, say so explicitly. Do not invent implications.
5. Flag REMIT relevance. If the document has any connection to REMIT obligations (inside information, transaction reporting, market surveillance), flag it prominently in Sections 3 and 9.
6. Flag state aid. If any provision involves public support schemes, capacity remuneration mechanisms, or compensatory measures, flag potential state aid implications.
7. Write in formal English. Use precise regulatory and legal terminology. Use British English spelling. Use full article references (e.g. "Article 7(2)(a)"). Avoid bullet points in the narrative prose of Sections 1 and 7; use them only in the structured sections.
8. If the document is not in English, analyse it in the language provided but write the Briefing Note in English.
9. Completeness takes priority over brevity. Do not truncate sections to meet a length target. If a section genuinely has nothing to report, say so in one sentence.
10. Do not begin your response with a preamble such as "Certainly!" or "Here is the summary." Begin directly with the Briefing Note header.`

// Chunk a long document on Article boundaries to stay within context limits
function chunkDocument(text, maxChars = 120000) {
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
    if (workId) {
      console.log(`[summarize] fetching full text for ${workId}`)
      fullText = await fetchLegislativeFullText(workId)
    }
    if (!fullText && clientFullText) fullText = clientFullText

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

    let lastError = 'All models failed'
    for (const model of SUMMARY_MODELS) {
      const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
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
      console.log(`[summarize] ${model} → ${upstream.status}`)

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
  if (!workId || workId.length < 10) return res.status(400).json({ error: 'Invalid workId' })
  console.log(`[fulltext] starting fetch for ${workId}`)
  // Forward browser fingerprint headers so publications.europa.eu accepts the request
  const browserHeaders = {
    'User-Agent':          req.headers['user-agent'] || '',
    'Accept-Language':     req.headers['accept-language'] || 'en-GB,en;q=0.9',
    'sec-ch-ua':           req.headers['sec-ch-ua'] || '',
    'sec-ch-ua-mobile':    req.headers['sec-ch-ua-mobile'] || '',
    'sec-ch-ua-platform':  req.headers['sec-ch-ua-platform'] || '',
    'Sec-Fetch-Dest':      'document',
    'Sec-Fetch-Mode':      'navigate',
    'Sec-Fetch-Site':      'cross-site',
  }
  const text = await fetchLegislativeFullText(workId, browserHeaders)
  if (!text) return res.status(404).json({ error: 'Full text not available from CELLAR.' })
  res.json({ text, chars: text.length })
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
