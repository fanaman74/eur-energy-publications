import { useEffect, useState, useRef, useCallback } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

// ── File metadata ─────────────────────────────────────────────────────────────
const FILE_META = {
  'analyst-skill': {
    label: 'Analysis Skill',
    subtitle: 'EU Energy Regulatory Impact Analyst — 8-step framework',
    icon: '⚡',
    accent: '#3b82f6',
    accentMuted: 'rgba(59,130,246,0.12)',
    accentBorder: 'rgba(59,130,246,0.30)',
    description:
      'The primary prompt powering all regulatory analysis. Defines the 6 analytical frameworks (Market Design, Renewables, Network, Consumer, Gas, ETS), the 8-section output structure, and quality standards. Changes here take effect immediately — no restart required.',
  },
  'italy-baseline': {
    label: 'Italy Market Baseline',
    subtitle: 'Standing reference injected into every analysis',
    icon: '🇮🇹',
    accent: '#10b981',
    accentMuted: 'rgba(16,185,129,0.10)',
    accentBorder: 'rgba(16,185,129,0.28)',
    description:
      'Institutional architecture, Enel market positions, electricity and gas parameters, key active EU regulations, and Italy-specific structural tensions. Automatically inlined into the Analyst Skill system prompt — the AI always sees this as context.',
  },
  'briefing-note': {
    label: 'Briefing Note Prompt',
    subtitle: 'Legacy ENEL regulatory briefing note format',
    icon: '📋',
    accent: '#8b5cf6',
    accentMuted: 'rgba(139,92,246,0.10)',
    accentBorder: 'rgba(139,92,246,0.28)',
    description:
      'The original 10-section briefing note format (Executive Summary → Key Provisions → Financial Implications → Italian Market Dimension → …). Used as fallback when the Analyst Skill file is missing, and as the basis for the aisummary.md format.',
  },
  'slide-prompt': {
    label: 'Slide Deck Prompt',
    subtitle: 'PowerPoint export — 8 slide types, aisummary.md-aligned',
    icon: '▣',
    accent: '#f59e0b',
    accentMuted: 'rgba(245,158,11,0.10)',
    accentBorder: 'rgba(245,158,11,0.28)',
    description:
      'Instructs the AI to produce structured JSON for the multi-slide PPTX export. Defines 8 slide types mapped to the briefing note sections. Changes take effect on the next Export Slide action.',
  },
}

const FILE_KEYS = ['analyst-skill', 'italy-baseline', 'briefing-note', 'slide-prompt']

// ── Utility ───────────────────────────────────────────────────────────────────
function tokenEstimate(chars) {
  return Math.round(chars / 4).toLocaleString()
}

function charCount(s) {
  return (s || '').length.toLocaleString()
}

// ── Save status badge ─────────────────────────────────────────────────────────
function SaveBadge({ status }) {
  if (status === 'saving')
    return <span className="text-[10px] font-mono text-amber-300 animate-pulse">saving…</span>
  if (status === 'saved')
    return <span className="text-[10px] font-mono text-emerald-400">✓ saved</span>
  if (status === 'error')
    return <span className="text-[10px] font-mono text-red-400">✕ save failed</span>
  return null
}

