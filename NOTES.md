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

## Iteración 10 (2026-04-18)

**Hecho:**
- Dividido el ítem `moodle-client.ts` en sub-ítems (rate-limit y moodle-client propiamente dicho). Regla de hierro aplicada: cerré uno.
- Creado `src/utils/rate-limit.ts` — token bucket simple:
  - `createTokenBucketLimiter({ tokensPerSec, capacity?, now?, sleep? })`.
  - Capacity default = tokensPerSec (burst de 1 segundo).
  - `now` y `sleep` inyectables → tests deterministas con fake clock.
  - Queue interna FIFO para serializar acquires concurrentes (evita race por token).
  - Cap explícito en `capacity` (no crecimiento infinito si el bucket queda idle).
- `tests/unit/rate-limit.test.ts` — 8 tests: inválidos, burst inicial sin sleep, wait post-burst ~100ms, refill progresivo, cap de capacity tras idle, FIFO en 15 concurrentes, capacity custom.
- tsc --noEmit limpio. Tests totales: **33/33 verde** (config 12 + errors 13 + rate-limit 8).
- Sub-ítem 1 de moodle-client ✅.

**Próximo ítem (iteración 11):** sub-ítem `src/client/moodle-client.ts` — fetch POST, timeout con AbortController, `p-retry` (3 intentos), invocar rate limiter, detección de `exception` en respuesta JSON (Moodle devuelve `{exception: "...", errorcode: "..."}` cuando falla semánticamente), throw tipado (`MoodleTokenError` si token inválido, `MoodleTimeoutError`, `MoodleWsError` genérico con `errorcode` en `details`). Tests con `nock`.

---

## Iteración 11 (2026-04-18)

**Hecho:**
- Creado `src/client/moodle-client.ts`:
  - `createMoodleClient({ url, token, timeoutMs?, maxRetries?, rateLimiter?, tokensPerSec?, fetch?, retryMinTimeoutMs?, retryFactor? })` → `MoodleClient` con método `call<T>(functionName, params?)`.
  - POST a `${url}/webservice/rest/server.php` (strip trailing slashes) con body `application/x-www-form-urlencoded`: `wstoken`, `wsfunction`, `moodlewsrestformat=json`, + params flattened.
  - `flattenParams` maneja objetos anidados (`options[name]=x`), arrays (`options[0][name]=a`), booleanos (→ `1`/`0`), skippa `null`/`undefined`.
  - Timeout via `AbortController` + `setTimeout` → `MoodleTimeoutError` con `timeoutMs` + `functionName`.
  - `p-retry` con `retries: maxRetries` (default 3), `minTimeout: 1000ms`, `factor: 2`.
  - Error mapping:
    - `AbortError` → `MoodleTimeoutError` (retryable).
    - `TypeError` network → `MoodleWsError{code: NETWORK_ERROR}` (retryable).
    - 5xx → `HTTP_5XX` (retryable).
    - 4xx → `HTTP_4XX` (NON-retryable, `AbortError` p-retry).
    - Bad JSON → `BAD_JSON` (non-retryable).
    - Moodle JSON `{exception, errorcode}` con errorcode token-like → `MoodleTokenError` (non-retryable).
    - Otro errorcode → `MoodleWsError{code: EXCEPTION, details.{exception, errorcode, debuginfo}}` (non-retryable).
  - `redactToken(s, token)` reemplaza todas las apariciones del token por `***`; se aplica a body 4xx, mensajes de exception, y errores de red. Regex-escape de metacaracteres.
  - Constantes `CLIENT_ERROR_CODES` exportadas + set `TOKEN_ERROR_CODES` de errorcodes Moodle considerados no-retryables.
