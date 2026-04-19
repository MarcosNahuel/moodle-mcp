/**
 * Estilos visuales Italicia para componentes de FichaClase.
 *
 * Paleta tomada de italicia.com (branding real):
 *   - Primary navy: #1e3a8a (blue-900)
 *   - Accent lime: #22c55e (green-500, gradient 74,222,128 → 22,163,74)
 *   - Text ink:    #111827 (gray-900)
 *   - Link blue:   #2563eb (blue-600)
 *   - Font family: Inter + sans-serif fallback
 *
 * Cada preset es un string CSS listo para inyectar como `style="..."` en el
 * `<div>` que envuelve el contenido del componente. Usa la paleta oficial y
 * diferencia tipos de componente por hue, manteniendo el border-left como
 * hint cromático idéntico al estilo Boost de Moodle.
 *
 * Si el usuario pasa `custom_style`, ese CSS crudo gana; si no, usa
 * `estilo` como nombre de preset; si tampoco, se auto-detecta de `tipo`.
 */

export type EstiloPreset =
  | 'default'
  | 'apertura'
  | 'disparador'
  | 'dialogo'
  | 'input'
  | 'vocabulario'
  | 'ejercicio'
  | 'produccion'
  | 'cierre'
  | 'tarea'
  | 'url'
  | 'video'
  | 'audio';

// Base: Inter + Italicia ink + rounded + padding coherente.
const BASE = "padding:1.25em 1.5em; border-radius:12px; margin:1em 0; font-family:Inter,'Inter Fallback','Segoe UI',sans-serif; color:#111827; line-height:1.65;";

export const ESTILO_PRESETS: Record<EstiloPreset, string> = {
  default:
    `${BASE} background:#f9fafb; border-left:4px solid #1e3a8a;`,
  apertura:
    `${BASE} background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%); border-left:4px solid #1e3a8a;`,
  disparador:
    `${BASE} background:linear-gradient(135deg,#dcfce7 0%,#bbf7d0 100%); border-left:4px solid #22c55e;`,
  dialogo:
    `${BASE} background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%); border-left:4px solid #2563eb;`,
  input:
    `${BASE} background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%); border-left:4px solid #2563eb;`,
  vocabulario:
    `${BASE} background:linear-gradient(135deg,#ede9fe 0%,#ddd6fe 100%); border-left:4px solid #6d28d9;`,
  ejercicio:
    `${BASE} background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%); border-left:4px solid #d97706;`,
  produccion:
    `${BASE} background:linear-gradient(135deg,#ffe4e6 0%,#fecdd3 100%); border-left:4px solid #e11d48;`,
  cierre:
    `${BASE} background:#f9fafb; border-left:4px solid #1e3a8a;`,
  tarea:
    `${BASE} background:#f9fafb; border:2px dashed #1e3a8a;`,
  url:
    `${BASE} background:#eff6ff; border-left:4px solid #2563eb;`,
  video:
    `${BASE} background:#fef2f2; border-left:4px solid #dc2626;`,
  audio:
    `${BASE} background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%); border-left:4px solid #2563eb;`,
};

/**
 * Map a raw `componente.tipo` from the Ficha YAML to a preset name.
 */
export function tipoToPreset(tipo: string): EstiloPreset {
  const t = tipo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (t === 'apertura') return 'apertura';
  if (t === 'disparador' || t === 'imagen') return 'disparador';
  if (t === 'dialogo') return 'dialogo';
  if (t === 'input') return 'input';
  if (t === 'vocabulario') return 'vocabulario';
  if (t.startsWith('ejercicio')) return 'ejercicio';
  if (t.startsWith('produccion')) return 'produccion';
  if (t === 'cierre') return 'cierre';
  if (t.startsWith('tarea')) return 'tarea';
  if (t === 'url') return 'url';
  if (t === 'video') return 'video';
  if (t === 'audio') return 'audio';
  return 'default';
}

export function resolveStyle(opts: {
  tipo: string;
  estilo?: string;
  customStyle?: string;
}): string {
  if (opts.customStyle !== undefined && opts.customStyle.trim() !== '') {
    return opts.customStyle.trim();
  }
  if (opts.estilo !== undefined && opts.estilo in ESTILO_PRESETS) {
    return ESTILO_PRESETS[opts.estilo as EstiloPreset];
  }
  return ESTILO_PRESETS[tipoToPreset(opts.tipo)];
}

export function wrapWithStyle(html: string, style: string): string {
  const escaped = style.replace(/"/g, '&quot;');
  return `<div style="${escaped}">${html}</div>`;
}

/**
 * Italicia-branded HTML block for the course summary (capa B).
 * Uses the brand palette directly — no preset indirection.
 */
export function renderCourseSummary(opts: {
  title: string;
  subtitle?: string;
  descriptionHtml: string;
}): string {
  const subtitle = opts.subtitle
    ? `<p style="font-size:1.05rem; color:#1e3a8a; margin:0 0 1em 0; font-weight:500;">${opts.subtitle}</p>`
    : '';
  return `
<div style="font-family:Inter,'Inter Fallback','Segoe UI',sans-serif; color:#111827; line-height:1.65; max-width:860px;">
  <div style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%); color:white; padding:2em 2em 1.75em; border-radius:16px; margin:0 0 1.5em 0;">
    <h2 style="margin:0 0 .25em 0; font-size:1.75rem; font-weight:700; color:white;">${opts.title}</h2>
    <div style="display:inline-block; background:linear-gradient(to right,#4ade80,#16a34a); color:white; padding:.35em .9em; border-radius:999px; font-size:.85rem; font-weight:600; letter-spacing:.02em;">ItalicIA</div>
  </div>
  ${subtitle}
  <div>${opts.descriptionHtml}</div>
</div>`.trim();
}
