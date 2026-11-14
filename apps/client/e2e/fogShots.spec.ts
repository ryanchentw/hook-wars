import { expect, test, type Page } from '@playwright/test';
import type { TeamView } from '@hookbrawl/sim';
import { SCENE_IDS } from '../src/render/scenes/types';

const SHOT_DIR = 'test-results';
const DESKTOP = { width: 1280, height: 720 };
/** The draw-call ceiling the scene specs hold every scene to. */
const CALL_BUDGET = 150;
const SETTLE_MS = 700;

type Moment = 'hookEmerging' | 'enemyAtEdge' | 'draggedInFog' | 'sharedSight';

async function boot(page: Page, query: string): Promise<void> {
  await page.setViewportSize(DESKTOP);
  await page.goto(`/?intro=off&${query}`);
  await page.waitForFunction(() => window.__hookbrawl !== undefined, null, { timeout: 30_000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
}

/** Holds the match and the picture on the first frame whose view shows `moment`. Each test reads only the view. */
async function freezeOn(page: Page, moment: Moment, timeout: number): Promise<void> {
  await page.evaluate(
    ([wanted, ms]) =>
      new Promise<void>((resolve, reject) => {
        const hb = window.__hookbrawl!;
        const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
        const sightOf = (v: TeamView) => v.players.filter((p) => p.team === v.viewer && p.status.kind !== 'dead');
        const nearest = (v: TeamView, at: { x: number; y: number }): number => Math.min(...sightOf(v).map((p) => dist(p.pos, at)));
        const radius = (v: TeamView): number => (v.vision.kind === 'fog' ? v.vision.radius : Infinity);
        /** Clear of the HUD bands at the top and bottom of a 1280x720 page. */
        const onScreen = (p: { x: number; y: number }): boolean => {
          const s = hb.worldToScreen(p);
          return s.x > 80 && s.x < 1200 && s.y > 120 && s.y < 580;
        };
        const shows: Record<typeof wanted, (v: TeamView) => boolean> = {
          hookEmerging: (v) =>
            v.hooks.some((h) => !v.players.some((p) => p.id === h.ownerId) && h.phase.kind === 'extending' && dist(h.pos, h.path[0]!) > 200),
          enemyAtEdge: (v) =>
            v.players.some((p) => p.team !== v.viewer && p.status.kind === 'alive' && nearest(v, p.pos) > radius(v) - 90),
          draggedInFog: (v) => v.players.some((p) => p.team !== v.viewer && p.status.kind === 'dragged' && nearest(v, p.pos) > radius(v) + 60),
          sharedSight: (v) => {
            const me = v.players.find((p) => p.id === hb.getLocalPlayerId());
            return (
              me !== undefined &&
              v.players.some((p) => p.team !== v.viewer && p.status.kind === 'alive' && dist(me.pos, p.pos) > radius(v) + 150 && onScreen(p.pos))
            );
          },
        };
        const until = performance.now() + ms;
        const check = (): void => {
          if (shows[wanted](hb.getView())) {
            hb.freeze(true);
            resolve();
          } else if (performance.now() > until) reject(new Error(`the moment "${wanted}" never came`));
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
    [moment, timeout] as const,
  );
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

async function calls(page: Page): Promise<number> {
  return page.evaluate(() => window.__hookbrawl!.renderStats().calls);
}

test('match start under fog in every scene, inside the draw budget', async ({ page }) => {
  test.setTimeout(180_000);
  const cost: Record<string, { readonly fogOff: number; readonly fogOn: number }> = {};
  for (const scene of SCENE_IDS) {
    await boot(page, `scene=${scene}&seed=1&opponent=idle`);
    await page.waitForTimeout(SETTLE_MS);
    const fogOff = await calls(page);
    await boot(page, `scene=${scene}&seed=1&opponent=idle&fog=on`);
    await page.waitForTimeout(SETTLE_MS);
    const fogOn = await calls(page);
    await shoot(page, `fog-start-${scene}`);
    expect(fogOn, `${scene} draw calls under fog`).toBeLessThanOrEqual(CALL_BUDGET);
    cost[scene] = { fogOff, fogOn };
  }
  test.info().annotations.push({ type: 'draw calls, fog off and on', description: JSON.stringify(cost) });
});

test('an enemy hook comes out of the fog', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 'scene=victoria&seed=4&roster=3v3&fog=on');
  await freezeOn(page, 'hookEmerging', 70_000);
  await shoot(page, 'fog-hook-emerging');
});

test('an enemy just inside the edge of sight', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 'scene=golden-gate&seed=2&roster=3v3&fog=on');
  await freezeOn(page, 'enemyAtEdge', 70_000);
  await shoot(page, 'fog-edge');
});

test('a hooked enemy is seen all the way in across the fog', async ({ page }) => {
  await boot(page, 'scene=harbour&seed=1&opponent=idle&fog=on');
  await page.keyboard.down('KeyD');
  await page.keyboard.down('KeyW');
  // North-east, off the line through the buoy, which would bounce a straight throw home.
  await page.waitForFunction(() => {
    const hb = window.__hookbrawl!;
    const me = hb.getView().players.find((p) => p.id === hb.getLocalPlayerId())!;
    return me.pos.x >= 720 && me.pos.y <= 520;
  });
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');
  const dummy = await page.evaluate(() => window.__hookbrawl!.getState().players.find((p) => p.team === 'east')!.pos);
  const aim = await page.evaluate((p) => window.__hookbrawl!.worldToScreen(p), dummy);
  await page.mouse.move(aim.x, aim.y);
  const frozen = freezeOn(page, 'draggedInFog', 6_000);
  await page.keyboard.press('Space');
  await frozen;
  await shoot(page, 'fog-dragged');
});

test('a 3v3 sees through its teammates', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 'scene=daan&seed=5&roster=3v3&fog=on');
  await freezeOn(page, 'sharedSight', 70_000);
  await shoot(page, 'fog-3v3');
});
