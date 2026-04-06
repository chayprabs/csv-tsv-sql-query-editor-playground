# EDGE_CASES

This matrix is derived from the current codebase in `q-web/` as of 2026-04-06. "Likely current behavior" is based on direct code inspection plus the commands run during the audit.

## Input Data: Encoding, Delimiters, Quoting, and Row Shapes

| ID | Category | Description | Expected Correct Behavior | Likely Current Behavior |
| --- | --- | --- | --- | --- |
| IN-01 | Input data | UTF-8 CSV with BOM | Strip BOM before delimiter detection, header detection, and parsing so the first column name is clean. | Correct. `stripByteOrderMark()` is used in delimiter detection and parsing. |
| IN-02 | Input data | UTF-16 LE file with BOM while the UI is left on default `utf-8` | Auto-detect BOM and decode correctly even if the user does not manually switch encoding. | Silent wrong result. The current decoder only obeys the selected encoding and does not auto-detect BOMs before choosing a decoder. |
| IN-03 | Input data | Latin-1 / Windows-1252 file with the UI set to `latin1` | Decode correctly and preserve accented text. | Likely correct when the user explicitly selects `latin1`. |
| IN-04 | Input data | UTF-16 BE file | Either auto-detect and decode or reject with a clear unsupported-encoding error. | Likely wrong result. Only `utf-8`, `latin1`, and `utf-16le` are supported. |
| IN-05 | Input data | File with invalid UTF-8 byte sequences | Reject cleanly or decode with a warning that replacement characters were introduced. | Silent wrong result. `TextDecoder` will typically substitute replacement characters without warning. |
| IN-06 | Input data | Mixed `\n`, `\r\n`, and bare `\r` line endings | Parse all row boundaries correctly. | Likely correct because PapaParse handles normal newline variants. |
| IN-07 | Input data | Semicolon-delimited export from Excel/European locales | Auto-detect or honor a manual semicolon override. | Correct. Semicolons are supported in detection and manual override. |
| IN-08 | Input data | Pipe-delimited `.txt` upload | Reject clearly as unsupported or let the user choose `|`. | Silent wrong result. The app only supports comma, tab, and semicolon delimiters, so a pipe file will become a single-column table. |
| IN-09 | Input data | Quoted fields containing commas | Parse quoted values without splitting cells. | Correct. Covered by PapaParse and existing tests. |
| IN-10 | Input data | Quoted fields containing embedded newlines | Preserve multiline cell contents as a single field. | Likely correct through PapaParse, but untested today. |
| IN-11 | Input data | Quoted fields containing escaped quotes (`""`) | Preserve inner quotes exactly. | Likely correct through PapaParse, but untested today. |
| IN-12 | Input data | Unclosed quoted field | Return a clear parse error tied to the source file. | Likely correct. Parse errors bubble up with the filename in `sourceName`. |
| IN-13 | Input data | Backslash-escaped CSV from legacy systems | Either support the dialect explicitly or reject with a clear parse error. | Likely wrong result or parse error. Only standard CSV quoting is assumed. |
| IN-14 | Input data | File containing NUL bytes or binary payload with `.csv` extension | Reject as non-text before parsing. | Bug. Extension and MIME checks are shallow, so binary-looking `.csv` uploads can reach the parser. |
| IN-15 | Input data | Very long single-cell text blobs | Parse without truncation and without quadratic copying. | Likely functional but memory-heavy because the file is fully buffered and parsed in-memory. |
| IN-16 | Input data | File with only a header row and no data rows | Create the table, expose the inferred columns, and allow zero-row query results. | Correct. Table creation works with zero `dataRows`. |
| IN-17 | Input data | File with only one data row and no header | Auto-detect carefully or allow manual no-header override. | Mixed. Manual no-header works; auto-detect is heuristic and can misclassify single-row text data. |
| IN-18 | Input data | Single-column CSV | Keep one column and do not invent extra structure. | Correct. Covered by tests. |
| IN-19 | Input data | Hundreds or thousands of columns | Parse, normalize missing cells, and stay within memory bounds. | Likely functional for moderate widths, but memory/perf degrade because inference allocates per-column arrays. |
| IN-20 | Input data | Very large row counts such as the requested 500k-row parsing benchmark | Parse successfully without stack overflow or argument-expansion crashes. | Crash. The current `Math.max(...dataRows.map(...))` implementation blows the call stack at high row counts. |
| IN-21 | Input data | Extremely wide rows with inconsistent field counts | Normalize shorter rows to `NULL`-ish empties and retain extra columns with generated names. | Correct. `columnCount` is based on the widest row and shorter rows are padded. |
| IN-22 | Input data | Rows with fewer fields than the header row | Pad missing cells and preserve the row count. | Correct. Missing fields become empty strings and later `NULL`. |
| IN-23 | Input data | Rows with more fields than the header row | Preserve extra cells and generate `cN` names for unnamed trailing columns. | Correct. `columnCount` uses the widest row and `makeUniqueColumnNames()` fills gaps. |
| IN-24 | Input data | Duplicate column names in the header row | De-duplicate deterministically with `_2`, `_3`, etc. | Correct. Already implemented in `makeUniqueColumnNames()`. |
| IN-25 | Input data | Empty header names (`,,`) | Generate fallback names like `c1`, `c2`, `c3`. | Correct. |
| IN-26 | Input data | Header names that are SQL reserved words (`select`, `from`) | Preserve the original header text but ensure queries are still usable, ideally by documenting or auto-quoting. | Usable only when quoted. SQLite table creation quotes identifiers, but analysts must remember to quote reserved column names. |
| IN-27 | Input data | Header names with spaces, punctuation, emoji, or unicode | Preserve them safely and allow quoting in SQL. | Mostly correct. SQLite identifiers are quoted, but unquoted analyst queries will fail. |
| IN-28 | Input data | All-empty delimiter-only rows like `,,` | Preserve them as real rows with `NULL` cells rather than dropping them. | Correct. Current parser deliberately preserves delimiter-only rows. |
| IN-29 | Input data | Blank lines between real rows | Skip them so row counts are stable. | Correct for truly empty lines; those rows are filtered after parse. |
| IN-30 | Input data | Whitespace-only lines with no delimiter characters | Treat them as empty lines, not as a one-column null record. | Bug / silent wrong result. The current filter keeps rows whose only value is whitespace. |
| IN-31 | Input data | File that contains only a BOM or only whitespace after decoding | Return a clean "empty file" style validation error. | Partially wrong. The route only rejects zero-byte files; BOM-only or whitespace-only files fail deeper in parsing with a less user-friendly error. |

