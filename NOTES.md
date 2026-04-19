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

## Iteración 2 (2026-04-18)

**Hecho:**
- Creado `package.json` con:
  - `name: moodle-mcp`, `version: 0.1.0`, `type: module`, `license: MIT`, `author: Italicia`.
  - `bin: { "moodle-mcp": "./dist/index.js" }`.
  - `files: ["dist", "README.md", "LICENSE"]` → lo que publica npm.
  - `engines.node: >=20`.
  - Scripts: `build` (tsup), `dev` (tsup watch), `typecheck` (tsc --noEmit), `test` (vitest run), `test:coverage`, `test:integration` (config separada), `prepublishOnly`.
  - `publishConfig.access: public`.
  - Deps prod/dev con ranges `^x.y.z` como dicta §3.1 del CONTEXT. Las versiones concretas se fijan al `npm install` del próximo ítem (el lock file será la fuente de verdad de la versión pineada).
- Validado con `node -e "JSON.parse(...)"` → OK.
- Ítem 2 de Fase 0 ✅.

**Próximo ítem (iteración 3):** Fase 0 → `tsconfig.json` target ES2022, module NodeNext, strict true, declaration true.

**Decisión menor:** el repo GitHub URL es `github.com/italicia/moodle-mcp` como placeholder. Si el org/name final difiere (ej. scope `@italicia/moodle-mcp` por conflicto npm), se actualiza en Fase 7. Anotado aquí para recordar.

---

## Iteración 3 (2026-04-18)

