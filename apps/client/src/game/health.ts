/** Health fractions at which hp displays change colour, shared by the HUD panel and the bars over characters. */
export const LOW_HP_FRACTION = 0.5;
export const CRITICAL_HP_FRACTION = 0.25;

export type HpLevel = 'ok' | 'low' | 'critical';

export function hpLevel(fraction: number): HpLevel {
  if (fraction <= CRITICAL_HP_FRACTION) return 'critical';
  if (fraction <= LOW_HP_FRACTION) return 'low';
  return 'ok';
}
