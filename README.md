# Flatfile SQL Studio

Flatfile SQL Studio is a browser-based workspace for querying uploaded delimited files with SQLite. Upload CSV or TSV files, inspect the inferred schema, run SQL, and export the results without creating a persistent database.

## What it does

- Loads each uploaded file into a fresh in-memory SQLite database
- Auto-detects delimiters and header rows, with manual overrides
- Supports joins across multiple uploaded files
- Returns structured query results, row counts, timing, warnings, and validation errors
- Exports results as CSV, TSV, or semicolon-delimited text

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Verification commands:

```bash
npm test
npx tsc --noEmit
npm run build
```

## Configuration

Copy `env.example` to your local environment file and override only what you need. When a variable is not set, the server falls back to the secure default listed below.

| Variable | Default | What it controls |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | unset | Enables Redis-backed rate limiting in production. When unset, the app uses an in-memory fallback that works locally but does not share limits across instances. |
| `UPSTASH_REDIS_REST_TOKEN` | unset | Credentials for the Upstash Redis backend. |
| `MAX_UPLOAD_BYTES` | `52428800` | Hard cap for the full multipart request body. Requests above this are rejected with `413 Upload too large`. |
| `NEXT_PUBLIC_MAX_UPLOAD_BYTES` | `52428800` alias | Optional alias the server honors when `MAX_UPLOAD_BYTES` is unset. Useful when the UI needs to display the same limit. |
| `MAX_FILE_COUNT` | `20` | Maximum number of uploaded files per request. Extra files are rejected with `400 Too many files uploaded`. |
| `MAX_RESULT_ROWS` | `50000` | Maximum rows returned before results are truncated and annotated with `truncated: true` and a warning. |
| `QUERY_TIMEOUT_MS` | `30000` | Maximum query execution time before the request returns `408 Query timed out...`. |
| `MAX_HEAP_MB` | `512` | Memory-pressure threshold source. When Node heap usage exceeds 80% of this value, the API returns `503 Server is under memory pressure`. |
| `RATE_LIMIT_REQUESTS_PER_MINUTE` | `10` | Sliding-window request limit per IP. Exceeding it returns `429 Too many requests`. |
| `RATE_LIMIT_BANDWIDTH_MB_PER_HOUR` | `200` | Total uploaded bytes allowed per IP per hour. Exceeding it returns `429 Upload limit reached`. |
| `RATE_LIMIT_MAX_CONCURRENT_PER_IP` | `3` | Maximum in-flight requests per IP. Exceeding it returns `429 Too many concurrent requests from your IP`. |
| `RATE_LIMIT_MAX_CONCURRENT_GLOBAL` | `20` | Maximum in-flight requests across all users. Exceeding it returns `503 Server is busy`. |

Recommended production values:

- Keep `MAX_UPLOAD_BYTES` at `50MB` unless you have profiled larger workloads.
- Keep `QUERY_TIMEOUT_MS` at `30000` or lower for public deployments.
- Configure Upstash Redis for any multi-instance or horizontally scaled deployment.
- Leave the concurrency limits in place even when Redis is enabled. They protect CPU-bound execution, not just request volume.

## How to use it

1. Upload one or more `.csv` or `.tsv` files.
2. Review the inferred table names, delimiter handling, and header behavior.
3. Write a SQLite query in the editor.
4. Run the query and inspect the results table.
5. Copy or download the result set when needed.

## API contract

### Endpoint

`POST /api/query`

### Request

Send `multipart/form-data` with:

- `files[]`: one or more uploaded files
- `query`: SQLite query string
- `delimiter`: `auto`, `,`, `\t`, or `;`
- `hasHeaders`: `true` or `false`
- `encoding`: `utf-8`, `latin1`, or `utf-16le`

### Success response

```json
{
  "columns": ["subject", "score"],
  "rows": [
    {
      "subject": "math",
      "score": 88
    }
  ],
  "rowCount": 1,
  "executionTimeMs": 12,
  "returnedRows": 1,
  "totalRows": 1,
  "truncated": false
}
```

### Error response

```json
{
  "error": "Upload too large. Maximum total upload size is 50MB.",
  "requestId": "abc12345-def6"
}
```

Validation failures return `400`, request and body size violations return `413`, rate limiting returns `429`, timeout responses return `408`, memory pressure returns `503`, and unexpected internal failures return `500`.

## Tech stack

- Next.js App Router
- React and TypeScript
- `better-sqlite3`
- `papaparse`
- Tailwind CSS
- Vitest and Testing Library
"# csv-tsv-sql-query-editor-playground" 