- `tests/unit/moodle-client.test.ts` — 21 tests: redactToken (3), flattenParams (4), POST body shape, URL trailing slash, invalidtoken → MoodleTokenError sin retry, exception genérica → MoodleWsError, redacción en mensajes de exception, 4xx sin retry, 5xx con retry y éxito, 5xx agotado con maxRetries, redacción en body 4xx, network error con retry, timeout via AbortController, rateLimiter.acquire called, empty body → null, bad JSON no retry.
- tsc --noEmit limpio. **Total: 54/54 tests verde**.
- Sub-ítem 2 ✅. **Ítem padre moodle-client ✅.**

**Decisión técnica (documentada para futuras iteraciones):** nock 13.5.6 NO intercepta confiablemente el `fetch` nativo de Node 20+ (undici). En lugar de downgradear al módulo `http` o hacer hacks con `MockAgent`, el cliente expone `opts.fetch?: typeof fetch` inyectable. Los tests unit usan un mock fetch (queue de Responses/Errors) — más simple, rápido, y explícito. Nock queda disponible pero los unit tests de facades/tools en Fase 3 usarán el mismo patrón de inyección. Para integration tests (Fase 5) el fetch real contra docker Moodle es suficiente, sin nock.

**Códigos de error del cliente (diccionario):**
| Code | Retryable | Cuándo |
|---|---|---|
| MOODLE_WS_NETWORK_ERROR | sí | fetch throw (no abort) |
| MOODLE_WS_TIMEOUT | sí | AbortController timeout |
| MOODLE_WS_HTTP_5XX | sí | response.status >= 500 |
| MOODLE_WS_HTTP_4XX | no | 400-499 |
| MOODLE_WS_BAD_JSON | no | JSON.parse fail en 2xx |
| MOODLE_WS_EXCEPTION | no | JSON con `exception` key |
| MOODLE_WS_TOKEN_INVALID | no | errorcode en TOKEN_ERROR_CODES |

**Próximo ítem (iteración 12):** Fase 1 → `src/utils/idempotency.ts` — `buildIdnumber(fichaId, componentId)` con sha1 + prefijo `mcp:` + slice(0, 24). Tests unit.

---

## Iteración 12 (2026-04-18)

**Hecho:**
- Creado `src/utils/idempotency.ts`:
  - `buildIdnumber(fichaId, componentId)` → `"mcp:" + sha1(trimmed_fichaId + "|" + trimmed_componentId).slice(0, 24)`.
  - `buildSectionIdnumber(fichaId)` → alias para `buildIdnumber(fichaId, "section")` — matches CONTEXT §8.1.
  - `isMcpIdnumber(value)` → type guard para identificar ids producidos por este MCP (prefix + 24 hex).
  - Constantes exportadas: `IDNUMBER_PREFIX = "mcp:"`, `IDNUMBER_HASH_LEN = 24`.
  - Trim whitespace antes de hashear (evita drift por copy-paste de fichaId con espacios).
  - Rechaza inputs vacíos con mensaje claro — `TypeError` si no es string, `Error` si string vacío.
- `tests/unit/idempotency.test.ts` — 14 tests: prefix + longitud, tail hex, determinismo, fórmula explícita contra `crypto.sha1` in-test, distinct inputs → distinct outputs (2 tests), trim, empty fichaId rechaza (2 casos), empty componentId rechaza (2 casos), buildSectionIdnumber equivalence, section formula match, isMcpIdnumber accepts/rejects/non-strings.
- tsc --noEmit limpio. **Total: 68/68 tests verde**.
- Ítem 4 de Fase 1 ✅.

**Próximo ítem (iteración 13):** Fase 1 → `src/utils/markdown-to-html.ts` — wrapper sobre `marked` con config segura (no raw HTML si no viene del frontmatter del autor). Tests unit.

---

## Iteración 13 (2026-04-18)

