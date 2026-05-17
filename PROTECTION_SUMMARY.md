# Protection Summary

Date: 2026-04-06

## Implemented Layers

### Layer 1: Request size hard limit

- Early `Content-Length` rejection before parsing in `app/api/query/route.ts`
- Streaming multipart byte counting and mid-stream abort in `lib/multipartRequest.ts`
- Default limit: `MAX_UPLOAD_BYTES=52428800` (`50MB`)
- Optional alias: `NEXT_PUBLIC_MAX_UPLOAD_BYTES`
- User-facing response: `413 Upload too large. Maximum total upload size is 50MB.`

Note:

- This app uses Next.js App Router route handlers. The old `pages/api` `bodyParser` and `responseLimit` settings are not applied to this endpoint, so the protection is enforced directly in the route and multipart stream parser instead.

### Layer 2: Per-IP and global rate limiting

- Implemented in `lib/ratelimit.ts`
- Upstash Redis is used when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured
- Automatic in-memory fallback is used for local development and unconfigured environments
- Client IP extraction validates `X-Forwarded-For`, then `X-Real-IP`, then connection address, then falls back to `unknown`

Default limits:

- `RATE_LIMIT_REQUESTS_PER_MINUTE=10`
- `RATE_LIMIT_BANDWIDTH_MB_PER_HOUR=200`
- `RATE_LIMIT_MAX_CONCURRENT_PER_IP=3`
- `RATE_LIMIT_MAX_CONCURRENT_GLOBAL=20`

User-facing responses:

- `429 Too many requests. Try again in {N} seconds.`
- `429 Upload limit reached. Resets in {N} minutes.`
- `429 Too many concurrent requests from your IP.`
- `503 Server is busy. Try again in a moment.`

### Layer 3: Input validation

- Enforced in `app/api/query/route.ts` and `lib/multipartRequest.ts`
- Requires `multipart/form-data`
- Requires at least one file
- Limits uploads to `MAX_FILE_COUNT=20`
- Requires `.csv`, `.tsv`, or `.txt` filenames; MIME allowlist and binary sniffing
- Rejects blank, dot-only, or oversized filenames
- Enforces per-file minimum size of 2 bytes
- Requires a non-empty trimmed query
- Enforces query length cap of 10,000 characters

User-facing responses include:

- `400 Request must use multipart/form-data.`
- `400 At least one CSV or TSV file is required.`
- `400 Too many files uploaded. Maximum is 20.`
- `400 Only CSV, TSV, and TXT text files are supported.`
- `400 Only text-based CSV, TSV, and TXT files are supported.` (binary sniff)
- `400 File {name} is empty.`
- `400 Query is required.`
- `400 Query too long. Maximum 10,000 characters.`

### Layer 4: SQL timeout

- Implemented in `lib/queryTimeout.ts` and `lib/queryEngine.ts`
- Uses `better-sqlite3` interruption with `db.interrupt()`
- Default timeout: `QUERY_TIMEOUT_MS=30000`
- Timeout events are logged with timestamp and a query preview truncated to 200 characters
- Databases are closed in `finally` paths, including timeout cases

User-facing response:

- `408 Query timed out after 30 seconds. Simplify your query.`

### Layer 5: Result-size caps

- Implemented in `lib/queryEngine.ts`
- Row-count truncation default: `MAX_RESULT_ROWS=50000`
- JSON response-size estimation caps responses to roughly `50MB`
- Responses include `truncated`, `totalRows`, `returnedRows`, and `warning` when caps are hit

User-facing response behavior:

- Successful response still returns `200`
- Result metadata warns when rows were truncated or when the response was capped to stay under the 50MB response budget

### Layer 6: Memory guard

- Implemented in `lib/memoryGuard.ts`, enforced in the route and query engine
- Default heap baseline: `MAX_HEAP_MB=512`
- Requests are rejected when heap usage exceeds 80% of the configured limit
- Large buffers are explicitly nulled or zeroed after use
- SQLite databases are always closed in `finally`

User-facing response:

- `503 Server is under memory pressure. Try again shortly.`

### Layer 7: Error sanitization

- Implemented in `lib/errorSanitizer.ts`
- Every error response includes a short `requestId`
- Stack traces, filesystem paths, and Node internals are stripped from client responses
- User-relevant SQLite errors are preserved in sanitized form
- Unknown internal failures fall back to a generic safe message
- Full internal errors are logged server-side with the same `requestId`

User-facing response shape:

```json
{
  "error": "Human readable message safe for client",
  "requestId": "abc-123",
  "truncated": true,
  "warning": "Results truncated to 50,000 rows."
}
```

Representative user-facing messages:

- SQLite table not found: `The query referenced a table that was not loaded.`
- Parse failure: `Could not parse the uploaded file.` or a safe parsing message depending on failure type
- Unknown internal error: `The query could not be completed.`

### Layer 8: HTTP security headers

- Implemented in `middleware.ts` and reused by route handlers through `lib/securityHeaders.ts`
- Added headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=()`
- API-specific headers:
  - `Cache-Control: no-store, max-age=0`
  - `Content-Security-Policy: default-src 'none'`
- HTML/document responses (via `middleware.ts`):
  - Same baseline headers as above
  - `Content-Security-Policy` matches PRD §13 page policy (`default-src 'self'`, `script-src` / `style-src` with `'unsafe-inline'`, plus `img-src`, `font-src`, `connect-src`, `object-src`, `base-uri`, `frame-ancestors`, `form-action`). In `development` only, `script-src` also allows `'unsafe-eval'` for Next.js HMR.

## Environment Variables

Defined in `env.example`:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `MAX_UPLOAD_BYTES`
- `NEXT_PUBLIC_MAX_UPLOAD_BYTES`
- `MAX_FILE_COUNT`
- `MAX_RESULT_ROWS`
- `QUERY_TIMEOUT_MS`
- `MAX_HEAP_MB`
- `RATE_LIMIT_REQUESTS_PER_MINUTE`
- `RATE_LIMIT_BANDWIDTH_MB_PER_HOUR`
- `RATE_LIMIT_MAX_CONCURRENT_PER_IP`
- `RATE_LIMIT_MAX_CONCURRENT_GLOBAL`

## Final Verification

Completed successfully:

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run build`
- `npx ts-node tests/load-test.ts`

Production smoke checks:

- Oversized upload to `POST /api/query` returned `413`
- Eleven rapid requests from the same IP returned `200` for the first ten and `429` for the eleventh
- `curl -I http://127.0.0.1:3000/api/query` returned the expected security headers

## Load Test Summary

Fresh production-mode load test results are recorded in `LOAD_TEST_RESULTS.md` and `artifacts/load-test-results.json`.

Highlights:

- Scenario 1 normal load: p99 `813ms`, `625 x 200`
- Scenario 2 same-IP storm: first `10 x 200`, then `1559 x 429`
- Scenario 3 large uploads: `3 x 200`, peak RSS `960.31MB`
- Scenario 4 slow-query attack: `5 x 408`, legitimate traffic still served in `1975ms`
