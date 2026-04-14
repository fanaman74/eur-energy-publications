# EU Energy Publications Explorer

A web app for browsing, searching, and filtering EU energy policy publications sourced from the Publications Office of the European Union (CELLAR repository).

## Stack

- Vite + React 18
- Tailwind CSS v3
- React Router v6
- Native fetch + Context + useReducer

## Data sources (in priority order)

1. **CELLAR SPARQL endpoint** — `http://publications.europa.eu/webapi/rdf/sparql`
2. **OP Search API** — `https://op.europa.eu/en/search-results` (fallback)
3. **EU Open Data Portal** — `https://data.europa.eu/api/hub/search/datasets` (final fallback)

All are public, no API key required.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:5173/>.

## CORS / proxy

Neither CELLAR nor OP Search return permissive CORS headers, so the app never talks to them directly from the browser:

- **Dev:** `vite.config.js` proxies `/api/sparql`, `/api/opsearch`, and `/api/opendata` to the upstream hosts.
- **Prod:** deploy the serverless function in `api/sparql.js` to Vercel / Netlify Functions. Add similar proxies for the other endpoints if desired.

## Scripts

```bash
npm run dev      # Vite dev server on :5173
npm run build    # Production build to dist/
npm run preview  # Serve the production build locally
```

## Project layout

```
src/
├── api/          # cellar, opSearch, openData (with fallback)
├── components/   # layout, search, publications, ui
├── context/      # PublicationsContext (reducer + cache)
├── hooks/        # usePublications, useSearch, useFilters, useDocumentTitle
├── pages/        # Home, Browse, Detail, About
└── utils/        # sparqlBuilder, formatters, constants
```

## Attribution

Data source: Publications Office of the European Union — CELLAR repository and OP Search API. All publication data is public and reusable under applicable EU open data policies. This project is not affiliated with the European Commission.
# eur-energy-publications
# eur-energy-publications
# eur-energy-publications
