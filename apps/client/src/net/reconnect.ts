/** How long to wait before the `attempt`th try (counting from 0): doubling, up to a ceiling. */
export function backoffDelay(attempt: number, firstMs: number, maxMs: number): number {
  return Math.min(maxMs, firstMs * 2 ** Math.max(0, attempt));
}

/** Whole seconds left of the window that opened at `since`, never below zero. */
export function secondsLeft(since: number, now: number, windowMs: number): number {
  return Math.max(0, Math.ceil((since + windowMs - now) / 1000));
}
