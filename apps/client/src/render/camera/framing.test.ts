import { DEFAULT_ARENA, TUNING } from '@hookbrawl/sim';
import type { Arena, TeamId, Vec2 } from '@hookbrawl/sim';
import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { simToWorld, toWorldLength } from '../space';
import { CAMERA, HUD_INSETS, SIZES } from '../theme';
import { dampFocus, focusFor, poseFor, type Viewport } from './framing';
import { applyPose, worldToScreen } from './projection';

const arena = DEFAULT_ARENA;
const R = TUNING.playerRadius;
const AIM_REACH = 0.85 * TUNING.hookRange;
const EDGE_PAD = 8;

const WIDE_VIEWPORTS: readonly Viewport[] = [
  { width: 1280, height: 720 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
];
const NARROW_VIEWPORTS: readonly Viewport[] = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 844, height: 390 },
];
const TEAMS: readonly TeamId[] = ['west', 'east'];

function dockPositions(a: Arena, team: TeamId): readonly Vec2[] {
  const x0 = team === 'west' ? R : a.canal.x1 + R;
  const x1 = team === 'west' ? a.canal.x0 - R : a.width - R;
  const steps = 8;
  const out: Vec2[] = [];
  for (let i = 0; i <= steps; i += 1) {
    for (let j = 0; j <= steps; j += 1) {
      out.push({ x: x0 + ((x1 - x0) * i) / steps, y: R + ((a.height - 2 * R) * j) / steps });
    }
  }
  return out;
}

function settledCamera(team: TeamId, pos: Vec2, viewport: Viewport): PerspectiveCamera {
  const camera = new PerspectiveCamera();
  applyPose(camera, poseFor(focusFor(arena, team, pos, viewport), viewport));
  return camera;
}

type Screen = { readonly x: number; readonly y: number };

function expectClearOfHud(p: Screen, viewport: Viewport, what: string): void {
  expect(p.x, `${what} x`).toBeGreaterThanOrEqual(EDGE_PAD);
  expect(p.x, `${what} x`).toBeLessThanOrEqual(viewport.width - EDGE_PAD);
  expect(p.y, `${what} y`).toBeGreaterThanOrEqual(HUD_INSETS.top);
  expect(p.y, `${what} y`).toBeLessThanOrEqual(viewport.height - HUD_INSETS.bottom);
}

function playerScreenPoints(camera: PerspectiveCamera, viewport: Viewport, pos: Vec2): readonly Screen[] {
  const ring = [
    { x: pos.x - R, y: pos.y },
    { x: pos.x + R, y: pos.y },
    { x: pos.x, y: pos.y - R },
    { x: pos.x, y: pos.y + R },
  ].map((p) => worldToScreen(camera, viewport, simToWorld(p)));
  const label = worldToScreen(camera, viewport, simToWorld(pos, SIZES.labelHeight));
  return [...ring, { x: label.x, y: label.y - SIZES.labelBlockPx }];
}

