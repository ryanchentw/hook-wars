import type { TeamId } from '@hookbrawl/sim';
import { AdditiveBlending, Color, MeshBasicMaterial, MeshStandardMaterial, SpriteMaterial, type Material, type Texture } from 'three';
import type { Tints } from '../scenes/types';
import { HOOK_GROUPS } from './hookGeometry';
import { MENACES, MENACE_STYLES, type HookLook, type Menace } from './hookLook';

/** One material per draw group of the hook geometry, in group order. Shared between meshes, so never changed. */
export type HookFaces = Material[];

type Dressing = { readonly plain: HookFaces; readonly barbed: HookFaces; readonly halo: SpriteMaterial | null };

/** A null halo means none is drawn. */
export type Dress = { readonly faces: HookFaces; readonly halo: SpriteMaterial | null };

export type HookMaterials = {
  dress(team: TeamId, look: HookLook): Dress;
  dispose(): void;
};

/** Gives the spurs' draw group its own material, so a plain hook leaves them undrawn. */
export function facesFor(iron: Material, hidden: Material, barbed: boolean): HookFaces {
  const faces: Material[] = [];
  faces[HOOK_GROUPS.plain] = iron;
  faces[HOOK_GROUPS.spurs] = barbed ? iron : hidden;
  return faces;
}

export function createHiddenMaterial(): Material {
  return new MeshBasicMaterial({ visible: false });
}

function dressingFor(team: TeamId, menace: Menace, hidden: Material, softDot: Texture, tints: Tints): Dressing {
  const style = MENACE_STYLES[menace];
  const glow = style.tint ?? tints.teams[team].glow;
  const iron = new MeshStandardMaterial({
    color: new Color(tints.iron).multiplyScalar(style.iron),
    roughness: 0.34,
    metalness: 0.6,
    emissive: glow,
    emissiveIntensity: style.emissiveIntensity,
  });
  const halo = style.halo
    ? new SpriteMaterial({ map: softDot, color: glow, blending: AdditiveBlending, depthWrite: false, opacity: style.haloOpacity })
    : null;
  return { plain: facesFor(iron, hidden, false), barbed: facesFor(iron, hidden, true), halo };
}

export function createHookMaterials(softDot: Texture, tints: Tints): HookMaterials {
  const hidden = createHiddenMaterial();
  const teams = Object.keys(tints.teams) as TeamId[];
  const table = new Map(teams.flatMap((team) => MENACES.map((m) => [`${team}:${m}`, dressingFor(team, m, hidden, softDot, tints)] as const)));
  return {
    dress(team, look) {
      const dressing = table.get(`${team}:${look.menace}`);
      if (dressing === undefined) throw new Error(`No hook materials for ${team} ${look.menace}`);
      return { faces: look.barbed ? dressing.barbed : dressing.plain, halo: dressing.halo };
    },
    dispose() {
      table.forEach(({ barbed, halo }) => {
        barbed.forEach((m) => m.dispose());
        halo?.dispose();
      });
      hidden.dispose();
    },
  };
}
