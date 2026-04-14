import { BADGE_COLORS } from '../../utils/constants'

export default function PublicationBadge({ type }) {
  const cls = BADGE_COLORS[type] || BADGE_COLORS.Publication
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {type}
    </span>
  )
}
