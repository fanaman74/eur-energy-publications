import { Link } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { fetchWithFallback } from '../api/openData'
import PublicationTable from '../components/publications/PublicationTable'
import Spinner from '../components/ui/Spinner'

// ── Europe capitals (lat/lon) ─────────────────────────────────────────────────
const CAPITALS = [
  { name: 'Dublin',      lat: 53.3, lon:  -6.3 },
  { name: 'Lisbon',      lat: 38.7, lon:  -9.1 },
  { name: 'Madrid',      lat: 40.4, lon:  -3.7 },
  { name: 'Paris',       lat: 48.9, lon:   2.3 },
  { name: 'Brussels',    lat: 50.8, lon:   4.4 },
  { name: 'Amsterdam',   lat: 52.4, lon:   4.9 },
  { name: 'Luxembourg',  lat: 49.6, lon:   6.1 },
  { name: 'Bern',        lat: 46.9, lon:   7.4 },
  { name: 'Berlin',      lat: 52.5, lon:  13.4 },
  { name: 'Copenhagen',  lat: 55.7, lon:  12.6 },
  { name: 'Oslo',        lat: 59.9, lon:  10.7 },
  { name: 'Stockholm',   lat: 59.3, lon:  18.1 },
  { name: 'Helsinki',    lat: 60.2, lon:  25.0 },
  { name: 'Tallinn',     lat: 59.4, lon:  24.7 },
  { name: 'Riga',        lat: 56.9, lon:  24.1 },
  { name: 'Vilnius',     lat: 54.7, lon:  25.3 },
  { name: 'Warsaw',      lat: 52.2, lon:  21.0 },
  { name: 'Prague',      lat: 50.1, lon:  14.4 },
  { name: 'Vienna',      lat: 48.2, lon:  16.4 },
  { name: 'Bratislava',  lat: 48.1, lon:  17.1 },
  { name: 'Budapest',    lat: 47.5, lon:  19.0 },
  { name: 'Ljubljana',   lat: 46.1, lon:  14.5 },
  { name: 'Zagreb',      lat: 45.8, lon:  16.0 },
  { name: 'Belgrade',    lat: 44.8, lon:  20.5 },
  { name: 'Bucharest',   lat: 44.4, lon:  26.1 },
  { name: 'Sofia',       lat: 42.7, lon:  23.3 },
  { name: 'Skopje',      lat: 42.0, lon:  21.4 },
  { name: 'Sarajevo',    lat: 43.9, lon:  17.7 },
  { name: 'Podgorica',   lat: 42.4, lon:  19.3 },
  { name: 'Tirana',      lat: 41.3, lon:  19.8 },
  { name: 'Athens',      lat: 37.9, lon:  23.7 },
  { name: 'Rome',        lat: 41.9, lon:  12.5 },
  { name: 'Valletta',    lat: 35.9, lon:  14.5 },
  { name: 'Nicosia',     lat: 35.2, lon:  33.4 },
  { name: 'Kyiv',        lat: 50.4, lon:  30.5 },
  { name: 'Chisinau',    lat: 47.0, lon:  28.9 },
]

// Energy-type colours used for connections
const ENERGY_COLORS = [
  [59,  130, 246], // blue  — electricity
  [6,   182, 212], // cyan  — offshore wind
  [16,  185, 129], // green — renewables
  [245, 158,  11], // amber — gas
  [139,  92, 246], // violet — nuclear
  [239,  68,  68], // red   — oil
]

// Equirectangular projection with a slight Mercator-ish vertical stretch
function project(lat, lon, W, H) {
  const LON_MIN = -12, LON_MAX = 36
  const LAT_MIN = 34,  LAT_MAX = 62
  const PX = 0.06, PY = 0.08          // padding fractions
  const x = PX * W + (lon - LON_MIN) / (LON_MAX - LON_MIN) * (1 - 2 * PX) * W
  const y = PY * H + (LAT_MAX - lat)  / (LAT_MAX - LAT_MIN) * (1 - 2 * PY) * H
  return { x, y }
}

