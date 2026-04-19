import { describe, it, expect } from 'vitest';
import {
  FichaClaseSchema,
  IDIOMAS,
  MODALIDADES,
  PERFILES_ALUMNO,
  type FichaClaseInput,
} from '../../src/schemas/ficha-clase.js';

function validFicha(overrides: Partial<FichaClaseInput> = {}): FichaClaseInput {
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
    objetivos_observables: ['presentar_familia_propia_oral'],
    componentes: [
      { id: 'apertura', tipo: 'texto', minutos: 10 },
      { id: 'cierre', tipo: 'texto', minutos: 5 },
    ],
    moodle: { course_id: 42 },
    ...overrides,
  };
}

describe('FichaClaseSchema — happy paths', () => {
  it('accepts a minimal valid ficha', () => {
    const parsed = FichaClaseSchema.parse(validFicha());
    expect(parsed.id).toBe('italiano-a1-2026-u3-c5');
    expect(parsed.competencias_activadas).toEqual([]);
    expect(parsed.assets_generados).toEqual([]);
  });

  it('accepts a full ficha with assets and component references', () => {
    const parsed = FichaClaseSchema.parse(
      validFicha({
        assets_generados: [
          { id: 'img-1', tipo: 'imagen', path: './assets/img-1.png', autor: 'gemini' },
          { id: 'aud-1', tipo: 'audio_dialogo', path: './assets/aud-1.mp3' },
        ],
        componentes: [
          { id: 'apertura', tipo: 'texto', minutos: 10 },
          { id: 'disparador-1', tipo: 'imagen', minutos: 5, asset: 'img-1' },
          { id: 'input-1', tipo: 'dialogo', minutos: 15, asset: 'aud-1' },
          { id: 'cierre', tipo: 'texto', minutos: 5 },
        ],
        vocabulario: [{ it: 'famiglia', es: 'familia', ipa: 'ˈfamiʎʎa' }],
        competencias_activadas: ['comp-23', 'comp-24'],
      }),
    );
    expect(parsed.assets_generados).toHaveLength(2);
    expect(parsed.componentes[1]!.asset).toBe('img-1');
  });

  it('accepts all idiomas', () => {
    for (const idioma of IDIOMAS) {
      expect(() => FichaClaseSchema.parse(validFicha({ idioma }))).not.toThrow();
    }
  });

  it('accepts all modalidades and perfiles', () => {
    for (const modalidad of MODALIDADES) {
      expect(() => FichaClaseSchema.parse(validFicha({ modalidad }))).not.toThrow();
    }
    for (const perfil_alumno of PERFILES_ALUMNO) {
      expect(() =>
        FichaClaseSchema.parse(validFicha({ perfil_alumno })),
      ).not.toThrow();
    }
  });

  it('accepts moodle.section_id_preferido as null', () => {
    const parsed = FichaClaseSchema.parse(
      validFicha({ moodle: { course_id: 42, section_id_preferido: null } }),
    );
    expect(parsed.moodle.section_id_preferido).toBeNull();
  });
});

describe('FichaClaseSchema — rejections', () => {
  it('rejects missing id', () => {
    const bad = validFicha();
    // @ts-expect-error -- deliberate
    delete bad.id;
    expect(() => FichaClaseSchema.parse(bad)).toThrow();
  });

  it('rejects tipo other than "clase"', () => {
    expect(() =>
      FichaClaseSchema.parse(validFicha({ tipo: 'examen' as never })),
    ).toThrow();
  });

  it('rejects unknown idioma', () => {
    expect(() =>
      FichaClaseSchema.parse(validFicha({ idioma: 'espanol' as never })),
    ).toThrow();
  });

  it('rejects empty componentes', () => {
    expect(() => FichaClaseSchema.parse(validFicha({ componentes: [] }))).toThrow();
  });

  it('rejects empty objetivos_observables', () => {
    expect(() =>
      FichaClaseSchema.parse(validFicha({ objetivos_observables: [] })),
    ).toThrow();
  });

  it('rejects unknown top-level key (strict)', () => {
    expect(() =>
      FichaClaseSchema.parse({ ...validFicha(), foo: 'bar' }),
    ).toThrow();
  });

  it('rejects non-positive duracion_min', () => {
    expect(() =>
      FichaClaseSchema.parse(validFicha({ duracion_min: 0 })),
    ).toThrow();
  });

  it('rejects non-positive course_id', () => {
    expect(() =>
      FichaClaseSchema.parse(
        validFicha({ moodle: { course_id: 0 } }),
      ),
    ).toThrow();
  });
});

describe('FichaClaseSchema — cross-field rules', () => {
  it('rejects duplicate asset ids', () => {
    expect(() =>
      FichaClaseSchema.parse(
        validFicha({
          assets_generados: [
            { id: 'x', tipo: 'imagen', path: 'a.png' },
            { id: 'x', tipo: 'imagen', path: 'b.png' },
          ],
        }),
      ),
    ).toThrow(/Duplicate asset id/);
  });

  it('rejects duplicate component ids', () => {
    expect(() =>
      FichaClaseSchema.parse(
        validFicha({
          componentes: [
            { id: 'dup', tipo: 'texto', minutos: 5 },
            { id: 'dup', tipo: 'texto', minutos: 5 },
          ],
        }),
      ),
    ).toThrow(/Duplicate component id/);
  });

  it('rejects component referencing missing asset', () => {
    expect(() =>
      FichaClaseSchema.parse(
        validFicha({
          assets_generados: [{ id: 'exists', tipo: 'imagen', path: 'x.png' }],
          componentes: [
            { id: 'c1', tipo: 'imagen', minutos: 5, asset: 'ghost' },
          ],
        }),
      ),
    ).toThrow(/missing asset/);
  });

  it('accepts component with asset when asset exists', () => {
    expect(() =>
      FichaClaseSchema.parse(
        validFicha({
          assets_generados: [{ id: 'a1', tipo: 'imagen', path: 'x.png' }],
          componentes: [
            { id: 'c1', tipo: 'imagen', minutos: 5, asset: 'a1' },
          ],
        }),
      ),
    ).not.toThrow();
  });
});
