# moodle-mcp

> Model Context Protocol (MCP) server for Moodle. Lets AI agents publish and manage pedagogical content — lessons, resources, activities — in Moodle via Web Services with guaranteed idempotency.

[![CI](https://github.com/italicia/moodle-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/italicia/moodle-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/moodle-mcp.svg)](https://www.npmjs.com/package/moodle-mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**Status:** v0.1 MVP.

---

## What it is

`moodle-mcp` is a stdio-based MCP server that exposes a small set of high-level **facades** plus one low-level `ws_raw` primitive to publish a canonical pedagogical "Ficha" (a markdown file with YAML frontmatter) into a Moodle course as real sections, pages, resources and activities. Every write is upsert-by-`idnumber`, so republishing the same Ficha never creates duplicates.

Primary consumer: Claude Desktop driving the [Italicia](https://italicia.com) language-teaching workflow. But it is a generic open-source adapter — any MCP-capable agent + any Moodle 4.x/5.x instance with Web Services enabled can use it.

## Tools exposed in v0.1

| Tool | Purpose |
|---|---|
| `obtener_contexto_curso` | Snapshot of a course: metadata, sections, recent MCP-published lessons, enrolment counts. |
| `publicar_ficha_clase` | Publish a FichaClase (absolute markdown path) as a Moodle section + module updates. |
| `publicar_preview` | Same as above but forced hidden + returns a preview URL. |
| `confirmar_preview` | Make a previously hidden section and its modules visible to students. |
| `ws_raw` | Escape hatch: call any Moodle WS function directly. |

Not in v0.1 (planned for v0.2+): `publicar_ficha_examen`, `sync_alumnos_csv`, HTTP/SSE transport, GIFT builder, multipart asset upload, automatic module creation.

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
| `MOODLE_ALLOW_INSECURE` | no | `false` | Allow `http://` URLs (dev-only escape hatch). |

## Claude Desktop config

Add to `claude_desktop_config.json` (see [`examples/setup-claude-desktop.md`](./examples/setup-claude-desktop.md) for the exact path per OS):

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

Restart Claude Desktop. The five tools above should now be available to the agent.

## Examples

### 1. Snapshot a course before acting

```jsonc
// tool call
{
  "name": "obtener_contexto_curso",
  "arguments": { "course_id": 42, "incluir_ultimas_clases": 5 }
}
```

Response (abridged):

```json
{
  "course": { "id": 42, "fullname": "Italiano A1", "shortname": "ITA-A1", "format": "topics", "startdate": 1700000000 },
  "secciones": [{ "id": 100, "name": "Unidad 3", "section": 3, "visible": true, "modules_count": 6 }],
  "ultimas_clases": [{ "seccion_id": 100, "seccion_name": "Unidad 3", "ficha_idnumber": "mcp:a9993e364706816aba3e2571" }],
  "matriculados": { "total": 18, "docentes": 1, "alumnos": 17 }
}
```

### 2. Publish a FichaClase (preview first)

```jsonc
{
  "name": "publicar_preview",
  "arguments": {
    "ficha_path": "/home/alicia/fichas/italiano/a1-2026/u3/c5.md",
    "course_id": 42
  }
}
```

Response includes `preview_url` Alicia can open to review. Once approved:

```jsonc
{
  "name": "confirmar_preview",
  "arguments": { "seccion_id": 100, "recursos_ids": [501, 502, 503] }
}
```

### 3. Escape hatch — call a raw WS function

```jsonc
{
  "name": "ws_raw",
  "arguments": {
    "function_name": "core_webservice_get_site_info",
    "params": {}
  }
}
```

Response:

```json
{ "data": { "sitename": "Aula Italicia", "release": "5.0.2+", ... } }
```

## Idempotency

Every resource created by this MCP carries a stable `idnumber` of the form:

```
mcp:<first 24 chars of sha1(ficha.id + "|" + component_id)>
```

Republishing the same Ficha finds the existing resource by `idnumber` and updates it in place. Nothing gets duplicated. Safe to retry anywhere, anytime.

## v0.1 caveats

v0.1 is honest about its capability boundary. It reliably:

- Looks up a course, its sections and modules.
- Finds "owned" resources by the `mcp:` idnumber prefix.
- Updates visibility of pre-existing modules (the preview → confirm workflow).
- Surfaces structured Moodle errors with stable `code` fields.
- Never logs tokens, never propagates stack traces.

v0.1 does **not** yet:

- Upload asset files via multipart to the Moodle draft file area. Calls planned for asset upload are reported back in `advertencias` — seed them manually the first time.
- Create brand-new sections or modules through Web Services. Where a module does not exist yet, the tool returns status `"missing"` plus an `advertencia`. Installing [`local_wsmanagesections`](https://moodle.org/plugins/local_wsmanagesections) (or equivalent) and wiring those endpoints is v0.2 work.

Both gaps are driven out by the integration suite in `tests/integration/` when run against a real Moodle docker.

## Development

```bash
git clone https://github.com/italicia/moodle-mcp
cd moodle-mcp
npm install

npm run typecheck         # tsc --noEmit
npm test                  # vitest unit suite
npm run test:coverage     # with v8 coverage (≥80% enforced)
npm run build             # tsup → dist/

# Integration — requires docker
docker compose -f tests/integration/docker-compose.test.yml up -d
export MOODLE_TEST_URL=http://localhost:8081
export MOODLE_TEST_TOKEN=<generate in Moodle admin>
export MOODLE_TEST_COURSE=<course id>
npm run test:integration
docker compose -f tests/integration/docker-compose.test.yml down -v
```

## Security

- The token is never logged. Tokens appearing in any field of any log record are replaced with `***`.
- URLs in error messages are likewise redacted.
- HTTPS is required unless `MOODLE_ALLOW_INSECURE=true` (dev-only).
- The MCP only talks to Moodle via Web Services REST. No cookie auth, no web scraping, no direct DB access.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for issue, PR and commit conventions.

By participating in this project you agree to abide by the [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## License

MIT © 2026 Italicia — see [`LICENSE`](./LICENSE).