## SQL Query Behavior

| ID | Category | Description | Expected Correct Behavior | Likely Current Behavior |
| --- | --- | --- | --- | --- |
| SQL-01 | SQL | Basic `SELECT * FROM table LIMIT 10` | Return rows, columns, timing, and no warning. | Correct. |
| SQL-02 | SQL | Query that returns zero rows | Return the column schema and an empty row list. | Correct. |
| SQL-03 | SQL | Query that returns one row or one column | Render and export correctly without special-casing failures. | Correct. |
| SQL-04 | SQL | Aggregate query with no `GROUP BY` | Return one row with aggregate values. | Correct. |
| SQL-05 | SQL | `GROUP BY` + `HAVING` + `ORDER BY` + `LIMIT` | Execute correctly over inferred types. | Likely correct. SQLite supports this and the app does not block it. |
| SQL-06 | SQL | CTEs (`WITH ...`) | Support ordinary and recursive CTE syntax as long as the query is bounded. | Likely correct functionally. |
| SQL-07 | SQL | Window functions | Support standard SQLite window expressions. | Likely correct functionally. |
| SQL-08 | SQL | `UNION`, `INTERSECT`, and `EXCEPT` | Support compound queries. | Likely correct. |
| SQL-09 | SQL | Self-joins and multi-file joins | Support them naturally across created tables. | Correct. Existing tests cover multi-file joins. |
| SQL-10 | SQL | Query with a syntax error | Return a 400-level structured error without leaking internals beyond the sanitized message. | Partially wrong. It returns structured JSON, but the raw SQLite parser message is sent back to the client. |
| SQL-11 | SQL | Query referencing a missing table or column | Return a structured validation-style error. | Partially wrong. The structure is correct, but the raw SQLite message is returned verbatim. |
| SQL-12 | SQL | `INSERT`, `UPDATE`, `DELETE`, or DDL | Reject because the product is a query surface, not a mutating SQL console. | Correct for non-reader statements. The route rejects statements where `statement.reader` is false. |
| SQL-13 | SQL | `PRAGMA` statements that return rows | Reject unless they are intentionally supported and documented. | Likely allowed. Any row-returning statement passes the current `statement.reader` check. |
| SQL-14 | SQL | Very long query text | Enforce a practical size limit and return a clear error if exceeded. | No explicit limit. Likely accepted until request parsing or memory becomes the bottleneck. |
| SQL-15 | SQL | Query over reserved-word columns without quoting | Offer a usable path, ideally through sanitized column aliases or UI hints. | SQL error. The user must quote those identifiers manually. |
| SQL-16 | SQL | Unicode string comparisons in `WHERE` | Match correctly when the file has been decoded correctly. | Likely correct after decoding. |
| SQL-17 | SQL | `NULL` checks vs empty strings | Preserve the distinction between `NULL` and `''`. | Partially correct. Whitespace-only cells become `NULL`, but non-whitespace empty-string semantics from source CSVs are not configurable. |
| SQL-18 | SQL | Query returning more rows than the UI can safely render | Enforce a row cap and communicate truncation clearly. | Partially correct. The backend caps at 10,000 rows and includes a warning, but the requested production target is 50,000 and the UI still renders all returned rows in one table. |
| SQL-19 | SQL | Recursive CTE without a stopping condition | Interrupt execution after the configured timeout and return a safe error. | Availability bug. There is no timeout or interrupt path today. |
| SQL-20 | SQL | Huge cross join or full-table `ORDER BY` on large data | Either finish within limits or be interrupted cleanly. | Performance / availability risk. Query execution is synchronous and unbounded. |
| SQL-21 | SQL | Multiple SQL statements in one request | Reject clearly. | Likely rejected by `prepare()` as invalid SQL, but not explicitly validated. |

