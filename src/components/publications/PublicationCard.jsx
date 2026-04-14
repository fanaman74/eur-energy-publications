import { Link } from 'react-router-dom'
import PublicationBadge from './PublicationBadge'
import { formatDate, truncate, shortId, opDetailUrl } from '../../utils/formatters'

export default function PublicationCard({ pub, index = 0 }) {
  const detailPath = `/publication/${encodeURIComponent(shortId(pub.id))}`
  return (
    <article
      className="group relative rounded-xl bg-surface border border-border border-l-2 hover:border-l-primary hover:bg-surface/60 p-5 transition-all animate-fade-in"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <PublicationBadge type={pub.type} />
        <time className="font-mono text-[11px] text-muted shrink-0">{formatDate(pub.date)}</time>
      </div>
      <h3 className="font-display text-lg leading-snug mb-2 text-text group-hover:text-primary transition-colors">
        <Link to={detailPath} state={{ pub }}>{pub.title}</Link>
      </h3>
      {pub.abstract && (
        <p className="text-sm text-muted line-clamp-3 mb-4">{truncate(pub.abstract, 220)}</p>
      )}
      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted">{pub.language}</span>
        <a
          href={opDetailUrl(pub)}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Open in Publications Office ↗
        </a>
      </div>
    </article>
  )
}
