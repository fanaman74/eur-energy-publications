import { Link } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { fetchWithFallback } from '../api/openData'
import PublicationTable from '../components/publications/PublicationTable'
import Spinner from '../components/ui/Spinner'

// ── Europe capitals (lat/lon + ENTSO-E country code) ─────────────────────────
const CAPITALS = [
  { name: 'Dublin',      lat: 53.3, lon:  -6.3, country: 'IE' },
  { name: 'Lisbon',      lat: 38.7, lon:  -9.1, country: 'PT' },
  { name: 'Madrid',      lat: 40.4, lon:  -3.7, country: 'ES' },
  { name: 'Paris',       lat: 48.9, lon:   2.3, country: 'FR' },
  { name: 'Brussels',    lat: 50.8, lon:   4.4, country: 'BE' },
  { name: 'Amsterdam',   lat: 52.4, lon:   4.9, country: 'NL' },
  { name: 'Luxembourg',  lat: 49.6, lon:   6.1, country: 'LU' },
  { name: 'Bern',        lat: 46.9, lon:   7.4, country: 'CH' },
  { name: 'Berlin',      lat: 52.5, lon:  13.4, country: 'DE' },
  { name: 'Copenhagen',  lat: 55.7, lon:  12.6, country: 'DK' },
  { name: 'Oslo',        lat: 59.9, lon:  10.7, country: 'NO' },
  { name: 'Stockholm',   lat: 59.3, lon:  18.1, country: 'SE' },
  { name: 'Helsinki',    lat: 60.2, lon:  25.0, country: 'FI' },
  { name: 'Tallinn',     lat: 59.4, lon:  24.7, country: 'EE' },
  { name: 'Riga',        lat: 56.9, lon:  24.1, country: 'LV' },
  { name: 'Vilnius',     lat: 54.7, lon:  25.3, country: 'LT' },
  { name: 'Warsaw',      lat: 52.2, lon:  21.0, country: 'PL' },
  { name: 'Prague',      lat: 50.1, lon:  14.4, country: 'CZ' },
  { name: 'Vienna',      lat: 48.2, lon:  16.4, country: 'AT' },
  { name: 'Bratislava',  lat: 48.1, lon:  17.1, country: 'SK' },
  { name: 'Budapest',    lat: 47.5, lon:  19.0, country: 'HU' },
  { name: 'Ljubljana',   lat: 46.1, lon:  14.5, country: 'SI' },
  { name: 'Zagreb',      lat: 45.8, lon:  16.0, country: 'HR' },
  { name: 'Belgrade',    lat: 44.8, lon:  20.5, country: 'RS' },
  { name: 'Bucharest',   lat: 44.4, lon:  26.1, country: 'RO' },
  { name: 'Sofia',       lat: 42.7, lon:  23.3, country: 'BG' },
  { name: 'Skopje',      lat: 42.0, lon:  21.4, country: null },
  { name: 'Sarajevo',    lat: 43.9, lon:  17.7, country: null },
  { name: 'Podgorica',   lat: 42.4, lon:  19.3, country: null },
  { name: 'Tirana',      lat: 41.3, lon:  19.8, country: null },
  { name: 'Athens',      lat: 37.9, lon:  23.7, country: 'GR' },
  { name: 'Rome',        lat: 41.9, lon:  12.5, country: 'IT' },
  { name: 'Valletta',    lat: 35.9, lon:  14.5, country: null },
  { name: 'Nicosia',     lat: 35.2, lon:  33.4, country: null },
  { name: 'Kyiv',        lat: 50.4, lon:  30.5, country: null },
  { name: 'Chisinau',    lat: 47.0, lon:  28.9, country: null },
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

// ── Europe Energy Map Canvas (interactive) ────────────────────────────────────
function EuropeEnergyMap({ flows = null, live = false }) {
  const canvasRef    = useRef(null)
  const nodesRef     = useRef([])
  const edgesRef     = useRef([])
  const selectedRef  = useRef(-1)
  const liveFlowsRef = useRef(flows)
  const rebuildRef   = useRef(null)
  const [panel, setPanel] = useState(null)  // { name, country, outgoing[], incoming[] }

  // Keep liveFlowsRef in sync and rebuild graph whenever real flows arrive
  useEffect(() => {
    liveFlowsRef.current = flows
    rebuildRef.current?.()
  }, [flows])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const DIST_THRESHOLD     = 11
    const MAX_EDGES_PER_NODE = 5

    const buildGraph = (W, H) => {
      nodesRef.current = CAPITALS.map(c => ({
        ...c,
        ...project(c.lat, c.lon, W, H),
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.015 + 0.006,
        r:     Math.random() * 1.2 + 1.2,
      }))

      const lf = liveFlowsRef.current
      if (lf && lf.length > 0) {
        // ── Real ENTSO-E data ──────────────────────────────────────────────────
        const codeToIdx = {}
        CAPITALS.forEach((c, i) => { if (c.country) codeToIdx[c.country] = i })
        edgesRef.current = []
        for (const flow of lf) {
          const a = codeToIdx[flow.from]
          const b = codeToIdx[flow.to]
          if (a === undefined || b === undefined) continue
          const exporting = flow.mw > 0
          const srcIdx    = exporting ? a : b
          const dstIdx    = exporting ? b : a
          const absMw     = Math.abs(flow.mw)
          const intensity = Math.min(absMw / 3000, 1)
          edgesRef.current.push({
            i: srcIdx, j: dstIdx,
            color: ENERGY_COLORS[edgesRef.current.length % ENERGY_COLORS.length],
            dashOffset: Math.random() * 50,
            speed: 0.08 + 0.22 * intensity,  // faster = higher MW
            alpha: 0.25 + 0.55 * intensity,
            mw: absMw,
          })
        }
      } else {
        // ── Illustrative proximity-based graph ─────────────────────────────────
        edgesRef.current = []
        const edgeCount = new Array(nodesRef.current.length).fill(0)
        for (let i = 0; i < nodesRef.current.length; i++) {
          const candidates = []
          for (let j = i + 1; j < nodesRef.current.length; j++) {
            const dLat = nodesRef.current[i].lat - nodesRef.current[j].lat
            const dLon = nodesRef.current[i].lon - nodesRef.current[j].lon
            const deg  = Math.sqrt(dLat * dLat + dLon * dLon)
            if (deg < DIST_THRESHOLD) candidates.push({ j, deg })
          }
          candidates.sort((a, b) => a.deg - b.deg)
          for (const { j } of candidates) {
            if (edgeCount[i] >= MAX_EDGES_PER_NODE) break
            if (edgeCount[j] >= MAX_EDGES_PER_NODE) continue
            edgesRef.current.push({
              i, j,
              color: ENERGY_COLORS[edgesRef.current.length % ENERGY_COLORS.length],
              dashOffset: Math.random() * 50,
              speed: (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 0.25 + 0.12),
              alpha: Math.random() * 0.25 + 0.35,
              mw: null,
            })
            edgeCount[i]++
            edgeCount[j]++
          }
        }
      }
    }

    // Expose rebuild so the flows useEffect can trigger it
    rebuildRef.current = () => {
      if (canvas.width && canvas.height) buildGraph(canvas.width, canvas.height)
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

    const spawnPacket = (edgeOverride = null, forceForward = null) => {
      const edges = edgesRef.current
      if (!edges.length) return
      const edge = edgeOverride || edges[Math.floor(Math.random() * edges.length)]
      const forward = forceForward !== null ? forceForward : (Math.random() > 0.5)
      packets.push({ edge, t: forward ? 0 : 1, speed: (forward ? 1 : -1) * (Math.random() * 0.007 + 0.004) })
    }

    // Hit test — returns index or -1
    const hitTest = (cx, cy) => {
      const nodes = nodesRef.current
      for (let i = 0; i < nodes.length; i++) {
        const dx = nodes[i].x - cx, dy = nodes[i].y - cy
        if (Math.sqrt(dx * dx + dy * dy) < 18) return i
      }
      return -1
    }

    const handleClick = (e) => {
      const rect  = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const cx = (e.clientX - rect.left) * scaleX
      const cy = (e.clientY - rect.top)  * scaleY
      const hit = hitTest(cx, cy)

      if (hit < 0 || hit === selectedRef.current) {
        selectedRef.current = -1
        setPanel(null)
        return
      }

      selectedRef.current = hit
      const nodes = nodesRef.current
      const edges = edgesRef.current
      const outgoing = [], incoming = []

      edges.forEach(edge => {
        if (edge.i === hit) {
          const isOut = edge.speed > 0
          const partner = nodes[edge.j]
          ;(isOut ? outgoing : incoming).push({ name: partner.name, mw: edge.mw })
          spawnPacket(edge, isOut)
          spawnPacket(edge, isOut)
        } else if (edge.j === hit) {
          const isOut = edge.speed < 0
          const partner = nodes[edge.i]
          ;(isOut ? outgoing : incoming).push({ name: partner.name, mw: edge.mw })
          spawnPacket(edge, !isOut)
          spawnPacket(edge, !isOut)
        }
      })

      setPanel({ name: nodes[hit].name, country: nodes[hit].country, outgoing, incoming })
    }

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const cx = (e.clientX - rect.left) * scaleX
      const cy = (e.clientY - rect.top)  * scaleY
      canvas.style.cursor = hitTest(cx, cy) >= 0 ? 'pointer' : 'default'
    }

    canvas.addEventListener('click', handleClick)
    canvas.addEventListener('mousemove', handleMouseMove)

    let animId
    const draw = () => {
      tick++
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const nodes  = nodesRef.current
      const edges  = edgesRef.current
      const sel    = selectedRef.current
      const hasSel = sel >= 0

      nodes.forEach(n => { n.phase += n.speed })
      if (tick % 45 === 0 && packets.length < MAX_PKTS) spawnPacket()

      // Build connected-edge + connected-node sets
      const connEdges = new Set()
      const connNodes = new Set()
      const outEdges  = new Set()   // edges where sel is the source
      if (hasSel) {
        edges.forEach((e, idx) => {
          if (e.i === sel || e.j === sel) {
            connEdges.add(idx)
            connNodes.add(e.i === sel ? e.j : e.i)
            if ((e.i === sel && e.speed > 0) || (e.j === sel && e.speed < 0)) outEdges.add(idx)
          }
        })
      }

      // Draw edges
      edges.forEach((e, idx) => {
        e.dashOffset += e.speed
        const a = nodes[e.i], b = nodes[e.j]
        const isConn   = connEdges.has(idx)
        const isOut    = outEdges.has(idx)
        const dimmed   = hasSel && !isConn

        let [r, g, bl] = e.color
        let baseAlpha = 0.08, dashAlpha = e.alpha, lw = 1.2

        if (dimmed) { baseAlpha = 0.02; dashAlpha = 0.06; lw = 0.8 }
        if (isConn) {
          // outgoing = cyan, incoming = amber
          ;[r, g, bl] = isOut ? [6, 182, 212] : [245, 158, 11]
          baseAlpha = 0.18; dashAlpha = 0.9; lw = 2
        }

        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = `rgba(${r},${g},${bl},${baseAlpha})`
        ctx.lineWidth = lw; ctx.setLineDash([]); ctx.stroke()

        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = `rgba(${r},${g},${bl},${dashAlpha})`
        ctx.lineWidth = lw; ctx.setLineDash([6, 14])
        ctx.lineDashOffset = -e.dashOffset; ctx.stroke()
        ctx.setLineDash([])
      })

      // Draw nodes
      nodes.forEach((n, idx) => {
        const pulse   = 0.5 + 0.5 * Math.sin(n.phase)
        const isSel   = idx === sel
        const isConn  = connNodes.has(idx)
        const dimmed  = hasSel && !isSel && !isConn
        const glowR   = isSel ? 28 : isConn ? 20 : 14
        const glowA   = isSel ? 0.7 : isConn ? 0.45 : (dimmed ? 0.06 : 0.3)
        const [cr, cg, cb] = isSel ? [99, 210, 255] : isConn ? [255, 200, 80] : [99, 210, 255]
        const coreA   = dimmed ? 0.2 : (0.6 + 0.4 * pulse)

        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR)
        glow.addColorStop(0, `rgba(${cr},${cg},${cb},${glowA * pulse})`)
        glow.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
        ctx.beginPath(); ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2)
        ctx.fillStyle = glow; ctx.fill()

        ctx.beginPath(); ctx.arc(n.x, n.y, isSel ? 4 : n.r + pulse * 0.6, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${coreA})`; ctx.fill()

        if (canvas.width > 700) {
          ctx.fillStyle = dimmed
            ? `rgba(180,220,255,0.12)`
            : isSel ? `rgba(255,255,255,0.95)` : `rgba(180,220,255,${0.45 + 0.2 * pulse})`
          ctx.font = isSel ? 'bold 10px monospace' : '9px monospace'
          ctx.textAlign = 'center'
          ctx.fillText(n.name, n.x, n.y - (isSel ? 12 : 9))
        }
      })

      // Draw packets
      for (let k = packets.length - 1; k >= 0; k--) {
        const p = packets[k]
        p.t += p.speed
        if (p.t < 0 || p.t > 1) { packets.splice(k, 1); continue }
        const a = nodes[p.edge.i], b = nodes[p.edge.j]
        const px = a.x + (b.x - a.x) * p.t
        const py = a.y + (b.y - a.y) * p.t
        const isHighlight = connEdges.has(edgesRef.current.indexOf(p.edge))
        const [r, g, bl] = isHighlight ? (outEdges.has(edgesRef.current.indexOf(p.edge)) ? [6,182,212] : [245,158,11]) : p.edge.color
        const size = isHighlight ? 9 : 7
        const pg = ctx.createRadialGradient(px, py, 0, px, py, size)
        pg.addColorStop(0, `rgba(255,255,255,1)`)
        pg.addColorStop(0.3, `rgba(${r},${g},${bl},0.85)`)
        pg.addColorStop(1, `rgba(${r},${g},${bl},0)`)
        ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2)
        ctx.fillStyle = pg; ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(animId)
      ro.disconnect()
      canvas.removeEventListener('click', handleClick)
      canvas.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Info panel */}
      {panel && (
        <div
          className="absolute bottom-20 right-6 z-20 rounded-xl border border-white/15 backdrop-blur-md p-4 text-left"
          style={{ background: 'rgba(4,6,15,0.82)', minWidth: 200, maxWidth: 260 }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-display font-bold text-white text-sm">{panel.name}</span>
            <button
              onClick={() => { selectedRef.current = -1; setPanel(null) }}
              className="text-white/40 hover:text-white text-lg leading-none"
            >×</button>
          </div>

          {panel.outgoing.length > 0 && (
            <div className="mb-2">
              <div className="text-[9px] font-mono uppercase tracking-widest text-cyan-400 mb-1.5">
                ↗ Exporting to ({panel.outgoing.length})
              </div>
              {panel.outgoing.map(e => (
                <div key={e.name} className="flex items-center justify-between gap-2 text-xs text-white/70 mb-1">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                    {e.name}
                  </span>
                  {e.mw && <span className="font-mono text-cyan-300 text-[10px]">{Math.round(e.mw).toLocaleString()} MW</span>}
                </div>
              ))}
            </div>
          )}

          {panel.incoming.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-amber-400 mb-1.5">
                ↙ Importing from ({panel.incoming.length})
              </div>
              {panel.incoming.map(e => (
                <div key={e.name} className="flex items-center justify-between gap-2 text-xs text-white/70 mb-1">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    {e.name}
                  </span>
                  {e.mw && <span className="font-mono text-amber-300 text-[10px]">{Math.round(e.mw).toLocaleString()} MW</span>}
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-white/10 text-[9px] font-mono flex items-center gap-1.5">
            {live
              ? <><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><span className="text-emerald-400">Live · ENTSO-E Transparency Platform</span></>
              : <span className="text-white/25">Illustrative flows · add ENTSOE_TOKEN for live data</span>
            }
          </div>
        </div>
      )}
    </div>
  )
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
  const [flowData, setFlowData] = useState({ flows: null, live: false })

  useEffect(() => {
    fetch('/api/energy-flows')
      .then(r => r.json())
      .then(d => setFlowData(d))
      .catch(() => {})  // fail silently, map falls back to illustrative
  }, [])

  return (
    <div>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden" style={{ minHeight: '92vh', background: 'linear-gradient(160deg,#04060f 0%,#060c1a 50%,#050810 100%)' }}>
        <EuropeEnergyMap flows={flowData.flows} live={flowData.live} />

        {/* subtle edge vignette — keep map visible */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 90% 80% at 50% 50%, transparent 50%, rgba(4,6,15,0.4) 100%)' }} aria-hidden />
        <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent, #050810)' }} aria-hidden />

        {/* Title — top center */}
        <div className="absolute top-8 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <FadeIn delay={300} className="text-center">
            <h1 className="font-display font-bold tracking-tight leading-none" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 3rem)', opacity: 0.85 }}>
              <span className="text-white">EU ENERGY </span>
              <span
                style={{
                  background: 'linear-gradient(90deg, #3b82f6, #06b6d4, #8b5cf6, #3b82f6)',
                  backgroundSize: '300% 100%',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  animation: 'gradientShift 4s ease infinite',
                }}
              >
                DECODED.
              </span>
            </h1>
          </FadeIn>
        </div>

        {/* Legend — bottom center */}
        <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-2 z-10">
          <FadeIn delay={600}>
            {flowData.live && (
              <div className="flex items-center gap-1.5 text-[9px] font-mono text-emerald-400 mb-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE · ENTSO-E cross-border flows
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-4 text-[10px] text-white/35 font-mono uppercase tracking-wider">
              {[['#3b82f6','Electricity'],['#06b6d4','Offshore wind'],['#10b981','Renewables'],['#f59e0b','Gas'],['#8b5cf6','Nuclear'],['#ef4444','Oil']].map(([c,l]) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-px rounded-full" style={{ background: c, boxShadow: `0 0 5px ${c}` }} />
                  {l}
                </span>
              ))}
            </div>
          </FadeIn>
        </div>

        <style>{`
          @keyframes gradientShift {
            0%   { background-position: 0% 50% }
            50%  { background-position: 100% 50% }
            100% { background-position: 0% 50% }
          }
        `}</style>
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
