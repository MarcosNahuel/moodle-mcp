import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadConfig, ConfigError } from './config.js';
import { createMoodleClient } from './client/moodle-client.js';
import { createLogger } from './utils/logger.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    const msg = e instanceof ConfigError ? e.message : (e as Error).message;
    process.stderr.write(`moodle-mcp: ${msg}\n`);
    process.exit(2);
  }

  const logger = createLogger({
    level: config.logLevel,
    redact: [config.moodleWsToken],
  });

  const client = createMoodleClient({
    url: config.moodleUrl,
    token: config.moodleWsToken,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    tokensPerSec: config.rateLimitPerSec,
  });

  const server = buildServer({ client, logger });

  const transport = new StdioServerTransport();

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutdown.start', { signal });
    try {
      await server.close();
    } catch (e) {
      logger.warn('shutdown.close_failed', { error: (e as Error).message });
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('server.start', {
    moodle_url: config.moodleUrl,
    log_level: config.logLevel,
  });

  await server.connect(transport);
}

main().catch((e: unknown) => {
  process.stderr.write(`moodle-mcp: fatal: ${(e as Error).message}\n`);
  process.exit(1);
});