**Hecho:**
- Creado `src/utils/markdown-to-html.ts`:
  - `renderMarkdown(md, opts?)` con `marked v14` (async: false para return sincrónico).
  - Opciones: `sanitize` (default true), `gfm` (default true), `breaks` (default false).
  - `sanitizeHtml(html)` strippea tags peligrosos (script, style, iframe, object, embed, form, input, button, link, meta, base), event handlers inline (`on*=`), y neutraliza `javascript:` URLs en `href`/`src`/`formaction`/`action`/`xlink:href` reemplazando por `#`.
  - Preserva `<img>`, `<audio>`, `<video>`, `<source>`, `<a>`, `<p>`, headings, listas, tablas — el contrato de Ficha los usa.
- `tests/unit/markdown-to-html.test.ts` — 19 tests: inline formatting, headings+lists, img preservation, raw audio, anchors, script/style/iframe strip, self-closing dangerous tags, event handlers, javascript: URLs en href y src, sanitize:false debug, GFM tables, breaks on/off, sanitizeHtml unit tests (nested script, benign passthrough, idempotency).
- tsc --noEmit limpio. **Total: 87/87 tests verde**.
- Ítem 5 de Fase 1 ✅.

**Decisión técnica:** sanitización basada en regex — frágil pero suficiente para v0.1 como defensa en profundidad (Moodle tiene sus propios filtros). Anotado en doc de la función como candidato v0.2 para DOMPurify/parser HTML real. Agregado a "Future work".

**Próximo ítem (iteración 14):** Fase 1 → `src/utils/logger.ts` — JSON-por-línea a stderr, niveles, redactor de token.

---

## Iteración 14 (2026-04-18) — Fase 1 cerrada

**Hecho:**
- Creado `src/utils/logger.ts`:
  - `createLogger({ level?, sink?, clock?, redact? })` → `Logger` con `error/warn/info/debug/child`.
  - Level threshold: `error(0) < warn(1) < info(2) < debug(3)`. Reusa `LOG_LEVELS` de `config.ts`.
  - Emite JSON-per-line con `ts` (ISO), `level`, `msg`, merged fields.
  - Sink default: `process.stderr.write(line + '\n')` (stdout reservado para JSON-RPC MCP).
  - `redact: string[]` — cada string se reemplaza por `***` en msg y campos (deep walk, escape regex metachars).
  - `child(baseFields)` devuelve logger que merge los fields en cada call (call-site tiene prioridad).
  - Circular refs → `[Circular]` sin throw (dual walk: uno en `deepRedact`, otro en `safeStringify`).
  - Invalid level en constructor → `throw Error`.
  - Export `nullLogger` no-op para módulos que quieran un default.
  - `deepRedact` exportado para reuso (ej. logs específicos fuera del logger).
- `tests/unit/logger.test.ts` — 16 tests: JSON-per-line shape, field merge, level threshold, default info, debug enabled por `level: 'debug'`, invalid level rechaza, redacción msg+fields+nested, regex escape en redact, child merge, child-of-child, circular, call-site override, deepRedact empty/array/circular, nullLogger no-op.
- Fix: helper `makeCaptured` cambió `records` getter por función (getter dentro del retorno del helper no funcionaba con destructuring).
- tsc --noEmit limpio. **Total: 103/103 tests verde**.
- Ítem 6 de Fase 1 ✅.
- Ítem "Commit: `feat: core client, config, idempotency, logger`" ✅ (cierre simbólico de Fase 1).
- **Fase 1 completa.** 🎉

**Estado del repo al cerrar Fase 1:**
- `src/config.ts`, `src/client/{errors,moodle-client}.ts`, `src/utils/{rate-limit,idempotency,markdown-to-html,logger}.ts`.
- 7 test files en `tests/unit/` con 103 casos.
- Cobertura no medida todavía (Fase 5 lo exige ≥80%). Todo lo escrito tiene tests directos.
- Sin `src/schemas/`, `src/adapters/`, `src/tools/`, `src/server.ts`, `src/index.ts` — esas son Fases 2-4.

**Próximo ítem (iteración 15):** Fase 2 → `src/schemas/ficha-clase.ts` — zod schema completo según §7.1 del CONTEXT. Exportar tipo `FichaClase`.

