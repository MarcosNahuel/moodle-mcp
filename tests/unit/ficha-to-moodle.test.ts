import { describe, it, expect } from 'vitest';
import {
  planFichaClase,
  type Plan,
  type PlanUpsertPage,
  type PlanUpsertAssignment,
  type PlanUpsertUrl,
  type PlanUploadAsset,
} from '../../src/adapters/ficha-to-moodle.js';
import {
  FichaClaseSchema,
  type FichaClaseInput,
} from '../../src/schemas/ficha-clase.js';
import {
  buildIdnumber,
  buildSectionIdnumber,
} from '../../src/utils/idempotency.js';

function ficha(overrides: Partial<FichaClaseInput> = {}): FichaClaseInput {
  return {
    id: 'italiano-a1-2026-u3-c5',
    tipo: 'clase',
    idioma: 'italiano',
    programa: 'italiano-a1-2026',
    unidad: 3,
    orden: 5,
    duracion_min: 90,
    modalidad: 'virtual',
    perfil_alumno: 'adulto',
    objetivos_observables: ['o1'],
    componentes: [{ id: 'apertura', tipo: 'texto', minutos: 10 }],
    moodle: { course_id: 42 },
    ...overrides,
  };
}

function parse(input: FichaClaseInput) {
  return FichaClaseSchema.parse(input);
}

function plan(input: FichaClaseInput, visible = true, componentContent?: Record<string, string>): Plan {
  return planFichaClase({
    ficha: parse(input),
    visible,
    ...(componentContent ? { componentContent } : {}),
  });
}

describe('planFichaClase — section', () => {
  it('builds section with stable idnumber and default name', () => {
    const p = plan(ficha());
    expect(p.section.idnumber).toBe(buildSectionIdnumber('italiano-a1-2026-u3-c5'));
    expect(p.section.name).toBe('Clase 5 — italiano-a1-2026 u3');
    expect(p.section.preferred_section_id).toBeNull();
    expect(p.section.visible).toBe(true);
  });

  it('propagates preferred_section_id from moodle ref', () => {
    const p = plan(ficha({ moodle: { course_id: 42, section_id_preferido: 7 } }));
    expect(p.section.preferred_section_id).toBe(7);
  });

  it('maps visible=false when publishing hidden / preview', () => {
    const p = plan(ficha(), false);
    expect(p.section.visible).toBe(false);
  });
});

describe('planFichaClase — asset uploads', () => {
  it('does not emit uploads for unused assets', () => {
    const p = plan(
      ficha({
        assets_generados: [
          { id: 'img-1', tipo: 'imagen', path: './a.png' },
          { id: 'unused', tipo: 'audio', path: './u.mp3' },
        ],
        componentes: [
          { id: 'comp', tipo: 'imagen', minutos: 5, asset: 'img-1' },
        ],
      }),
    );
    const uploads = p.operations.filter((o): o is PlanUploadAsset => o.kind === 'upload_asset');
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.asset_id).toBe('img-1');
  });

  it('deduplicates assets referenced by multiple components', () => {
    const p = plan(
      ficha({
        assets_generados: [{ id: 'shared', tipo: 'imagen', path: './s.png' }],
        componentes: [
          { id: 'c1', tipo: 'imagen', minutos: 1, asset: 'shared' },
          { id: 'c2', tipo: 'imagen', minutos: 1, asset: 'shared' },
        ],
      }),
    );
    const uploads = p.operations.filter((o) => o.kind === 'upload_asset');
    expect(uploads).toHaveLength(1);
  });

  it('emits asset uploads before module upserts', () => {
    const p = plan(
      ficha({
        assets_generados: [{ id: 'img-1', tipo: 'imagen', path: './a.png' }],
        componentes: [
          { id: 'comp', tipo: 'imagen', minutos: 5, asset: 'img-1' },
        ],
      }),
    );
    expect(p.operations[0]!.kind).toBe('upload_asset');
    expect(p.operations[1]!.kind).toBe('upsert_page');
  });

  it('emits uploads in Ficha declaration order', () => {
    const p = plan(
      ficha({
        assets_generados: [
          { id: 'a', tipo: 'imagen', path: './a.png' },
          { id: 'b', tipo: 'imagen', path: './b.png' },
          { id: 'c', tipo: 'imagen', path: './c.png' },
        ],
        componentes: [
          { id: 'k1', tipo: 'imagen', minutos: 1, asset: 'c' },
          { id: 'k2', tipo: 'imagen', minutos: 1, asset: 'a' },
          { id: 'k3', tipo: 'imagen', minutos: 1, asset: 'b' },
        ],
      }),
    );
    const uploads = p.operations.filter((o): o is PlanUploadAsset => o.kind === 'upload_asset');
    expect(uploads.map((u) => u.asset_id)).toEqual(['a', 'b', 'c']);
  });
});