**Hecho:**
- Creado `tsconfig.json` con:
  - `target: ES2022`, `lib: [ES2022]`, `module: NodeNext`, `moduleResolution: NodeNext`.
  - `strict: true` + extra strictness: `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `exactOptionalPropertyTypes`.
  - `declaration: true`, `declarationMap: true`, `sourceMap: true`.
  - `outDir: ./dist`, `rootDir: ./src`.
  - `isolatedModules: true` + `verbatimModuleSyntax: true` (compat con tsup/ESM).
  - `skipLibCheck: true`, `resolveJsonModule: true`, `types: ["node"]`.
  - Include `src/**/*`, excluye `tests`, `**/*.test.ts`, `dist`, `coverage`, `node_modules`.
- Validado parse JSON OK. `tsc --noEmit` no corrió aún porque `@types/node` y `typescript` no están instalados todavía (próximo ítem).
- Ítem 3 de Fase 0 ✅.

**Próximo ítem (iteración 4):** Fase 0 → Instalar deps prod (`@modelcontextprotocol/sdk`, `zod`, `marked`, `form-data`, `p-retry`, `gray-matter`). Resolver versión exacta ^1.x del SDK MCP al momento de `npm install` (según §2 decisión 5 de AGENT_LAUNCH).

**Decisión técnica en iteración 3:** habilité `exactOptionalPropertyTypes` y `noUncheckedIndexedAccess` además del strict base. Razón: el spec §18.5 del CONTEXT ("Tipos primero. Zod schema → tipos TS inferidos → implementación. Cero any") y §4.2 del AGENT_LAUNCH ("Zod schema primero...") sugieren tipado muy estricto. Si algún preset de tsup/vitest falla por esto, lo relajo en esa iteración y anoto aquí.

---

## Iteración 4 (2026-04-18)

**Hecho:**
- `npm install --omit=dev --no-audit --no-fund` → 114 paquetes, 15s.
- Versiones resueltas (pineadas en `package-lock.json`):
  - `@modelcontextprotocol/sdk@1.29.0` (última estable `^1.x` al 2026-04-18, cumple §2 decisión 5 de AGENT_LAUNCH).
  - `zod@3.25.76`
  - `marked@14.1.4`
  - `form-data@4.0.5`
  - `p-retry@6.2.1`
  - `gray-matter@4.0.3`
- Ítem 4 de Fase 0 ✅.

**Próximo ítem (iteración 5):** Fase 0 → Instalar devDeps (`typescript`, `vitest`, `nock`, `@types/node`, `tsup`, `@vitest/coverage-v8`). Corriendo `npm install` sin flag agrega las devDeps (ya declaradas en `package.json`) sobre las prod ya instaladas.

**Decisión menor:** uso `--omit=dev` en iter 4 y `npm install` limpio en iter 5 para respetar literalmente "un ítem por iteración". Posible que npm quiera reinstalar árbol entero en iter 5 (ruido en `package-lock.json`); si genera diff no-significativo, lo acepto como parte del commit de devDeps.

---

## Iteración 5 (2026-04-18)

**Hecho:**
- `npm install --no-audit --no-fund` → 144 paquetes adicionales, 3s. Warn deprecated glob@10.5.0 (dep transitiva, no crítico, ignoro).
- DevDeps resueltas:
  - `typescript@5.9.3`
  - `vitest@2.1.9`
  - `nock@13.5.6`
  - `@types/node@24.12.2`
  - `tsup@8.5.1`
  - `@vitest/coverage-v8@2.1.9`
- Binarios verificados: `tsc 5.9.3` y `vitest 2.1.9` responden `--version`.
- Ítem 5 de Fase 0 ✅.

**Próximo ítem (iteración 6):** Fase 0 → `LICENSE` MIT con año 2026 y owner "Italicia".

---

## Iteración 6 (2026-04-18)

**Hecho:**
- Creado `LICENSE` con texto MIT estándar, año 2026, owner "Italicia".
- Ítem 6 de Fase 0 ✅.

**Próximo ítem (iteración 7):** Fase 0 → `README.md` skeleton (expandir al final en Fase 6).

---

## Iteración 7 (2026-04-18)

**Hecho:**
- Creado `README.md` skeleton con: descripción corta, status, tabla de tools v0.1 (5), instalación, tabla de env vars, snippet Claude Desktop config, sección idempotencia con fórmula `idnumber`, dev setup, seguridad, license. Placeholders para badges (Fase 6) y ejemplos copy-pasteables (Fase 6).
- Ítem 7 de Fase 0 ✅.
- Ítem 8 "Primer commit: chore: bootstrap repo" ✅ (interpretado como cierre simbólico de Fase 0 — todos los fundamentos del repo están en git).
- **Fase 0 completa.** 🎉

**Próximo ítem (iteración 8):** Fase 1 → `src/config.ts` — env vars con zod (`MOODLE_URL`, `MOODLE_WS_TOKEN` obligatorias; `TIMEOUT`, `MAX_RETRIES`, `RATE_LIMIT`, `LOG_LEVEL` opcionales). Fallo claro si faltan.

**Estado del repo al cerrar Fase 0:**
- `.gitignore`, `package.json`, `package-lock.json`, `tsconfig.json`, `LICENSE`, `README.md`, `CHECKLIST.md`, `NOTES.md`.
- `node_modules/` con 258 paquetes (114 prod + 144 dev).
- Sin código `src/` todavía — empieza en Fase 1.
- 7 commits en `main` linear, convención `chore:` hasta aquí.

---

## Iteración 8 (2026-04-18) — Fase 1 arranca

**Hecho:**
- Creado `src/config.ts`:
  - Export: `loadConfig(env?)`, `MoodleConfig` (type), `ConfigError`, `LogLevel`, `LOG_LEVELS`.
  - Zod schema `ConfigSchemaBase` con coerción manual de strings (env siempre devuelve string).
  - Requeridas: `MOODLE_URL`, `MOODLE_WS_TOKEN`. Defaults: `timeoutMs=30000`, `maxRetries=3`, `rateLimitPerSec=10`, `logLevel=info`.
  - Escape hatch HTTPS: `MOODLE_ALLOW_INSECURE=true` quita refinement de `https://` (para docker test local).
  - Error handling: `ConfigError` con mensaje humano. No propaga stacks ni zod raw errors al cliente — §14.1/§18.2 del CONTEXT.
- Creado `tests/unit/config.test.ts` con 12 tests: required missing, https enforcement, insecure override, URL malformed, empty token, numeric coercion (timeout/retries/rate), non-numeric rejection, negative timeout, log level case-normalization, invalid log level.
- `npx tsc --noEmit` → limpio.
- `npx vitest run tests/unit/config.test.ts` → **12/12 verde, 375ms**.
- Ítem 1 de Fase 1 ✅.

**Próximo ítem (iteración 9):** Fase 1 → `src/client/errors.ts` con clases `MoodleWsError`, `MoodleTokenError`, `MoodleTimeoutError`, `MoodlePluginMissingError`.

**Decisiones tomadas:**
1. `verbatimModuleSyntax` + NodeNext → imports dentro de `src/` y tests usan `.js` extension (`from '../../src/config.js'`). Funciona con vitest 2.1.9.
2. `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` no han dado problemas todavía. Confirmado que zod `.default()` juega bien con esto si el raw se construye con `Record<string, unknown>` omitiendo claves ausentes.

---

## Iteración 9 (2026-04-18)

**Hecho:**
- Creado `src/client/errors.ts`:
  - Clase base `MoodleWsError extends Error` con `code`, `functionName`, `details`, `cause`. Code default `MOODLE_WS_ERROR`.
  - `MoodleTokenError` → `code: MOODLE_WS_TOKEN_INVALID`.
  - `MoodleTimeoutError` → `code: MOODLE_WS_TIMEOUT`, lleva `timeoutMs`.
  - `MoodlePluginMissingError` → `code: MOODLE_PLUGIN_MISSING`, lleva `plugin`, mensaje default incluye URL a moodle.org/plugins.
  - Método `toClientPayload()` que retorna objeto serializable para MCP responses (sin stack trace) — §14.2 del CONTEXT.
  - Type guard `isMoodleWsError(e)`.
- `tests/unit/errors.test.ts` con 13 tests: default code, custom options, cause preservation, toClientPayload omit/include, instanceof checks de las 4 clases, type guard positivo y negativo.
- `tsc --noEmit` limpio.
- Tests totales: **25/25 verde** (config 12 + errors 13).
- Ítem 2 de Fase 1 ✅.

**Próximo ítem (iteración 10):** Fase 1 → `src/client/moodle-client.ts` — fetch POST a `/webservice/rest/server.php`, `wstoken`, `moodlewsrestformat=json`, `p-retry` con 3 intentos + backoff, rate limit token-bucket, detección de `exception` en respuesta JSON → throw tipado.

**Códigos de error establecidos (diccionario para iteraciones siguientes):**
- `MOODLE_WS_ERROR` — genérico/fallback
- `MOODLE_WS_TOKEN_INVALID` — 401 / token
- `MOODLE_WS_TIMEOUT` — request abort por timeout
- `MOODLE_PLUGIN_MISSING` — plugin requerido ausente
- (futuros del moodle-client) `MOODLE_WS_HTTP_ERROR`, `MOODLE_WS_NETWORK_ERROR`, `MOODLE_WS_EXCEPTION` (for Moodle-returned exceptions).

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
