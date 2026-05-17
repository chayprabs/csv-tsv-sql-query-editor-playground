import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Credits — Quarry",
  description: "Open source acknowledgements for Quarry.",
};

const credits = [
  {
    href: "https://github.com/WiseLibs/better-sqlite3",
    label: "SQLite engine: better-sqlite3 by Joshua Wise",
  },
  {
    href: "https://www.papaparse.com",
    label: "CSV parsing: PapaParse",
  },
  {
    href: "https://nextjs.org",
    label: "Framework: Next.js",
  },
  {
    href: "https://upstash.com",
    label: "Rate limiting: Upstash (optional in production)",
  },
];

export default function CreditsPage() {
  return (
    <main className="min-h-screen px-4 py-10 md:px-8">
      <article className="mx-auto max-w-3xl">
        <p className="text-sm text-muted">
          <Link href="/">← Back to Quarry</Link>
        </p>
        <h1 className="mt-4 font-sans text-3xl font-semibold text-ink">Credits</h1>
        <p className="mt-2 text-muted">
          Quarry builds on excellent open source projects. Thank you to the authors and
          maintainers.
        </p>
        <ul className="mt-8 space-y-4 text-lg text-ink">
          {credits.map((item) => (
            <li key={item.href}>
              <a className="text-accent underline underline-offset-4" href={item.href} rel="noreferrer" target="_blank">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </article>
    </main>
  );
}
