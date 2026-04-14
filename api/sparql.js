// Vercel/Netlify serverless proxy for CELLAR SPARQL endpoint.
// Forwards form-encoded POST body to publications.europa.eu and returns JSON.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const body =
      typeof req.body === 'string'
        ? req.body
        : new URLSearchParams(req.body || {}).toString()
    const upstream = await fetch('http://publications.europa.eu/webapi/rdf/sparql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/sparql-results+json',
      },
      body,
    })
    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', 'application/sparql-results+json')
    res.send(text)
  } catch (e) {
    res.status(502).json({ error: 'Upstream failed', detail: String(e) })
  }
}
