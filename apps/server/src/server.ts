import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAdaptorServer } from '@hono/node-server';
import type { ServerConfig } from './config';
import { attachGateway } from './gateway';
import { createHttpApp } from './http';
import type { Logger } from './logger';
import { randomRoomCode, systemEntropy } from './rooms/codes';
import { createRegistry, type Clock } from './rooms/registry';

export type RunningServer = {
  readonly port: number;
  /** Tells every client the server is going, then stops listening. Resolves once nothing is left open. */
  close(): Promise<void>;
};

/** `performance.now` never jumps when the machine's date is corrected, which a tick clock could not survive. */
const systemClock: Clock = {
  now: () => performance.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout | undefined),
};

function listen(server: Server, config: ServerConfig): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

/** One process: the built client, the health check and every room, on one port. */
export async function startServer(config: ServerConfig, log: Logger): Promise<RunningServer> {
  const registry = createRegistry({ rules: config.rules, entropy: systemEntropy, clock: systemClock, log, maxRooms: config.maxRooms, newCode: randomRoomCode });
  const health = () => ({ ...registry.stats(), connections: gateway.connections() });
  const app = createHttpApp(config.staticDir, health);
  const server = createAdaptorServer({ fetch: app.fetch }) as Server;
  const gateway = attachGateway(server, { config, registry, clock: systemClock, log });
  const port = await listen(server, config);
  log.info('server.listening', { port, static: config.staticDir !== null });

  return {
    port,
    close() {
      gateway.close('shutdown');
      return new Promise((resolve) => {
        const force = setTimeout(() => server.closeAllConnections(), config.shutdownGraceMs);
        server.close(() => {
          clearTimeout(force);
          log.info('server.closed');
          resolve();
        });
      });
    },
  };
}
