# moodle-mcp v0.1 — Checklist maestro

Copiado de §5 de `D:/Proyectos/italicia_whatsapp/docs/mcp-moodle/AGENT_LAUNCH.md` (2026-04-18). Tildar a medida que se completa cada ítem. Un solo ítem por iteración de Ralph.

---

## Fase 0 — Bootstrap del repo
- [x] `git init`, `.gitignore` (node_modules, dist, .env, coverage)
- [x] `package.json` con metadata, scripts, `bin: { "moodle-mcp": "./dist/index.js" }`
- [x] `tsconfig.json` target ES2022, module NodeNext, strict true, declaration true
- [x] Instalar deps: `@modelcontextprotocol/sdk` (pin ^1.x), `zod`, `marked`, `form-data`, `p-retry`, `gray-matter`
- [x] Instalar devDeps: `typescript`, `vitest`, `nock`, `@types/node`, `tsup`, `@vitest/coverage-v8`
- [x] `LICENSE` MIT con año 2026 y owner "Italicia"
- [x] `README.md` skeleton (expandir al final)
- [x] Primer commit: `chore: bootstrap repo`

## Fase 1 — Infraestructura interna
- [x] `src/config.ts` — env vars con zod (MOODLE_URL, MOODLE_WS_TOKEN obligatorias; TIMEOUT, MAX_RETRIES, RATE_LIMIT, LOG_LEVEL opcionales). Fallo claro si faltan.
- [x] `src/client/errors.ts` — clases `MoodleWsError`, `MoodleTokenError`, `MoodleTimeoutError`, `MoodlePluginMissingError`.
- [x] `src/client/moodle-client.ts` — fetch POST a `/webservice/rest/server.php`, `wstoken`, `moodlewsrestformat=json`, `p-retry` con 3 intentos + backoff, rate limit token-bucket simple (10 req/s default), detección de `exception` en respuesta JSON y throw tipado.
  - [x] `src/utils/rate-limit.ts` — token bucket aislado (sub-ítem)
  - [x] `src/client/moodle-client.ts` — fetch + timeout + retry + exception detection (sub-ítem)
- [x] `src/utils/idempotency.ts` — `buildIdnumber(fichaId, componentId)` con sha1 + prefijo `mcp:` + slice(0, 24). Tests unit.
- [x] `src/utils/markdown-to-html.ts` — wrapper sobre `marked` con config segura (no raw HTML si no viene del frontmatter del autor). Tests unit.
- [ ] `src/utils/logger.ts` — JSON-por-línea a stderr, niveles, redactor de token.
- [ ] Commit: `feat: core client, config, idempotency, logger`

## Fase 2 — Schemas
- [ ] `src/schemas/ficha-clase.ts` — zod schema completo según §7.1 del CONTEXT. Exportar tipo `FichaClase`.
- [ ] `src/schemas/moodle-responses.ts` — schemas de respuestas usadas (`core_course_get_courses_by_field`, `core_course_get_contents`, etc.).
- [ ] `src/adapters/ficha-to-moodle.ts` — función que dado un `FichaClase`, devuelve una lista de operaciones planificadas (sin ejecutar). Facilita testear la lógica de mapeo aislada de la API.
- [ ] Tests unit de schemas (rechazo de inputs inválidos, aceptación de ejemplos válidos).
- [ ] Commit: `feat: FichaClase schema and ficha-to-moodle adapter`

## Fase 3 — Tools (primitive + facades v0.1)
- [ ] `src/tools/ws_raw.ts` — primitive que expone `ws_raw(function_name, params)`.
- [ ] `src/tools/obtener_contexto_curso.ts` — compone `core_course_get_courses_by_field` + `core_course_get_contents` + `core_enrol_get_enrolled_users`.
- [ ] `src/tools/publicar_ficha_clase.ts` — lee `ficha_path`, parsea YAML + markdown, valida, ejecuta adapter, upserts con idempotencia. Modo default: `oculto`.
- [ ] `src/tools/publicar_preview.ts` — alias que fuerza `modo: oculto` y devuelve `preview_url`.
- [ ] `src/tools/confirmar_preview.ts` — `core_course_edit_section` + `core_course_edit_module` para visibilidad.
- [ ] Cada tool con unit tests (nock). Commit por tool: `feat: tool <nombre>`.

