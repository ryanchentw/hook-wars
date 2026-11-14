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
