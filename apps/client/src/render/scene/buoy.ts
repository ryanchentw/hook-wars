import type { Arena } from '@hookbrawl/sim';
import {
  AdditiveBlending,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  type Texture,
} from 'three';
import { simToWorld, toWorldLength } from '../space';
import { createRust } from '../textures';
import { COLORS, SIZES } from '../theme';

export type Buoy = { readonly group: Group; update(elapsed: number): void; dispose(): void };

/** Heights above the waterline. The drum stays full width past hook height, so a hook visibly strikes iron. */
const SHAPE = { keel: -0.9, shoulder: 4.1, cap: 5.5, mast: 6.6, hoops: [0.5, 3.9], band: { from: 1.7, to: 3.1 } } as const;
const SEGMENTS = 20;
const LAMP = { glowSize: 2.2, intensity: 34, distance: 16 } as const;

/** A rusted can buoy moored mid-canal. Its drum is exactly the sim's buoy radius. */
export function createBuoy(arena: Arena, softDot: Texture): Buoy {
  const radius = toWorldLength(arena.buoy.radius);
  const centre = simToWorld(arena.buoy.pos);
  const rust = createRust();
  rust.repeat.set(3, 1);
  const iron = new MeshStandardMaterial({ map: rust, roughness: 0.92, metalness: 0.25 });
  const dark = new MeshStandardMaterial({ color: COLORS.rustDark, roughness: 0.8, metalness: 0.4 });
  const lamp = new MeshBasicMaterial({ color: COLORS.buoyLamp });

  const group = new Group();
  const drumHeight = SHAPE.shoulder - SHAPE.keel;
  const drum = new Mesh(new CylinderGeometry(radius, radius * 0.96, drumHeight, SEGMENTS), iron);
  drum.position.y = SHAPE.keel + drumHeight / 2;
  const capHeight = SHAPE.cap - SHAPE.shoulder;
  const cap = new Mesh(new CylinderGeometry(radius * 0.2, radius, capHeight, SEGMENTS), iron);
  cap.position.y = SHAPE.shoulder + capHeight / 2;
  const mastHeight = SHAPE.mast - SHAPE.cap;
  const mast = new Mesh(new CylinderGeometry(0.12, 0.16, mastHeight, 6), dark);
  mast.position.y = SHAPE.cap + mastHeight / 2;
  const light = new Mesh(new SphereGeometry(0.24, 10, 8), lamp);
  light.position.y = SHAPE.mast + 0.1;
  const hoopGeometry = new TorusGeometry(radius, 0.09, 6, SEGMENTS);
  const hoops = SHAPE.hoops.map((y) => {
    const hoop = new Mesh(hoopGeometry, dark);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    return hoop;
  });
  // What is left of the marker's painted band: without it the drum reads as one more barrel.
  const paint = new MeshStandardMaterial({ color: COLORS.buoyPaint, roughness: 0.9, metalness: 0.1 });
  const bandHeight = SHAPE.band.to - SHAPE.band.from;
  const band = new Mesh(new CylinderGeometry(radius * 1.004, radius * 1.004, bandHeight, SEGMENTS, 1, true), paint);
  band.position.y = SHAPE.band.from + bandHeight / 2;
  const parts = [drum, cap, mast, band, ...hoops];
  parts.forEach((part) => {
    part.castShadow = true;
    part.receiveShadow = true;
  });
  // The marker lamp is the buoy's only light of its own: enough to pick the drum out of the dark water around it.
  const glowMaterial = new SpriteMaterial({ map: softDot, color: COLORS.buoyLamp, blending: AdditiveBlending, depthWrite: false });
  const glow = new Sprite(glowMaterial);
  glow.scale.setScalar(LAMP.glowSize);
  glow.position.copy(light.position);
  const beam = new PointLight(COLORS.buoyLamp, LAMP.intensity, LAMP.distance, 2);
  beam.position.set(0, SHAPE.mast + 0.8, 0);
  group.add(...parts, light, glow, beam);
  group.position.set(centre.x, SIZES.waterLevel, centre.z);

  return {
    group,
    update(elapsed) {
      group.position.y = SIZES.waterLevel + Math.sin(elapsed * 1.1) * SIZES.buoyBob;
      beam.intensity = LAMP.intensity * (0.75 + 0.25 * Math.sin(elapsed * 2.4));
      group.rotation.x = Math.sin(elapsed * 0.7) * SIZES.buoyTilt;
      group.rotation.z = Math.cos(elapsed * 0.53) * SIZES.buoyTilt;
    },
    dispose() {
      [...parts, light].forEach((part) => part.geometry.dispose());
      [iron, dark, lamp, paint, glowMaterial].forEach((m) => m.dispose());
      rust.dispose();
    },
  };
}
