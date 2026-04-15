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
        </nav>
      </div>
    </header>
  )
}
