import Link from "next/link";

export function SiteHeader() {
  return (
    <div className="border-b border-line/60 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link
          className="text-sm font-semibold tracking-tight text-ink hover:text-accent"
          href="/"
        >
          Quarry
        </Link>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <Link className="hover:text-accent" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-accent" href="/terms">
            Terms
          </Link>
          <a
            className="hover:text-accent"
            href="https://github.com/chayprabs/csv-tsv-sql-query-editor-playground"
            rel="noreferrer"
            target="_blank"
          >
            GitHub
          </a>
        </nav>
      </div>
    </div>
  );
}
