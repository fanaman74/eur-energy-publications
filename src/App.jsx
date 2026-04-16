import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { PublicationsProvider } from './context/PublicationsContext'
import ErrorBoundary from './components/ui/ErrorBoundary'
import Header from './components/layout/Header'
import Footer from './components/layout/Footer'
import Home from './pages/Home'
import Browse from './pages/Browse'
import Detail from './pages/Detail'
import About from './pages/About'
import Remit from './pages/Remit'
import EurLex from './pages/EurLex'
import LegislationDetail from './pages/LegislationDetail'
import FullTextReader from './pages/FullTextReader'
import InteractiveMap from './pages/InteractiveMap'

export default function App() {
  return (
    <ErrorBoundary>
      <PublicationsProvider>
        <BrowserRouter>
          <div className="min-h-full flex flex-col">
            <Header />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/browse" element={<Browse />} />
                <Route path="/publication/:id" element={<Detail />} />
                <Route path="/remit" element={<Remit />} />
                <Route path="/eur-lex" element={<EurLex />} />
                <Route path="/eur-lex/:workId" element={<LegislationDetail />} />
                <Route path="/eur-lex/:workId/text/:lang" element={<FullTextReader />} />
                <Route path="/map" element={<InteractiveMap />} />
                <Route path="/about" element={<About />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </BrowserRouter>
      </PublicationsProvider>
    </ErrorBoundary>
  )
}
