# System Map

## Scope

This map reflects the authored application code in this repository as of 2026-05-29. Generated artifacts such as `node_modules`, `.next`, and `coverage` were excluded from behavioral mapping.

## Product Summary

Flatfile SQL Studio is a Next.js App Router application that lets users upload one or more delimited text files, preview inferred schemas, run read-only SQLite queries against an in-memory database, inspect results, and export results as CSV, TSV, or semicolon-delimited text.

## High-Level Architecture

- Client entrypoint: [`app/page.tsx`](app/page.tsx)
- API route: [`app/api/query/route.ts`](app/api/query/route.ts)
- UI components:
  - [`components/FileUploader.tsx`](components/FileUploader.tsx)
  - [`components/QueryEditor.tsx`](components/QueryEditor.tsx)
  - [`components/ResultsTable.tsx`](components/ResultsTable.tsx)
  - [`components/ErrorDisplay.tsx`](components/ErrorDisplay.tsx)
- Server-side data pipeline:
  - [`lib/textEncoding.ts`](lib/textEncoding.ts)
  - [`lib/delimiterDetection.ts`](lib/delimiterDetection.ts)
  - [`lib/headerDetection.ts`](lib/headerDetection.ts)
  - [`lib/delimitedData.ts`](lib/delimitedData.ts)
  - [`lib/typeInference.ts`](lib/typeInference.ts)
  - [`lib/tableNaming.ts`](lib/tableNaming.ts)
  - [`lib/queryEngine.ts`](lib/queryEngine.ts)
  - [`lib/csvToSqlite.ts`](lib/csvToSqlite.ts)
  - [`lib/queryWorker.ts`](lib/queryWorker.ts)
  - [`lib/queryWorkerPool.ts`](lib/queryWorkerPool.ts)
- Client-only state helpers:
  - [`lib/queryHistory.ts`](lib/queryHistory.ts)
  - [`lib/shareState.ts`](lib/shareState.ts)
  - [`lib/csvExport.ts`](lib/csvExport.ts)

## User-Facing Interaction Points

### Primary page

The main page is rendered by [`app/page.tsx`](app/page.tsx) and contains three functional areas.

### Upload area

Implemented by [`components/FileUploader.tsx`](components/FileUploader.tsx).

- Hidden `<input type="file">`
  - `multiple`
  - `accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"`
- Click target label styled as “Choose Files”
- “Clear Files” button shown when at least one file is loaded
- Per-file controls after selection:
  - Delimiter dropdown
    - `auto`
    - `,`
    - `/t`
    - `;`
  - Header row dropdown
    - `auto`
    - `present`
    - `absent`
- Per-file preview output
  - Original filename
  - Derived SQLite table name
  - File size
  - Effective delimiter
  - Suggested delimiter
  - Effective header detection
  - Suggested header detection
  - Schema preview chips
  - Parse error banner per file if preview parsing fails
- Cross-file warning banner
  - Displayed when files still using `auto` disagree on header detection

### Query area

Implemented by [`components/QueryEditor.tsx`](components/QueryEditor.tsx).

- Input encoding dropdown
  - `utf-8`
  - `latin1`
  - `utf-16le`
- SQL textarea
- Recent query buttons sourced from localStorage-backed history
- “Copy Share Link” button
- “Run Query” submit button
- Keyboard shortcut
  - `Ctrl+Enter` or `Cmd+Enter` submits when the form is submittable

### Result area

Implemented by [`components/ResultsTable.tsx`](components/ResultsTable.tsx).

- Execution summary
  - returned row count
  - execution time in ms
- Optional truncation warning banner
- Export controls when there are rows and columns
  - output delimiter dropdown
    - CSV
    - TSV
    - Semicolon
  - “Include Header” checkbox
  - “Copy Results” button
  - “Download CSV” button
- Result states
  - no result yet: placeholder panel from `app/page.tsx`
  - query succeeded with zero columns: “The query completed without any result columns.”
  - query succeeded with columns but zero rows: “No results.”
  - query succeeded with rows: HTML table
- Pagination
  - enabled only when `rows.length > 1000`
  - page size fixed at 25 rows
  - Previous and Next buttons

### Error and notice surfaces

- Query/server/client errors render through [`components/ErrorDisplay.tsx`](components/ErrorDisplay.tsx)
- Success notices rendered in `app/page.tsx`
  - “Results copied to the clipboard.”
  - “Share link copied to the clipboard.”

## Browser State Model

Managed in [`app/page.tsx`](app/page.tsx).

- `uploadedFiles`
  - `File`
  - derived `tableName`
  - per-file `delimiter`
  - per-file `headerMode`
