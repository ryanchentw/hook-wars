import { AdditiveBlending, DirectionalLight, Group, HemisphereLight, PointLight, Sprite, SpriteMaterial, type Texture } from 'three';
import { COLORS, LIGHTS } from '../theme';
import type { TorchSpot } from './layout';

export type Lighting = { readonly group: Group; update(elapsed: number): void; dispose(): void };

/** Where the moon stands: over the viewer's left shoulder, so it lights the faces we see and throws shadows up and to the right. */
const MOON_FROM = { x: -0.55, y: 1, z: 0.5 };
/** A weak counter-light from behind the scene that only picks out edges; it casts nothing. */
const RIM_FROM = { x: 0.5, y: 0.7, z: -1 };
const MOON_DISTANCE = 90;
const SHADOW_MARGIN = 14;
const GLOW_SIZE = 3.4;
/** The light sits above its flame, clear of the masonry right under it, which would otherwise burn out white. */
const LIGHT_LIFT = 1.1;

function flicker(elapsed: number, index: number): number {
  return (
    Math.sin(elapsed * 11.3 + index * 1.7) * 0.5 + Math.sin(elapsed * 23.9 + index * 4.1) * 0.3 + Math.sin(elapsed * 5.1 + index) * 0.2
  );
}

/** Cold moonlight with the only shadows in the scene, a dim sky fill, and warm torches that cast none. */
export function createLighting(size: { readonly w: number; readonly d: number }, torches: readonly TorchSpot[], softDot: Texture): Lighting {
  const group = new Group();
  const centre = { x: size.w / 2, z: size.d / 2 };

  const moon = new DirectionalLight(COLORS.moon, LIGHTS.moonIntensity);
  const reach = Math.hypot(MOON_FROM.x, MOON_FROM.y, MOON_FROM.z);
  moon.position.set(
    centre.x + (MOON_FROM.x / reach) * MOON_DISTANCE,
    (MOON_FROM.y / reach) * MOON_DISTANCE,
    centre.z + (MOON_FROM.z / reach) * MOON_DISTANCE,
  );
  moon.target.position.set(centre.x, 0, centre.z);
  moon.castShadow = true;
  moon.shadow.mapSize.set(LIGHTS.shadowMapSize, LIGHTS.shadowMapSize);
  const halfWidth = size.w / 2 + SHADOW_MARGIN;
  const halfDepth = size.d / 2 + SHADOW_MARGIN;
  moon.shadow.camera.left = -halfWidth;
  moon.shadow.camera.right = halfWidth;
  moon.shadow.camera.top = halfDepth;
  moon.shadow.camera.bottom = -halfDepth;
  moon.shadow.camera.near = 10;
  moon.shadow.camera.far = MOON_DISTANCE * 2;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.05;
  const rim = new DirectionalLight(COLORS.moon, LIGHTS.rimIntensity);
  rim.position.set(centre.x + RIM_FROM.x * MOON_DISTANCE, RIM_FROM.y * MOON_DISTANCE, centre.z + RIM_FROM.z * MOON_DISTANCE);
  rim.target.position.set(centre.x, 0, centre.z);
  group.add(moon, moon.target, rim, rim.target, new HemisphereLight(COLORS.skyFill, COLORS.groundFill, LIGHTS.hemiIntensity));

  const glowMaterial = new SpriteMaterial({ map: softDot, color: COLORS.torchGlow, blending: AdditiveBlending, depthWrite: false });
  const flames = torches.map((torch) => {
    const light = new PointLight(COLORS.torch, LIGHTS.torchIntensity, LIGHTS.torchDistance, LIGHTS.torchDecay);
    light.position.set(torch.flame.x, torch.flame.y + LIGHT_LIFT, torch.flame.z);
    const glow = new Sprite(glowMaterial);
    glow.position.set(torch.flame.x, torch.flame.y, torch.flame.z);
    glow.scale.setScalar(GLOW_SIZE);
    group.add(light, glow);
    return { light, glow };
  });

  return {
    group,
    update(elapsed) {
      flames.forEach(({ light, glow }, i) => {
        const f = 1 + flicker(elapsed, i) * LIGHTS.torchFlicker;
        light.intensity = LIGHTS.torchIntensity * f;
        glow.scale.setScalar(GLOW_SIZE * (0.9 + 0.2 * f));
      });
    },
    dispose() {
      glowMaterial.dispose();
      moon.shadow.map?.dispose();
    },
  };
}
