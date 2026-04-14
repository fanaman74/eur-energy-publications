import { useEffect, useState } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { fetchAcerNews } from '../api/acerRss'
import { fetchDocuments } from '../api/energyDocuments'
import { formatDate, shortId, eurLexUrl, opDetailUrl } from '../utils/formatters'
import Spinner from '../components/ui/Spinner'

const LEG_TYPE_LABEL = {
  REG: 'Regulation', REG_IMPL: 'Implementing Reg.', REG_DEL: 'Delegated Reg.',
  REG_IMPL_DRAFT: 'Draft IR', REG_DEL_DRAFT: 'Draft DR',
  DEC: 'Decision', DEC_IMPL: 'Implementing Dec.',
}

async function fetchRemitLegislation() {
  const SPARQL = '/api/sparql'
  const query = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT DISTINCT ?work ?title ?date ?type WHERE {
  VALUES ?type {
    <http://publications.europa.eu/resource/authority/resource-type/REG>
    <http://publications.europa.eu/resource/authority/resource-type/REG_IMPL>
    <http://publications.europa.eu/resource/authority/resource-type/REG_DEL>
    <http://publications.europa.eu/resource/authority/resource-type/REG_IMPL_DRAFT>
    <http://publications.europa.eu/resource/authority/resource-type/REG_DEL_DRAFT>
    <http://publications.europa.eu/resource/authority/resource-type/DEC>
    <http://publications.europa.eu/resource/authority/resource-type/DEC_IMPL>
  }
  ?work cdm:work_has_resource-type ?type .
  ?work cdm:work_date_document ?date .
  ?expr cdm:expression_belongs_to_work ?work .
  ?expr cdm:expression_title ?title .
  ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
  FILTER(
    CONTAINS(LCASE(STR(?title)), "remit") ||
    CONTAINS(STR(?title), "1227/2011") ||
    CONTAINS(STR(?title), "2024/1106")
  )
  FILTER(?date >= "2010-01-01"^^xsd:date)
}
ORDER BY DESC(?date)
LIMIT 20`

  const res = await fetch(SPARQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
    body: new URLSearchParams({ query }).toString(),
  })
  if (!res.ok) throw new Error('SPARQL failed')
  const json = await res.json()
  return (json?.results?.bindings || []).map(b => ({
    id: b.work?.value || '',
    title: b.title?.value || 'Untitled',
    date: b.date?.value || null,
    rawType: b.type?.value?.split('/').pop() || '',
  }))
}

const KB_SECTIONS = [
  {
    title: 'Q&As on REMIT',
    desc: '30th edition — authoritative Q&A compendium on the regulation',
    href: 'https://www.acer.europa.eu/remit/about-remit/remit-qas',
    pdf: 'https://www.acer.europa.eu/sites/default/files/documents/en/remit/REMIT-30th-edition-QAs.pdf',
    tag: 'Q&A',
  },
  {
    title: 'Transaction Reporting User Manual (TRUM)',
    desc: 'Technical specifications for REMIT transaction data reporting (v7.0)',
    href: 'https://www.acer.europa.eu/remit/data-collection/data-reporting',
    pdf: 'https://www.acer.europa.eu/sites/default/files/documents/en/remit/ACER-REMIT-TRUM-2024-v7.0.pdf',
    tag: 'Manual',
  },
  {
    title: 'FAQs on Transaction Reporting',
    desc: 'Frequently asked questions specific to REMIT transaction reporting obligations',
    href: 'https://www.acer.europa.eu/remit/data-collection/data-reporting',
    pdf: 'https://www.acer.europa.eu/sites/default/files/documents/en/remit/FAQ-on-transaction-reporting.pdf',
    tag: 'FAQ',
  },
  {
    title: 'FAQs on Fundamental Data & Inside Information',
    desc: 'FAQs covering inside information disclosure and fundamental data obligations',
    href: 'https://www.acer.europa.eu/remit/data-collection/inside-information-disclosure-and-collection',
    pdf: 'https://www.acer.europa.eu/sites/default/files/documents/en/remit/FAQs-on-REMIT-fundamental-data-and-inside-information_V8-clean.pdf',
    tag: 'FAQ',
  },
  {
    title: 'REMIT Guidance',
    desc: 'Regulatory guidance documents on REMIT implementation',
    href: 'https://www.acer.europa.eu/remit/about-remit/remit-guidance',
    tag: 'Guidance',
  },
  {
    title: 'REMIT Investigations',
    desc: 'Enforcement decisions and ongoing market abuse investigations',
    href: 'https://www.acer.europa.eu/remit/remit-investigations',
    tag: 'Enforcement',
  },
]

const TAG_COLOR = {
  'Q&A':        'text-primary border-primary/30 bg-primary/10',
  Manual:       'text-amber-400 border-amber-400/30 bg-amber-400/10',
  FAQ:          'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
  Guidance:     'text-violet-400 border-violet-400/30 bg-violet-400/10',
  Enforcement:  'text-rose-400 border-rose-400/30 bg-rose-400/10',
}

export default function Remit() {
  useDocumentTitle('REMIT Knowledge Base')
  const [news, setNews] = useState([])
  const [newsStatus, setNewsStatus] = useState('loading')
  const [legislation, setLegislation] = useState([])
  const [legStatus, setLegStatus] = useState('loading')

  useEffect(() => {
    const controller = new AbortController()
    fetchAcerNews({ signal: controller.signal })
      .then((items) => { setNews(items); setNewsStatus('done') })
      .catch((e) => { if (e.name !== 'AbortError') setNewsStatus('error') })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    fetchRemitLegislation()
      .then((items) => { setLegislation(items); setLegStatus('done') })
      .catch(() => setLegStatus('error'))
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-xs text-muted mb-4">
          <span className="text-accent" aria-hidden>★</span>
          ACER · Regulation on Energy Market Integrity and Transparency
        </div>
        <h1 className="font-display text-3xl font-semibold mb-2">
          REMIT <span className="text-primary">Knowledge Base</span>
        </h1>
        <p className="text-muted text-sm max-w-2xl">
          Official ACER resources on REMIT — Q&As, reporting manuals, guidance, and enforcement updates.
          Live news feed sourced from{' '}
          <a href="https://www.acer.europa.eu" target="_blank" rel="noreferrer" className="text-primary hover:underline">
            acer.europa.eu ↗
          </a>
        </p>
      </div>

      {/* REMIT Legislation — full width above the grid */}
      <div className="mb-10">
        <h2 className="font-display text-lg mb-4 flex items-center gap-2">
          <span className="text-accent" aria-hidden>★</span>
          REMIT Legislation
          {legStatus === 'loading' && (
            <span className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin inline-block ml-1" />
          )}
        </h2>
        {legStatus === 'error' ? (
          <p className="text-muted text-sm">Could not load from CELLAR.</p>
        ) : legislation.length === 0 && legStatus === 'done' ? (
          <p className="text-muted text-sm">No results found.</p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface2 border-b border-border text-[10px] uppercase tracking-wider text-muted">
                  <th className="text-left px-4 py-3">Title</th>
                  <th className="text-left px-4 py-3 w-44">Type</th>
                  <th className="text-left px-4 py-3 w-32 font-mono">Date</th>
                  <th className="px-4 py-3 w-24 text-center">Links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {legislation.map((leg, i) => {
                  const pub = { id: leg.id }
                  const typeLabel = LEG_TYPE_LABEL[leg.rawType] || leg.rawType
                  return (
                    <tr key={leg.id || i} className="hover:bg-primary/5 transition-colors">
                      <td className="px-4 py-3 font-medium text-text leading-snug">{leg.title}</td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-mono uppercase tracking-wide text-accent border border-accent/30 rounded px-1.5 py-0.5">
                          {typeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted whitespace-nowrap">
                        {formatDate(leg.date)}
                      </td>
                      <td className="px-4 py-3 text-center flex gap-3 justify-center">
                        <a href={eurLexUrl(pub)} target="_blank" rel="noreferrer"
                          className="text-xs text-primary hover:underline" title="Open in EUR-Lex">
                          EUR-Lex ↗
                        </a>
                        <a href={opDetailUrl(pub)} target="_blank" rel="noreferrer"
                          className="text-xs text-muted hover:text-text" title="Open in Publications Office">
                          OP ↗
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* KB sections — left 2/3 */}
        <div className="lg:col-span-2">
          <h2 className="font-display text-lg mb-4 flex items-center gap-2">
            <span className="text-accent" aria-hidden>★</span>
            Knowledge Base Documents
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {KB_SECTIONS.map((sec) => (
              <div
                key={sec.title}
                className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-[10px] font-mono uppercase tracking-wider border rounded px-1.5 py-0.5 ${TAG_COLOR[sec.tag] || TAG_COLOR.Guidance}`}>
                    {sec.tag}
                  </span>
                </div>
                <div>
                  <h3 className="font-medium text-text text-sm leading-snug mb-1">{sec.title}</h3>
                  <p className="text-xs text-muted leading-relaxed">{sec.desc}</p>
                </div>
                <div className="flex gap-3 mt-auto pt-2 border-t border-border">
                  <a
                    href={sec.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Webpage ↗
                  </a>
                  {sec.pdf && (
                    <a
                      href={sec.pdf}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted hover:text-text"
                    >
                      PDF ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Quick links */}
          <div className="mt-8 rounded-xl border border-border bg-surface/50 p-5">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-3">Key REMIT Links</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                ['About REMIT', 'https://www.acer.europa.eu/remit/about-remit'],
                ['Data Collection', 'https://www.acer.europa.eu/remit/data-collection'],
                ['Market Surveillance', 'https://www.acer.europa.eu/remit/market-surveillance'],
                ['REMIT for You', 'https://www.acer.europa.eu/remit/remit-for-you'],
                ['Coordination on Cases', 'https://www.acer.europa.eu/remit/coordination-on-cases'],
                ['Cooperation', 'https://www.acer.europa.eu/remit/cooperation'],
              ].map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-muted hover:text-primary transition-colors flex items-center gap-1.5"
                >
                  <span className="text-border">›</span> {label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* ACER news feed — right 1/3 */}
        <div>
          <h2 className="font-display text-lg mb-4 flex items-center gap-2">
            <span className="text-accent" aria-hidden>★</span>
            ACER Latest News
          </h2>
          {newsStatus === 'loading' ? (
            <Spinner label="Loading ACER feed…" />
          ) : newsStatus === 'error' ? (
            <p className="text-muted text-sm">Feed unavailable — visit{' '}
              <a href="https://www.acer.europa.eu" target="_blank" rel="noreferrer" className="text-primary hover:underline">acer.europa.eu</a>{' '}
              directly.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border rounded-xl border border-border overflow-hidden">
              {news.map((item, i) => (
                <a
                  key={i}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`block px-4 py-3 hover:bg-primary/5 transition-colors ${item.isRemit ? 'border-l-2 border-l-primary' : ''}`}
                >
                  {item.isRemit && (
                    <span className="text-[9px] font-mono uppercase tracking-wider text-primary mb-1 block">
                      REMIT
                    </span>
                  )}
                  <p className="text-sm text-text leading-snug font-medium">{item.title}</p>
                  {item.date && (
                    <time className="text-[11px] font-mono text-muted mt-1 block">{formatDate(item.date)}</time>
                  )}
                </a>
              ))}
              <div className="px-4 py-3 bg-surface/50">
                <a
                  href="https://www.acer.europa.eu/rss.xml"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted hover:text-primary transition-colors"
                >
                  Subscribe to ACER RSS ↗
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
