# Contributing to Quarry

Thank you for your interest in contributing.

## Development setup

```bash
npm install
npm run dev
```

## Quality gate (matches CI)

```bash
npm run typecheck
npm run lint
npm test
node scripts/check-production-licenses.cjs
npm run build
npx playwright install chromium
npm run test:e2e
```

## Pull requests

- Keep changes focused and include tests when fixing bugs or adding behavior.
- Run the full quality gate before opening a PR.
- Follow existing TypeScript and React patterns in `app/` and `components/`.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities privately.
