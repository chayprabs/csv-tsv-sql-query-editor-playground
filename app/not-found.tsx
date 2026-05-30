import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-ink">Page not found</h1>
      <p className="mt-3 text-sm text-muted">
        This URL does not exist. Head back to Quarry to query your files.
      </p>
      <Link
        className="mt-8 inline-block rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white"
        href="/"
      >
        Back to Quarry
      </Link>
    </main>
  );
}
