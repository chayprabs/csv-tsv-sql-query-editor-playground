import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — Quarry",
  description: "How Quarry handles your data and what is logged.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <article className="mx-auto max-w-3xl space-y-6 text-base leading-relaxed text-ink">
        <p className="text-sm text-muted">
          <Link href="/">← Back to Quarry</Link>
        </p>
        <h1 className="text-3xl font-semibold text-ink">Privacy</h1>
        <p className="text-sm text-muted">Quarry (Flatfile SQL Studio)</p>

        <h2 className="text-xl font-semibold text-ink">Data we collect</h2>
        <p>
          Quarry does not create user accounts and does not store uploaded files. When you
          submit a query, your files are transmitted to our server over HTTPS, processed
          entirely in memory, and discarded the moment the request ends. We do not retain
          file content between requests.
        </p>
        <p>
          We collect standard server request logs including: your IP address (used for rate
          limiting), the time and duration of each request, the HTTP status code, and a short
          identifier used to correlate error reports. We may retain a truncated preview of
          your SQL query (first 200 characters) for debugging timed-out queries. We do not log
          file content or query results.
        </p>

        <h2 className="text-xl font-semibold text-ink">Cookies</h2>
        <p>
          Quarry does not set any application cookies. Your infrastructure provider (for
          example Cloudflare, Fly.io, or Render) may set short-lived cookies for security or
          routing purposes as part of standard network operation. These cookies are set by the
          infrastructure provider, not by Quarry, and do not contain your file content.
        </p>

        <h2 className="text-xl font-semibold text-ink">Analytics</h2>
        <p>
          None. Quarry does not include analytics, tracking pixels, or telemetry scripts.
        </p>

        <h2 className="text-xl font-semibold text-ink">Third-party services</h2>
        <p>
          Quarry uses Upstash Redis for rate limiting in production. Upstash receives per-IP
          request counts and bandwidth counters — it does not receive file content or query
          results. Upstash&apos;s privacy policy applies to data processed by their service.
        </p>
        <p>
          Your hosting provider (Fly.io, Render, etc.) processes standard HTTP traffic as part
          of delivery. They do not receive file content beyond what is inherent in routing your
          HTTPS request.
        </p>

        <h2 className="text-xl font-semibold text-ink">localStorage</h2>
        <p>
          Your last 10 SQL queries are stored in your browser&apos;s localStorage for
          convenience. This data stays on your device and is never transmitted to any server.
        </p>

        <h2 className="text-xl font-semibold text-ink">Contact</h2>
        <p>
          For questions about this privacy notice, contact{" "}
          <a href="mailto:hello@chaitanyaprabuddha.com">hello@chaitanyaprabuddha.com</a>.
        </p>
        <p className="text-sm text-muted">Last updated: May 17, 2026</p>
      </article>
    </main>
  );
}
