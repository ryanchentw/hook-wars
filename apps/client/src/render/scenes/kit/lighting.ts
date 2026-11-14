import { AdditiveBlending, DirectionalLight, Group, HemisphereLight, PointLight, Sprite, SpriteMaterial, type Texture } from 'three';
import type { Animated, Lamp, LightRig, SunSpec } from '../types';

const SUN_DISTANCE = 90;
const SHADOW_MARGIN = 14;

function flicker(elapsed: number, index: number): number {
  return (
    Math.sin(elapsed * 11.3 + index * 1.7) * 0.5 + Math.sin(elapsed * 23.9 + index * 4.1) * 0.3 + Math.sin(elapsed * 5.1 + index) * 0.2
  );
}

function createSun(spec: SunSpec, centre: { readonly x: number; readonly z: number }): DirectionalLight {
  const light = new DirectionalLight(spec.color, spec.intensity);
  const reach = Math.hypot(spec.from.x, spec.from.y, spec.from.z);
  light.position.set(
    centre.x + (spec.from.x / reach) * SUN_DISTANCE,
    (spec.from.y / reach) * SUN_DISTANCE,
    centre.z + (spec.from.z / reach) * SUN_DISTANCE,
  );
  light.target.position.set(centre.x, 0, centre.z);
  return light;
}

function castShadows(key: DirectionalLight, shadow: LightRig['key']['shadow'], size: { readonly w: number; readonly d: number }): void {
  key.castShadow = true;
  key.shadow.mapSize.set(shadow.mapSize, shadow.mapSize);
  const halfWidth = size.w / 2 + SHADOW_MARGIN;
  const halfDepth = size.d / 2 + SHADOW_MARGIN;
  key.shadow.camera.left = -halfWidth;
  key.shadow.camera.right = halfWidth;
  key.shadow.camera.top = halfDepth;
  key.shadow.camera.bottom = -halfDepth;
  key.shadow.camera.near = 10;
  key.shadow.camera.far = SUN_DISTANCE * 2;
  key.shadow.bias = shadow.bias;
  key.shadow.normalBias = shadow.normalBias;
  key.shadow.radius = shadow.radius;
}

/** One shadow-casting key light, an optional rim, a sky fill, and the scene's lamps, which cast none. */
export function createLighting(rig: LightRig, lamps: readonly Lamp[], size: { readonly w: number; readonly d: number }, softDot: Texture): Animated {
  const group = new Group();
  const centre = { x: size.w / 2, z: size.d / 2 };
  const key = createSun(rig.key, centre);
  castShadows(key, rig.key.shadow, size);
  group.add(key, key.target);
  if (rig.rim !== null) {
    const rim = createSun(rig.rim, centre);
    group.add(rim, rim.target);
  }
  group.add(new HemisphereLight(rig.fill.sky, rig.fill.ground, rig.fill.intensity));

  const glowMaterials = new Map<number, SpriteMaterial>();
  const glowFor = (color: number): SpriteMaterial => {
    const made = glowMaterials.get(color) ?? new SpriteMaterial({ map: softDot, color, blending: AdditiveBlending, depthWrite: false });
    glowMaterials.set(color, made);
    return made;
  };
  const lit = lamps.map((lamp) => {
    const light = new PointLight(lamp.color, lamp.intensity, lamp.distance, lamp.decay);
    light.position.set(lamp.glowAt.x, lamp.glowAt.y + lamp.lift, lamp.glowAt.z);
    const glow = new Sprite(glowFor(lamp.glowColor));
    glow.position.set(lamp.glowAt.x, lamp.glowAt.y, lamp.glowAt.z);
    glow.scale.setScalar(lamp.glowSize);
    group.add(light, glow);
    return { lamp, light, glow };
  });
  const flickering = lit.filter(({ lamp }) => lamp.flicker > 0);

  return {
    group,
    update(elapsed) {
      flickering.forEach(({ lamp, light, glow }, i) => {
        const f = 1 + flicker(elapsed, i) * lamp.flicker;
        light.intensity = lamp.intensity * f;
        glow.scale.setScalar(lamp.glowSize * (0.9 + 0.2 * f));
      });
    },
    dispose() {
      glowMaterials.forEach((material) => material.dispose());
      // Frees the shadow map with it.
      key.dispose();
    },
  };
}
