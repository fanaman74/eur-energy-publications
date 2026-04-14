import { formatDate } from '../../utils/formatters'
import PublicationBadge from './PublicationBadge'

export default function PublicationDetail({ pub, related = [] }) {
  if (!pub) return null
  return (
    <article className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <PublicationBadge type={pub.type} />
        <time className="font-mono text-xs text-muted">{formatDate(pub.date)}</time>
      </div>
      <h1 className="font-display text-3xl md:text-4xl mb-6 leading-tight">{pub.title}</h1>
      {pub.abstract && <p className="text-muted mb-8 leading-relaxed">{pub.abstract}</p>}

      <div className="rounded-xl border border-border bg-surface overflow-hidden mb-8">
        <table className="w-full text-sm">
          <tbody>
            <Row label="Type" value={pub.type} />
            <Row label="Date" value={formatDate(pub.date)} mono />
            <Row label="Language" value={pub.language} />
            <Row label="Identifier" value={pub.id} mono truncate />
            <Row label="Source" value={pub.source || '—'} />
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3 mb-12">
        {pub.url && (
          <a
            href={pub.url}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded border border-primary/40 bg-primary/10 text-primary text-sm hover:bg-primary/20"
          >
            Open in Publications Office ↗
          </a>
        )}
      </div>

      {related.length > 0 && (
        <section>
          <h2 className="font-display text-xl mb-4">Related publications</h2>
          <ul className="space-y-2">
            {related.map((r) => (
              <li key={r.id} className="text-sm text-muted hover:text-text">
                <span className="font-mono text-xs text-accent mr-2">{formatDate(r.date)}</span>
                {r.title}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}

function Row({ label, value, mono, truncate }) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <th className="text-left text-xs uppercase tracking-wider text-muted font-medium px-4 py-3 w-32 align-top">
        {label}
      </th>
      <td className={`px-4 py-3 ${mono ? 'font-mono text-xs' : ''} ${truncate ? 'truncate max-w-0' : ''}`}>
        {value}
      </td>
    </tr>
  )
}
