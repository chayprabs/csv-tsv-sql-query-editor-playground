export function SeoBar() {
  return (
    <header className="border-b border-line/80 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Quarry
        </p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          Run SQL on CSV and TSV files — server-side, nothing stored.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted md:text-base">
          Upload delimited files, review inferred schemas, and run read-only SQLite queries
          including joins. Each request uses a fresh in-memory database; files are not written
          to disk.
        </p>
        <p
          className="mt-5 max-w-2xl rounded-xl border border-line bg-neutral-50 px-4 py-3 text-sm text-ink"
          role="note"
        >
          Your files are never stored. When the request ends, the in-memory database is
          destroyed.
        </p>
      </div>
    </header>
  );
}
