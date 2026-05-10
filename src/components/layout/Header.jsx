import { NavLink } from 'react-router-dom'

const link = ({ isActive }) =>
  `px-3 py-2 text-sm tracking-wide transition-colors ${
    isActive ? 'text-text' : 'text-muted hover:text-text'
  }`

export default function Header() {
  return (
    <header className="border-b border-border bg-bg/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <NavLink to="/" className="flex items-center gap-3 group">
          <span className="text-accent text-lg leading-none" aria-hidden>★</span>
          <span className="font-display text-lg font-semibold tracking-tight">
            EU Energy <span className="text-primary">Publications</span>
          </span>
        </NavLink>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={link}>Home</NavLink>
          <NavLink to="/browse" className={link}>Browse</NavLink>
          <NavLink to="/remit" className={link}>REMIT</NavLink>
          <NavLink to="/eur-lex" className={link}>EUR-Lex</NavLink>
          <NavLink to="/map" className={link}>Map</NavLink>
          <NavLink to="/about" className={link}>About</NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `ml-1 px-3 py-1.5 text-[11px] font-mono rounded-lg border transition-all ${
                isActive
                  ? 'border-blue-400/40 bg-blue-400/10 text-blue-300'
                  : 'border-white/10 text-white/30 hover:border-white/20 hover:text-white/60'
              }`
            }
            title="Analyst prompt settings"
          >
            ⚙ Analyst
          </NavLink>
        </nav>
      </div>
    </header>
  )
}
