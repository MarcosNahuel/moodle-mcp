import { marked } from 'marked';

/**
 * Convert Ficha body markdown into HTML fragments suitable for Moodle page
 * modules. Sanitisation is conservative and on-by-default: script, style,
 * iframe and friends are stripped; event handlers (`onerror=`, `onclick=`,
 * …) and `javascript:` URLs are neutralised. Benign embeds the Ficha
 * contract expects — `<img>`, `<audio>`, `<video>`, `<source>`, `<a>`,
 * headings, lists — pass through untouched so the publication layer can
 * later rewrite asset paths.
 *
 * Note: regex-based sanitisation is not a hardened XSS defence. v0.2 will
 * likely replace it with DOMPurify or a proper HTML parser. For v0.1 it is
 * defence-in-depth on top of Moodle's own filters — the trust boundary is
 * the authored Ficha markdown file, which is checked into Git.
 */

export interface RenderOptions {
  /** Default `true`. If `false`, returns marked's raw output (tests/debug only). */
  sanitize?: boolean;
  /** Default `true`. Enables GFM (tables, strikethrough, task lists). */
  gfm?: boolean;
  /** Default `false`. If `true`, single `\n` becomes `<br>`. */
  breaks?: boolean;
}

const DANGEROUS_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'link',
  'meta',
  'base',
] as const;

const DANGEROUS_TAG_PAIRED_RE = new RegExp(
  `<(${DANGEROUS_TAGS.join('|')})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`,
  'gi',
);
const DANGEROUS_TAG_SELF_RE = new RegExp(
  `<\\/?(${DANGEROUS_TAGS.join('|')})\\b[^>]*\\/?>`,
  'gi',
);
const EVENT_HANDLER_RE = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL_RE =
  /\b(href|src|formaction|action|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi;

export function sanitizeHtml(html: string): string {
  return html
    .replace(DANGEROUS_TAG_PAIRED_RE, '')
    .replace(DANGEROUS_TAG_SELF_RE, '')
    .replace(EVENT_HANDLER_RE, '')
    .replace(JS_URL_RE, '$1="#"');
}

export function renderMarkdown(
  markdown: string,
  opts: RenderOptions = {},
): string {
  const gfm = opts.gfm ?? true;
  const breaks = opts.breaks ?? false;
  const sanitize = opts.sanitize ?? true;
  // marked v14: `async: false` forces sync return; assertion is safe.
  const html = marked.parse(markdown, { async: false, gfm, breaks }) as string;
  return sanitize ? sanitizeHtml(html) : html;
}
