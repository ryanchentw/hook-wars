import type { Hook } from '@hookbrawl/sim';

/**
 * How dangerous a hook in the air is to anyone it passes. `live` can still catch someone, `spent` is an empty hook
 * on its way home that will pass through bodies, and `hot` is an empty barbed hook on its way home, which still catches.
 * A hook hauling its catch is `live`: it is the catch that holds the eye.
 */
export type Menace = 'live' | 'spent' | 'hot';

export type HookLook = { readonly menace: Menace; readonly barbed: boolean };

export function hookLook(hook: Hook): HookLook {
  const { phase, stats } = hook;
  const emptyReturn = phase.kind === 'retracting' && phase.cargo === null;
  const menace: Menace = !emptyReturn ? 'live' : stats.barbed ? 'hot' : 'spent';
  return { menace, barbed: stats.barbed };
}

/** `tint` replaces the team glow on the halo and the iron's emissive when set; `iron` scales the hook's base colour. */
export type MenaceStyle = {
  readonly halo: boolean;
  readonly haloOpacity: number;
  readonly tint: number | null;
  readonly iron: number;
  readonly emissiveIntensity: number;
};

export const MENACE_STYLES: Readonly<Record<Menace, MenaceStyle>> = {
  live: { halo: true, haloOpacity: 0.55, tint: null, iron: 1, emissiveIntensity: 0.05 },
  spent: { halo: false, haloOpacity: 0, tint: null, iron: 0.38, emissiveIntensity: 0 },
  hot: { halo: true, haloOpacity: 0.85, tint: 0xff3b12, iron: 1, emissiveIntensity: 0.55 },
};

export const MENACES: readonly Menace[] = ['live', 'spent', 'hot'];
