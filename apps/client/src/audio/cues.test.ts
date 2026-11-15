import { describe, expect, it } from 'vitest';
import type { PlayerId, SeenEvent, TeamId, Vec2 } from '@hookwars/sim';
import { cuesFor, type CueContext } from './cues';

const ME = 'p1' as PlayerId;
const FRIEND = 'p2' as PlayerId;
const FOE = 'p3' as PlayerId;
const TEAMS: Record<string, TeamId> = { p1: 'west', p2: 'west', p3: 'east' };
const AT: Vec2 = { x: 100, y: 200 };

const ctx: CueContext = {
  localId: ME,
  localTeam: 'west',
  teamOf: (id) => TEAMS[id],
  posOf: (id) => (id === FOE ? null : { x: 10, y: 20 }),
  hookPos: () => ({ x: 7, y: 8 }),
  grapplePos: () => null,
};

const sounds = (events: readonly SeenEvent[]) => cuesFor(events, ctx).map((c) => c.sound);

describe('cuesFor', () => {
  it('plays a hook hit, and the hurt on top when the local fighter is the one hooked', () => {
    const hit = (targetId: PlayerId): SeenEvent => ({ kind: 'hookHit', hookId: 'h1' as never, ownerId: FOE, targetId, damage: 10, ally: false, at: AT });
    expect(sounds([hit(ME)])).toEqual(['hookHit', 'hurt']);
    expect(sounds([hit(FRIEND)])).toEqual(['hookHit']);
  });

  it('places a blow where the event says it landed', () => {
    const [cue] = cuesFor([{ kind: 'melee', attackerId: ME, targetId: FOE, damage: 5, at: AT }], ctx);
    expect(cue).toMatchObject({ sound: 'melee', at: AT });
  });

  it('places a cast at its caster, or at the hook when the caster is out of sight', () => {
    expect(cuesFor([{ kind: 'hookCast', hookId: 'h1' as never, ownerId: ME }], ctx)[0]?.at).toEqual({ x: 10, y: 20 });
    expect(cuesFor([{ kind: 'hookCast', hookId: 'h1' as never, ownerId: FOE }], ctx)[0]?.at).toEqual({ x: 7, y: 8 });
  });

  it('stays silent for a kill whose place this team did not see', () => {
    expect(sounds([{ kind: 'kill', killerId: FRIEND, victimId: FOE, assistIds: [], at: null }])).toEqual([]);
    expect(sounds([{ kind: 'kill', killerId: FRIEND, victimId: FOE, assistIds: [], at: AT }])).toEqual(['kill']);
  });

  it('tells victory from defeat by the winning side', () => {
    expect(sounds([{ kind: 'matchEnd', winner: 'west' }])).toEqual(['victory']);
    expect(sounds([{ kind: 'matchEnd', winner: 'east' }])).toEqual(['defeat']);
  });

  it('names the pickup that was collected, quieter when it is not the local fighter who took it', () => {
    const took = (playerId: PlayerId, pickupKind: 'gold' | 'gale' | 'storm'): SeenEvent => ({ kind: 'pickupCollected', pickupId: 'k' as never, pickupKind, playerId, gold: 0 });
    const [mine] = cuesFor([took(ME, 'gale')], ctx);
    const [theirs] = cuesFor([took(FOE, 'gale')], ctx);
    expect(mine?.sound).toBe('gale');
    expect(theirs?.gain).toBeLessThan(mine?.gain ?? 0);
    expect(sounds([took(ME, 'gold'), took(ME, 'storm')])).toEqual(['gold', 'storm']);
  });

  it('leaves purchases to the shop, which also knows the refused ones', () => {
    expect(sounds([{ kind: 'purchase', playerId: ME, purchase: { kind: 'item', id: 'grapple' }, cost: 1 }])).toEqual([]);
  });

  it('marks the respawn of the local fighter only', () => {
    expect(sounds([{ kind: 'respawn', playerId: ME }])).toEqual(['respawn']);
    expect(sounds([{ kind: 'respawn', playerId: FOE }])).toEqual([]);
  });
});
