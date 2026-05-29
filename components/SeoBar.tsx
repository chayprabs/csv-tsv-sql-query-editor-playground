export function SeoBar() {
  return (
    <section
      aria-labelledby="product-summary"
      className="border-b border-neutral-200 bg-neutral-50"
      role="note"
    >
      <div className="mx-auto max-w-6xl px-4 py-4 md:px-6">
        <h1
          className="text-base font-semibold leading-snug text-neutral-900 md:text-lg"
          id="product-summary"
        >
          Run SQL on CSV and TSV files — server-side, nothing stored.
        </h1>
        <p className="mt-1 max-w-4xl text-sm leading-relaxed text-neutral-600">
          Upload delimited files, confirm inferred schemas, and run read-only SQLite
          queries including joins. Each request uses a fresh in-memory database; your
          files are never written to disk or kept after the request ends.
        </p>
      </div>
    </section>
  );
}
