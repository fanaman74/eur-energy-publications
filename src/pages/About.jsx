import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function About() {
  useDocumentTitle('About')
  return (
    <div className="max-w-3xl mx-auto px-6 py-16 prose-invert">
      <h1 className="font-display text-3xl mb-6">About this explorer</h1>
      <p className="text-muted mb-4">
        A fast, institutionally precise interface to the European Union's energy policy
        publications, sourced directly from the Publications Office's CELLAR repository.
      </p>
      <h2 className="font-display text-xl mt-10 mb-3">Data sources</h2>
      <ul className="space-y-2 text-sm text-muted list-disc pl-5">
        <li>
          <strong className="text-text">CELLAR SPARQL endpoint</strong> — primary source,
          returning structured metadata for DG ENER works.
        </li>
        <li>
          <strong className="text-text">OP Search API</strong> — resilient fallback using the
          public portlet search.
        </li>
        <li>
          <strong className="text-text">EU Open Data Portal</strong> — final fallback for
          dataset metadata under the ENER category.
        </li>
      </ul>
      <h2 className="font-display text-xl mt-10 mb-3">Open data</h2>
      <p className="text-sm text-muted">
        All publication data shown here is public and reusable under applicable EU open data
        policies. This project is not affiliated with the European Commission.
      </p>
    </div>
  )
}
