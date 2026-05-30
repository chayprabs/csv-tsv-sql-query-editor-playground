# Changelog

All notable changes to Quarry (Flatfile SQL Studio) are documented here.

## [1.0.0] — 2026-05-30

**v1 complete** — server-side flatfile SQL studio ready for production deployment.

### Added

- Multi-file upload with delimiter/header detection, schema inference, and read-only SQL (`SELECT`, `WITH`, `JOIN`, etc.).
- `POST /api/query` with in-memory **better-sqlite3**, rate limits, memory guards, and sanitized errors.
- `GET /api/health` for load balancers and smoke checks.
- Client export (CSV/TSV/semicolon), share links (URL hash), and local query history (10 entries).
- Legal pages: `/privacy`, `/terms`, `/credits`.
- Docker image (`Dockerfile`) with `FLATFILE_INLINE_QUERY_WORKER=1` default for container-friendly execution.
- Documented env vars in `env.example` (including `FLATFILE_INLINE_QUERY_WORKER`, `NEXT_PUBLIC_MAX_QUERY_LENGTH`).

### Security & limits

- Eight server-enforced protection layers (upload caps, rate limits, SQL timeout, result truncation, CSP, etc.).
- Configurable limits via environment variables (see README **Limits & defaults**).

### Quality

- Vitest unit/integration tests, Playwright E2E, CI workflow (typecheck, lint, build, e2e).
