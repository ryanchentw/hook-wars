import { defineScene } from '../types';
import { layOutArena } from './layout';
import { HARBOUR_LOOK } from './look';
import { buildHarbourSet } from './set';

/** The original scene: a torch-lit stone quay at night, built from the KayKit dungeon props. */
export const HARBOUR = defineScene(HARBOUR_LOOK, layOutArena, buildHarbourSet);