- `filePreviews`
  - inferred schema and preview metadata
- `query`
- `inputEncoding`
- `outputDelimiter`
- `includeOutputHeader`
- `isLoading`
- `errorMessage`
- `noticeMessage`
- `result`
- `headerNotice`
- `queryHistory`
- `inputResetKey`
- `hasLoadedShareState`
- decoded file cache keyed by `name:size:lastModified:encoding`

## API Surface

### `POST /api/query`

Implemented by [`app/api/query/route.ts`](app/api/query/route.ts).

#### Runtime behavior

- `runtime = "nodejs"`
- `dynamic = "force-dynamic"`
- response header always includes `Cache-Control: no-store, max-age=0`

#### Expected request format

`multipart/form-data`

Accepted fields:

- `files[]`
- legacy alias `files`
- `query`
- `encoding`
- `fileSettings`
- legacy fallback fields:
  - `delimiter`
  - `headerMode`
  - `hasHeaders`

#### Request validation path

1. Parse `request.formData()`
2. Collect files from `files[]` and `files`
3. Trim query text
4. Load runtime limits from [`lib/runtimeConfig.ts`](lib/runtimeConfig.ts)
5. Validate:
   - at least one file
   - non-empty query
   - file count <= `maxFilesPerRequest`
   - each file size <= `maxUploadBytes`
   - combined upload size <= `maxTotalUploadBytes`
   - extension and MIME type are supported
   - no zero-byte files
   - file settings payload is valid if provided
6. Buffer every file into memory with `await file.arrayBuffer()`
7. Reject likely-binary uploads using content sniffing
8. Dispatch query work to the worker pool

#### Supported file extensions

- `.csv`
- `.tsv`
- `.txt`

#### Supported content types

- empty MIME type
- any `text/*`
- `application/csv`
- `application/vnd.ms-excel`

#### Supported encodings

- `utf-8`
- `latin1`
- `utf-16le`

Unsupported encoding input falls back to `utf-8`.

#### Success response shape

```json
{
  "columns": ["..."],
  "rows": [{ "...": "..." }],
  "rowCount": 1,
  "executionTimeMs": 12,
  "warning": "optional",
  "error": "optional on logical failure"
}
```

#### Status codes and failure modes

- `200`
  - query completed and `payload.error` is absent
- `400`
  - no files
  - missing query
  - unsupported upload type
  - empty file
  - malformed `fileSettings`
  - logical query failure returned by `csvToSqlite`
- `408`
  - worker query timeout
- `413`
  - too many files
  - per-file size limit exceeded
  - total upload size limit exceeded
- `499`
  - request aborted while work was queued or running
- `500`
  - unexpected uncaught server error

### API error messaging

Top-level route messages are intentionally human-readable:

- `No files uploaded`
- `Query is required`
- `Too many files uploaded. Maximum is N.`
- `File too large`
- `Total upload size is too large`
- `Only CSV, TSV, and TXT text files are supported`
- `File is empty`
- `Invalid file settings payload`
- `File settings did not match the uploaded file count`
- `Only text-based CSV, TSV, and TXT files are supported`
- `Query execution timed out`
- `The request was cancelled before the query completed.`
- `Unexpected server error while processing the query.`

## End-to-End Data Flow

### 1. File bytes to decoded text

- Browser `File` objects are selected in [`components/FileUploader.tsx`](components/FileUploader.tsx)
- For preview, `app/page.tsx` reads bytes with `file.arrayBuffer()`
- [`lib/textEncoding.ts`](lib/textEncoding.ts)
  - detects BOM
  - strips BOM bytes
  - decodes with `TextDecoder`
  - strips U+FEFF if still present

### 2. Decoded text to parsed delimited rows

- [`lib/delimiterDetection.ts`](lib/delimiterDetection.ts)
  - guesses delimiter from `,`, `/t`, `;`
- [`lib/headerDetection.ts`](lib/headerDetection.ts)
  - uses preview heuristics to infer whether the first row is a header
- [`lib/delimitedData.ts`](lib/delimitedData.ts)
  - parses rows with PapaParse
  - drops parser-blocking errors except delimiter auto-detect noise
  - removes empty/whitespace-only single-cell rows
  - preserves delimiter-only empty records like `,,`
  - determines max column count
  - pads short rows
  - fills missing header names with `cN`
  - de-duplicates duplicate headers with `_2`, `_3`, and so on

### 3. Parsed rows to inferred schema

