import {
  type AssetGenerado,
  type AssetTipo,
  type Componente,
  type FichaClase,
} from '../schemas/ficha-clase.js';
import {
  buildIdnumber,
  buildSectionIdnumber,
} from '../utils/idempotency.js';

/**
 * Pure mapping layer: turns a validated {@link FichaClase} into a list of
 * Moodle-side operations *without executing any of them*. Keeping this
 * logic side-effect-free lets us unit-test mapping rules in isolation and
 * makes the tool layer (`publicar_ficha_clase`) a thin executor.
 */

export interface PlanInput {
  /** The validated Ficha. */
  ficha: FichaClase;
  /** Publish visible (true) or hidden / preview (false). */
  visible: boolean;
  /**
   * Optional markdown bodies keyed by `componente.id`. The tool layer is
   * expected to extract these by `{#id}` anchors from the Ficha markdown
   * body and pass them in. Missing keys default to an empty string.
   */
  componentContent?: Record<string, string>;
}

export interface SectionPlan {
  idnumber: string;
  name: string;
  summary: string;
  preferred_section_id: number | null;
  visible: boolean;
}

export interface PlanUploadAsset {
  kind: 'upload_asset';
  asset_id: string;
  asset_path: string;
  asset_tipo: AssetTipo;
}

export interface PlanUpsertPage {
  kind: 'upsert_page';
  idnumber: string;
  component_id: string;
  name: string;
  content_markdown: string;
  visible: boolean;
  /** Asset ids referenced by this page. The executor rewrites markdown asset paths to Moodle URLs. */
  asset_refs: string[];
}

export interface PlanUpsertAssignment {
  kind: 'upsert_assignment';
  idnumber: string;
  component_id: string;
  name: string;
  description_markdown: string;
  visible: boolean;
}

export interface PlanUpsertUrl {
  kind: 'upsert_url';
  idnumber: string;
  component_id: string;
  name: string;
  externalurl: string;
  visible: boolean;
}

export type PlanOperation =
  | PlanUploadAsset
  | PlanUpsertPage
  | PlanUpsertAssignment
  | PlanUpsertUrl;

export interface Plan {
  section: SectionPlan;
  operations: PlanOperation[];
}

type ModuleKind = 'page' | 'assignment' | 'url';

function componentKind(tipo: string): ModuleKind {
  if (tipo === 'tarea_asincronica' || tipo === 'tarea_asincrónica') {
    return 'assignment';
  }
  if (tipo === 'url') return 'url';
  return 'page';
}

function componentName(c: Componente): string {
  const md = c.metadata;
  if (md && typeof md === 'object' && typeof (md as { title?: unknown }).title === 'string') {
    const title = (md as { title: string }).title.trim();
    if (title !== '') return title;
  }
  return c.id;
}

function extractExternalUrl(c: Componente): string {
  const md = c.metadata;
  if (md && typeof md === 'object' && typeof (md as { url?: unknown }).url === 'string') {
    return (md as { url: string }).url;
  }
  return '';
}

function sectionName(ficha: FichaClase): string {
  return `Clase ${ficha.orden} — ${ficha.programa} u${ficha.unidad}`;
}

/**
 * Compute the plan. Operation ordering reflects execution order:
 *   1. upload every asset that is referenced by at least one component
 *      (unused assets are skipped — no point uploading them to Moodle)
 *   2. one `upsert_*` per component, in the order declared in the Ficha
 *
 * The `section` lives outside `operations` because it is always needed and
 * because the executor typically creates/updates it before or after the
 * module operations depending on the Moodle plugin setup available.
 */
export function planFichaClase(input: PlanInput): Plan {
  const { ficha, visible } = input;
  const content = input.componentContent ?? {};

  const assetMap = new Map<string, AssetGenerado>(
    ficha.assets_generados.map((a) => [a.id, a]),
  );
  const usedAssetIds = new Set<string>();
  for (const c of ficha.componentes) {
    if (c.asset !== undefined) usedAssetIds.add(c.asset);
  }

  const operations: PlanOperation[] = [];

  // 1. asset uploads (in the order assets appear in the Ficha)
  for (const a of ficha.assets_generados) {
    if (!usedAssetIds.has(a.id)) continue;
    operations.push({
      kind: 'upload_asset',
      asset_id: a.id,
      asset_path: a.path,
      asset_tipo: a.tipo,
    });
  }

  // 2. one upsert per component
  for (const c of ficha.componentes) {
    const idnumber = buildIdnumber(ficha.id, c.id);
    const name = componentName(c);
    const kind = componentKind(c.tipo);
    const body = content[c.id] ?? '';
    const refs = c.asset !== undefined ? [c.asset] : [];

    if (kind === 'assignment') {
      operations.push({
        kind: 'upsert_assignment',
        idnumber,
        component_id: c.id,
        name,
        description_markdown: body,
        visible,
      });
      continue;
    }
    if (kind === 'url') {
      operations.push({
        kind: 'upsert_url',
        idnumber,
        component_id: c.id,
        name,
        externalurl: extractExternalUrl(c),
        visible,
      });
      continue;
    }
    operations.push({
      kind: 'upsert_page',
      idnumber,
      component_id: c.id,
      name,
      content_markdown: body,
      visible,
      asset_refs: refs,
    });
  }

  return {
    section: {
      idnumber: buildSectionIdnumber(ficha.id),
      name: sectionName(ficha),
      summary: '',
      preferred_section_id: ficha.moodle.section_id_preferido ?? null,
      visible,
    },
    operations,
  };
}
