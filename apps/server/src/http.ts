import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { GAME_VERSION } from '@hookwars/protocol';
import { Hono } from 'hono';

export const HEALTH_PATH = '/healthz';
const HASHED_ASSETS = '/assets/';
const YEAR_SECONDS = 31_536_000;

/**
 * The page talks only to the server it came from. Three.js reads its models and textures through blob and data
 * addresses, and React sets inline styles; nothing else is let in.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "connect-src 'self' blob: data:",
  "img-src 'self' blob: data:",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');

export type Health = { readonly rooms: number; readonly matches: number; readonly connections: number };

/** The health check the platform polls, and the built client when there is one to serve. */
export function createHttpApp(staticDir: string | null, health: () => Health): Hono {
  const app = new Hono();
  app.get(HEALTH_PATH, (c) => c.json({ ok: true, version: GAME_VERSION, ...health() }));
  if (staticDir === null) return app;

  const root = resolve(staticDir);
  const indexPath = join(root, 'index.html');
  if (!existsSync(indexPath)) throw new Error(`HOOKWARS_STATIC_DIR has no index.html: ${root}`);
  const index = readFileSync(indexPath, 'utf8');

  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    // The room code is in the address; it is not for any other site to learn.
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    // Vite names everything under /assets by its content, so those never change; the page that points at them does.
    c.header('Cache-Control', c.req.path.startsWith(HASHED_ASSETS) ? `public, max-age=${YEAR_SECONDS}, immutable` : 'no-cache');
  });
  app.use('*', serveStatic({ root }));
  app.get('*', (c) => c.html(index));
  return app;
}
