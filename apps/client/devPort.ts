const DEFAULT_PORT = 5183;
const MAX_PORT = 65535;

type Env = Readonly<Record<string, string | undefined>>;

// The client has no Node typings, and these configs only ever run under Node.
const nodeEnv = (): Env => (globalThis as { process?: { env: Env } }).process?.env ?? {};

/** `HOOKBRAWL_PORT` lets two checkouts run their dev servers and Playwright side by side. */
export function devPort(env: Env = nodeEnv()): number {
  const raw = env.HOOKBRAWL_PORT;
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`HOOKBRAWL_PORT must be an integer from 1 to ${MAX_PORT}, got "${raw}"`);
  }
  return port;
}
