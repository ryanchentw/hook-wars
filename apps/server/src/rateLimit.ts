/** A token bucket: `capacity` at once, refilled at `perSecond`. A plain value, so whoever holds it also holds the clock. */
export type Bucket = { readonly tokens: number; readonly at: number };

export type BucketRule = { readonly capacity: number; readonly perSecond: number };

export const fullBucket = (rule: BucketRule, now: number): Bucket => ({ tokens: rule.capacity, at: now });

/** Takes one token if there is one. Time running backwards refills nothing. */
export function takeToken(bucket: Bucket, rule: BucketRule, now: number): { readonly bucket: Bucket; readonly allowed: boolean } {
  const elapsed = Math.max(0, now - bucket.at) / 1000;
  const tokens = Math.min(rule.capacity, bucket.tokens + elapsed * rule.perSecond);
  if (tokens < 1) return { bucket: { tokens, at: now }, allowed: false };
  return { bucket: { tokens: tokens - 1, at: now }, allowed: true };
}

/** A connection's chat allowance, apart from the bucket every message draws on, and whether it has been told it is out. */
export type ChatGate = { readonly bucket: Bucket; readonly told: boolean };

/** `tell`: drop the line and say so, which happens once per run of dropped lines. `drop`: drop it quietly. */
export type ChatVerdict = 'send' | 'tell' | 'drop';

export const openChatGate = (rule: BucketRule, now: number): ChatGate => ({ bucket: fullBucket(rule, now), told: false });

export function passChat(gate: ChatGate, rule: BucketRule, now: number): { readonly gate: ChatGate; readonly verdict: ChatVerdict } {
  const { bucket, allowed } = takeToken(gate.bucket, rule, now);
  if (allowed) return { gate: { bucket, told: false }, verdict: 'send' };
  return { gate: { bucket, told: true }, verdict: gate.told ? 'drop' : 'tell' };
}
