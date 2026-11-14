import { proceduralSet } from '../kit/proceduralSet';
import { defineScene } from '../types';
import { layOutGoldenGate } from './layout';
import { GATE_LOOK, GATE_PAINTS } from './look';
import { GATE_TEXTURES } from './textures';

/** San Francisco in fog at golden hour, the Golden Gate Bridge crossing the strait beyond the piers. */
export const GOLDEN_GATE = defineScene(GATE_LOOK, layOutGoldenGate, proceduralSet(GATE_PAINTS, GATE_TEXTURES));
