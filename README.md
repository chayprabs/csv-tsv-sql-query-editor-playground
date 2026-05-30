<!-- Quarry / Flatfile SQL Studio — README keywords: CSV SQL, TSV SQL, SQLite query tool, join CSV files, server-side SQL, better-sqlite3, Next.js, TypeScript, privacy, no signup, flatfile analytics -->

<div align="center">

# Quarry

**Flatfile SQL Studio** — run **read-only SQL** (including `JOIN`s) on **CSV**, **TSV**, and **plain-text** delimited files in the browser. No install, no account, **no file storage** after the request.

[![MIT License](https://img.shields.io/github/license/chayprabs/csv-tsv-sql-query-editor-playground?style=flat-square)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/node.js-%3E%3D20-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![CI](https://img.shields.io/github/actions/workflow/status/chayprabs/csv-tsv-sql-query-editor-playground/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/chayprabs/csv-tsv-sql-query-editor-playground/actions/workflows/ci.yml)

[Features](#-what-it-does) · [Quick start](#-quick-start) · [API](#-api-contract) · [Limits](#-limits--defaults) · [FAQ](#-faq) · [Privacy](#-privacy--data-handling) · [Deploy](#-deployment)

</div>

---

## Why Quarry?

Analysts and engineers often need **ad hoc SQL on flat files** — exports, logs, spreadsheets — without spinning up Python, DuckDB, or a real database. **Quarry** removes that friction: **upload → query → export**. It is a lightweight alternative to workflows built around **Datasette**, **`q`**, **TextQL**, **pandas**, or the **DuckDB CLI** when you only need a quick, disposable query session.

**Internal codename:** Flatfile SQL Studio · **Owner:** Chaitanya Prabuddha ([@chayprabs](https://github.com/chayprabs))

---

## What it does

| Capability | Details |
| --- | --- |
| **Multi-file SQL** | Upload one or more files; `JOIN` across derived SQLite tables. |
| **Smart parsing** | Auto **delimiter** detection (`,`, tab, `;`) and **header** heuristics, with per-file overrides. |
| **Types** | Columns inferred as SQLite **INTEGER**, **REAL**, or **TEXT** with sensible edge-case rules. |
| **Safe SQL** | Only **reader-style** statements (e.g. `SELECT`, `WITH`, `VALUES`, `EXPLAIN QUERY PLAN` for readers). |
| **Exports** | Copy or download results as **CSV**, **TSV**, or **semicolon**-delimited text (client-side). |
| **Share query** | Encode query + encoding + export prefs in the **URL hash** (files are *not* shared). |
| **History** | Last **10** queries in **localStorage** (device-local only). |

---

## Architecture (server-side)

Quarry is **not** a WASM-in-browser SQLite demo. Each run sends files to a **Node.js** `POST /api/query` handler; the server parses with **PapaParse**, loads **better-sqlite3** **in-memory** SQLite, executes the query, returns JSON, then **discards** buffers and closes the database. **Nothing is written to disk** for uploads; **no cross-request persistence**.

**Requires:** Node.js **20+**, a host that runs **native Node** (e.g. Fly.io, Render, Railway, VPS). **Not** suited to **Cloudflare Pages**, **Vercel Edge**, **Netlify Edge**, or other **static / edge-only** deployments — **better-sqlite3** needs a normal Node runtime.

```text
Browser                    Node.js (per request)
────────                   ─────────────────────
Upload + SQL    ─POST──►   Rate limits → multipart stream → validation
                             → worker pool → in-memory SQLite → JSON
                             → DB closed, buffers released
```

---

## Quick start

```bash
git clone https://github.com/chayprabs/csv-tsv-sql-query-editor-playground.git
cd csv-tsv-sql-query-editor-playground
npm install
npm run dev
```

Open **http://localhost:3000**.

**Quality gate (matches CI):**

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
npx playwright install chromium   # first time only
npm run test:e2e
```

Copy **`env.example`** when overriding limits or enabling **Upstash Redis** for production rate limits.

---

## Tech stack

| Area | Technology |
| --- | --- |
| Framework | **Next.js 14** (App Router), **React 18**, **TypeScript** |
| SQL engine | **better-sqlite3** (SQLite in memory) |
| Parsing | **PapaParse** |
| Styling | **Tailwind CSS** |
| Rate limiting | **@upstash/ratelimit** + **@upstash/redis** (optional; in-memory fallback) |
| Tests | **Vitest**, **Playwright** |

---

## Supported uploads

| Input | Extensions | Notes |
| --- | --- | --- |
| CSV | `.csv` | Comma or overridden delimiter |
| TSV | `.tsv` | Tab or overridden delimiter |
| Plain text | `.txt` | Treated as delimited; delimiter auto-detected |

**Encodings (UI / `encoding` field):** `utf-8` (default), `latin1`, `utf-16le`.

Other extensions and disallowed MIME types are rejected. Content is **sniffed** for binary data; binary-looking uploads return a clear **400** even if the filename looks like CSV.

---

## API contract

**Endpoint:** `POST /api/query`  
**Runtime:** `nodejs` · **Caching:** responses include **`Cache-Control: no-store`**.

**Body:** `multipart/form-data`

| Field | Required | Description |
| --- | --- | --- |
| `files[]` | Yes | One or more files (legacy name `files` also accepted). |
| `query` | Yes | Non-empty SQL after trim (max **10,000** characters). |
| `encoding` | No | `utf-8` · `latin1` · `utf-16le` |
| `fileSettings` | No | JSON **array** — **one object per file**, each with `delimiter` (`auto` / `,` / `\t` / `;`) and `headerMode` (`auto` / `present` / `absent`). |
| `delimiter`, `headerMode`, `hasHeaders` | No | Legacy global fallbacks if `fileSettings` is omitted. |

**Success (200):** JSON with `columns`, `rows`, `rowCount`, `executionTimeMs`, `returnedRows`, `totalRows`, `truncated`, `warning` (when applicable).

**Errors:** JSON `{ "error": "…", "requestId": "…" }` with appropriate HTTP status (**400**, **408**, **413**, **429**, **499**, **500**, **503**, etc.).

---

## Limits & defaults

| Concern | Default | Config (see `env.example`) |
| --- | --- | --- |
| Per-file upload | **50 MB** | `MAX_UPLOAD_BYTES`, aliases |
| Total upload (all files) | **50 MB** | `MAX_TOTAL_UPLOAD_BYTES`, aliases |
| Max files | **20** | `MAX_FILE_COUNT` |
| Max result rows | **50,000** | `MAX_RESULT_ROWS` |
| JSON response budget | **~50 MB** | Engine-enforced |
| Query length | **10,000** characters | `MAX_QUERY_LENGTH`, `NEXT_PUBLIC_MAX_QUERY_LENGTH` |
| Query timeout | **30 s** | `QUERY_TIMEOUT_MS` |
| Memory guard | **80%** of **512 MB** heap budget | `MAX_HEAP_MB` |
| Requests / IP / minute | **10** | `RATE_LIMIT_REQUESTS_PER_MINUTE` |
| Upload bandwidth / IP / hour | **200 MB** | `RATE_LIMIT_BANDWIDTH_MB_PER_HOUR` |
| Concurrent / IP | **3** | `RATE_LIMIT_MAX_CONCURRENT_PER_IP` |
| Global concurrent | **20** | `RATE_LIMIT_MAX_CONCURRENT_GLOBAL` |

Production deployments with **multiple instances** should set **Upstash Redis** (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) so rate limits stay consistent.

---

## npm scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm run start` | Production build / server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (unit + integration) |
| `npm run test:e2e` | Playwright |
| `npm run test:load` | Load test entry |
| `npm run generate-fixtures` | Generate test fixtures |

---

## Privacy & data handling

- **Your files are never stored.** Each request builds an **in-memory** SQLite database and destroys it when the request ends.
- **Privacy policy:** [`/privacy`](app/privacy/page.tsx) (in-app route when running the app).
- **Terms:** [`/terms`](app/terms/page.tsx).
- **Credits / attribution:** [`/terms#open-source`](/terms#open-source) (`/credits` redirects there).

Server logs are described in the privacy page (metadata and truncated query preview for timeouts — **not** file contents or result rows).

---

## Security model (summary)

Eight **server-enforced** layers cover upload size, **per-IP and global** rate limits, strict **multipart** validation, **SQL execution timeout** (`db.interrupt()`), **result-size** caps, **memory guard**, **error sanitisation** (no paths/stacks to clients), and **HTTP security headers** (including **CSP** for pages and `default-src 'none'` on the API). See **`PROTECTION_SUMMARY.md`** for detail.

---

## FAQ

<details>
<summary><strong>Do my files stay in the browser only?</strong></summary>

No. Quarry is **server-side**: files are sent over **HTTPS** to your Node server, processed **in memory**, then discarded. The privacy promise is **“never stored”**, not **“never leaves your device.”** If you need WASM-only processing, that is an explicit **non-goal** for v1 (see PRD).
</details>

<details>
<summary><strong>Can I deploy this on Vercel or Cloudflare Pages?</strong></summary>

**Not** as a typical serverless/edge-only app. You need **Node 20+** with **native** `better-sqlite3`. Use a **container** or **VPS**-style host (Fly.io, Render, Railway, etc.).
</details>

<details>
<summary><strong>What SQL can I run?</strong></summary>

**Read-only** patterns only — e.g. **`SELECT`**, **`WITH` … `SELECT`**, **`VALUES`**, and **`EXPLAIN QUERY PLAN`** when tied to a reader statement. Mutating statements (`INSERT`, `UPDATE`, `ATTACH`, etc.) are **rejected**.
</details>

<details>
<summary><strong>Can I query Excel (.xlsx) files?</strong></summary>

**Not** in v1. Use CSV/TSV/TXT exports from Excel or another tool first.
</details>

<details>
<summary><strong>Do I need an account?</strong></summary>

**No.** There is no sign-up. Optional **share links** only encode **query text and UI settings** in the URL hash — **not** your files.
</details>

<details>
<summary><strong>Why Redis (Upstash)?</strong></summary>

For **production** and **horizontal scale**, Redis backs **sliding-window** rate limits and bandwidth accounting **across instances**. Without Redis, an **in-memory** limiter is used (fine for **single-instance** dev or small deployments).
</details>

<details>
<summary><strong>What happens if my query or result is too large?</strong></summary>

Long queries hit a **character cap**. Long-running queries hit a **timeout** (**408**). Huge results are **truncated** by row count and by an approximate **JSON size** cap; the API still returns **200** with `truncated: true` and a **warning** when applicable.
</details>

<details>
<summary><strong>Is this the same as Pluck or a WASM SQLite tool?</strong></summary>

**No.** Quarry intentionally uses **server-side** SQLite for v1. The PRD contrasts this with WASM/client-side approaches.
</details>

<details>
<summary><strong>How do table names work?</strong></summary>

Safe SQLite identifiers are derived from **filenames** (normalized, deduplicated). The UI shows the derived name next to each upload so you can `SELECT` / `JOIN` confidently.
</details>

<details>
<summary><strong>Where are tests and fixtures?</strong></summary>

**Vitest** tests live under `tests/` and `lib/**/__tests__`. **Playwright** specs live under `tests/e2e/`. Large generated fixtures are created at test time (see `scripts/generate-fixtures.ts`); only **small** static fixtures belong in **`test-fixtures/`**.
</details>

---

## Suggested GitHub repository topics

Paste these into **Repository → About → Topics** for discoverability:

`csv` `tsv` `txt` `sql` `sqlite` `sqlite3` `better-sqlite3` `flatfile` `data-analysis` `analytics` `business-intelligence` `nextjs` `nextjs14` `app-router` `typescript` `react` `tailwindcss` `papaparse` `server-side` `nodejs` `privacy` `open-source` `sql-query-builder` `csv-to-sql` `join-csv` `etl` `developer-tools` `quarry`

---

## Deployment

Quarry needs **Node.js 20+** with native **`better-sqlite3`** (not edge-only hosting). Use a **container** or **VPS**-style platform (Fly.io, Render, Railway, etc.).

### Docker

```bash
docker build -t quarry .
docker run --rm -p 3000:3000 \
  -e FLATFILE_INLINE_QUERY_WORKER=1 \
  quarry
```

The image sets `FLATFILE_INLINE_QUERY_WORKER=1` by default so queries run on the main thread (reliable in minimal containers). Health check: `GET /api/health` → `{ "status": "ok" }`.

### Manual production

```bash
npm ci
npm run build
FLATFILE_INLINE_QUERY_WORKER=1 npm run start
```

Copy **`env.example`** to `.env` and set at least:

- **`UPSTASH_REDIS_REST_URL`** + **`UPSTASH_REDIS_REST_TOKEN`** when running **more than one instance** (shared rate limits).
- Optional limit overrides (`MAX_UPLOAD_BYTES`, `RATE_LIMIT_*`, etc.).

Smoke after deploy:

```bash
curl -sS http://localhost:3000/api/health
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```


---

## License

**MIT** — see [`LICENSE`](LICENSE).  
© 2026 **Chaitanya Prabuddha**
