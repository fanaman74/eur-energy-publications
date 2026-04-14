const ACER_BASE = 'https://www.acer.europa.eu'

function stripHtml(str) {
  return str ? str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim() : ''
}

function extractHref(str) {
  // The ACER feed embeds HTML anchor tags in <link> and <title> elements
  const m = str.match(/href=["']([^"']+)["']/)
  if (m) {
    const href = m[1]
    return href.startsWith('http') ? href : `${ACER_BASE}${href}`
  }
  // Sometimes the <link> itself is URL-encoded HTML — decode it
  const decoded = decodeURIComponent(str)
  const m2 = decoded.match(/href=["']([^"']+)["']/)
  if (m2) return m2[1].startsWith('http') ? m2[1] : `${ACER_BASE}${m2[1]}`
  // Fallback: the value might be a clean URL already
  return str.startsWith('http') ? str : `${ACER_BASE}${str}`
}

function parseItems(xml) {
  const items = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1]
    const titleRaw = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ''
    const linkRaw  = (block.match(/<link>([\s\S]*?)<\/link>/)  || [])[1] || ''
    const descRaw  = (block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || ''
    const pubDate  = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || ''

    const title = stripHtml(titleRaw)
    const url   = extractHref(linkRaw) || extractHref(titleRaw)
    const desc  = stripHtml(descRaw).split('\n').filter(Boolean)[0] || ''

    let date = null
    try { date = new Date(pubDate).toISOString().split('T')[0] } catch { /* ignore */ }

    if (title) items.push({ title, url, desc, date, isRemit: /remit/i.test(title + desc) })
  }
  return items
}

export async function fetchAcerNews({ signal } = {}) {
  const res = await fetch('/api/acer-rss', { signal })
  if (!res.ok) throw new Error(`ACER RSS ${res.status}`)
  const xml = await res.text()
  return parseItems(xml)
}
