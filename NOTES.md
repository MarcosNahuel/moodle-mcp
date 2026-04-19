# moodle-mcp — Bitácora Ralph Loop

Memoria persistente entre iteraciones. La iteración N lee esto para saber qué pasó en iteración N-1.

---

## Iteración 1 (2026-04-18)

**Hecho:**
- Leída completa `D:/Proyectos/italicia_whatsapp/docs/mcp-moodle/CONTEXT.md` (922 líneas).
- Creado `CHECKLIST.md` copiando §5 del AGENT_LAUNCH.md.
- Creado este `NOTES.md`.
- `git init -b main` ejecutado, user configurado (Nahuel / nahuelachu@gmail.com).
- `.gitignore` creado con node_modules, dist, coverage, .env*, logs, editor, OS, tgz, Ralph state.
- Ítem 1 de Fase 0 ✅.

**Próximo ítem (iteración 2):** Fase 0 → `package.json` con metadata, scripts, `bin: { "moodle-mcp": "./dist/index.js" }`.

**Convención de commits adoptada:**
- Un commit por ítem del checklist. Mensaje conventional en inglés, corto.
- El ítem literal "Primer commit: `chore: bootstrap repo`" lo interpreto como directriz de estilo, no como commit único de cierre de fase. Uso commits granulares por ítem; el mensaje del commit de README skeleton (último ítem de Fase 0) será `chore: bootstrap repo` como cierre simbólico de Fase 0.

**Decisiones tomadas en esta iteración:** ninguna técnica nueva. Todas las respuestas a ambigüedades ya vienen de §2 del AGENT_LAUNCH.md.

**Context resumido (para iteraciones futuras, no releer CONTEXT completo):**
- Target: paquete npm `moodle-mcp` (stdio, TS, Node 20+, build con tsup).
- Arquitectura: MCP protocol layer → facade layer (5 tools en v0.1) → primitive `ws_raw` → moodle-client.
- Deps prod: `@modelcontextprotocol/sdk` (pin ^1.x), `zod`, `marked`, `form-data`, `p-retry`, `gray-matter`.
- DevDeps: `typescript`, `vitest`, `@vitest/coverage-v8`, `nock`, `@types/node`, `tsup`.
- Idempotencia: `idnumber = "mcp:" + sha1(ficha.id + "|" + component_id).slice(0, 24)`.
- Input contract: `ficha_path: string` absoluto; assets resueltos relativo a `dirname(ficha_path)`.
- Tests docker: `bitnamilegacy/moodle:5.0.2` + `mysql:8` (NO mariadb).
- v0.1 scope: `obtener_contexto_curso`, `publicar_ficha_clase`, `publicar_preview`, `confirmar_preview`, `ws_raw`. NO examen, NO csv, NO gift, NO HTTP/SSE.

---

## Blockers

(Ninguno por ahora.)

---

## Future work / v0.2 candidates

- `publicar_ficha_examen` + `FichaExamen` schema + `gift-builder.ts` (requiere plugin `qbank_importexport` en target Moodle).
- `sync_alumnos_csv` para matrícula en lote.
- Transport HTTP/SSE para Claude Cowork (requiere deploy + OAuth).
- Empaquetado Desktop Extension `.dxt` (v0.3).
- Facade `publicar_ficha_unidad` (composición N clases + 1 examen) en v0.4+.
- Webhook listener para drift detection vs Ficha canónica en Git.

---

## CONTEXT.md corrections needed

(Ninguna detectada hasta ahora.)
