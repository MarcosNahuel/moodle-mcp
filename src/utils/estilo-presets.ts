/**
 * Estilos visuales Italicia para componentes de FichaClase.
 *
 * Cada preset es un string CSS listo para inyectar como `style="..."` en el
 * `<div>` que envuelve el contenido del componente. La paleta está pensada
 * para ser legible tanto en el theme Boost default como en themes custom:
 * colores con contraste AAA sobre fondo blanco y border-left como hint
 * cromático para poder identificar el tipo de componente de un vistazo.
 *
 * Presets cubren los `tipo` más comunes del schema FichaClase; tipos
 * desconocidos caen a `default`. El usuario puede override con
 * `custom_style` en el YAML frontmatter del componente.
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

const BASE_STYLE = 'padding:1.25em 1.5em; border-radius:12px; margin:1em 0;';

export const ESTILO_PRESETS: Record<EstiloPreset, string> = {
  default: `${BASE_STYLE} background:#f9fafb; border-left:4px solid #9ca3af;`,
  apertura: `${BASE_STYLE} background:linear-gradient(135deg,#fef3c7,#fde68a); border-left:4px solid #f59e0b;`,
  disparador: `${BASE_STYLE} background:linear-gradient(135deg,#ffedd5,#fed7aa); border-left:4px solid #ea580c;`,
  dialogo: `${BASE_STYLE} background:linear-gradient(135deg,#dbeafe,#bfdbfe); border-left:4px solid #2563eb;`,
  input: `${BASE_STYLE} background:linear-gradient(135deg,#dbeafe,#bfdbfe); border-left:4px solid #2563eb;`,
  vocabulario: `${BASE_STYLE} background:linear-gradient(135deg,#ede9fe,#ddd6fe); border-left:4px solid #7c3aed;`,
  ejercicio: `${BASE_STYLE} background:linear-gradient(135deg,#dcfce7,#bbf7d0); border-left:4px solid #16a34a;`,
  produccion: `${BASE_STYLE} background:linear-gradient(135deg,#fce7f3,#fbcfe8); border-left:4px solid #db2777;`,
  cierre: `${BASE_STYLE} background:#f3f4f6; border-left:4px solid #6b7280;`,
  tarea: `${BASE_STYLE} background:#f9fafb; border:2px dashed #9ca3af;`,
  url: `${BASE_STYLE} background:#eff6ff; border-left:4px solid #3b82f6;`,
  video: `${BASE_STYLE} background:#fef2f2; border-left:4px solid #dc2626;`,
  audio: `${BASE_STYLE} background:linear-gradient(135deg,#dbeafe,#bfdbfe); border-left:4px solid #2563eb;`,
};

/**
 * Map a raw `componente.tipo` from the Ficha YAML to a preset name.
 * Accents and variants (ejercicio_cloze, produccion_oral, tarea_asincrónica)
 * normalise to their base preset.
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

/**
 * Resolve the CSS for a component. `customStyle` wins; then `estilo` preset
 * name; then auto-detect from `tipo`.
 */
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

/**
 * Wrap HTML content in a styled div. Escapes the style attribute value
 * to prevent breakout. Does not touch the content itself (caller is
 * responsible for sanitising markdown output).
 */
export function wrapWithStyle(html: string, style: string): string {
  const escaped = style.replace(/"/g, '&quot;');
  return `<div style="${escaped}">${html}</div>`;
}
