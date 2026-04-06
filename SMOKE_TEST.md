# Manual QA Log

Date: 2026-04-06

## Environment

- Launch command: `npm run dev`
- URL: `http://127.0.0.1:3000`
- Additional verification:
  - targeted browser automation with Playwright against the rendered UI

## Sample files

- `examples/exams.csv`
- `examples/students.csv`
- `test-fixtures/semicolon_delimited.csv`
- `test-fixtures/no_header.csv`

## Scenarios

### 1. Single-file query

- Uploaded `examples/exams.csv`
- Ran `SELECT * FROM exams LIMIT 5`
- Result: passed
- Notes: rendered five rows with the expected `exam_id`, `student_id`, `subject`, `score`, and `term` columns

### 2. Aggregate query

- Uploaded `examples/exams.csv`
- Ran `SELECT subject, COUNT(*) AS cnt FROM exams GROUP BY subject ORDER BY subject`
- Result: passed
- Notes: returned three grouped rows with the expected counts

### 3. Multi-file join

- Uploaded `examples/exams.csv` and `examples/students.csv`
- Ran `SELECT exams.subject, students.name, exams.score FROM exams JOIN students ON exams.student_id = students.student_id ORDER BY exams.exam_id`
- Result: passed
- Notes: joined rows rendered correctly and included expected names such as `Ada`, `Grace`, and `Linus`

### 4. Query error handling

- Uploaded `examples/exams.csv`
- Ran `SELEC * FROM exams`
- Result: passed
- Notes: the error banner displayed `near "SELEC": syntax error`

### 5. Result export

- Used the successful `SELECT * FROM exams LIMIT 5` result
- Triggered the download action
- Result: passed
- Notes: the exported file included the expected header row and first record

### 6. Per-file parsing controls and schema preview

- Uploaded `examples/exams.csv`, `test-fixtures/semicolon_delimited.csv`, and `test-fixtures/no_header.csv`
- Changed the `semicolon_delimited.csv` delimiter control to `;`
- Changed the `no_header.csv` header control to `No header row`
- Observed schema preview updates:
  - `semicolon_delimited.csv` showed `name`, `age`, and `city`
  - `no_header.csv` showed generated columns `c1`, `c2`, and `c3`
- Ran:
  - `SELECT`
  - `  (SELECT COUNT(*) FROM exams) AS exams_rows,`
  - `  (SELECT COUNT(*) FROM semicolon_delimited) AS semicolon_rows,`
  - `  (SELECT MIN(c1) FROM no_header) AS no_header_min`
- Result: passed
- Notes:
  - per-file controls stayed set to `;` and `No header row`
  - the query returned the expected values `5`, `3`, and `100`