- [`lib/typeInference.ts`](lib/typeInference.ts)
  - column types are inferred as `INTEGER`, `REAL`, or `TEXT`
  - heuristics keep certain digit-only columns as `TEXT`
    - leading-zero values
    - fixed-width identifiers length >= 7
    - compact `YYYYMMDD`-shaped values

### 4. Schema to SQLite tables

- [`lib/tableNaming.ts`](lib/tableNaming.ts)
  - derives safe table names from filenames
  - strips path segments and extensions
  - lowercases
  - replaces non-alphanumeric characters with `_`
  - prefixes reserved words and digit-leading names with `t_`
  - de-duplicates collisions with `_1`, `_2`, and so on
- [`lib/queryEngine.ts`](lib/queryEngine.ts)
  - creates in-memory SQLite DB
  - sets PRAGMAs:
    - `journal_mode = OFF`
    - `synchronous = OFF`
    - `temp_store = MEMORY`
    - `cache_size = -64000`
  - creates tables with quoted identifiers
  - inserts rows inside a transaction
  - coerces empty cells to `NULL`
  - coerces `INTEGER` and `REAL` values to numbers

### 5. SQLite tables to executed query

- Query enters through `app/page.tsx`
- Sent to API in `multipart/form-data`
- API dispatches to [`lib/queryWorkerPool.ts`](lib/queryWorkerPool.ts)
- Worker executes [`lib/csvToSqlite.ts`](lib/csvToSqlite.ts)
- [`lib/queryEngine.ts`](lib/queryEngine.ts)
  - normalizes trailing semicolons
  - permits only reader-style queries:
    - `SELECT`
    - `WITH`
    - `VALUES`
    - `EXPLAIN QUERY PLAN` followed by reader query
  - rejects non-reader statements
  - iterates result rows
  - truncates beyond configured row limit

### 6. Executed query to API response

- [`lib/csvToSqlite.ts`](lib/csvToSqlite.ts)
  - measures execution time
  - sanitizes many downstream errors into user-facing messages
  - always returns a structured response object

### 7. API response to rendered table

- `app/page.tsx`
  - checks `response.ok` and `payload.error`
  - sets result state or error state
- [`components/ResultsTable.tsx`](components/ResultsTable.tsx)
  - formats `null` or `undefined` as `NULL`
  - stringifies object values with `JSON.stringify`
  - paginates client-side if over 1000 rows

### 8. Rendered table to downloaded CSV/TSV

- `app/page.tsx` creates a Blob from [`lib/csvExport.ts`](lib/csvExport.ts)
- [`lib/csvExport.ts`](lib/csvExport.ts)
  - stringifies cells
  - quotes cells when needed for delimiter, quotes, tabs, or newlines
  - supports optional header row
  - joins with `/r/n`
- Browser download metadata
  - filename depends on output delimiter
  - MIME type is `text/csv` or `text/tab-separated-values`

## User Input Touchpoints and Trust Boundaries

### Direct user inputs

- uploaded filenames
- uploaded file bytes and text content
- per-file delimiter setting
- per-file header setting
- input encoding selector
- SQL query text
- output delimiter selector
- include-header checkbox
- recent query selection
- URL hash share state
- localStorage query history

### Where untrusted input reaches code

- filenames influence:
  - table names
  - preview display
  - parser source labels
- file bytes influence:
  - decoder choice
  - delimiter detection
  - header detection
  - schema inference
  - SQLite row values
- query text influences:
  - SQLite statement preparation and iteration
- URL hash influences:
  - query text
  - input encoding
  - output delimiter
  - includeHeader setting
- localStorage influences:
  - recent query chips

### Hardening already present

- table names are sanitized and deduplicated
- SQL table and column identifiers are quoted when created
- mutating SQL statements are blocked
- per-request DB is ephemeral and in-memory
- file count and size limits exist
- likely-binary uploads are rejected
- worker pool isolates and times out query execution
- errors are mostly sanitized before reaching UI

## Error Surface Inventory

### Client-side preview errors

Possible from `app/page.tsx` preview preparation:

- file decode failure
- parsing failure for preview
- any thrown client read error

Preview behavior:

- individual preview cards can carry `parseError`
- catastrophic failure in the preview effect clears all previews and sets global error

### Submission-time client errors

- no files uploaded
- empty query
- fetch failure
- unexpected client exception
- clipboard copy failure

### API parsing and validation errors

- malformed multipart payload
- invalid `fileSettings`
- mismatched `fileSettings` count
- too many files
- unsupported extension or MIME
- binary masquerading as text
- empty file
- oversize file
- oversize total upload

### Query execution errors

Sanitized in [`lib/csvToSqlite.ts`](lib/csvToSqlite.ts):

