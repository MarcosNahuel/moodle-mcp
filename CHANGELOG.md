# Changelog

All notable changes to `@nahuelalbornoz/moodle-mcp` (wrapper TS) and `local_italiciamcp` (plugin PHP) are documented here.
Follows [Keep a Changelog](https://keepachangelog.com/).

## Plugin `local_italiciamcp` v0.5.0 — 2026-05-03

### Fixed
- **`add_questions_gift`**: contrato roto desde v0.4.x. El wrapper enviaba `quiz_idnumber` y `append`, el plugin esperaba `quizidnumber` y no declaraba `append`. Resultado: 100% de las llamadas fallaban con `invalid_parameter_exception`. Ahora acepta ambos nombres de idnumber y declara `append` con default 1.

### Added
- **`add_questions_gift`**: nuevo modo `append=0` para crear preguntas en el banco sin attacharlas a un quiz específico (útil para preparar bancos reusables).
- **`add_questions_gift`**: campos nuevos en el response (`created`, `existing`, `appended`, `category_id`) para que el wrapper TS pueda mapear sin parsear `imported`.

### Migration notes
- El plugin sigue siendo backwards-compat: scripts viejos que envían `quizidnumber` siguen funcionando.
- Wrapper `@nahuelalbornoz/moodle-mcp` debe bumpearse a v0.5.2 también para aprovechar el response nuevo.

---

## [0.5.0] — 2026-04-20

### Added — 35 new tools, covering ~80% of the teaching workflow

**Curso (5 new):** `crear_curso`, `actualizar_curso`, `duplicar_curso`, `archivar_curso`, `listar_mis_cursos`.

**Secciones (5 new):** `crear_seccion`, `actualizar_seccion`, `ocultar_seccion`, `liberar_seccion`, `reordenar_secciones`.

**Contenido (fix + 2 new):**
- `publicar_ficha_clase` now **uploads asset files** (images/audios) via `local_italiciamcp_upload_file` and rewrites markdown `./assets/...` refs to the Moodle pluginfile URLs (Phase 2a).
- Auto-creates **`mod_url`** and **`mod_assign`** modules via new plugin endpoints (Phase 2b/2c).

**Evaluación (3 new):** `publicar_ficha_examen` (one-shot upsert_quiz + GIFT import + repair_sections + promote_questions), `configurar_quiz`, `importar_gift`.

**Alumnos (7 new):** `listar_alumnos`, `matricular_csv` (creates missing users with temp passwords + batched enrol), `dar_baja`, `crear_grupo`, `asignar_a_grupo`, `cambiar_rol`, `reset_password`.

**Gradebook (5 new):** `obtener_calificaciones`, `obtener_completion`, `obtener_intentos_quiz`, `obtener_entregas_assign`, `calificar_manualmente`.

**Comunicación (4 new):** `enviar_mensaje_moodle`, `crear_anuncio_foro` (auto-resolves news forum), `obtener_logs_curso` (derived from enrolment access times — Moodle core exposes no log WS), `obtener_info_sitio`.

**Calendario (4 new):** `crear_evento_calendario`, `listar_eventos_calendario`, `actualizar_evento`, `eliminar_evento`.

**Badges (1 new, read-only):** `listar_badges_usuario`.

### Plugin companion — `local_italiciamcp` v0.4.1

- New endpoint `upsert_url` (mod_url create/update by idnumber).
- New endpoint `upsert_assignment` (mod_assign create/update by idnumber, with submission plugins seeded).
- Requires redeploy in the Moodle admin and adding the two new functions to the external service the token belongs to.

### Refactor

- `src/tools/` reorganized into per-family subfolders (`curso/`, `secciones/`, `contenido/`, etc). Legacy imports updated via `git mv` so history is preserved.
- New `src/tools/_common/` with shared `buildIdnumber()`, `setSectionVisibility`, and `setModuleVisibility` helpers.

### Tests

- 270 unit tests pass (vs 14 in v0.4). Coverage stays ≥80% across src/.
- No regression to existing `publicar_ficha_clase` / `generate_video` / core client tests.

### Known deferred to v0.6

These six facades need new plugin endpoints (not yet in `local_italiciamcp`):

- `duplicar_seccion` — Moodle core has no `core_course_duplicate_section` WS.
- `crear_banco_preguntas` — no `core_question_category_create_category` in core.
- `editar_preguntas_banco` — same.
- `liberar_quiz` / `ocultar_quiz` — no `core_course_edit_module` in core service.
- `otorgar_badge` — only `core_badges_get_user_badges` is exposed; award is not.

See `italiacia_whatsapp/moodle/decisiones-y-lecciones.md` for the full rationale (lessons L4–L13).

## [0.4.0] — 2026-04-19

### Added
- `generate_video` tool — generates didactic videos via Google Gemini Veo 3.1, uploads + embeds in a `mod_page` in one call.
- Plugin companion v0.3.8 — fixes `quiz_sections` to resolve the `noquestionsfound` attempt bug.

## [0.3.x] — 2026-04-18 → 2026-04-19 (plugin iteration)

- v0.3.0: `local_italiciamcp_upload_file` + pluginfile callback.
- v0.3.1: italicia.com palette styling + plugin 0.2.0 (course summary + quiz shell).
- v0.3.2: auto-create sections via `local_wsmanagesections`.
- v0.3.5: `add_questions_gift` + persist `idnumber` after `add_course_module`.
- v0.3.8: fix quiz attempts `noquestionsfound` via `repair_quiz_sections` + `promote_quiz_questions`.

## [0.1.0–0.1.2] — 2026-04-18

- Initial MVP: 5 tools (`obtener_contexto_curso`, `publicar_ficha_clase`, `publicar_preview`, `confirmar_preview`, `ws_raw`) + styled pages + section visibility via `local_wsmanagesections`.