---

## Iteración 15 (2026-04-18) — Fase 2 arranca

**Hecho:**
- Creado `src/schemas/ficha-clase.ts`:
  - Constantes enum: `IDIOMAS`, `MODALIDADES`, `PERFILES_ALUMNO`, `ASSET_TIPOS`, `COMPONENTE_TIPOS_CONOCIDOS` (este último informativo, no valida).
  - Schemas: `VocabularioItemSchema` (passthrough, acepta códigos lang nuevos), `AssetGeneradoSchema` (strict), `ComponenteSchema` (strict, tipo como string libre), `MoodleRefSchema` (strict, course_id positive, section_id_preferido nullable+optional).
  - `FichaClaseSchema` — `.strict()` + `.superRefine` con cross-field checks:
    - asset ids únicos.
    - component ids únicos.
    - `componente.asset` refs a assets existentes.
  - Defaults aplicados a `competencias_activadas`, `competencias_prerequisito`, `vocabulario`, `estructuras`, `assets_generados`.
  - `objetivos_observables` y `componentes` requieren al menos 1 elemento.
  - Exports: `FichaClase` (output), `FichaClaseInput` (input con opcionales), sub-types (`Componente`, `AssetGenerado`, etc.).
- `tests/unit/ficha-clase.test.ts` — 17 tests: minimal válido, full con assets y refs, todos idiomas/modalidades/perfiles, null section_id, missing id, tipo inválido, idioma inválido, empty componentes, empty objetivos, unknown key strict, invalid duracion/course_id (2), duplicate asset/component (2), ref missing asset, asset ref OK.
- tsc --noEmit limpio. **Total: 120/120 tests verde**.
- Ítem 1 de Fase 2 ✅.

**Próximo ítem (iteración 16):** Fase 2 → `src/schemas/moodle-responses.ts` — schemas zod para respuestas Moodle usadas (`core_course_get_courses_by_field`, `core_course_get_contents`, `core_enrol_get_enrolled_users`, etc.).

---

## Iteración 16 (2026-04-18)

**Hecho:**
- Creado `src/schemas/moodle-responses.ts`:
  - `moodleBool` — coerce 0|1|boolean → boolean.
  - `SiteInfoResponseSchema` para `core_webservice_get_site_info` (sitename, userid, functions[], version, release).
  - `CourseSchema` + `CoursesByFieldResponseSchema` para `core_course_get_courses_by_field`.
  - `SectionSchema` + `ModuleSchema` + `CourseContentsResponseSchema` (array de sections) para `core_course_get_contents`.
  - `EnrolledUserRoleSchema` + `EnrolledUserSchema` + `EnrolledUsersResponseSchema` para `core_enrol_get_enrolled_users`.
  - `FileUploadResponseSchema` para `core_files_upload` (itemid, filename, …).
  - Todos con `.passthrough()` para ser robustos a drift de versión Moodle.
  - Export `TEACHER_ROLE_SHORTNAMES` set para contar docentes vs alumnos.
- `tests/unit/moodle-responses.test.ts` — 13 tests: moodleBool (4), site info realista con extra field, site defaults, courses con visible mixto, course rejection, sections con modules anidados, sections default empty, enrolled users con roles, file upload mínimo, file upload sin itemid.
- tsc --noEmit limpio. **Total: 133/133 tests verde**.
- Ítem 2 de Fase 2 ✅.

**Próximo ítem (iteración 17):** Fase 2 → `src/adapters/ficha-to-moodle.ts` — función que dado `FichaClase` devuelve lista de operaciones planificadas (sin ejecutar). Facilita testear lógica de mapeo aislada de la API.

---

## Iteración 17 (2026-04-18) — Fase 2 cerrada

