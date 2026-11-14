/** A simulated line in one direction. `busyUntil` is when the last message handed to it comes out the far end. */
export type LagLine = { readonly busyUntil: number };

export type LagRules = {
  /** One way. */
  readonly latencyMs: number;
  /** 0 to 1: the share of messages that have to be sent twice. */
  readonly loss: number;
  readonly retransmitMs: number;
};

export const IDLE_LINE: LagLine = { busyUntil: 0 };

/**
 * When a message handed over at `now` is delivered. This is loss as a WebSocket shows it: nothing ever goes missing,
 * but a lost packet is sent again after a wait, and everything behind it waits too, because TCP delivers in order.
 * `roll` is a random number from 0 to 1.
 */
export function scheduleDelivery(line: LagLine, now: number, roll: number, rules: LagRules): { readonly line: LagLine; readonly at: number } {
  const lost = roll < rules.loss;
  const at = Math.max(line.busyUntil, now + rules.latencyMs + (lost ? rules.retransmitMs : 0));
  return { line: { busyUntil: at }, at };
}

const PERCENT = 100;

/** `?netlag=100&netloss=2` adds 100 ms to the round trip and loses 2 percent of messages. Null when neither is asked for. */
export function lagRulesFromQuery(search: string, retransmitMs: number): LagRules | null {
  const params = new URLSearchParams(search);
  const lag = Number(params.get('netlag') ?? 0);
  const loss = Number(params.get('netloss') ?? 0);
  if (!Number.isFinite(lag) || !Number.isFinite(loss) || (lag <= 0 && loss <= 0)) return null;
  return { latencyMs: Math.max(0, lag) / 2, loss: Math.min(PERCENT, Math.max(0, loss)) / PERCENT, retransmitMs };
}
