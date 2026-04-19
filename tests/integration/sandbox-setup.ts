import { createMoodleClient } from '../../src/client/moodle-client.js';

/**
 * Integration test sandbox setup helpers.
 *
 * These helpers assume a Moodle instance is already running (typically via
 * `docker compose -f tests/integration/docker-compose.test.yml up -d`).
 * Environment variables drive where it lives:
 *
 *   MOODLE_TEST_URL    — default http://localhost:8081
 *   MOODLE_TEST_TOKEN  — Web Services token with editingteacher perms
 *   MOODLE_TEST_COURSE — optional: reuse this course id instead of creating a fresh one
 *
 * First-run setup inside the sandbox (manual, one-time):
 *   1. Log in as admin (admin / adminpass1!).
 *   2. Site admin → Server → Web services → Enable web services.
 *   3. Site admin → Server → Web services → External services → Enable "Moodle mobile web service"
 *      and add the WS functions this MCP uses (see CONTEXT §9).
 *   4. Site admin → Server → Web services → Manage tokens → create a token for admin,
 *      export as MOODLE_TEST_TOKEN.
 *   5. Create a course shell (or let the test create one via ws_raw).
 *
 * Full automation of steps 1-4 is v0.2 work — CLI `vercel` style setup script.
 */

export interface SandboxEnv {
  url: string;
  token: string;
  courseId: number | undefined;
}

export function readSandboxEnv(): SandboxEnv | null {
  const url = process.env.MOODLE_TEST_URL ?? 'http://localhost:8081';
  const token = process.env.MOODLE_TEST_TOKEN ?? '';
  const courseRaw = process.env.MOODLE_TEST_COURSE;
  if (!token) return null;
  return {
    url,
    token,
    courseId: courseRaw ? Number(courseRaw) : undefined,
  };
}

export function buildSandboxClient(env: SandboxEnv) {
  return createMoodleClient({
    url: env.url,
    token: env.token,
    tokensPerSec: 5,
    timeoutMs: 60_000,
    maxRetries: 2,
    retryMinTimeoutMs: 1000,
  });
}

/**
 * Check the Moodle instance is reachable and the token has enough perms
 * to call `core_webservice_get_site_info`. Returns site info on success,
 * `null` if the sandbox is not usable (test should `.skip`).
 */
export async function probeSandbox(env: SandboxEnv): Promise<{
  sitename: string;
  release: string;
} | null> {
  const client = buildSandboxClient(env);
  try {
    const info = (await client.call('core_webservice_get_site_info', {})) as {
      sitename?: string;
      release?: string;
    };
    if (typeof info.sitename !== 'string' || typeof info.release !== 'string') {
      return null;
    }
    return { sitename: info.sitename, release: info.release };
  } catch {
    return null;
  }
}
