import { z } from 'zod';

/**
 * Zod schema for a FichaClase — the canonical pedagogical lesson contract
 * this MCP consumes. Mirrors CONTEXT.md §7.1.
 *
 * Strict keys: unknown top-level properties are rejected so that typos in
 * the YAML frontmatter fail fast at publish time rather than silently.
 *
 * Cross-field checks enforced via `superRefine`:
 *   - asset ids are unique
 *   - component ids are unique
 *   - every `componente.asset` reference resolves to a known asset id
 */

export const IDIOMAS = ['italiano', 'portugues'] as const;
export type Idioma = (typeof IDIOMAS)[number];

export const MODALIDADES = ['virtual', 'presencial', 'hibrida'] as const;
export type Modalidad = (typeof MODALIDADES)[number];

export const PERFILES_ALUMNO = ['adulto', 'adolescente', 'universitario'] as const;
export type PerfilAlumno = (typeof PERFILES_ALUMNO)[number];

export const ASSET_TIPOS = [
  'imagen',
  'audio',
  'audio_dialogo',
  'video',
  'documento',
] as const;
export type AssetTipo = (typeof ASSET_TIPOS)[number];

/**
 * Known component kinds. `tipo` is a free string so new kinds can be added
 * without a breaking schema change; this constant is exported for tooling
 * and documentation, not for validation.
 */
export const COMPONENTE_TIPOS_CONOCIDOS = [
  'texto',
  'imagen',
  'dialogo',
  'ejercicio_cloze',
  'ejercicio_opcion_multiple',
  'ejercicio_verdadero_falso',
  'ejercicio_matching',
  'produccion_oral',
  'produccion_escrita',
  'vocabulario',
  'tarea_asincronica',
  'video',
  'audio',
  'url',
] as const;

const nonEmpty = z.string().min(1);

export const VocabularioItemSchema = z
  .object({
    it: z.string().optional(),
    pt: z.string().optional(),
    es: nonEmpty,
    ipa: z.string().optional(),
    notas: z.string().optional(),
  })
  .passthrough();
export type VocabularioItem = z.infer<typeof VocabularioItemSchema>;

export const AssetGeneradoSchema = z
  .object({
    id: nonEmpty,
    tipo: z.enum(ASSET_TIPOS),
    path: nonEmpty,
    autor: z.string().optional(),
    licencia: z.string().optional(),
  })
  .strict();
export type AssetGenerado = z.infer<typeof AssetGeneradoSchema>;

export const ComponenteSchema = z
  .object({
    id: nonEmpty,
    tipo: nonEmpty,
    minutos: z.number().int().positive().optional(),
    asset: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();
export type Componente = z.infer<typeof ComponenteSchema>;

export const MoodleRefSchema = z
  .object({
    course_id: z.number().int().positive(),
    section_id_preferido: z.number().int().positive().nullable().optional(),
  })
  .strict();
export type MoodleRef = z.infer<typeof MoodleRefSchema>;

const FichaClaseBase = z
  .object({
    id: nonEmpty,
    tipo: z.literal('clase'),
    idioma: z.enum(IDIOMAS),
    programa: nonEmpty,
    unidad: z.number().int().nonnegative(),
    orden: z.number().int().nonnegative(),
    duracion_min: z.number().int().positive(),
    modalidad: z.enum(MODALIDADES),
    perfil_alumno: z.enum(PERFILES_ALUMNO),
    competencias_activadas: z.array(nonEmpty).default([]),
    competencias_prerequisito: z.array(nonEmpty).default([]),
    objetivos_observables: z.array(nonEmpty).min(1),
    vocabulario: z.array(VocabularioItemSchema).default([]),
    estructuras: z.array(nonEmpty).default([]),
    assets_generados: z.array(AssetGeneradoSchema).default([]),
    componentes: z.array(ComponenteSchema).min(1),
    moodle: MoodleRefSchema,
  })
  .strict();

export const FichaClaseSchema = FichaClaseBase.superRefine((data, ctx) => {
  const assetIds = new Set<string>();
  for (const a of data.assets_generados) {
    if (assetIds.has(a.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assets_generados'],
        message: `Duplicate asset id: ${a.id}`,
      });
    }
    assetIds.add(a.id);
  }
  const compIds = new Set<string>();
  for (const c of data.componentes) {
    if (compIds.has(c.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['componentes'],
        message: `Duplicate component id: ${c.id}`,
      });
    }
    compIds.add(c.id);
    if (c.asset !== undefined && !assetIds.has(c.asset)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['componentes'],
        message: `Component '${c.id}' references missing asset: '${c.asset}'`,
      });
    }
  }
});

export type FichaClase = z.infer<typeof FichaClaseSchema>;

/**
 * Input type — what callers must supply. Has optionals for fields with
 * defaults; the parsed output (`FichaClase`) has them as required arrays.
 */
export type FichaClaseInput = z.input<typeof FichaClaseSchema>;
