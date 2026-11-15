import { z } from 'zod';

/**
 * Import this before anything else in a browser bundle. Zod tests whether it may compile its parsers with
 * `new Function` as soon as a schema is built, which is at import time, so a setting applied later is too late:
 * the page's content policy forbids the test and reports it in every player's console. The server has no such
 * policy, never imports this, and keeps the compiled parsers, which are the faster ones.
 */
z.config({ jitless: true });
