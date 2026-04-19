# Contributing to moodle-mcp

Thanks for considering a contribution. This document is short on purpose — the project is small and the conventions straightforward.

## Before you open an issue

- Check the [issue tracker](https://github.com/italicia/moodle-mcp/issues) for duplicates.
- Reproductions are gold. A failing test in `tests/unit/` or a minimal Moodle setup is the best possible bug report.

## Running the test suite

```bash
npm install
npm run typecheck
npm test
npm run test:coverage   # 80% line / function / statement, 70% branch
npm run build
```

Integration tests require a Moodle docker sandbox — see [`README.md#development`](./README.md#development).

## Coding conventions

- **TypeScript strict mode** — no `any`. Tests live beside a sibling source file, not inside it.
- **Zod first** — define the schema, then infer the type. Every tool input must have a zod schema.
- **Idempotency is the product** — any new write operation must be upsert-by-idnumber (use `buildIdnumber`).
- **Errors are structured** — throw `MoodleWsError` (or a subclass) with a stable `code`. Never leak the token in a message.
- **No stack traces across the MCP boundary** — `toErrorResponse` handles this; use it.
- **Logging is structured** — `ctx.logger.info('event', { field: value })`, never free-form strings concatenated with data.
- **Commits are conventional** — `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`. English, short, imperative.

## Pull requests

1. Branch from `main`.
2. One logical change per PR.
3. Tests for any new behaviour. If you touch `src/tools/`, cover the happy path and at least one error shape.
4. Run `npm run typecheck && npm test` before pushing.
5. Describe the change in the PR body: *why*, not just *what*. Link to an issue when relevant.

## Release

Maintainers tag the commit with `vX.Y.Z`. CI publishes to npm via trusted publishing (see `.github/workflows/ci.yml`).

## Security

Please do not open public issues for security reports. Email the maintainer listed in `package.json` instead.
