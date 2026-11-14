import { loadConfig, type ServerConfig } from './config';
import { createLogger } from './logger';
import { startServer } from './server';

const FAILURE = 1;

function readConfig(): ServerConfig {
  try {
    return loadConfig(process.env);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(FAILURE);
  }
}

const config = readConfig();
const log = createLogger(config.logLevel);

try {
  const server = await startServer(config, log);
  let closing = false;
  const stop = (signal: string): void => {
    if (closing) return;
    closing = true;
    log.info('server.stopping', { signal });
    void server.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
} catch (error) {
  log.error('server.failed', { reason: error instanceof Error ? error.message : 'unknown' });
  process.exit(FAILURE);
}