## File Upload: Browser, Names, and Request Shape

| ID | Category | Description | Expected Correct Behavior | Likely Current Behavior |
| --- | --- | --- | --- | --- |
| UP-01 | Upload | Zero-byte file | Reject with `400` and a clear empty-file error. | Correct. |
| UP-02 | Upload | File containing only a newline | Treat as empty data and return a clear validation error. | Likely a generic parse-layer error rather than a user-friendly empty-file error. |
| UP-03 | Upload | File containing only a BOM | Treat as empty after decoding. | Likely parse-layer error, not a top-level validation error. |
| UP-04 | Upload | Image/PDF/ZIP upload with obvious non-text extension and MIME type | Reject before parsing. | Correct for obviously unsupported extension/MIME combinations. |
| UP-05 | Upload | Binary payload disguised as `data.csv` with `text/csv` or blank MIME | Reject using content sniffing. | Bug. Current validation trusts extension/MIME only. |
| UP-06 | Upload | Uploading the same file twice | Keep both tables addressable via deterministic collision handling. | Correct. Table names are de-duplicated. |
| UP-07 | Upload | Filenames that collide after sanitization (`sales.csv`, `sales!.csv`) | Produce `sales` and `sales_1` consistently. | Correct. |
| UP-08 | Upload | Filenames with spaces, emoji, or unicode-only names | Produce safe SQLite table names while preserving the original filename in the UI. | Mostly correct. Unicode-only names fall back to `table_1`; repeated uploads will suffix from there. |
| UP-09 | Upload | Filenames with path separators (`..\foo.csv`) | Ignore path segments and derive a safe base table name. | Correct. |
| UP-10 | Upload | Filename that is a SQL reserved word (`SELECT.csv`) | Produce a safe table name that works unquoted in starter queries. | Correct. Reserved table names are prefixed with `t_`. |
| UP-11 | Upload | Very long filenames | Accept without crashing and derive a safe, bounded table name. | Likely functional, but there is no explicit filename-length guard. |
| UP-12 | Upload | More than 20 files in one request | Reject early with a clear configurable limit. | Bug. There is no file-count limit today. |
| UP-13 | Upload | Total request size that is small per-file but huge in aggregate | Reject before buffering every file into memory. | Bug / OOM risk. Only per-file size is checked. |
| UP-14 | Upload | One file with parse settings different from another file | Preserve per-file delimiter/header overrides in preview and on submit. | Correct. The current page sends `fileSettings[]`, and the API honors them. |
| UP-15 | Upload | Re-selecting the same file after clearing | Trigger the file input `change` event normally. | Correct. `inputResetKey` resets the file input element. |

## System / Runtime / Operational Behavior

