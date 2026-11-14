import type { Arena, PlayerId, TeamId } from '@hookbrawl/sim';
import { Color, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import type { RenderFrame } from '../interpolate';
import type { FogOfWarLook } from '../scenes/types';
import { toWorldLength } from '../space';

export type FogLayer = {
  readonly mesh: Mesh;
  update(frame: RenderFrame, dt: number): void;
  dispose(): void;
};

export type FogLayerSpec = {
  readonly arena: Arena;
  readonly viewer: TeamId;
  /** Sim units each living fighter sees. */
  readonly radius: number;
  readonly look: FogOfWarLook;
  /** Seconds a fighter's circle takes to open or close; 0 for at once. */
  readonly fadeSeconds: number;
};

/** Just above the docks, so it dims the ground and the water but nothing that stands on them. */
const LIFT = 0.05;
/** World units of veil beyond the arena on every side, so the picture's edges are dimmed too. */
const MARGIN = 80;

const VERTEX = /* glsl */ `
varying vec2 vGround;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vGround = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

/** `circles[i]` is a sight circle's centre on the ground (x, z) and how open it is (0..1). */
const fragment = (count: number): string => /* glsl */ `
uniform vec3 circles[${count}];
uniform float radius;
uniform float edge;
uniform float opacity;
uniform vec3 color;
varying vec2 vGround;
void main() {
  float seen = 0.0;
  for (int i = 0; i < ${count}; i++) {
    float d = distance(vGround, circles[i].xy);
    seen = max(seen, circles[i].z * (1.0 - smoothstep(radius - edge, radius + edge, d)));
  }
  gl_FragColor = vec4(color, opacity * (1.0 - seen));
  #include <colorspace_fragment>
}`;

const step = (from: number, towards: number, by: number): number =>
  towards > from ? Math.min(towards, from + by) : Math.max(towards, from - by);

type Circle = { readonly x: number; readonly z: number; readonly open: number };

/**
 * One transparent sheet over the whole ground, one draw call: clear inside the circles of the viewer's living
 * fighters, a soft edge around them, and the scene's veil everywhere else.
 */
export function createFogLayer({ arena, viewer, radius, look, fadeSeconds }: FogLayerSpec): FogLayer {
  const count = arena.spawns[viewer].length;
  const [w, d] = [toWorldLength(arena.width), toWorldLength(arena.height)];
  const geometry = new PlaneGeometry(w + MARGIN * 2, d + MARGIN * 2);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(w / 2, LIFT, d / 2);
  const uniforms = {
    circles: { value: Array.from({ length: count }, () => new Vector3()) },
    radius: { value: toWorldLength(radius) },
    edge: { value: toWorldLength(look.edge) / 2 },
    opacity: { value: look.opacity },
    color: { value: new Color(look.color) },
  };
  const material = new ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: fragment(count), transparent: true, depthWrite: false });
  const mesh = new Mesh(geometry, material);
  // First of the see-through things, so rings, halos and sparks above it are never veiled.
  mesh.renderOrder = -1;
  let circles = new Map<PlayerId, Circle>();

  return {
    mesh,
    update(frame, dt) {
      const by = fadeSeconds > 0 ? dt / fadeSeconds : 1;
      const next = new Map<PlayerId, Circle>();
      for (const { player, pos } of frame.players) {
        if (player.team !== viewer) continue;
        const target = player.status.kind === 'dead' ? 0 : 1;
        const open = step(circles.get(player.id)?.open ?? target, target, by);
        next.set(player.id, { x: toWorldLength(pos.x), z: toWorldLength(pos.y), open });
      }
      circles = next;
      const slots = [...circles.values()];
      uniforms.circles.value.forEach((v, i) => {
        const c = slots[i];
        v.set(c?.x ?? 0, c?.z ?? 0, c?.open ?? 0);
      });
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
