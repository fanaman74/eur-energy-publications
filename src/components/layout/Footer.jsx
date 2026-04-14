export default function Footer() {
  return (
    <footer className="border-t border-border mt-20 py-8">
      <div className="max-w-7xl mx-auto px-6 text-xs text-muted flex flex-col md:flex-row gap-3 justify-between">
        <p>
          Data source:{' '}
          <a
            href="https://op.europa.eu/en/web/cellar"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Publications Office of the EU — CELLAR
          </a>
        </p>
        <p>All publication data is public under EU open data policies.</p>
      </div>
    </footer>
  )
}
