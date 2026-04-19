import { describe, it, expect } from 'vitest';
import {
  renderMarkdown,
  sanitizeHtml,
} from '../../src/utils/markdown-to-html.js';

describe('renderMarkdown', () => {
  it('renders basic inline formatting', () => {
    const html = renderMarkdown('**bold** and *italic*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders headings and lists', () => {
    const html = renderMarkdown('# Title\n\n- a\n- b\n');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toMatch(/<ul>\s*<li>a<\/li>\s*<li>b<\/li>\s*<\/ul>/);
  });

  it('preserves image tags for later asset rewriting', () => {
    const html = renderMarkdown('![alt](./assets/img-1.png)');
    expect(html).toContain('<img');
    expect(html).toContain('src="./assets/img-1.png"');
    expect(html).toContain('alt="alt"');
  });

  it('preserves audio tags written as raw HTML', () => {
    const html = renderMarkdown('<audio src="./assets/aud-1.mp3"></audio>');
    expect(html).toContain('<audio');
    expect(html).toContain('src="./assets/aud-1.mp3"');
  });

  it('preserves anchors', () => {
    const html = renderMarkdown('[link](https://example.com)');
    expect(html).toContain('<a href="https://example.com">link</a>');
  });

  it('strips <script> by default', () => {
    const html = renderMarkdown('before<script>alert(1)</script>after');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('before');
    expect(html).toContain('after');
  });

  it('strips <style> by default', () => {
    const html = renderMarkdown('<style>body{display:none}</style>hi');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('display:none');
  });

  it('strips <iframe>', () => {
    const html = renderMarkdown('<iframe src="https://evil"></iframe>');
    expect(html).not.toContain('iframe');
  });

  it('strips self-closing dangerous tags', () => {
    const html = renderMarkdown('<meta http-equiv="refresh" content="0;url=evil">');
    expect(html).not.toContain('<meta');
  });

  it('strips inline event handlers', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).toContain('<img');
    expect(html).toContain('src="x"');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('alert(1)');
  });

  it('neutralises javascript: URLs in href', () => {
    const html = renderMarkdown('<a href="javascript:alert(1)">x</a>');
    expect(html).toContain('<a');
    expect(html).toContain('href="#"');
    expect(html).not.toContain('javascript:');
  });

  it('neutralises javascript: URLs in src', () => {
    const html = renderMarkdown('<iframe-ok></iframe-ok><img src="javascript:bad()" >');
    expect(html).toContain('<img');
    expect(html).toContain('src="#"');
    expect(html).not.toContain('javascript:');
  });

  it('respects sanitize: false for debug', () => {
    const html = renderMarkdown('<script>x</script>', { sanitize: false });
    expect(html).toContain('<script');
  });

  it('supports GFM tables by default', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n');
    expect(html).toContain('<table');
    expect(html).toContain('<th>a</th>');
  });

  it('does not break single newlines by default', () => {
    const html = renderMarkdown('line1\nline2');
    expect(html).not.toContain('<br');
  });

  it('inserts <br> on single newlines when breaks: true', () => {
    const html = renderMarkdown('line1\nline2', { breaks: true });
    expect(html).toContain('<br');
  });
});

describe('sanitizeHtml', () => {
  it('removes nested script blocks', () => {
    expect(sanitizeHtml('a<script>b</script>c')).toBe('ac');
  });

  it('leaves benign tags alone', () => {
    const input = '<p>hi <strong>there</strong></p>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('is idempotent', () => {
    const input = '<p>hi<script>x</script></p>';
    const once = sanitizeHtml(input);
    const twice = sanitizeHtml(once);
    expect(twice).toBe(once);
  });
});