| ID | Category | Description | Expected Correct Behavior | Likely Current Behavior |
| --- | --- | --- | --- | --- |
| SYS-01 | Runtime | Single 100k-row upload | Stay within a predictable memory envelope and finish in acceptable time. | Likely functional for moderate files, but memory usage is higher than necessary because the entire request, decoded text, parsed rows, inferred columns, and SQLite inserts coexist in memory. |
| SYS-02 | Runtime | Single 500k-row upload | Either stream/scale safely or fail fast with a clear resource-limit error. | High memory / availability risk. There is no streaming path or total memory guard. |
| SYS-03 | Runtime | Ten concurrent medium queries | Preserve isolation and reasonable latency. | Isolation is correct because each request gets a fresh DB, but heavy queries can still block each other because `better-sqlite3` runs synchronously on the request thread. |
| SYS-04 | Runtime | Recursive CTE or pathological sort that runs for minutes | Abort after the configured timeout and return a safe error. | Availability bug. No timeout exists today. |
| SYS-05 | Runtime | Client disconnects mid-request | Cancel work promptly and release resources. | Likely still runs to completion. The route does not observe request aborts. |
| SYS-06 | Runtime | Server runs out of memory while decoding or parsing | Fail cleanly without corrupting other requests. | Crash / process-level risk. There is no backpressure or guard beyond per-file size. |
| SYS-07 | Runtime | Massive result set | Cap the result, warn the user, and keep the UI responsive. | Partial. Backend caps at 10,000 rows, but the UI still renders all returned rows without pagination or virtualization. |
| SYS-08 | Runtime | Large file with preview settings changed repeatedly | Avoid re-reading every file from disk for every small UI adjustment. | Performance bug. The preview effect re-decodes and re-parses every uploaded file on every parse-setting change. |
| SYS-09 | Runtime | Browser storage disabled or quota exceeded | Gracefully skip query-history persistence. | Likely error path. `localStorage.setItem()` is not guarded. |
| SYS-10 | Runtime | Production build / type gates | `npx tsc --noEmit`, `npm run lint`, and `npm run build` should all pass. | Incorrect today. `npm run build` currently fails on share-state type drift; `npx tsc --noEmit` is also not clean. |

## Type Inference and Value Coercion

| ID | Category | Description | Expected Correct Behavior | Likely Current Behavior |
| --- | --- | --- | --- | --- |
| TI-01 | Type inference | Pure integers in safe JS range | Infer `INTEGER` and store as numbers. | Correct. |
| TI-02 | Type inference | Pure floats and mixed ints/floats | Infer `REAL` and store as numbers. | Correct. |
| TI-03 | Type inference | Scientific notation like `1e5` and `1.5e-3` | Infer `REAL`. | Correct. The float regex supports exponent notation. |
| TI-04 | Type inference | `Infinity`, `-Infinity`, or `NaN` | Keep as `TEXT`, not numeric. | Correct. Non-finite values fail numeric checks. |
| TI-05 | Type inference | Whitespace around numeric values | Trim for inference/coercion, but preserve text values where appropriate. | Correct for numeric inference. |
| TI-06 | Type inference | Cells that are only whitespace | Treat as `NULL`. | Correct. `coerceValue()` maps trimmed-empty strings to `null`. |
| TI-07 | Type inference | Integers beyond `Number.MAX_SAFE_INTEGER` | Keep as `TEXT` to avoid precision loss. | Correct. Safe-range guard exists. |
| TI-08 | Type inference | Digit-only values with any leading zero (`007`, `01234`) | Keep the entire column as `TEXT` to preserve formatting. | Silent wrong result. The current implementation still infers `INTEGER`. |
| TI-09 | Type inference | ZIP codes or account ids that are all digits but semantically textual | Favor `TEXT` when there is strong evidence of formatting significance. | Often wrong today unless a leading zero or overflow forces text. |
| TI-10 | Type inference | Phone-number-like values with punctuation or `+` | Keep as `TEXT`. | Correct. Non-numeric formatting prevents numeric inference. |
| TI-11 | Type inference | Date-looking values with separators (`2026-04-06`) | Keep as `TEXT`. | Correct. They are not numeric under the current regexes. |
| TI-12 | Type inference | Date-looking values without separators (`20260406`) | Prefer `TEXT` if the column is clearly date-shaped. | Silent wrong result today. The current implementation will infer `INTEGER`. |
| TI-13 | Type inference | Currency strings like `$12.50` or `€99,95` | Keep as `TEXT`. | Correct. |
| TI-14 | Type inference | Percent strings like `12%` | Keep as `TEXT`. | Correct. |
| TI-15 | Type inference | Column that is 99% integers and 1% text | Prefer `TEXT` to avoid coercion loss. | Correct. |
| TI-16 | Type inference | All-empty column | Infer `TEXT` and store `NULL`s. | Correct. |
| TI-17 | Type inference | Negative zero (`-0`) | Preserve the sign if numeric fidelity matters, or normalize intentionally. | Silent normalization. `parseInt("-0", 10)` becomes `0`. |
| TI-18 | Type inference | Boolean-looking strings (`true`, `false`, `TRUE`, `FALSE`) | Keep as `TEXT` unless the product explicitly supports booleans. | Correct. |
