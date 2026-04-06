# Improvements

## High priority

- Align the client controls and API payload for header handling so manual overrides behave consistently end to end.
- Add a single end-to-end regression test for upload, query execution, export, and error rendering.
- Surface upload-size limits and supported file types directly in the UI before submission.

## Medium priority

- Split the main page component into smaller client-side units to reduce orchestration complexity.
- Add clearer guidance for table aliases, supported SQL expectations, and export options in the editor panel.
- Capture a lightweight release checklist that pairs smoke coverage with automated verification.

## Ongoing maintenance

- Keep shared parsing, export, naming, and state helpers centralized in `lib/`.
- Watch memory usage when multiple large files are uploaded in a single session.
- Preserve parity between documentation, tests, and the live request contract.
