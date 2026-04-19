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
