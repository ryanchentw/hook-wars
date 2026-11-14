import { proceduralSet } from '../kit/proceduralSet';
import { defineScene } from '../types';
import { BOAT_TEXTURES } from './boats';
import { GROUND_TEXTURES } from './ground';
import { layOutVictoria } from './layout';
import { LIGHT_TEXTURES } from './lights';
import { VICTORIA_LOOK, VICTORIA_PAINTS } from './look';

const TEXTURES = { ...GROUND_TEXTURES, ...LIGHT_TEXTURES, ...BOAT_TEXTURES };
/** Repeats per second the reflections slide sideways, back and forth: water never holds a light still. */
const SHIMMER = { rate: 0.9, reach: 0.004 };

/** Victoria Harbour, Hong Kong, at night. */
export const VICTORIA = defineScene(
  VICTORIA_LOOK,
  layOutVictoria,
  proceduralSet(VICTORIA_PAINTS, TEXTURES, (shop, elapsed) => {
    shop.texture('streaks').offset.x = Math.sin(elapsed * SHIMMER.rate) * SHIMMER.reach;
    shop.texture('stripStreaks').offset.x = Math.sin(elapsed * SHIMMER.rate * 1.3) * SHIMMER.reach * 4;
  }),
);
