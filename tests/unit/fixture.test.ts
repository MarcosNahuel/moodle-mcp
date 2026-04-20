import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { FichaClaseSchema } from '../../src/schemas/ficha-clase.js';
import { extractComponentBodies } from '../../src/tools/contenido/publicar_ficha_clase.js';
import { planFichaClase } from '../../src/adapters/ficha-to-moodle.js';

const fixturePath = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'ficha-clase-ejemplo.md',
);

describe('fixture ficha-clase-ejemplo.md', () => {
  const raw = readFileSync(fixturePath, 'utf8');
  const parsed = matter(raw);

  it('frontmatter validates against FichaClaseSchema', () => {
    const ficha = FichaClaseSchema.parse(parsed.data);
    expect(ficha.id).toBe('italiano-a1-2026-u3-c5');
    expect(ficha.componentes).toHaveLength(8);
    expect(ficha.assets_generados).toHaveLength(2);
  });

  it('body has an anchor for every componente', () => {
    const ficha = FichaClaseSchema.parse(parsed.data);
    const bodies = extractComponentBodies(parsed.content);
    for (const c of ficha.componentes) {
      expect(bodies).toHaveProperty(c.id);
      expect(bodies[c.id]!.length).toBeGreaterThan(0);
    }
  });

  it('plan emits exactly 10 operations (2 assets used + 8 components)', () => {
    const ficha = FichaClaseSchema.parse(parsed.data);
    const bodies = extractComponentBodies(parsed.content);
    const plan = planFichaClase({ ficha, visible: false, componentContent: bodies });
    const uploads = plan.operations.filter((o) => o.kind === 'upload_asset');
    const upserts = plan.operations.filter((o) => o.kind !== 'upload_asset');
    expect(uploads).toHaveLength(2);
    expect(upserts).toHaveLength(8);
  });
});