**Hecho:**
- Creado `src/adapters/ficha-to-moodle.ts` — planner side-effect-free.
  - `planFichaClase({ ficha, visible, componentContent? })` devuelve `Plan { section, operations[] }`.
  - `section: { idnumber (stable), name: "Clase {orden} — {programa} u{unidad}", summary, preferred_section_id, visible }`.
  - `operations[]` en orden de ejecución:
    1. `upload_asset` para cada asset referenciado por al menos un componente (unused assets se omiten). Orden: declaration order de `assets_generados`.
    2. `upsert_*` por componente en orden de declaración.
  - Mapping tipo → op:
    - `tarea_asincronica` / `tarea_asincrónica` → `upsert_assignment`.
    - `url` → `upsert_url` (lee `metadata.url`).
    - todo lo demás → `upsert_page`.
  - `name`: `metadata.title` trimmed, fallback a `componente.id`.
  - `content_markdown` / `description_markdown`: del map `componentContent[id]`, default `''`.
  - `asset_refs[]` en páginas: single-element array con el asset ref, empty si no hay.
- `tests/unit/ficha-to-moodle.test.ts` — 18 tests cubriendo: section idnumber estable, section name format, preferred_section_id propagation, visible false, unused assets omitidos, dedupe assets compartidos, uploads antes de upserts, orden declaration, mapping a page/assignment/url (ambas tildes), metadata.title override, fallback id, idnumber estable por componente, visible propagation a todos, componentContent fill, default empty content, asset_refs, declaration order preservation.
- Ítems 2.3 + 2.4 (tests schemas) + commit simbólico 2.5 ✅.
- **Fase 2 completa.** 🎉
- tsc --noEmit limpio. **Total: 151/151 tests verde**.

**Estado del repo al cerrar Fase 2:**
- `src/config.ts`, `src/client/{errors,moodle-client}.ts`, `src/utils/{rate-limit,idempotency,markdown-to-html,logger}.ts`, `src/schemas/{ficha-clase,moodle-responses}.ts`, `src/adapters/ficha-to-moodle.ts`.
- 10 test files con 151 casos.
- Siguiente: Fase 3 (tools MCP) — es la parte más grande del trabajo remanente.

**Próximo ítem (iteración 18):** Fase 3 arranca → `src/tools/ws_raw.ts` — primitive que expone `ws_raw(function_name, params)` al servidor MCP. Simple wrapper sobre `MoodleClient.call()` con shape de respuesta MCP.

---

## Iteración 18 (2026-04-18) — Fase 3 arranca

**Hecho:**
- Creado `src/tools/types.ts`:
  - `ToolContext { client, logger }`.
  - `ToolDefinition<TInput>` con `name`, `description`, `inputSchema: ZodType`, `handler`.
  - `ToolResponse { content[], isError?, meta? }` — shape MCP.
  - `toErrorResponse(e)` uniformiza errores: `MoodleWsError` → `isError + meta` con `toClientPayload()` spread; resto → `MOODLE_WS_ERROR` genérico con message.
  - `toJsonResponse(data)` — shortcut.
- Creado `src/tools/ws_raw.ts`:
  - Input: `function_name` (regex `/^[a-z][a-z0-9_]*$/i`) + `params` (record, default `{}`), schema strict.
  - Handler: log debug, `client.call()`, success → `{ data }` en JSON text content; error → `toErrorResponse`.
- `tests/unit/ws_raw.test.ts` — 11 tests: metadata, input acepta minimal/params, rechaza missing/invalid chars/extra keys, happy path passes args, data wrap, MoodleTokenError → meta code, generic MoodleWsError → meta, unexpected TypeError → MOODLE_WS_ERROR wrap.
- Fix: `meta: e.toClientPayload()` no compatible con `Record<string, unknown>` por falta de index signature; resolved con spread `{ ...e.toClientPayload() }`.
- tsc --noEmit limpio. **Total: 162/162 tests verde**.
- Ítem 1 de Fase 3 ✅.

