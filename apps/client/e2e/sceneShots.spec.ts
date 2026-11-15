import { expect, test, type Page } from '@playwright/test';
import { TUNING } from '@hookwars/sim';
import type { GameState } from '@hookwars/sim';
import { SCENE_IDS, type SceneId } from '../src/render/scenes/types';

const SHOT_DIR = 'test-results';
/** Into the establishing shot far enough for the title to be up, short of where the camera starts down. */
const ESTABLISHING_MS = 1_300;

async function boot(page: Page, scene: SceneId, extra = ''): Promise<void> {
  await page.goto(`/?scene=${scene}&opponent=idle&gold=500&seed=1${extra}`);
  await expect(page.locator('#stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
}

type Moment = 'hookOverStrip' | 'blowLanded' | 'hauledOverStrip';

/**
 * Stops the match and the picture on the first drawn frame that shows `moment`, so the screenshot shows it and not
 * wherever the match has run on to by the time the shot is taken.
 */
async function freezeOn(page: Page, moment: Moment, timeout = 15_000): Promise<void> {
  await page.evaluate(
    ([wanted, ms, blowBelow]) =>
      new Promise<void>((resolve, reject) => {
        const hb = window.__hookwars!;
        const shows: Record<typeof wanted, (state: GameState) => boolean> = {
          hookOverStrip: (s) => s.hooks.some((h) => h.phase.kind === 'extending' && h.pos.x > s.arena.canal.x0 + (s.arena.canal.x1 - s.arena.canal.x0) * 0.7),
          // Below what the hook alone takes: the first blow of the brawl has just gone in.
          blowLanded: (s) => s.players.some((p) => p.team === 'east' && p.hp < blowBelow),
          hauledOverStrip: (s) =>
            s.grapples.some((g) => g.phase.kind === 'pulling') &&
            s.players.some((p) => p.id === hb.getLocalPlayerId() && p.pos.x > s.arena.canal.x0 + (s.arena.canal.x1 - s.arena.canal.x0) * 0.35),
        };
        const until = performance.now() + ms;
        const check = (): void => {
          if (shows[wanted](hb.getState())) {
            hb.freeze(true);
            resolve();
          } else if (performance.now() > until) {
            reject(new Error(`the moment "${wanted}" never came`));
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      }),
    [moment, timeout, TUNING.maxHp - TUNING.hookDamage] as const,
  );
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
  await page.evaluate(() => window.__hookwars!.freeze(false));
}

type Target = 'dummy' | 'eastDock';

async function aimAt(page: Page, target: Target): Promise<void> {
  const screen = await page.evaluate((wanted) => {
    const hb = window.__hookwars!;
    const s = hb.getState();
    return hb.worldToScreen(wanted === 'dummy' ? s.players.find((p) => p.team === 'east')!.pos : { x: s.arena.canal.x1 + 260, y: s.arena.height * 0.55 });
  }, target);
  await page.mouse.move(screen.x, screen.y);
}

/** Holds `key` until the local player's `axis` coordinate passes `mark` in the direction it moves. */
async function holdUntil(page: Page, key: string, axis: 'x' | 'y', mark: number, rising: boolean): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForFunction(
    ([a, m, up]) => {
      const hb = window.__hookwars!;
      const p = hb.getState().players.find((q) => q.id === hb.getLocalPlayerId())!;
      return up ? p.pos[a] >= m : p.pos[a] <= m;
    },
    [axis, mark, rising] as const,
    { timeout: 8_000 },
  );
  await page.keyboard.up(key);
}

for (const scene of SCENE_IDS) {
  test(`screenshots of the ${scene} scene at 1280x720: the establishing shot, then a match`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await boot(page, scene);
    expect(await page.evaluate(() => window.__hookwars!.introActive())).toBe(true);
    await page.waitForTimeout(ESTABLISHING_MS);
    await page.evaluate(() => window.__hookwars!.freeze(true));
    await shoot(page, `scene-${scene}-1-establishing`);

    await boot(page, scene, '&intro=off');
    const { arena } = await page.evaluate(() => window.__hookwars!.getState());
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__hookwars!.freeze(true));
    await shoot(page, `scene-${scene}-2-start`);

    // The obstacle sits on the straight line between the two spawns, so throw from off that line.
    await holdUntil(page, 'KeyD', 'x', arena.canal.x0 - 100, true);
    await holdUntil(page, 'KeyW', 'y', arena.height * 0.3, false);
    await page.waitForTimeout(150);
    await aimAt(page, 'dummy');
    await page.keyboard.press('Space');
    await freezeOn(page, 'hookOverStrip');
    await shoot(page, `scene-${scene}-3-hook`);

    // The hook drags the dummy back across and drops it beside the thrower, where the two start trading blows.
    await freezeOn(page, 'blowLanded');
    await shoot(page, `scene-${scene}-4-brawl`);

    await page.keyboard.press('Digit5');
    await page.waitForFunction(() => {
      const hb = window.__hookwars!;
      return hb.getState().players.some((p) => p.id === hb.getLocalPlayerId() && p.items.grapple.kind === 'owned');
    });
    await aimAt(page, 'eastDock');
    await page.keyboard.press('KeyE');
    await freezeOn(page, 'hauledOverStrip');
    await shoot(page, `scene-${scene}-5-grapple`);
  });

  for (const [n, width, height] of [[6, 1440, 900], [7, 390, 844]] as const) {
    test(`screenshot of the ${scene} scene at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await boot(page, scene, '&intro=off');
      await page.waitForTimeout(400);
      await page.evaluate(() => window.__hookwars!.freeze(true));
      await shoot(page, `scene-${scene}-${n}-${width}x${height}`);
    });
  }
}