describe('planFichaClase — component mapping', () => {
  it('maps plain types to upsert_page', () => {
    const p = plan(
      ficha({
        componentes: [
          { id: 'apertura', tipo: 'texto', minutos: 5 },
          { id: 'd1', tipo: 'dialogo', minutos: 10 },
          { id: 'ex1', tipo: 'ejercicio_cloze', minutos: 5 },
        ],
      }),
    );
    const pages = p.operations.filter((o): o is PlanUpsertPage => o.kind === 'upsert_page');
    expect(pages).toHaveLength(3);
    expect(pages.map((x) => x.component_id)).toEqual(['apertura', 'd1', 'ex1']);
  });

  it('maps tarea_asincronica to upsert_assignment (both spellings)', () => {
    const p = plan(
      ficha({
        componentes: [
          { id: 't1', tipo: 'tarea_asincronica', minutos: 15 },
          { id: 't2', tipo: 'tarea_asincrónica', minutos: 15 },
        ],
      }),
    );
    const assignments = p.operations.filter(
      (o): o is PlanUpsertAssignment => o.kind === 'upsert_assignment',
    );
    expect(assignments).toHaveLength(2);
    expect(assignments.map((a) => a.component_id)).toEqual(['t1', 't2']);
  });

  it('maps url type to upsert_url and reads metadata.url', () => {
    const p = plan(
      ficha({
        componentes: [
          {
            id: 'ext',
            tipo: 'url',
            metadata: { url: 'https://example.com' },
          },
        ],
      }),
    );
    const urls = p.operations.filter((o): o is PlanUpsertUrl => o.kind === 'upsert_url');
    expect(urls).toHaveLength(1);
    expect(urls[0]!.externalurl).toBe('https://example.com');
  });

  it('uses metadata.title as module name when provided', () => {
    const p = plan(
      ficha({
        componentes: [
          {
            id: 'raw-id',
            tipo: 'texto',
            minutos: 5,
            metadata: { title: 'Nice Title' },
          },
        ],
      }),
    );
    const pages = p.operations.filter((o): o is PlanUpsertPage => o.kind === 'upsert_page');
    expect(pages[0]!.name).toBe('Nice Title');
  });

  it('falls back to component id when no metadata.title', () => {
    const p = plan(ficha());
    const pages = p.operations.filter((o): o is PlanUpsertPage => o.kind === 'upsert_page');
    expect(pages[0]!.name).toBe('apertura');
  });

  it('produces a stable idnumber per component', () => {
    const p = plan(ficha());
    const op = p.operations[0] as PlanUpsertPage;
    expect(op.idnumber).toBe(
      buildIdnumber('italiano-a1-2026-u3-c5', 'apertura'),
    );
  });

  it('carries visible flag down to every upsert', () => {
    const p = plan(
      ficha({
        componentes: [
          { id: 'a', tipo: 'texto', minutos: 1 },
          { id: 'b', tipo: 'tarea_asincronica', minutos: 1 },
          { id: 'c', tipo: 'url', metadata: { url: 'https://x' } },
        ],
      }),
      false,
    );
    const upserts = p.operations.filter((o) => o.kind !== 'upload_asset') as Array<
      PlanUpsertPage | PlanUpsertAssignment | PlanUpsertUrl
    >;
    for (const u of upserts) expect(u.visible).toBe(false);
  });

  it('fills content_markdown from componentContent map', () => {
    const p = plan(ficha(), true, { apertura: '# Saludo\n\nCiao!' });
    const page = p.operations[0] as PlanUpsertPage;
    expect(page.content_markdown).toBe('# Saludo\n\nCiao!');
  });

  it('defaults content_markdown to empty when key is absent', () => {
    const p = plan(ficha());
    const page = p.operations[0] as PlanUpsertPage;
    expect(page.content_markdown).toBe('');
  });

  it('records asset_refs on pages that reference an asset', () => {
    const p = plan(
      ficha({
        assets_generados: [{ id: 'img-1', tipo: 'imagen', path: './a.png' }],
        componentes: [
          { id: 'apertura', tipo: 'texto', minutos: 5 },
          { id: 'img', tipo: 'imagen', minutos: 5, asset: 'img-1' },
        ],
      }),
    );
    const pages = p.operations.filter((o): o is PlanUpsertPage => o.kind === 'upsert_page');
    expect(pages[0]!.asset_refs).toEqual([]);
    expect(pages[1]!.asset_refs).toEqual(['img-1']);
  });

  it('preserves component declaration order', () => {
    const p = plan(
      ficha({
        componentes: [
          { id: 'a', tipo: 'texto', minutos: 1 },
          { id: 'b', tipo: 'texto', minutos: 1 },
          { id: 'c', tipo: 'texto', minutos: 1 },
        ],
      }),
    );
    const ids = p.operations
      .filter((o): o is PlanUpsertPage => o.kind === 'upsert_page')
      .map((o) => o.component_id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});
