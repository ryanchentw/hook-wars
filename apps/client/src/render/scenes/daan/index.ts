import { proceduralSet } from '../kit/proceduralSet';
import { defineScene } from '../types';
import { layOutDaan } from './layout';
import { DAAN_LOOK, DAAN_PAINTS } from './look';
import { DAAN_GROUND_TEXTURES } from './textures';
import { DAAN_FAR_TEXTURES } from './tower';

const TEXTURES = { ...DAAN_GROUND_TEXTURES, ...DAAN_FAR_TEXTURES };
/** How far, in repeats, and how fast the tower's reflection slides from side to side on the ripples. */
const WAVER = { rate: 0.7, reach: 0.012 };

/** Daan Forest Park, Taipei, on a sunny afternoon. */
export const DAAN = defineScene(
  DAAN_LOOK,
  layOutDaan,
  proceduralSet(DAAN_PAINTS, TEXTURES, (shop, elapsed) => {
    shop.texture('towerReflection').offset.x = Math.sin(elapsed * WAVER.rate) * WAVER.reach;
  }),
);
