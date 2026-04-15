import { Link } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { fetchWithFallback } from '../api/openData'
import PublicationTable from '../components/publications/PublicationTable'
import Spinner from '../components/ui/Spinner'

// ── EU Network SVG Animation (cordis-inspired, blue/cyan palette) ─────────────
// Country shapes defined in geographic (lon, lat) space.
// The SVG transform translate(169.6,729.4) scale(7.65,-11.1) maps them to pixel
// space matching our city node positions (verified against known capitals).
const EU_COUNTRIES = [
  // Iberian Peninsula (Spain + Portugal)
  { d: 'M-9.2,43.8 -9,37 -6,36 -1.5,36.8 0.4,38 3.2,39.5 3.3,42.4 -1.7,43.4Z', fill: '#10b981' },
  // France
  { d: 'M-4.7,48.4 2.5,51.1 8.2,48.8 7.5,43.6 3,42.5 -1.8,43.3Z', fill: '#3b82f6' },
  // UK (Great Britain)
  { d: 'M-5.5,50 -3,58.7 -1.5,58.7 -0.5,57.5 0.5,51.5 1.5,51Z', fill: '#06b6d4' },
  // Ireland
  { d: 'M-10,51.5 -8,55 -6.5,55.4 -6,51.5Z', fill: '#06b6d4' },
  // Benelux + Germany (combined into one mass)
  { d: 'M3.4,51.5 7,50.9 9.5,54.8 14.5,54.3 15,51 13.5,50.5 14.3,48.5 10.5,47.7 6.8,49.5Z', fill: '#3b82f6' },
  // Denmark
  { d: 'M8.1,55 8.5,57.8 10.5,57.8 12.5,56 10,55Z', fill: '#06b6d4' },
  // Scandinavia (Norway + Sweden)
  { d: 'M10,56 12.5,56 18,60 24.5,65 20,69.5 15,68.5 4.5,62Z', fill: '#06b6d4' },
  // Finland
  { d: 'M20,60 28,65 29,60 25,59 22,59.5Z', fill: '#06b6d4' },
  // Italy (mainland, simplified boot)
  { d: 'M7,44.1 7.5,43.9 13.5,46.5 18.5,40.5 15.6,37.9 10,38 8.5,40Z', fill: '#f59e0b' },
  // Poland
  { d: 'M14.5,54.3 23,54.3 24,50.5 22.5,50 18.5,49 14.5,50.5Z', fill: '#8b5cf6' },
  // Czech + Slovakia + Austria + Hungary (central block)
  { d: 'M12.5,51 16,51 18.5,49 22.5,48.5 22.5,46 18.5,45.5 16,46 13.5,46.5 12.5,50Z', fill: '#f59e0b' },
  // Romania
  { d: 'M22,48.5 30,45.5 29.5,43.7 25,43.5 22,44.5 20,46.5Z', fill: '#3b82f6' },
  // Balkans (Serbia, Bulgaria, Croatia + neighbours)
  { d: 'M13.5,46.5 18.5,45.5 22.5,46 22,43.5 25,43.5 26.5,40 22,36.5 19.5,39.5 19.5,42 14.5,45Z', fill: '#10b981' },
  // Greece
  { d: 'M19.5,42 22,41.5 26,40 26.5,37.5 22,36.5 21,38 20,39Z', fill: '#3b82f6' },
  // Baltic states (Estonia, Latvia, Lithuania — rough block)
  { d: 'M21,59 28.5,58.5 27,54.5 24,54 22,56Z', fill: '#8b5cf6' },
]

