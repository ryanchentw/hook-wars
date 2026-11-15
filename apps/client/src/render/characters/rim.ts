import { Color, type MeshStandardMaterial } from 'three';
import type { FighterRim } from '../scenes/types';

/** The edge light every fighter in a scene shares; each material adds only its own team's colour. */
export type RimLight = {
  light(material: MeshStandardMaterial, teamGlow: number): void;
  retune(spec: FighterRim): void;
};

const DECLARATIONS = /* glsl */ `
uniform float rimStrength;
uniform float rimPower;
uniform float rimTeamMix;
uniform vec3 rimColor;
uniform vec3 rimTeam;`;

/** Brightest where the surface turns away from the eye, which from above is the outline of the head, shoulders and cloak. */
const EDGE_LIGHT = /* glsl */ `
  float rimEdge = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), rimPower);
  totalEmissiveRadiance += mix(rimColor, rimTeam, rimTeamMix) * (rimEdge * rimStrength);`;

export function createRimLight(spec: FighterRim): RimLight {
  const shared = {
    rimStrength: { value: 0 },
    rimPower: { value: 1 },
    rimTeamMix: { value: 0 },
    rimColor: { value: new Color() },
  };
  const retune = (next: FighterRim): void => {
    shared.rimStrength.value = next.on ? next.strength : 0;
    shared.rimPower.value = next.power;
    shared.rimTeamMix.value = next.team;
    shared.rimColor.value.set(next.color);
  };
  retune(spec);

  return {
    light(material, teamGlow) {
      const rimTeam = { value: new Color(teamGlow) };
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, shared, { rimTeam });
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>${DECLARATIONS}`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${EDGE_LIGHT}`);
      };
    },
    retune,
  };
}
