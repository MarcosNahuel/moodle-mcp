# moodle-mcp

> Model Context Protocol (MCP) server for Moodle. Lets AI agents publish and manage pedagogical content — lessons, resources, activities — via Moodle Web Services with guaranteed idempotency.

<!-- Badges: will be filled in Phase 6 of the build (npm, ci, license) -->

**Status:** v0.1 MVP — under active construction (see `CHECKLIST.md`).

---

## What it is

`moodle-mcp` is a stdio-based MCP server that exposes a small set of high-level **facades** (plus one low-level `ws_raw` primitive) to publish a canonical pedagogical "Ficha" (a markdown file with YAML frontmatter) into a Moodle course as real sections, pages, resources and activities. Every write is upsert-by-`idnumber`, so republishing the same Ficha never creates duplicates.

Primary consumer: Claude Desktop driving the Italicia language-teaching workflow. But it is a generic open-source adapter — any MCP-capable agent + any Moodle 4.x/5.x instance with Web Services enabled can use it.

## Tools exposed in v0.1

| Tool | Purpose |
|---|---|
| `obtener_contexto_curso` | Snapshot of a course: sections, recent lessons, enrolled counts. |
| `publicar_ficha_clase` | Publish a FichaClase (markdown file path) as a Moodle section + resources. |
| `publicar_preview` | Same as above but forced hidden + returns a preview URL. |
| `confirmar_preview` | Make a previously hidden section/resources visible to students. |
| `ws_raw` | Escape hatch: call any Moodle WS function directly. |

Not in v0.1 (planned for v0.2+): `publicar_ficha_examen`, `sync_alumnos_csv`, HTTP/SSE transport, GIFT builder.

## Installation

```bash
# Via npx (recommended for Claude Desktop)
npx -y moodle-mcp

# Or install globally
npm install -g moodle-mcp
```

Requires Node.js 20 or higher.

## Configuration (env vars)

| Variable | Required | Default | Description |
|---|---|---|---|
| `MOODLE_URL` | yes | — | Full HTTPS URL of the Moodle instance. |
| `MOODLE_WS_TOKEN` | yes | — | Web Services token with edit permissions. |
| `MOODLE_WS_TIMEOUT_MS` | no | `30000` | Per-request timeout. |
| `MOODLE_WS_MAX_RETRIES` | no | `3` | Retry attempts on transient failures. |
| `MOODLE_WS_RATE_LIMIT_PER_SEC` | no | `10` | Token-bucket rate limit. |
| `MCP_LOG_LEVEL` | no | `info` | `error` / `warn` / `info` / `debug`. |

## Claude Desktop config

Add to `claude_desktop_config.json` (the exact path depends on your OS):

```json
{
  "mcpServers": {
    "moodle": {
      "command": "npx",
      "args": ["-y", "moodle-mcp"],
      "env": {
        "MOODLE_URL": "https://your-moodle.example.com",
        "MOODLE_WS_TOKEN": "your-ws-token"
      }
    }
  }
}
```

Restart Claude Desktop. The five tools above should now be available.

## Examples

<!-- Three copy-pasteable tool-call examples will be added in Phase 6 of the build. -->

## Idempotency

Every resource created by this MCP carries a stable `idnumber` of the form:

```
mcp:<first 24 chars of sha1(ficha.id + "|" + component_id)>
```

Republishing the same Ficha finds the existing resource by `idnumber` and updates it in place. Nothing gets duplicated. Safe to retry anywhere, anytime.

## Development

```bash
git clone https://github.com/italicia/moodle-mcp
cd moodle-mcp
npm install
npm run build          # compile with tsup
npm test               # unit tests (vitest + nock)
npm run test:integration   # integration tests against Moodle docker
```

See `D:/Proyectos/italicia_whatsapp/docs/mcp-moodle/CONTEXT.md` (internal) for the full design spec.

## Security

- Token is never logged; URLs in error messages redact it to `***`.
- HTTPS is required unless `MOODLE_ALLOW_INSECURE=true` (dev-only escape hatch).
- The MCP only talks to Moodle via Web Services REST. No cookie auth, no web scraping, no direct DB access.

## Contributing

See `CONTRIBUTING.md` (to be added in Phase 6).

## License

MIT © 2026 Italicia — see [`LICENSE`](./LICENSE).
