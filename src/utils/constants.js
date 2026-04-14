export const PUBLICATION_TYPES = [
  'Report',
  'Study',
  'Brochure',
  'Press release',
  'Factsheet',
  'Working document',
]

export const TOPICS = [
  'Renewable energy',
  'Nuclear',
  'Gas',
  'Oil',
  'Electricity',
  'Energy efficiency',
  'Energy union',
]

export const LANGUAGES = [
  { code: 'EN', label: 'English' },
  { code: 'FR', label: 'Français' },
  { code: 'DE', label: 'Deutsch' },
]

export const FORMATS = ['All', 'PDF', 'HTML']

export const RESULTS_PER_PAGE = 20
export const DEBOUNCE_MS = 300
export const CACHE_MAX = 50

export const BADGE_COLORS = {
  Report: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  Study: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  Brochure: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  'Press release': 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  Factsheet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  'Working document': 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  Publication: 'bg-primary/15 text-primary border-primary/30',
}

export const CURRENT_YEAR = new Date().getFullYear()
export const YEAR_RANGE = Array.from(
  { length: CURRENT_YEAR - 2010 + 1 },
  (_, i) => CURRENT_YEAR - i
)