// ── Europe Energy Map Canvas ──────────────────────────────────────────────────
function EuropeEnergyMap() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    // Node state (projected positions + render data)
    let nodes = []
    // Edge state
    let edges = []

    const DIST_THRESHOLD = 11   // degrees — connect geographic neighbours
    const MAX_EDGES_PER_NODE = 5

    const buildGraph = (W, H) => {
      nodes = CAPITALS.map(c => ({
        ...c,
        ...project(c.lat, c.lon, W, H),
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.015 + 0.006,
        r:     Math.random() * 1.2 + 1.2,
      }))

      edges = []
      const edgeCount = new Array(nodes.length).fill(0)

      for (let i = 0; i < nodes.length; i++) {
        // Find all candidates sorted by distance
        const candidates = []
        for (let j = i + 1; j < nodes.length; j++) {
          const dLat = nodes[i].lat - nodes[j].lat
          const dLon = nodes[i].lon - nodes[j].lon
          const deg  = Math.sqrt(dLat * dLat + dLon * dLon)
          if (deg < DIST_THRESHOLD) candidates.push({ j, deg })
        }
        candidates.sort((a, b) => a.deg - b.deg)

        for (const { j } of candidates) {
          if (edgeCount[i] >= MAX_EDGES_PER_NODE) break
          if (edgeCount[j] >= MAX_EDGES_PER_NODE) continue
          const colorSet = ENERGY_COLORS[edges.length % ENERGY_COLORS.length]
          edges.push({
            i, j,
            color: colorSet,
            dashOffset: Math.random() * 50,
            speed: (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 0.25 + 0.12),
            alpha: Math.random() * 0.25 + 0.35,
          })
          edgeCount[i]++
          edgeCount[j]++
        }
      }
    }

    const resize = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      buildGraph(canvas.width, canvas.height)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // Energy packets
    const packets = []
    const MAX_PKTS = 14
    let tick = 0

    const spawnPacket = () => {
      if (!edges.length) return
      const edge = edges[Math.floor(Math.random() * edges.length)]
      const forward = Math.random() > 0.5
      packets.push({ edge, t: forward ? 0 : 1, speed: (forward ? 1 : -1) * (Math.random() * 0.006 + 0.003) })
    }

    let animId
    const draw = () => {
      tick++
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Animate node phases
      nodes.forEach(n => { n.phase += n.speed })

      // Spawn packets
      if (tick % 45 === 0 && packets.length < MAX_PKTS) spawnPacket()

      // Draw edges — flowing dashed lines
      edges.forEach(e => {
        e.dashOffset += e.speed
        const a = nodes[e.i], b = nodes[e.j]
        const [r, g, bl] = e.color

        // Faint base line
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = `rgba(${r},${g},${bl},0.08)`
        ctx.lineWidth = 1
        ctx.setLineDash([])
        ctx.stroke()

        // Flowing dashes
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = `rgba(${r},${g},${bl},${e.alpha})`
        ctx.lineWidth = 1.2
        ctx.setLineDash([6, 14])
        ctx.lineDashOffset = -e.dashOffset
        ctx.stroke()
        ctx.setLineDash([])
      })

      // Draw nodes
      nodes.forEach(n => {
        const pulse = 0.5 + 0.5 * Math.sin(n.phase)

        // outer glow
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 14)
        glow.addColorStop(0, `rgba(99,210,255,${0.3 * pulse})`)
        glow.addColorStop(1, `rgba(99,210,255,0)`)
        ctx.beginPath()
        ctx.arc(n.x, n.y, 14, 0, Math.PI * 2)
        ctx.fillStyle = glow
        ctx.fill()

        // core dot
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r + pulse * 0.6, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(180,230,255,${0.6 + 0.4 * pulse})`
        ctx.fill()

        // label (only on larger displays — skip if canvas is narrow)
        if (canvas.width > 700) {
          ctx.fillStyle = `rgba(180,220,255,${0.45 + 0.2 * pulse})`
          ctx.font = '9px monospace'
          ctx.textAlign = 'center'
          ctx.fillText(n.name, n.x, n.y - 9)
        }
      })

      // Draw packets — bright travelling dots
      for (let k = packets.length - 1; k >= 0; k--) {
        const p = packets[k]
        p.t += p.speed
        if (p.t < 0 || p.t > 1) { packets.splice(k, 1); continue }
        const a = nodes[p.edge.i], b = nodes[p.edge.j]
        const px = a.x + (b.x - a.x) * p.t
        const py = a.y + (b.y - a.y) * p.t
        const [r, g, bl] = p.edge.color
        const pg = ctx.createRadialGradient(px, py, 0, px, py, 7)
        pg.addColorStop(0, `rgba(255,255,255,1)`)
        pg.addColorStop(0.3, `rgba(${r},${g},${bl},0.8)`)
        pg.addColorStop(1, `rgba(${r},${g},${bl},0)`)
        ctx.beginPath()
        ctx.arc(px, py, 7, 0, Math.PI * 2)
        ctx.fillStyle = pg
        ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }
    draw()

    return () => { cancelAnimationFrame(animId); ro.disconnect() }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden />
}

// ── Animated counter ──────────────────────────────────────────────────────────
function Counter({ target, suffix = '' }) {
  const [val, setVal] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      let start = null
      const step = (ts) => {
        if (!start) start = ts
        const p = Math.min((ts - start) / 1400, 1)
        setVal(Math.round((1 - Math.pow(1 - p, 3)) * target))
        if (p < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }, { threshold: 0.3 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [target])
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>
}

// ── Fade-in ───────────────────────────────────────────────────────────────────
function FadeIn({ children, delay = 0, className = '' }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { const t = setTimeout(() => setVisible(true), delay); return () => clearTimeout(t) }, [delay])
  return (
    <div className={className} style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(18px)', transition: 'opacity 0.7s ease, transform 0.7s ease' }}>
      {children}
    </div>
  )
}

// ── Latest publications hook ──────────────────────────────────────────────────
function useLatestPublications() {
  const [results, setResults] = useState([])
  const [status, setStatus]   = useState('loading')
  useEffect(() => {
    const controller = new AbortController()
    fetchWithFallback({ limit: 50, offset: 0 }, { signal: controller.signal })
      .then(({ results: r }) => { setResults(r); setStatus('done') })
      .catch((e) => { if (e.name !== 'AbortError') setStatus('error') })
    return () => controller.abort()
  }, [])
  return { results, status }
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Home() {
  useDocumentTitle('EU Energy Publications')
  const { results, status } = useLatestPublications()

  return (
    <div>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden" style={{ minHeight: '92vh', background: 'linear-gradient(160deg,#04060f 0%,#060c1a 50%,#050810 100%)' }}>
        <EuropeEnergyMap />

        {/* very subtle edge fade only — keep map visible */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 90% 80% at 50% 50%, transparent 55%, rgba(4,6,15,0.45) 100%)' }} aria-hidden />
        <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent, #050810)' }} aria-hidden />

        {/* Minimal text — bottom-left, small and subtle */}
        <div className="absolute bottom-10 left-8 z-10">
          <FadeIn delay={400}>
            <h1 className="font-display font-bold tracking-tight leading-none" style={{ fontSize: 'clamp(1.4rem, 3vw, 2.4rem)', opacity: 0.72 }}>
              <span className="block text-white">EU ENERGY</span>
              <span className="block" style={{ color: '#3b82f6' }}>DECODED.</span>
            </h1>
          </FadeIn>
        </div>
      </section>

      {/* ── Quick nav cards — 4 per row ── */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { to: '/browse',  label: 'Browse Publications',  desc: 'Reports, studies & factsheets from DG ENER & ACER',      icon: '📄' },
            { to: '/eur-lex', label: 'EUR-Lex Legislation',  desc: 'Regulations, directives, decisions — filterable by body', icon: '⚖️' },
            { to: '/remit',   label: 'REMIT Knowledge Base', desc: 'Q&As, reporting manuals and live ACER news feed',         icon: '📡' },
            { to: '/about',   label: 'About',                desc: 'How the platform works and attribution of data sources',  icon: 'ℹ️' },
          ].map(c => (
            <Link key={c.to} to={c.to} className="group rounded-xl border border-border bg-surface p-5 hover:border-primary/40 hover:bg-primary/5 transition-all">
              <div className="text-2xl mb-3">{c.icon}</div>
              <div className="font-medium text-text text-sm mb-1 group-hover:text-primary transition-colors">{c.label}</div>
              <div className="text-xs text-muted leading-relaxed">{c.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Data sources ── */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-surface2 flex items-center gap-2">
            <span className="text-accent text-xs" aria-hidden>★</span>
            <span className="text-[11px] uppercase tracking-widest text-muted font-mono">Data sources</span>
          </div>
          <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
            {[
              {
                name: 'CELLAR SPARQL',
                badge: 'Primary',
                badgeCls: 'text-primary border-primary/30 bg-primary/10',
                desc: 'Direct linked-data access to the Publications Office metadata graph. Powers all publication and legislation searches.',
                href: 'http://publications.europa.eu/webapi/rdf/sparql',
              },
              {
                name: 'OP Search Portlet',
                badge: 'Fallback',
                badgeCls: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
                desc: 'Publications Office search API used as a secondary source when CELLAR returns no results.',
                href: 'https://op.europa.eu/en/search-results',
              },
              {
                name: 'Open Data Portal',
                badge: 'Final fallback',
                badgeCls: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
                desc: 'data.europa.eu hub queried for energy-category datasets when both primary sources are unavailable.',
                href: 'https://data.europa.eu/en',
              },
            ].map(s => (
              <div key={s.name} className="px-6 py-5 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text text-sm">{s.name}</span>
                  <span className={`text-[9px] font-mono uppercase tracking-wider border rounded px-1.5 py-0.5 ${s.badgeCls}`}>{s.badge}</span>
                </div>
                <p className="text-xs text-muted leading-relaxed flex-1">{s.desc}</p>
                <a href={s.href} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                  View endpoint ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Latest publications ── */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="border-t border-border pt-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-xl font-semibold">Latest <span className="text-primary">Publications</span></h2>
            <Link to="/browse" className="text-sm text-muted hover:text-primary transition-colors">Browse all →</Link>
          </div>
          {status === 'loading' ? <Spinner label="Loading latest publications…" /> : <PublicationTable results={results} />}
        </div>
      </section>
    </div>
  )
}