function EUNetworkSVG() {
  const cities = [
    ['Dublin',     108, 138],
    ['Lisbon',     100, 300],
    ['Madrid',     152, 282],
    ['Paris',      198, 182],
    ['Brussels',   225, 160],
    ['Amsterdam',  220, 133],
    ['Berlin',     280, 148],
    ['Copenhagen', 278, 105],
    ['Stockholm',  308,  74],
    ['Warsaw',     342, 158],
    ['Vienna',     298, 195],
    ['Rome',       265, 280],
    ['Athens',     322, 328],
    ['Bucharest',  378, 242],
  ]

  const paths = [
    ['ep1',  'M198,182 Q238,118 280,148',   '#3b82f6'],
    ['ep2',  'M220,133 Q248,108 280,148',   '#06b6d4'],
    ['ep3',  'M225,160 Q220,148 220,133',   '#3b82f6'],
    ['ep4',  'M198,182 Q212,172 225,160',   '#06b6d4'],
    ['ep5',  'M198,182 Q172,234 152,282',   '#10b981'],
    ['ep6',  'M280,148 Q312,152 342,158',   '#8b5cf6'],
    ['ep7',  'M280,148 Q292,170 298,195',   '#3b82f6'],
    ['ep8',  'M298,195 Q284,238 265,280',   '#f59e0b'],
    ['ep9',  'M265,280 Q296,308 322,328',   '#10b981'],
    ['ep10', 'M322,328 Q352,288 378,242',   '#8b5cf6'],
    ['ep11', 'M342,158 Q364,198 378,242',   '#3b82f6'],
    ['ep12', 'M308,74  Q295,88  278,105',   '#06b6d4'],
    ['ep13', 'M278,105 Q279,124 280,148',   '#3b82f6'],
    ['ep14', 'M108,138 Q152,130 198,182',   '#06b6d4'],
    ['ep15', 'M100,300 Q124,292 152,282',   '#10b981'],
  ]

  const packets = [
    { path: 'ep1',  dur: '2.8s', begin: '0s'   },
    { path: 'ep5',  dur: '3.2s', begin: '0.4s' },
    { path: 'ep6',  dur: '2.6s', begin: '0.8s' },
    { path: 'ep9',  dur: '3.0s', begin: '1.2s' },
    { path: 'ep11', dur: '2.9s', begin: '0.2s' },
    { path: 'ep14', dur: '3.4s', begin: '0.6s' },
    { path: 'ep2',  dur: '2.5s', begin: '1.0s', reverse: true },
    { path: 'ep8',  dur: '3.1s', begin: '0.5s' },
    { path: 'ep12', dur: '2.7s', begin: '1.5s', reverse: true },
    { path: 'ep15', dur: '3.5s', begin: '0.9s' },
  ]

  return (
    <svg
      viewBox="0 0 560 400"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="svgBgGlow" cx="52%" cy="46%" r="55%">
          <stop offset="0%" stopColor="#1d3461" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#04060f" stopOpacity="0" />
        </radialGradient>
        {/* Path refs for animateMotion */}
        {paths.map(([id, d]) => (
          <path key={id} id={id} d={d} />
        ))}
      </defs>

      {/* Subtle radial glow */}
      <rect width="560" height="400" fill="url(#svgBgGlow)" />

      {/* Europe country fills — geographic lon/lat space transformed to SVG pixels */}
      <g transform="translate(169.6,729.4) scale(7.65,-11.1)">
        {EU_COUNTRIES.map((c, i) => (
          <path
            key={i}
            d={c.d}
            fill={c.fill}
            fillOpacity="0.09"
            stroke={c.fill}
            strokeOpacity="0.22"
            strokeWidth="0.09"
            strokeLinejoin="round"
          />
        ))}
      </g>

      {/* Connection lines */}
      {paths.map(([id, d, color]) => (
        <g key={id}>
          <path d={d} fill="none" stroke={color} strokeWidth="1.2" strokeOpacity="0.10" />
          <path d={d} fill="none" stroke={color} strokeWidth="1.2" strokeOpacity="0.52" strokeDasharray="4 14" />
        </g>
      ))}

      {/* City nodes — pulsing rings + solid dots */}
      {cities.map(([name, x, y]) => (
        <g key={name}>
          <circle cx={x} cy={y} r="5" fill="none" stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.55">
            <animate attributeName="r" values="5;19;5" dur="2.6s" repeatCount="indefinite" />
            <animate attributeName="strokeOpacity" values="0.55;0;0.55" dur="2.6s" repeatCount="indefinite" />
          </circle>
          <circle cx={x} cy={y} r="2.4" fill="#60a5fa">
            <animate attributeName="opacity" values="0.70;1;0.70" dur="2.6s" repeatCount="indefinite" />
          </circle>
        </g>
      ))}

      {/* Animated energy packets */}
      {packets.map((p, i) =>
        p.reverse ? (
          <circle key={i} r="2.2" fill="white" fillOpacity="0.88">
            <animateMotion dur={p.dur} repeatCount="indefinite" begin={p.begin} keyPoints="1;0" keyTimes="0;1" calcMode="linear">
              <mpath href={`#${p.path}`} />
            </animateMotion>
          </circle>
        ) : (
          <circle key={i} r="2.2" fill="white" fillOpacity="0.88">
            <animateMotion dur={p.dur} repeatCount="indefinite" begin={p.begin}>
              <mpath href={`#${p.path}`} />
            </animateMotion>
          </circle>
        )
      )}
    </svg>
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

  return (
    <div>
      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{ minHeight: '92vh', background: 'linear-gradient(160deg,#04060f 0%,#060c1a 50%,#050810 100%)' }}
      >
        {/* SVG network animation */}
        <div className="absolute inset-0">
          <EUNetworkSVG />
        </div>

        {/* Edge vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 90% 80% at 50% 50%, transparent 50%, rgba(4,6,15,0.4) 100%)' }}
          aria-hidden
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, #050810)' }}
          aria-hidden
        />

        {/* Title — top center */}
        <div className="absolute top-8 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <FadeIn delay={300} className="text-center">
            <h1
              className="font-display font-bold tracking-tight leading-none"
              style={{ fontSize: 'clamp(1.6rem, 3.5vw, 3rem)', opacity: 0.88 }}
            >
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

        {/* CTA + legend — bottom center */}
        <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3 z-10">
          <FadeIn delay={500}>
            <Link
              to="/map"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-primary/40 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 hover:border-primary/60 transition-all"
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              View Live Energy Map
            </Link>
          </FadeIn>
          <FadeIn delay={750}>
            <div className="flex flex-wrap justify-center gap-4 text-[10px] text-white/30 font-mono uppercase tracking-wider">
              {[
                ['#3b82f6', 'Electricity'],
                ['#06b6d4', 'Offshore wind'],
                ['#10b981', 'Renewables'],
                ['#f59e0b', 'Gas'],
                ['#8b5cf6', 'Nuclear'],
              ].map(([c, l]) => (
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
            { to: '/browse',  label: 'Browse Publications',  desc: 'Reports, studies & factsheets from DG ENER & ACER',            icon: '📄' },
            { to: '/eur-lex', label: 'EUR-Lex Legislation',  desc: 'Regulations, directives, decisions — filterable by body',      icon: '⚖️' },
            { to: '/remit',   label: 'REMIT Knowledge Base', desc: 'Q&As, reporting manuals and live ACER news feed',               icon: '📡' },
            { to: '/map',     label: 'Interactive Map',      desc: 'Live cross-border electricity flows across EU member states',   icon: '🗺️' },
          ].map(c => (
            <Link
              key={c.to}
              to={c.to}
              className="group rounded-xl border border-border bg-surface p-5 hover:border-primary/40 hover:bg-primary/5 transition-all"
            >
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