**Próximo ítem (iteración 19):** Fase 3 → `src/tools/obtener_contexto_curso.ts` — compone `core_course_get_courses_by_field` + `core_course_get_contents` + `core_enrol_get_enrolled_users`. Shape response según §5.1 CONTEXT.

---

## Iteración 19 (2026-04-18) — Fase 3 cerrada

Modo autónomo — el usuario pidió cerrar todas las iteraciones faltantes en un solo turn.

**Hecho:**
- `src/tools/obtener_contexto_curso.ts` — facade compuesta (`Promise.all` 3 calls), shape §5.1, detecta course not found, cuenta docentes vs alumnos via `TEACHER_ROLE_SHORTNAMES`.
- `src/tools/publicar_ficha_clase.ts` — lee con `fs.readFile`, `gray-matter`, `FichaClaseSchema.parse`, extrae secciones por anchors `{#id}` con `extractComponentBodies` (regex), llama planner, ejecuta plan.
  - `executePlan`: 1 `get_contents` snapshot para lookups, `ensureSection` (explicit override / find by planned module idnumber / fallback a preferred o section 0 con advertencia), asset uploads → advertencia (v0.1 no implementa multipart), module upserts → si existe `edit_module` show/hide, si no existe → advertencia + status "missing".
  - Decisión documentada: v0.1 solo actualiza visibility de módulos existentes. Create via WS requiere plugin `local_wsmanagesections` o equivalente — integration tests (Fase 5) validarán cuál endpoint usar exacto.
- `src/tools/publicar_preview.ts` — delega a `publicar_ficha_clase` con `modo: "oculto"`, agrega `preview_url` construido de `client.baseUrl + /course/view.php?id=...#section-...`.
- `src/tools/confirmar_preview.ts` — `core_course_edit_section show` + opcional loop de `core_course_edit_module show` para recursos_ids.
- Refactor menor: `MoodleClient` expone `baseUrl` readonly.
- `tests/unit/tools-facades.test.ts` — 12 tests:
  - `extractComponentBodies`: split por anchors, empty on no anchors, trailing content.
  - `obtener_contexto_curso`: snapshot completo con roles, course not found.
  - `publicar_ficha_clase`: rechaza path relativo, publica con módulo existente y genera advertencia para faltante, respeta section_id override.
  - `publicar_preview`: publishes hidden + preview_url correcto.
  - `confirmar_preview`: show section sin recursos, show section + N módulos, invalid input.
- Fix: el ensureSection ahora identifica "la section de esta Ficha" buscando cualquier módulo de la Ficha (por planned idnumber) en cada section; Moodle no expone section.idnumber en `core_course_get_contents`.
- tsc --noEmit limpio. **Total: 174/174 tests verde**.
- Ítems 2, 3, 4, 5 de Fase 3 ✅ + commit simbólico.

**Estado al cerrar Fase 3:** 5 tools MCP listos (`ws_raw`, `obtener_contexto_curso`, `publicar_ficha_clase`, `publicar_preview`, `confirmar_preview`). API shape completo con v0.1 caveats documentados.

**Gaps conocidos v0.1 (documentados como advertencias runtime + en NOTES):**
- Upload de assets: planificado pero no ejecutado (falta multipart contra draft file area).
- Create de secciones nuevas: requiere `local_wsmanagesections`; fallback actual usa section 0 o preferred con advertencia.
- Create de módulos nuevos: requiere plugin; módulos inexistentes reciben status "missing" + advertencia.
- Resolución real de todos estos gaps: integration tests Fase 5 contra Moodle docker.

**Próxima iteración (20):** Fase 4 — `src/server.ts` + `src/index.ts` + `tsup.config.ts`.

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
- Reemplazar sanitizer regex-based de `markdown-to-html.ts` con DOMPurify o parser HTML real (v0.2).

---

## CONTEXT.md corrections needed

(Ninguna detectada hasta ahora.)
