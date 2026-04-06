# Abuse Audit

Date: 2026-04-06

## Scope

Reviewed the authored codebase before any security changes, including:

- `app/api/query/route.ts`
- `lib/*.ts`
- existing tests under `app/api/query/__tests__`, `lib/__tests__`, and `tests/edge-cases`
- config files including `package.json`, `next.config.mjs`, `tsconfig.json`, and `vitest.config.ts`

## Current `/api/query` Request Path

1. The route calls `request.formData()` immediately.
2. That parses the full multipart body before most validation runs.
3. The route trims `query`, collects uploaded files, and validates:
   - at least one file exists
   - query is non-empty
   - file count does not exceed `maxFilesPerRequest`
   - each file size does not exceed `maxUploadBytes`
   - total file sizes do not exceed `maxTotalUploadBytes`
   - extension and MIME type look like CSV/TSV/TXT text files
   - zero-byte files are rejected
   - `fileSettings` JSON shape is valid
4. Every accepted `File` is fully buffered with `await file.arrayBuffer()`.
5. The request is executed in a worker thread pool via `runQueryInWorkerPool(...)`.
6. The worker creates a fresh in-memory SQLite database, loads all files, runs the SQL query, and closes the database in `finally`.

## Protection That Already Exists

### Validation and isolation

- The route is limited to `POST /api/query`.
- The route runs on the Node.js runtime and is marked dynamic.
- Missing files return `400`.
- Empty queries return `400`.
- There is an existing file-count limit from runtime config.
- There is an existing per-file upload size limit from runtime config.
- There is an existing aggregate upload-size limit from runtime config.
- Unsupported extensions and obvious non-text MIME types are rejected.
- Zero-byte files are rejected.
- A binary-sniffing heuristic rejects some disguised binary payloads after buffering.
- File-specific delimiter and header settings are shape-validated.
- Table names are sanitized and deduplicated before table creation.
- Each request gets a fresh in-memory SQLite database and the DB is closed in `finally`.

### Query controls

- Only reader-style SQL is allowed (`SELECT`, `WITH`, `VALUES`, and `EXPLAIN QUERY PLAN ...`).
- Non-reader statements are rejected.
- Result rows are capped with a warning.
- Query execution already runs inside a worker-thread pool.
- There is an outer worker-pool timeout and abort path.

### Response behavior

- API responses already set `Cache-Control: no-store, max-age=0`.
- Structured JSON error responses are returned.

## What Is Missing or Insufficient

### Layer 1: Request-size hard stop

- There is no raw HTTP `Content-Length` check before parsing.
- The route calls `request.formData()` first, so oversized requests are still parsed and buffered before rejection.
- There is no streaming multipart byte counter that aborts once the body crosses the configured limit.
- There is no protection against a spoofed low `Content-Length` with a larger actual body.
- `next.config.mjs` does not define any API-specific response/body handling settings.

### Layer 2: Abuse rate limiting

- No per-IP request rate limit exists.
- No per-IP hourly upload-bandwidth accounting exists.
- No per-IP concurrent in-flight limit exists.
- No global concurrent in-flight limit exists.
- No Redis-backed limiter exists.
- No local in-memory fallback limiter exists.
- There is no trusted IP extraction helper for proxy/CDN deployments.

### Layer 3: Request validation gaps

- `Content-Type` is not validated before parsing.
- The route currently accepts `.txt`; the requested hardened policy is CSV/TSV only.
- There is no filename length limit.
- There is no validation for whitespace-only or dot-only filenames.
- There is no minimum useful file-size rule beyond literal zero bytes.
- There is no query length cap.
- There is no explicit whitespace-only query rejection beyond `trim()`.

### Layer 4: SQLite timeout handling

- The existing timeout is enforced by terminating/replacing the worker, not by interrupting SQLite itself.
- There is no `db.interrupt()`-based timeout around query execution.
- Timeout logging with timestamp and truncated query text does not exist.
- The current timeout response is `408 Query execution timed out`, not the requested sanitized wording.

### Layer 5: Result-size caps

- Current truncation only caps by row count.
- The response does not include `truncated`, `totalRows`, and `returnedRows`.
- `rowCount` currently reports only returned rows, not actual total rows.
- There is no estimated JSON response-size cap to prevent huge payloads.

### Layer 6: Memory guard

- There is no heap-pressure guard before loading files into SQLite.
- Large request buffers, decoded strings, parsed rows, and SQLite inserts can coexist in memory.
- Large variables are not explicitly nulled after request completion.

### Layer 7: Error sanitization

- Client errors do not include a request ID.
- Internal errors are not logged with a request ID.
- There is no centralized sanitizer for internal errors.
- Validation errors are structured, but internal errors are not normalized around a single safe format.
- The existing SQL sanitization layer rewrites many SQLite errors into friendlier text, but it is not built around the requested path stripping and generic fallback rules.

### Layer 8: Security headers

- There is no `middleware.ts`.
- There is no global API security-header policy.
- Error responses rely only on route-level headers and do not currently include the requested browser hardening headers.

## Dependencies and Framework Baseline

- Next.js: `14.2.35` installed
- React: `18.3.1`
- SQLite engine: `better-sqlite3@12.8.0`
- Parser: `papaparse@5.5.3`
- Load-testing tool already present: `autocannon@8.0.0`
- Current route style: App Router route handler at `app/api/query/route.ts`
- Current middleware setup: none

## Important Framework Note

This app uses App Router route handlers, not `pages/api`. In this codebase, the real protection gap is not a pages-router body parser toggle; it is that the route currently uses `request.formData()` and therefore buffers the multipart request before enforcement. The fix needs to happen in the route itself via raw-stream multipart parsing and early header checks.