describe('camera framing', () => {
  it.each(WIDE_VIEWPORTS)('shows the player and 85% of hook range clear of the HUD at $width x $height', (viewport) => {
    for (const team of TEAMS) {
      const towardEnemy = team === 'west' ? 1 : -1;
      for (const pos of dockPositions(arena, team)) {
        const camera = settledCamera(team, pos, viewport);
        const at = `${team} player at ${pos.x},${pos.y}`;
        playerScreenPoints(camera, viewport, pos).forEach((p) => expectClearOfHud(p, viewport, at));
        const aim = { x: pos.x + towardEnemy * AIM_REACH, y: pos.y };
        expectClearOfHud(worldToScreen(camera, viewport, simToWorld(aim)), viewport, `aim point of ${at}`);
        expectClearOfHud(worldToScreen(camera, viewport, simToWorld(aim, SIZES.chainHeight)), viewport, `hook at aim point of ${at}`);
      }
    }
  });

  it.each(WIDE_VIEWPORTS)('frames a player who has grappled onto the enemy dock without staring past its far wall at $width x $height', (viewport) => {
    for (const team of TEAMS) {
      const enemy: TeamId = team === 'west' ? 'east' : 'west';
      const beyond = toWorldLength(team === 'west' ? arena.width + CAMERA.edgeMargin + 1 : -CAMERA.edgeMargin - 1);
      for (const pos of dockPositions(arena, enemy)) {
        const camera = settledCamera(team, pos, viewport);
        const at = `${team} player at ${pos.x},${pos.y}`;
        playerScreenPoints(camera, viewport, pos).forEach((p) => expectClearOfHud(p, viewport, at));
        // Hard against the wall the player gets the framing an enemy standing there would, wall and all.
        const toWall = team === 'west' ? arena.width - pos.x : pos.x;
        if (toWorldLength(toWall) < CAMERA.behindPlayer) continue;
        const lookAt = focusFor(arena, team, pos, viewport);
        const past = worldToScreen(camera, viewport, { x: beyond, y: 0, z: lookAt.z }).x;
        expect(past < 0 || past > viewport.width, `void past the far wall for ${at}`).toBe(true);
      }
    }
  });

  it.each(NARROW_VIEWPORTS)('keeps the player on screen and clear of the HUD at $width x $height', (viewport) => {
    for (const team of TEAMS) {
      for (const pos of dockPositions(arena, team)) {
        const camera = settledCamera(team, pos, viewport);
        playerScreenPoints(camera, viewport, pos).forEach((p) => expectClearOfHud(p, viewport, `${team} player at ${pos.x},${pos.y}`));
      }
    }
  });

  it('looks north with an RTS tilt, so west is left and screen-down is +y', () => {
    const viewport = { width: 1280, height: 720 };
    const pos = { x: 420, y: 675 };
    const camera = settledCamera('west', pos, viewport);
    const here = worldToScreen(camera, viewport, simToWorld(pos));
    const east = worldToScreen(camera, viewport, simToWorld({ x: pos.x + 100, y: pos.y }));
    const south = worldToScreen(camera, viewport, simToWorld({ x: pos.x, y: pos.y + 100 }));
    expect(east.x).toBeGreaterThan(here.x);
    expect(east.y).toBeCloseTo(here.y, 6);
    expect(south.y).toBeGreaterThan(here.y);
    expect(CAMERA.tiltDeg).toBeGreaterThanOrEqual(50);
    expect(CAMERA.tiltDeg).toBeLessThanOrEqual(60);
  });

  it('keeps a character at least as large on a wider screen of the same height', () => {
    const size = (viewport: Viewport): number => {
      const camera = settledCamera('west', { x: 420, y: 675 }, viewport);
      const a = worldToScreen(camera, viewport, simToWorld({ x: 420 - R, y: 675 }));
      const b = worldToScreen(camera, viewport, simToWorld({ x: 420 + R, y: 675 }));
      return b.x - a.x;
    };
    expect(size({ width: 2560, height: 1080 })).toBeGreaterThanOrEqual(size({ width: 1920, height: 1080 }) - 1e-6);
    expect(toWorldLength(R)).toBeGreaterThan(0);
  });
});

describe('dampFocus', () => {
  const from = { x: 0, z: 0 };
  const to = { x: 30, z: -12 };

  it('moves towards the target without snapping to it', () => {
    const next = dampFocus(from, to, 1 / 60);
    expect(next.x).toBeGreaterThan(0);
    expect(next.x).toBeLessThan(to.x * 0.25);
    expect(next.z).toBeLessThan(0);
    expect(next.z).toBeGreaterThan(to.z * 0.25);
  });

  it('never overshoots, even after a long stalled frame', () => {
    const next = dampFocus(from, to, 10);
    expect(next.x).toBeLessThanOrEqual(to.x);
    expect(next.z).toBeGreaterThanOrEqual(to.z);
  });

  it('settles on the target within a couple of seconds', () => {
    let focus = from;
    for (let i = 0; i < 120; i += 1) focus = dampFocus(focus, to, 1 / 60);
    expect(Math.hypot(focus.x - to.x, focus.z - to.z)).toBeLessThan(0.05);
  });

  it('reaches the same place whatever the frame rate', () => {
    let fast = from;
    for (let i = 0; i < 60; i += 1) fast = dampFocus(fast, to, 1 / 120);
    let slow = from;
    for (let i = 0; i < 15; i += 1) slow = dampFocus(slow, to, 1 / 30);
    expect(fast.x).toBeCloseTo(slow.x, 6);
  });
});
