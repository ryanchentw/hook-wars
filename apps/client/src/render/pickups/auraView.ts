import type { PlayerId, SeenEvent } from '@hookwars/sim';
import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  type Camera,
  type Texture,
} from 'three';
import type { PlayerFrame, RenderFrame } from '../interpolate';
import { simToWorld } from '../space';
import { AURA, EFFECT_COLORS } from './pickupLook';

export type AuraView = {
  readonly group: Group;
  update(frame: RenderFrame, events: readonly SeenEvent[], elapsed: number, dt: number, camera: Camera): void;
  dispose(): void;
};

/** What each fighter under an effect wears: wind for Gale, a violet glow for Storm. */
type Worn = { readonly gale: Group; readonly storm: Sprite };
type Bolt = { readonly mesh: Mesh; readonly geometry: BufferGeometry; age: number };

const has = (pf: PlayerFrame, kind: 'gale' | 'storm'): boolean => pf.player.effects.some((e) => e.kind === kind);

/** A jagged ribbon from the sky to the feet, in its own plane; turned to face the camera when drawn. */
function boltGeometry(random: () => number): BufferGeometry {
  const n = AURA.boltSegments;
  const points = Array.from({ length: n + 1 }, (_, i) => ({ x: i === 0 || i === n ? 0 : (random() - 0.5) * 2 * AURA.boltJag, y: AURA.boltTop * (1 - i / n) }));
  const half = AURA.boltWidth / 2;
  const vertices = points.flatMap((p) => [p.x - half, p.y, 0, p.x + half, p.y, 0]);
  const index = Array.from({ length: n }, (_, i) => [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2]).flat();
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(index);
  return geometry;
}

/**
 * Gale as streaks of wind wheeling round the fighter, Storm as a violet glow and a lightning strike on every pulse.
 * Under reduced motion the wind stands still and the glow holds steady; each strike still shows, once a second at most.
 */
export function createAuraView(softDot: Texture, calm: boolean, random: () => number = Math.random): AuraView {
  const group = new Group();
  const arc = new TorusGeometry(AURA.galeRadius, AURA.galeThickness, 6, 32, Math.PI * 0.8).rotateX(Math.PI / 2);
  const wind = new MeshBasicMaterial({ color: EFFECT_COLORS.gale, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: AURA.galeOpacity, fog: false });
  const glow = new SpriteMaterial({ map: softDot, color: EFFECT_COLORS.storm, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: AURA.stormHaloOpacity, fog: false });
  const boltMaterial = new MeshBasicMaterial({ color: 0xf2e6ff, blending: AdditiveBlending, depthWrite: false, transparent: true, side: DoubleSide, fog: false });
  let worn = new Map<PlayerId, Worn>();
  let bolts: readonly Bolt[] = [];

  const dress = (): Worn => {
    const gale = new Group();
    AURA.galeHeights.slice(0, AURA.galeStreaks).forEach((y, i) => {
      const streak = new Mesh(arc, wind);
      streak.position.y = y;
      streak.rotation.y = (i * 2 * Math.PI) / AURA.galeStreaks;
      gale.add(streak);
    });
    const storm = new Sprite(glow);
    storm.scale.setScalar(AURA.stormHaloSize);
    storm.position.y = 1.4;
    const both = { gale, storm };
    group.add(gale, storm);
    return both;
  };

  const wear = (frame: RenderFrame, elapsed: number): void => {
    const next = new Map<PlayerId, Worn>();
    frame.players.filter((pf) => pf.player.status.kind !== 'dead' && (has(pf, 'gale') || has(pf, 'storm'))).forEach((pf) => {
      const w = worn.get(pf.player.id) ?? dress();
      const at = simToWorld(pf.pos);
      w.gale.visible = has(pf, 'gale');
      w.gale.position.set(at.x, at.y, at.z);
      w.gale.rotation.y = calm ? 0 : elapsed * AURA.galeSpin;
      w.storm.visible = has(pf, 'storm');
      w.storm.position.set(at.x, 1.4, at.z);
      next.set(pf.player.id, w);
    });
    worn.forEach((w, id) => {
      if (!next.has(id)) group.remove(w.gale, w.storm);
    });
    worn = next;
  };

  const strike = (frame: RenderFrame, events: readonly SeenEvent[]): readonly Bolt[] =>
    events.flatMap((e): Bolt[] => {
      if (e.kind !== 'storm') return [];
      const pos = frame.players.find((pf) => pf.player.id === e.targetId)?.pos ?? e.at;
      const geometry = boltGeometry(random);
      const mesh = new Mesh(geometry, boltMaterial);
      const at = simToWorld(pos);
      mesh.position.set(at.x, at.y, at.z);
      group.add(mesh);
      return [{ mesh, geometry, age: 0 }];
    });

  return {
    group,
    update(frame, events, elapsed, dt, camera) {
      wear(frame, elapsed);
      const aged = [...bolts, ...strike(frame, events)].map((b) => ({ ...b, age: b.age + dt }));
      aged.filter((b) => b.age >= AURA.boltLife).forEach((b) => {
        group.remove(b.mesh);
        b.geometry.dispose();
      });
      bolts = aged.filter((b) => b.age < AURA.boltLife);
      bolts.forEach((b) => {
        b.mesh.rotation.y = Math.atan2(camera.position.x - b.mesh.position.x, camera.position.z - b.mesh.position.z);
      });
      boltMaterial.opacity = bolts.length === 0 ? 0 : 1 - Math.max(...bolts.map((b) => b.age / AURA.boltLife)) ** 2;
    },
    dispose() {
      bolts.forEach((b) => b.geometry.dispose());
      [arc].forEach((g) => g.dispose());
      [wind, glow, boltMaterial].forEach((m) => m.dispose());
    },
  };
}
