import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import { simToWorld } from '../space';
import { COLORS, SLASH, TEAM_COLORS } from '../theme';
import { slashGlow, slashTurn, type Slash } from './slash';

export type SlashView = { readonly group: Group; draw(slashes: readonly Slash[]): void; dispose(): void };

/** Two brawlers land a blow each every 0.7 s and an arc lives well under half of that, so two are alive at once. */
const MAX_SLASHES = 4;
const SEGMENTS = 24;
const DEG = Math.PI / 180;
// Above everything in the scene: the arc is drawn over the bodies it crosses, never hidden inside them.
const RENDER_ORDER = 10;

/**
 * A flat crescent about the origin whose leading end lies along +x and whose tail trails back towards -z,
 * the attacker's left. It thins to nothing at both ends. The outer edge is the blade: opaque and driven past
 * full brightness so the team colour burns towards white there, feathering to clear at the inner edge and the tail.
 */
function createCrescent(): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const along = i / SEGMENTS;
    const angle = -SLASH.spanDeg * DEG * (1 - along);
    const thickness = SLASH.width * Math.sin(Math.PI * along ** 1.5);
    const heat = 1 + (SLASH.heat - 1) * along;
    const edge = [
      { radius: SLASH.radius, shade: heat, alpha: Math.min(1, along * 2.5) },
      { radius: SLASH.radius - thickness, shade: 1, alpha: 0 },
    ];
    for (const { radius, shade, alpha } of edge) {
      positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      colors.push(shade, shade, shade, alpha);
    }
    if (i < SEGMENTS) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  return geometry;
}

function createArc(geometry: BufferGeometry): Mesh<BufferGeometry, MeshBasicMaterial> {
  const material = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
    toneMapped: false,
  });
  const arc = new Mesh(geometry, material);
  arc.renderOrder = RENDER_ORDER;
  arc.frustumCulled = false;
  arc.visible = false;
  return arc;
}

/** Draws the live slash arcs from a small fixed pool of meshes, each fading on its own. */
export function createSlashView(): SlashView {
  const geometry = createCrescent();
  const arcs = Array.from({ length: MAX_SLASHES }, () => createArc(geometry));
  const group = new Group();
  group.add(...arcs);

  return {
    group,
    draw(slashes) {
      const shown = Math.min(slashes.length, MAX_SLASHES);
      for (let i = 0; i < MAX_SLASHES; i += 1) {
        const arc = arcs[i]!;
        arc.visible = i < shown;
        if (i >= shown) continue;
        const slash = slashes[slashes.length - shown + i]!;
        const at = simToWorld(slash.origin, SLASH.height);
        arc.position.set(at.x, at.y, at.z);
        // A turn of -a about +y carries the crescent's +x round to the sim facing a.
        arc.rotation.y = -(slash.heading + SLASH.leadDeg * DEG + slashTurn(slash.age, slash.hold));
        arc.material.color.set(slash.team === null ? COLORS.flare : TEAM_COLORS[slash.team].glow);
        arc.material.opacity = SLASH.opacity * slashGlow(slash.age, slash.hold);
      }
    },
    dispose() {
      geometry.dispose();
      arcs.forEach((arc) => arc.material.dispose());
    },
  };
}
