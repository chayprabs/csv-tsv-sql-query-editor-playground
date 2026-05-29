# Changelog

## 2026-05-29

- Redesigned UI: white minimal layout, top bar with GitHub / X / website links, SEO summary bar, privacy and terms footer only.
- Removed Authos branding; `/credits` redirects home.
- Added Dockerfile, SECURITY.md, CONTRIBUTING.md, deployment README section, and sitemap.
- CI: inline query execution under Vitest; Playwright uses production server with inline worker on GitHub Actions.

## Current release

- Added support for upload previews, schema inference, export controls, share links, and recent-query history.
- Hardened validation for missing files, unsupported uploads, empty inputs, oversized files, and truncated result sets.
- Improved table naming, text decoding, delimiter handling, and result-state management across the client and server.
- Expanded automated coverage across parsing utilities, the import/query pipeline, the API route, and major UI components.
- Kept the product validation loop centered on tests, type checking, and production builds.
