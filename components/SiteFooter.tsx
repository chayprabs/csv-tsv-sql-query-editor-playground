import Link from "next/link";

const GITHUB_REPO = "https://github.com/chayprabs/csv-tsv-sql-query-editor-playground";

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-line/80 bg-panel/90 px-4 py-6 text-sm text-muted md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="max-w-3xl leading-relaxed text-ink">
          Your files are never stored. Each query runs against an in-memory database that
          is destroyed when the request ends.
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-ink">
          <Link className="underline decoration-accent/60 underline-offset-4 hover:text-accent" href="/privacy">
            Privacy
          </Link>
          <Link className="underline decoration-accent/60 underline-offset-4 hover:text-accent" href="/terms">
            Terms
          </Link>
          <Link className="underline decoration-accent/60 underline-offset-4 hover:text-accent" href="/terms#terms-of-use">
            Terms of Use
          </Link>
          <a
            className="underline decoration-accent/60 underline-offset-4 hover:text-accent"
            href={GITHUB_REPO}
            rel="noreferrer"
            target="_blank"
          >
            Source
          </a>
        </nav>
      </div>
      <p className="mx-auto mt-4 max-w-7xl text-xs text-muted">
        © {new Date().getFullYear()} Chaitanya Prabuddha — MIT License
      </p>
    </footer>
  );
}
