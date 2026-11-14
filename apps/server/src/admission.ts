import type { IncomingMessage } from 'node:http';
import type { ServerConfig } from './config';
import { fullBucket, takeToken, type Bucket, type BucketRule } from './rateLimit';

const UNKNOWN_ADDRESS = 'unknown';
const SECONDS_PER_MINUTE = 60;
const MINUTE_MS = 60_000;
/** Past this many remembered addresses, the ones whose bucket has long since refilled are forgotten. */
const JOIN_TABLE_SWEEP_SIZE = 2048;

export function clientAddress(request: IncomingMessage, header: string | null): string {
  const forwarded = header === null ? undefined : request.headers[header];
  const named = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return named ?? request.socket.remoteAddress ?? UNKNOWN_ADDRESS;
}

/**
 * A browser says which page opened the socket, and only our own pages may: without this any site a player visits
 * could open rooms in their name. A client that sends no origin is not a browser and gains nothing by leaving it out.
 */
export function originAllowed(request: IncomingMessage, allowed: readonly string[]): boolean {
  const { origin, host } = request.headers;
  if (origin === undefined) return true;
  if (allowed.length > 0) return allowed.includes(origin);
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export type Admission = {
  /** Counts a connection in, or says no when the server or the address has as many as it may. */
  admit(address: string): boolean;
  release(address: string): void;
  /** Whether this address may create or join a room now. */
  mayJoin(address: string, now: number): boolean;
  connections(): number;
};

/** Who may connect and how often they may knock, per client address. Holds only counts. */
export function createAdmission(config: ServerConfig): Admission {
  const open = new Map<string, number>();
  const joins = new Map<string, Bucket>();
  const joinRule: BucketRule = { capacity: config.joinsPerMinute, perSecond: config.joinsPerMinute / SECONDS_PER_MINUTE };
  let total = 0;
  return {
    admit(address) {
      const mine = open.get(address) ?? 0;
      if (total >= config.maxConnections || mine >= config.maxConnectionsPerIp) return false;
      open.set(address, mine + 1);
      total += 1;
      return true;
    },
    release(address) {
      const mine = (open.get(address) ?? 1) - 1;
      total = Math.max(0, total - 1);
      if (mine > 0) open.set(address, mine);
      else open.delete(address);
    },
    // The bucket outlives the connection: closing the socket and opening another must not buy a fresh allowance.
    mayJoin(address, now) {
      if (joins.size > JOIN_TABLE_SWEEP_SIZE) joins.forEach((bucket, key) => now - bucket.at > MINUTE_MS && joins.delete(key));
      const taken = takeToken(joins.get(address) ?? fullBucket(joinRule, now), joinRule, now);
      joins.set(address, taken.bucket);
      return taken.allowed;
    },
    connections: () => total,
  };
}
