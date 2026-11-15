const DEFAULT_PORT = 5183;
const DEFAULT_SERVER_PORT = 8787;
const MAX_PORT = 65535;

type Env = Readonly<Record<string, string | undefined>>;

// The client has no Node typings, and these configs only ever run under Node.
const nodeEnv = (): Env => (globalThis as { process?: { env: Env } }).process?.env ?? {};

function portFrom(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`${name} must be an integer from 1 to ${MAX_PORT}, got "${raw}"`);
  }
  return port;
}

/** `HOOKWARS_PORT` lets two checkouts run their dev servers and Playwright side by side. */
export function devPort(env: Env = nodeEnv()): number {
  return portFrom(env, 'HOOKWARS_PORT', DEFAULT_PORT);
}

/** Where the dev server finds the game server to pass `/ws` on to. The game server reads the same variable as `PORT`. */
export function serverPort(env: Env = nodeEnv()): number {
  return portFrom(env, 'HOOKWARS_SERVER_PORT', DEFAULT_SERVER_PORT);
}