- parser failures
- parsed-empty file
- no files
- missing query
- non-reader SQL
- missing table
- missing column
- SQL syntax errors
- ambiguous column errors
- misuse of aggregate
- UNION shape mismatch
- fallback generic message

### Worker lifecycle errors

- worker bootstrap invalid
- worker exits unexpectedly
- worker throws
- request abort before start
- request abort mid-run
- query timeout

## External Dependencies and Failure Implications

### `next`

- powers routing, dev server, build, and App Router runtime
- failure impact:
  - app does not boot
  - API route unavailable
  - page render fails

### `react` / `react-dom`

- power the client UI
- failure impact:
  - page interactivity breaks
  - state handling and rendering fail

### `better-sqlite3`

- powers in-memory SQL engine
- only used on server/worker side
- failure impact:
  - uploads cannot be materialized into tables
  - queries cannot execute
  - build/runtime can fail if bundled incorrectly

### `papaparse`

- powers delimiter-aware CSV parsing and delimiter inference preview
- failure impact:
  - preview parsing fails
  - imports fail
  - delimiter/header heuristics degrade

### `tsx`

- used for worker bootstrap via `--import tsx` and benchmark execution
- failure impact:
  - worker threads may not start correctly in dev/test
  - benchmark scripts fail

### Browser platform APIs

- `File`, `FormData`, `Blob`, `URL.createObjectURL`
- `navigator.clipboard`
- `localStorage`
- failure impact:
  - uploads, export, clipboard copy, or query history may partially fail

## Current Limits and Configuration

Defined in [`lib/runtimeConfig.ts`](lib/runtimeConfig.ts).

- max files per request: 20
- max result rows: 50,000
- max total upload bytes: 100 MB
- max single upload bytes: 50 MB
- query timeout: 30,000 ms
- adaptive index max columns: 1
- adaptive index row threshold: 75,000

Environment variable overrides:

- `FLATFILE_SQL_STUDIO_AUTO_INDEX_MAX_COLUMNS`
- `FLATFILE_SQL_STUDIO_AUTO_INDEX_ROW_THRESHOLD`
- `FLATFILE_SQL_STUDIO_MAX_FILES_PER_REQUEST`
- `FLATFILE_SQL_STUDIO_MAX_RESULT_ROWS`
- `FLATFILE_SQL_STUDIO_MAX_TOTAL_UPLOAD_BYTES`
- `FLATFILE_SQL_STUDIO_MAX_UPLOAD_BYTES`
- `FLATFILE_SQL_STUDIO_QUERY_TIMEOUT_MS`

## Current Result Rendering and Export Behavior

- `rowCount` equals the number of rows returned to the client after truncation, not the total rows the SQL statement might have produced
- warnings are used to signal truncation
- large result tables are paginated on the client only after the rows have already been delivered
- exports are generated entirely client-side from the currently loaded result data

## Security-Relevant Observations

- SQL is intentionally user-authored, but limited to reader-style statements
- DB lifetime is per request and in-memory only
- filesystem access is not exposed to SQL
- filenames are sanitized before becoming table names
- binary disguised uploads are sniffed and rejected
- raw parser/database errors are partially normalized into safer UI messages
- request abort and timeout handling exist through the worker pool boundary

## Observability Gaps

- no explicit server logging around parse/query failures
- no telemetry for worker timeouts, aborts, or queue depth
- no user-visible display of upload limits
- no explicit total row count beyond truncated visible count

## Existing Automated Coverage Map

- lib unit tests in `lib/__tests__`
- API route tests in `app/api/query/__tests__`
- UI component tests in `components/__tests__`
- additional edge-case tests in `tests/edge-cases`
- benchmark scripts in `benchmarks/`

Missing from the current authored repo before this QA pass:

- requested Playwright end-to-end suite structure
- requested `scripts/generate-fixtures.ts`
- requested `tests/api`, `tests/unit`, and `tests/performance` layout
- requested final reporting artifacts:
  - `FIXTURES.md`
  - `FIXES.md`
  - `REMAINING_ISSUES.md`
  - `FINAL_REPORT.md`

## Phase 1 Exit Notes

The current implementation already includes several hardening improvements beyond the bare product description:

- per-file parse settings
- worker-thread query execution
- runtime limits
- adaptive indexing
- client-side result pagination
- share-link and recent-query state

The requested QA effort should therefore focus on:

- validating the full behavior through browser, API, unit, and performance coverage
- finding gaps between current behavior and the requested guarantees
- fixing defects and writing the missing audit artifacts and automation
