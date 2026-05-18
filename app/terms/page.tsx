import type { Metadata } from "next";
import Link from "next/link";

const GITHUB_REPO = "https://github.com/chayprabs/csv-tsv-sql-query-editor-playground";

export const metadata: Metadata = {
  title: "Terms of Service — Quarry",
  description: "Terms of use for the Quarry SQL workspace.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen px-4 py-10 md:px-8">
      <article className="mx-auto max-w-3xl space-y-6 text-base leading-relaxed text-ink">
        <p className="text-sm text-muted">
          <Link href="/">← Back to Quarry</Link>
        </p>
        <h1 className="text-3xl font-semibold text-ink">Terms of Service</h1>

        <section className="scroll-mt-24" id="terms-of-use">
          <h2 className="text-xl font-semibold text-ink">Terms of Use</h2>
          <p className="mt-2">
            These Terms of Use apply to anyone who accesses Quarry (Flatfile SQL Studio). They work
            together with the sections below on acceptable use, privacy-related expectations, and
            liability limits.
          </p>
        </section>

        <section className="scroll-mt-24" id="disclaimer">
          <h2 className="text-xl font-semibold text-ink">Disclaimer</h2>
          <p className="mt-2">
            Quarry is provided for general productivity only. Nothing on this site is legal,
            financial, medical, or other professional advice. Use your own judgment and verify
            outputs before relying on them.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink">Use at your own risk</h2>
          <p className="mt-2">
            Quarry is provided free of charge and as-is, without warranty of any kind.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink">No warranty on query correctness</h2>
          <p className="mt-2">
            SQL queries are executed by SQLite via the better-sqlite3 library. The operator of
            Quarry makes no warranty that query results are accurate, complete, or suitable for
            any purpose. Always verify results independently before making decisions based on
            them.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink">Acceptable use</h2>
          <p className="mt-2">
            You may not use Quarry to upload files in a manner that violates applicable laws. You
            are responsible for ensuring you have the right to upload and query the files you
            submit. You may not attempt to circumvent rate limits or security measures.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink">No sensitive data</h2>
          <p className="mt-2">
            While files are never stored, you should avoid uploading files containing passwords,
            API keys, payment card numbers, government identification numbers, or other highly
            sensitive personal data. Transmission occurs over HTTPS but the operator cannot
            guarantee security of all infrastructure components.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink">Read-only queries only</h2>
          <p className="mt-2">
            Quarry enforces read-only SQL. Attempts to run mutating SQL are rejected by the
            server. Do not attempt to exploit or probe the SQL engine.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink">Rate limits</h2>
          <p className="mt-2">
            Quarry enforces per-IP rate limits to ensure fair access. Automated bulk usage or
            deliberate attempts to exceed limits may result in your IP being blocked.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink">Open source</h2>
          <p className="mt-2">
            Quarry&apos;s source code is available at the{" "}
            <a className="text-accent underline underline-offset-4" href={GITHUB_REPO} rel="noreferrer" target="_blank">
              GitHub repository
            </a>
            . It is provided under the MIT License.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-ink">Changes</h2>
          <p className="mt-2">These terms may be updated at any time. Continued use constitutes acceptance.</p>
        </section>
      </article>
    </main>
  );
}
