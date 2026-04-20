# `_common` — shared helpers for v0.5 tools

Non-tool utilities used across all families.

- `helpers.ts` — `buildIdnumber(kind, key)`, `isMcpIdnumber(value)`, `coerceInt(value, field)`.
- `visibility.ts` — `setSectionVisibility(client, sectionid, visible)`, `setModuleVisibility(client, cmid, visible)`.

These do not export `ToolDefinition`s. Never register anything under `_common` in `src/server.ts`.
