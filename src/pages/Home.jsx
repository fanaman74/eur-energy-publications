import { Link } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { fetchWithFallback } from '../api/openData'
import PublicationTable from '../components/publications/PublicationTable'
import Spinner from '../components/ui/Spinner'

// ── Energy Grid Canvas Animation ─────────────────────────────────────────────
function EnergyGrid() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const NODE_COUNT = 55
    const LINK_DIST  = 200
    const PRIMARY    = [59, 130, 246]   // blue-500
    const ACCENT     = [99, 210, 255]   // cyan

    const nodes = Array.from({ length: NODE_COUNT }, () => ({
      x:    Math.random() * canvas.width,
      y:    Math.random() * canvas.height,
      vx:   (Math.random() - 0.5) * 0.25,
      vy:   (Math.random() - 0.5) * 0.25,
      r:    Math.random() * 1.8 + 0.8,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.018 + 0.008,
    }))

    // Travelling energy packets along edges
    const packets = []
    const MAX_PKTS = 18
    let tick = 0

    const spawnPacket = () => {
      // pick two connected nodes at random
      const i = Math.floor(Math.random() * nodes.length)
      const j = Math.floor(Math.random() * nodes.length)
      if (i === j) return
      const dx = nodes[i].x - nodes[j].x
      const dy = nodes[i].y - nodes[j].y
      if (Math.sqrt(dx * dx + dy * dy) < LINK_DIST) {
        packets.push({ from: i, to: j, t: 0, speed: Math.random() * 0.008 + 0.004 })
      }
    }

    let animId
    const draw = () => {
      tick++
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Move nodes
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy; n.phase += n.speed
        if (n.x < -20) n.x = canvas.width + 20
        if (n.x > canvas.width + 20) n.x = -20
        if (n.y < -20) n.y = canvas.height + 20
        if (n.y > canvas.height + 20) n.y = -20
      })

      // Spawn packets periodically
      if (tick % 40 === 0 && packets.length < MAX_PKTS) spawnPacket()

      // Draw edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < LINK_DIST) {
            const alpha = (1 - dist / LINK_DIST) * 0.22
            ctx.beginPath()
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.strokeStyle = `rgba(${PRIMARY.join(',')},${alpha})`
            ctx.lineWidth = 0.6
            ctx.stroke()
          }
        }
      }

      // Draw nodes
      nodes.forEach(n => {
        const pulse = 0.5 + 0.5 * Math.sin(n.phase)
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 8)
        glow.addColorStop(0, `rgba(${ACCENT.join(',')},${0.35 * pulse})`)
        glow.addColorStop(1, `rgba(${ACCENT.join(',')},0)`)
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r * 8, 0, Math.PI * 2)
        ctx.fillStyle = glow
        ctx.fill()

        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${ACCENT.join(',')},${0.7 + 0.3 * pulse})`
        ctx.fill()
      })

      // Draw packets
      for (let k = packets.length - 1; k >= 0; k--) {
        const p = packets[k]
        p.t += p.speed
        if (p.t >= 1) { packets.splice(k, 1); continue }
        const a = nodes[p.from], b = nodes[p.to]
        const px = a.x + (b.x - a.x) * p.t
        const py = a.y + (b.y - a.y) * p.t
        const pg = ctx.createRadialGradient(px, py, 0, px, py, 5)
        pg.addColorStop(0, `rgba(255,255,255,0.9)`)
        pg.addColorStop(0.4, `rgba(${ACCENT.join(',')},0.5)`)
        pg.addColorStop(1, `rgba(${ACCENT.join(',')},0)`)
        ctx.beginPath()
        ctx.arc(px, py, 5, 0, Math.PI * 2)
        ctx.fillStyle = pg
        ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }

    draw()
    return () => { cancelAnimationFrame(animId); ro.disconnect() }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      aria-hidden
    />
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
      const duration = 1400
      const step = (ts) => {
        if (!start) start = ts
        const progress = Math.min((ts - start) / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setVal(Math.round(eased * target))
        if (progress < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }, { threshold: 0.3 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [target])

  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>
}

// ── Fade-in wrapper ───────────────────────────────────────────────────────────
function FadeIn({ children, delay = 0, className = '' }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(18px)',
        transition: 'opacity 0.7s ease, transform 0.7s ease',
      }}
    >
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

  const STATS = [
    { value: 40000, suffix: '+', label: 'Publications indexed' },
    { value: 27,    suffix: '',  label: 'EU member states' },
    { value: 3,     suffix: '',  label: 'Data sources' },
    { value: 11,    suffix: '',  label: 'Legislative types' },
  ]

  return (
    <div>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden" style={{ minHeight: '92vh', background: 'linear-gradient(160deg,#04060f 0%,#060c1a 50%,#050810 100%)' }}>
        <EnergyGrid />

        {/* gradient vignette */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, transparent 30%, rgba(4,6,15,0.7) 100%)' }} aria-hidden />
        <div className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent, #050810)' }} aria-hidden />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-6" style={{ minHeight: '92vh' }}>

          <FadeIn delay={100}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 text-xs text-white/50 mb-8 bg-white/5 backdrop-blur-sm">
              <span className="text-primary" aria-hidden>★</span>
              CELLAR SPARQL · Publications Office · EUR-Lex
            </div>
          </FadeIn>

          <FadeIn delay={250}>
            <h1 className="font-display font-bold tracking-tight leading-none mb-6" style={{ fontSize: 'clamp(3rem, 9vw, 8rem)' }}>
              <span className="block text-white">EU ENERGY</span>
              <span className="block" style={{ color: '#3b82f6', textShadow: '0 0 60px rgba(59,130,246,0.5)' }}>DECODED.</span>
            </h1>
          </FadeIn>

          <FadeIn delay={420}>
            <p className="text-white/50 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
              Search every DG&nbsp;ENER regulation, directive, and publication straight from the CELLAR repository. No friction, no institutional navigation.
            </p>
          </FadeIn>

          <FadeIn delay={560}>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/browse"
                className="px-7 py-3.5 rounded-lg font-semibold text-white transition-all"
                style={{ background: '#3b82f6', boxShadow: '0 0 30px rgba(59,130,246,0.4)' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow='0 0 50px rgba(59,130,246,0.7)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow='0 0 30px rgba(59,130,246,0.4)'}
              >
                Browse Publications →
              </Link>
              <Link
                to="/eur-lex"
                className="px-7 py-3.5 rounded-lg font-medium text-white/70 border border-white/15 hover:border-white/30 hover:text-white transition-all"
              >
                EUR-Lex Legislation
              </Link>
            </div>
          </FadeIn>

          {/* Stats */}
          <FadeIn delay={750} className="w-full max-w-3xl mt-20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/8">
              {STATS.map(({ value, suffix, label }) => (
                <div key={label} className="bg-white/3 backdrop-blur-sm px-6 py-6 text-center">
                  <div
                    className="font-display font-bold text-white mb-1"
                    style={{ fontSize: '2rem', textShadow: '0 0 20px rgba(59,130,246,0.4)' }}
                  >
                    <Counter target={value} suffix={suffix} />
                  </div>
                  <div className="text-xs text-white/40 uppercase tracking-wider">{label}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Quick nav cards ── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-3 gap-4 mb-16">
          {[
            { to: '/browse',    label: 'Browse Publications', desc: 'Reports, studies, factsheets from DG ENER & ACER',      icon: '📄' },
            { to: '/eur-lex',   label: 'EUR-Lex Legislation', desc: 'Regulations, directives, decisions — filterable by body', icon: '⚖️' },
            { to: '/remit',     label: 'REMIT Knowledge Base', desc: 'Q&As, reporting manuals, live ACER news feed',          icon: '📡' },
            { to: '/documents', label: 'Energy Documents',    desc: 'Working docs, opinions, technical reports',              icon: '📋' },
          ].map(c => (
            <Link
              key={c.to}
              to={c.to}
              className="group rounded-xl border border-border bg-surface p-5 hover:border-primary/40 hover:bg-primary/5 transition-all"
            >
              <div className="text-2xl mb-3">{c.icon}</div>
              <div className="font-medium text-text mb-1 group-hover:text-primary transition-colors">{c.label}</div>
              <div className="text-xs text-muted leading-relaxed">{c.desc}</div>
            </Link>
          ))}

          {/* Data source card */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="text-[10px] uppercase tracking-widest text-muted font-mono mb-3">Data sources</div>
            {[
              ['CELLAR SPARQL', 'Primary — Publications Office linked data graph'],
              ['OP Search',     'Fallback — search.op.europa.eu portlet'],
              ['Open Data',     'Final fallback — data.europa.eu'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-start gap-2 mb-2 last:mb-0">
                <span className="text-primary text-[10px] font-mono mt-0.5">›</span>
                <div>
                  <span className="text-xs text-text font-medium">{k}</span>
                  <span className="text-xs text-muted"> — {v}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Latest publications table */}
        <div className="border-t border-border pt-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-xl font-semibold">
              Latest <span className="text-primary">Publications</span>
            </h2>
            <Link to="/browse" className="text-sm text-muted hover:text-primary transition-colors">
              Browse all →
            </Link>
          </div>

          {status === 'loading' ? (
            <Spinner label="Loading latest publications…" />
          ) : (
            <PublicationTable results={results} />
          )}
        </div>
      </section>
    </div>
  )
}
