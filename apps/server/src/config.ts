import { TICK_RATE } from '@hookbrawl/sim';
import { z } from 'zod';
import type { RoomRules } from './rooms/types';

const whole = (fallback: number, min: number, max: number) => z.coerce.number().int().min(min).max(max).default(fallback);
const flag = (fallback: boolean) =>
  z
    .enum(['true', 'false'])
    .default(fallback ? 'true' : 'false')
    .transform((raw) => raw === 'true');

const MINUTE = 60_000;

/** Every setting the server has, each with the name of the environment variable that overrides it. */
const envSchema = z.object({
  PORT: whole(8787, 0, 65_535),
  HOST: z.string().min(1).default('0.0.0.0'),
  /** The built client. Unset, the server serves the rooms only, as in development where Vite serves the client. */
  HOOKBRAWL_STATIC_DIR: z.string().min(1).optional(),
  /** Comma-separated origins a browser may connect from. Unset, only the origin the page itself was served from. */
  HOOKBRAWL_ALLOWED_ORIGINS: z.string().default(''),
  /** The header the hosting proxy puts the client's address in, such as `fly-client-ip`. Unset, the socket's own. */
  HOOKBRAWL_CLIENT_IP_HEADER: z.string().min(1).optional(),
  HOOKBRAWL_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  HOOKBRAWL_SNAPSHOT_HZ: whole(20, 1, TICK_RATE),
  HOOKBRAWL_REJOIN_WINDOW_MS: whole(MINUTE, 0, 10 * MINUTE),
  HOOKBRAWL_EMPTY_ROOM_GRACE_MS: whole(MINUTE / 2, 0, 10 * MINUTE),
  HOOKBRAWL_MATCH_COUNTDOWN_MS: whole(3500, 0, MINUTE),
  HOOKBRAWL_MAX_CATCH_UP_TICKS: whole(5, 1, TICK_RATE),
  HOOKBRAWL_INPUT_BUFFER_MAX: whole(1, 0, 8),
  HOOKBRAWL_INPUT_QUEUE_MAX: whole(32, 1, 256),
  HOOKBRAWL_MAX_ROOMS: whole(40, 1, 10_000),
  HOOKBRAWL_MAX_CONNECTIONS: whole(300, 1, 100_000),
  HOOKBRAWL_MAX_CONNECTIONS_PER_IP: whole(12, 1, 10_000),
  /** Creating and joining, per address: also the rate at which room codes can be guessed. */
  HOOKBRAWL_JOINS_PER_MINUTE: whole(30, 1, 10_000),
  HOOKBRAWL_MESSAGES_PER_SECOND: whole(60, 1, 1000),
  HOOKBRAWL_MESSAGE_BURST: whole(120, 1, 10_000),
  HOOKBRAWL_HELLO_TIMEOUT_MS: whole(5000, 100, MINUTE),
  HOOKBRAWL_HEARTBEAT_MS: whole(10_000, 100, MINUTE),
  /** Past this much unsent data a client is sent no more snapshots until it catches up. */
  HOOKBRAWL_MAX_BUFFERED_BYTES: whole(262_144, 1024, 16_777_216),
  HOOKBRAWL_WS_COMPRESSION: flag(true),
  HOOKBRAWL_SHUTDOWN_GRACE_MS: whole(2000, 0, MINUTE),
});

export type LogLevel = z.infer<typeof envSchema>['HOOKBRAWL_LOG_LEVEL'];

export type ServerConfig = {
  readonly port: number;
  readonly host: string;
  readonly staticDir: string | null;
  readonly allowedOrigins: readonly string[];
  readonly clientIpHeader: string | null;
  readonly logLevel: LogLevel;
  readonly rules: RoomRules;
  readonly maxRooms: number;
  readonly maxConnections: number;
  readonly maxConnectionsPerIp: number;
  readonly joinsPerMinute: number;
  readonly messagesPerSecond: number;
  readonly messageBurst: number;
  readonly helloTimeoutMs: number;
  readonly heartbeatMs: number;
  readonly maxBufferedBytes: number;
  readonly wsCompression: boolean;
  readonly shutdownGraceMs: number;
};

type Env = Readonly<Record<string, string | undefined>>;

/** An empty variable is an unset one: `FOO=` in a shell should not mean zero. */
const unsetBlanks = (env: Env): Env => Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ''));

/** Reads the configuration, or throws naming every variable that is wrong. Called once, before anything listens. */
export function loadConfig(env: Env): ServerConfig {
  const parsed = envSchema.safeParse(unsetBlanks(env));
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid configuration. ${problems}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    host: e.HOST,
    staticDir: e.HOOKBRAWL_STATIC_DIR ?? null,
    allowedOrigins: e.HOOKBRAWL_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter((origin) => origin !== ''),
    clientIpHeader: e.HOOKBRAWL_CLIENT_IP_HEADER?.toLowerCase() ?? null,
    logLevel: e.HOOKBRAWL_LOG_LEVEL,
    rules: {
      tickMs: 1000 / TICK_RATE,
      snapshotHz: e.HOOKBRAWL_SNAPSHOT_HZ,
      rejoinWindowMs: e.HOOKBRAWL_REJOIN_WINDOW_MS,
      emptyRoomGraceMs: e.HOOKBRAWL_EMPTY_ROOM_GRACE_MS,
      countdownMs: e.HOOKBRAWL_MATCH_COUNTDOWN_MS,
      maxCatchUpTicks: e.HOOKBRAWL_MAX_CATCH_UP_TICKS,
      inputBufferMax: e.HOOKBRAWL_INPUT_BUFFER_MAX,
      inputQueueMax: e.HOOKBRAWL_INPUT_QUEUE_MAX,
    },
    maxRooms: e.HOOKBRAWL_MAX_ROOMS,
    maxConnections: e.HOOKBRAWL_MAX_CONNECTIONS,
    maxConnectionsPerIp: e.HOOKBRAWL_MAX_CONNECTIONS_PER_IP,
    joinsPerMinute: e.HOOKBRAWL_JOINS_PER_MINUTE,
    messagesPerSecond: e.HOOKBRAWL_MESSAGES_PER_SECOND,
    messageBurst: e.HOOKBRAWL_MESSAGE_BURST,
    helloTimeoutMs: e.HOOKBRAWL_HELLO_TIMEOUT_MS,
    heartbeatMs: e.HOOKBRAWL_HEARTBEAT_MS,
    maxBufferedBytes: e.HOOKBRAWL_MAX_BUFFERED_BYTES,
    wsCompression: e.HOOKBRAWL_WS_COMPRESSION,
    shutdownGraceMs: e.HOOKBRAWL_SHUTDOWN_GRACE_MS,
  };
}
