// Smoke test que debe FALLAR contra plugin v0.4.11 y PASAR contra v0.5.0.
// Reproduce el bug exacto: wrapper envía quiz_idnumber + append.
import { describe, it, expect } from 'vitest';
import https from 'node:https';

const URL = process.env.MOODLE_URL || 'https://aula.italicia.com';
const TOKEN = process.env.MOODLE_WS_TOKEN;

if (!TOKEN) {
  throw new Error('MOODLE_WS_TOKEN env var required');
}

function ws(fn, params) {
  return new Promise((resolve, reject) => {
    const parts = [`wstoken=${TOKEN}`, `wsfunction=${fn}`, 'moodlewsrestformat=json'];
    for (const [k, v] of Object.entries(params)) parts.push(`${k}=${encodeURIComponent(v)}`);
    const body = parts.join('&');
    const req = https.request(`${URL}/webservice/rest/server.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { reject(new Error(`Bad JSON: ${d.slice(0, 400)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

describe('add_questions_gift contract (against live aula.italicia.com)', () => {
  it('accepts the wrapper-shaped params (quiz_idnumber + append)', async () => {
    // El cmid 95 es el quiz vacío de Unità 5 C1 — sirve como target.
    // Si v0.4.11: devuelve invalid_parameter_exception.
    // Si v0.5.0: devuelve { action: 'imported', imported: >=1, ... }.
    const res = await ws('local_italiciamcp_add_questions_gift', {
      courseid: 3,
      quiz_idnumber: 'quiz-c1-unita5',
      gift: '::SmokeTest:: ¿2+2? {=4 ~3 ~5}',
      category_name: 'SmokeTest v0.5.0',
      append: 1,
    });

    expect(res.exception).toBeUndefined();
    expect(res.imported).toBeGreaterThanOrEqual(1);
    expect(res.action).toBe('imported');
    expect(typeof res.cmid).toBe('number');
  }, 30_000);
});
