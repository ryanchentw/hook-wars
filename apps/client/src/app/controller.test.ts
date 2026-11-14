import { describe, expect, it } from 'vitest';
import type { SceneId } from '../render/scenes/types';
import { createApp, type AppDeps } from './controller';
import type { MatchHandle } from './matchHost';
import type { PageOptions } from './matchSetup';
import { fakeRouter } from './fakeRouter';

const MENU_PAGE: PageOptions = { seed: 1, intro: false, overrides: { idleOpponent: false, startingGold: null }, direct: null };

function harness(options: { page?: PageOptions; storedName?: string; failStart?: boolean } = {}) {
  const page = options.page ?? MENU_PAGE;
  const nav = fakeRouter(page.direct === null ? 'menu' : 'match');
  const backdrops: (SceneId | 'gone')[] = [];
  const matches: { scene: SceneId; destroyed: boolean }[] = [];
  const deps: AppDeps = {
    router: nav.router,
    page,
    names: { load: () => options.storedName ?? '', save: () => undefined },
    makeBackdrop: async (scene) => {
      backdrops.push(scene);
      return { sceneId: scene, dispose: () => backdrops.push('gone') };
    },
    startMatch: async (_setup, view) => {
      if (options.failStart === true) throw new Error('the graphics card said no');
      const record = { scene: view.scene, destroyed: false };
      matches.push(record);
      return { destroy: () => (record.destroyed = true) } as unknown as MatchHandle;
    },
    focusGame: () => undefined,
    busy: () => undefined,
  };
  const app = createApp(deps);
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
  return { app, nav, backdrops, matches, settle };
}

describe('app controller', () => {
  it('seats the player from the menu and starts a match from the lobby', async () => {
    const { app, matches, settle } = harness();
    expect(app.play('  ')).toBe('Enter a name.');
    expect(app.play('Ryan')).toBeNull();
    expect(app.getSnapshot().route.screen).toBe('lobby');
    app.act({ kind: 'addBot', slot: { team: 'east', index: 0 } });
    app.start();
    await settle();
    expect(app.getSnapshot().route.screen).toBe('match');
    expect(app.getSnapshot().match).not.toBeNull();
    expect(matches.map((m) => m.scene)).toEqual(['victoria']);
  });

  it('returns to the lobby with a readable message when a match cannot start', async () => {
    const { app, settle } = harness({ failStart: true });
    app.play('Ryan');
    app.act({ kind: 'fillWithBots' });
    app.start();
    await settle();
    const view = app.getSnapshot();
    expect(view.route.screen).toBe('lobby');
    expect(view.notice).toBe('The match could not start: the graphics card said no');
    expect(view.room.phase.kind).toBe('lobby');
    expect(view.match).toBeNull();
  });

  it('ends the match when Back leaves it, and never opens a match nobody started', async () => {
    const { app, nav, matches, settle } = harness();
    app.play('Ryan');
    app.act({ kind: 'addBot', slot: { team: 'east', index: 0 } });
    app.start();
    await settle();
    nav.back();
    expect(app.getSnapshot().route.screen).toBe('lobby');
    expect(matches[0]?.destroyed).toBe(true);
    expect(app.getSnapshot().room.phase.kind).toBe('lobby');
    nav.forward();
    expect(app.getSnapshot().route.screen).toBe('lobby');
    expect(matches).toHaveLength(1);
  });

  it('rematches in the next scene when rotating', async () => {
    const { app, matches, settle } = harness();
    app.play('Ryan');
    app.act({ kind: 'addBot', slot: { team: 'east', index: 0 } });
    app.start();
    await settle();
    await app.rematch();
    expect(matches.map((m) => [m.scene, m.destroyed])).toEqual([
      ['victoria', true],
      ['golden-gate', false],
    ]);
  });

  it('shows the next match scene behind the menu and lobby, and nothing behind a match', async () => {
    const { app, backdrops, settle } = harness();
    await settle();
    expect(backdrops).toEqual(['victoria']);
    app.play('Ryan');
    app.act({ kind: 'setScene', scene: 'daan' });
    await settle();
    expect(backdrops).toEqual(['victoria', 'gone', 'daan']);
    app.act({ kind: 'addBot', slot: { team: 'east', index: 0 } });
    app.start();
    await settle();
    expect(backdrops.at(-1)).toBe('gone');
  });

  it('sends a direct lobby visit without a usable name back to the menu, and seats one with a remembered name', () => {
    const anonymous = harness();
    anonymous.nav.router.push('lobby');
    expect(anonymous.app.getSnapshot().route.screen).toBe('menu');
    const known = harness({ storedName: 'Ada' });
    known.nav.router.push('lobby');
    expect(known.app.getSnapshot().route.screen).toBe('lobby');
    expect(known.app.getSnapshot().room.slots.west[0]).toMatchObject({ kind: 'human', name: 'Ada' });
  });

  it('opens a test address straight into the match it asks for', async () => {
    const page: PageOptions = { ...MENU_PAGE, direct: { roster: { west: 3, east: 3 }, scene: 'harbour', fog: false } };
    const { app, matches, settle } = harness({ page });
    await settle();
    expect(app.getSnapshot().route.screen).toBe('match');
    expect(matches.map((m) => m.scene)).toEqual(['harbour']);
  });
});