## Fase 4 — Server MCP
- [ ] `src/server.ts` — crea server con `@modelcontextprotocol/sdk`, registra tools, `StdioServerTransport`.
- [ ] `src/index.ts` — entrypoint, lee config, arranca server, maneja SIGTERM/SIGINT con graceful shutdown.
- [ ] Shebang `#!/usr/bin/env node` en `index.ts` compilado (o via tsup banner).
- [ ] `tsup.config.ts` — build ESM, target node20, genera `.d.ts`.
- [ ] Commit: `feat: MCP server wiring and entrypoint`

## Fase 5 — Testing
- [ ] Fixtures: `tests/fixtures/ficha-clase-ejemplo.md` con Ficha completa realista (italiano A1 unidad 3 clase 5) y assets mínimos (imagen PNG placeholder, audio MP3 placeholder).
- [ ] Unit tests hasta cobertura ≥80%. Reporte con `vitest --coverage`.
- [ ] `tests/integration/docker-compose.test.yml` con `bitnamilegacy/moodle:5.0.2` + `mysql:8`.
- [ ] `tests/integration/sandbox-setup.ts` — script que levanta Moodle docker, crea curso de test, genera token WS. Reutilizable entre tests.
- [ ] Integration test 1: publicar FichaClase → verificar recursos existen.
- [ ] Integration test 2: republicar misma Ficha → verificar que NO duplica (comparar IDs).
- [ ] Integration test 3: `publicar_preview` → `confirmar_preview` → recurso visible para rol alumno.
- [ ] Script `npm run test:integration` (lento, flag explícito).
- [ ] Commit: `test: unit + integration suite`

## Fase 6 — Distribución
- [ ] `.github/workflows/ci.yml` — en PR: lint + type-check + unit. En push a main: también integration. En tag `v*`: publish npm con secret `NPM_TOKEN`.
- [ ] `README.md` completo: qué es, instalación (`npx moodle-mcp`), config Claude Desktop (snippet JSON copiable), 3 ejemplos de tool calls, tabla de env vars, link a CONTEXT.md.
- [ ] `examples/ficha-clase-ejemplo.md` copia de fixture, con comentarios pedagógicos.
- [ ] `examples/setup-claude-desktop.md` paso a paso con screenshots simulados (texto).
- [ ] `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` mínimos.
- [ ] Commit: `docs: README, examples, CI`

## Fase 7 — Verificación final
- [ ] Correr `npm run build` → `dist/` limpio.
- [ ] Correr `npm pack` → inspeccionar tarball (no debe incluir tests, node_modules, .env).
- [ ] Correr `npm test` y `npm run test:integration` — todos verdes.
- [ ] Smoke test manual (opcional si hay token de `aula.italicia.com` en env): `node dist/index.js` y una llamada `obtener_contexto_curso` vía MCP inspector.
- [ ] Tag `v0.1.0` en git, push con tags.
- [ ] Verificar que CI publicó a npm (o, si falta NPM_TOKEN, dejar nota en `NOTES.md` para el humano).
- [ ] Commit final: `release: v0.1.0` + actualización de README con badge npm.

---

## Definición de Éxito (§6 AGENT_LAUNCH.md)
- [ ] Repo con estructura de archivos según §2.3 del CONTEXT (adaptada a v0.1 — sin gift-builder, sin ficha-examen, sin tools de examen/csv).
- [ ] `npm run build` compila sin errores ni warnings TS.
- [ ] `npm test` — 100% pasando, cobertura ≥80% en archivos `src/**`.
- [ ] `npm run test:integration` — los 3 E2E listados pasan contra Moodle docker.
- [ ] `npm pack` produce un tarball válido de <5MB sin archivos prohibidos.
- [ ] `README.md` tiene: badge npm (si publicable), instalación, config Claude Desktop, 3 ejemplos copiables de tools, tabla de env vars.
- [ ] Git tag `v0.1.0` creado.
- [ ] CI GitHub Actions workflow existe y es válido.
- [ ] `NOTES.md` contiene resumen de decisiones tomadas, bloqueos encontrados, y lista de "future work / v0.2 candidates".