// ── Single file editor panel ──────────────────────────────────────────────────
function FileEditor({ fileKey, data, onSaved }) {
  const meta = FILE_META[fileKey]
  const [draft, setDraft]     = useState(data?.content ?? '')
  const [saveStatus, setSave] = useState('idle')
  const [expanded, setExpanded] = useState(false)
  const textareaRef = useRef(null)
  const dirty = draft !== (data?.content ?? '')

  // Sync when parent data refreshes (e.g. after reload)
  useEffect(() => {
    if (data?.content !== undefined) setDraft(data.content)
  }, [data?.content])

  async function handleSave() {
    setSave('saving')
    try {
      const res = await fetch(`/api/analyst-files/${fileKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      setSave('saved')
      onSaved(fileKey, draft)
      setTimeout(() => setSave('idle'), 2500)
    } catch {
      setSave('error')
      setTimeout(() => setSave('idle'), 3000)
    }
  }

  function handleReset() {
    if (!window.confirm('Discard all unsaved changes?')) return
    setDraft(data?.content ?? '')
    setSave('idle')
  }

  const lines = (draft || '').split('\n').length

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: `1px solid ${dirty ? meta.accentBorder : 'rgba(255,255,255,0.08)'}`, background: 'rgba(255,255,255,0.015)', transition: 'border-color 0.2s' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-3 cursor-pointer select-none"
        style={{ background: expanded ? meta.accentMuted : 'transparent', borderBottom: expanded ? `1px solid ${meta.accentBorder}` : 'none' }}
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-lg">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white/90">{meta.label}</span>
            {dirty && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider"
                    style={{ background: meta.accentMuted, color: meta.accent, border: `1px solid ${meta.accentBorder}` }}>
                unsaved
              </span>
            )}
          </div>
          <span className="text-[11px] text-white/35">{meta.subtitle}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] font-mono text-white/25">
            {charCount(draft)} chars · ~{tokenEstimate(draft.length)} tokens
          </span>
          <SaveBadge status={saveStatus} />
          <span className="text-white/30 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="flex flex-col">
          {/* Description */}
          <div className="px-5 py-3" style={{ background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-[12px] text-white/45 leading-relaxed">{meta.description}</p>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 px-5 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span className="text-[10px] font-mono text-white/20 flex-1">
              {lines.toLocaleString()} lines
            </span>
            {dirty && (
              <button
                onClick={handleReset}
                className="text-[11px] px-3 py-1 rounded transition-colors text-white/40 hover:text-white/70 hover:bg-white/5"
              >
                Reset
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!dirty || saveStatus === 'saving'}
              className="flex items-center gap-1.5 text-[11px] font-semibold px-4 py-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: dirty ? meta.accentMuted : 'rgba(255,255,255,0.04)',
                border: `1px solid ${dirty ? meta.accentBorder : 'rgba(255,255,255,0.08)'}`,
                color: dirty ? meta.accent : 'rgba(255,255,255,0.25)',
              }}
            >
              {saveStatus === 'saving' ? (
                <><span className="h-2.5 w-2.5 rounded-full border border-current border-t-transparent animate-spin" /> Saving…</>
              ) : '↑ Save'}
            </button>
          </div>

          {/* Editor */}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => { setDraft(e.target.value); setSave('idle') }}
            className="w-full bg-transparent resize-none outline-none px-5 py-4"
            style={{
              fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", ui-monospace, monospace',
              fontSize: '12px',
              lineHeight: '1.7',
              color: 'rgba(255,255,255,0.80)',
              minHeight: '420px',
              maxHeight: '70vh',
              overflowY: 'auto',
              tabSize: 2,
            }}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>
      )}
    </div>
  )
}

// ── Active prompt preview ─────────────────────────────────────────────────────
function ActivePromptStats({ activeChars }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3 rounded-xl" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.18)' }}>
      <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
      <div>
        <div className="text-[11px] font-mono text-blue-300/80">Active analyst system prompt</div>
        <div className="text-[10px] text-white/30 font-mono">
          Analyst Skill + Italy Baseline inlined = <span className="text-blue-300">{(activeChars || 0).toLocaleString()} chars</span>
          {' '}·{' '}<span className="text-blue-300">~{tokenEstimate(activeChars || 0)} tokens</span>
        </div>
      </div>
    </div>
  )
}

// ── Main Settings page ────────────────────────────────────────────────────────
export default function AnalystSettings() {
  useDocumentTitle('Analyst Settings — EU Energy')

  const [files, setFiles]           = useState({})
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [activeChars, setActiveChars] = useState(0)
  const [reloading, setReloading]   = useState(false)

  async function fetchFiles() {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/analyst-files')
      const data = await res.json()
      setFiles(data.files || {})
      setActiveChars(data.activePromptChars || 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchFiles() }, [])

  const handleSaved = useCallback((key, content) => {
    setFiles(f => ({ ...f, [key]: { ...f[key], content, chars: content.length } }))
    // Refresh active prompt stats after save
    fetch('/api/analyst-files').then(r => r.json()).then(d => setActiveChars(d.activePromptChars || 0))
  }, [])

  async function handleReload() {
    setReloading(true)
    try {
      await fetch('/api/reload-prompt', { method: 'POST' })
      await fetchFiles()
    } finally {
      setReloading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">

      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/25">Configuration</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white/90 mb-1">Analyst Settings</h1>
            <p className="text-sm text-white/40 leading-relaxed max-w-xl">
              Edit the AI analysis instructions, Italy market baseline, and output format prompts.
              All changes are saved to disk and take effect immediately — no redeploy needed.
            </p>
          </div>
          <button
            onClick={handleReload}
            disabled={reloading}
            className="shrink-0 flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded-lg border transition-all disabled:opacity-40"
            style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.40)' }}
            title="Force-reload all prompt files from disk"
          >
            {reloading ? (
              <span className="h-2.5 w-2.5 rounded-full border border-current border-t-transparent animate-spin" />
            ) : '↻'}
            Reload from disk
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-xl text-sm text-red-300" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)' }}>
          Failed to load files: {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[120, 80, 100, 60].map((h, i) => (
            <div key={i} className="rounded-xl animate-pulse" style={{ height: h, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }} />
          ))}
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-4">

          {/* Active prompt stats */}
          <ActivePromptStats activeChars={activeChars} />

          {/* How it works info box */}
          <div className="px-5 py-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-[10px] font-mono uppercase tracking-widest text-white/25 mb-2">How the analyst prompt is assembled</div>
            <div className="flex items-center gap-2 text-[12px] text-white/50 flex-wrap">
              <span className="px-2 py-0.5 rounded font-mono" style={{ background: 'rgba(59,130,246,0.12)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.25)' }}>⚡ Analysis Skill</span>
              <span className="text-white/25">+</span>
              <span className="px-2 py-0.5 rounded font-mono" style={{ background: 'rgba(16,185,129,0.10)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.25)' }}>🇮🇹 Italy Baseline</span>
              <span className="text-white/25">=</span>
              <span className="px-2 py-0.5 rounded font-mono" style={{ background: 'rgba(139,92,246,0.10)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.25)' }}>Active System Prompt</span>
              <span className="text-white/25 text-[11px] ml-1">sent to the AI on every Summarise request</span>
            </div>
          </div>

          {/* File editors */}
          {FILE_KEYS.map(key => (
            <FileEditor
              key={key}
              fileKey={key}
              data={files[key]}
              onSaved={handleSaved}
            />
          ))}

        </div>
      )}
    </div>
  )
}
