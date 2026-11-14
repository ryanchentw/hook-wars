import type { GameEvent, HookId, PlayerId } from '@hookbrawl/sim';
import { describe, expect, it } from 'vitest';
import { ANIMATIONS, fadeDuration, nextAnimState, triggersFor, type AnimFacts, type AnimState } from './animation';

const standing: AnimFacts = { status: 'alive', moving: false, hookOut: false };
const running: AnimFacts = { ...standing, moving: true };
const hookOut: AnimFacts = { ...standing, hookOut: true };
const dragged: AnimFacts = { ...standing, status: 'dragged' };
const dead: AnimFacts = { ...standing, status: 'dead' };

describe('animation state table', () => {
  it('derives the resting state from what the sim says the player is doing', () => {
    expect(nextAnimState('idle', standing, [], false)).toBe('idle');
    expect(nextAnimState('idle', running, [], false)).toBe('run');
    expect(nextAnimState('run', standing, [], false)).toBe('idle');
    expect(nextAnimState('idle', hookOut, [], false)).toBe('hold');
    expect(nextAnimState('idle', dragged, [], false)).toBe('dragged');
    expect(nextAnimState('idle', dead, [], false)).toBe('death');
  });

  it('runs rather than holding the pose when the thrower walks with the hook out', () => {
    expect(nextAnimState('hold', { ...hookOut, moving: true }, [], false)).toBe('run');
  });

  it('plays the throw once on a cast, then holds while the hook is out, then rests', () => {
    expect(nextAnimState('idle', hookOut, ['cast'], false)).toBe('throw');
    expect(nextAnimState('throw', hookOut, [], false)).toBe('throw');
    expect(nextAnimState('throw', { ...hookOut, moving: true }, [], false)).toBe('throw');
    expect(nextAnimState('throw', hookOut, [], true)).toBe('hold');
    expect(nextAnimState('hold', standing, [], false)).toBe('idle');
  });

  it('swings once as the attacker and flinches once as the target', () => {
    expect(nextAnimState('idle', standing, ['strike'], false)).toBe('swing');
    expect(nextAnimState('swing', standing, [], false)).toBe('swing');
    expect(nextAnimState('swing', standing, [], true)).toBe('idle');
    expect(nextAnimState('run', running, ['hurt'], false)).toBe('flinch');
    expect(nextAnimState('flinch', running, [], true)).toBe('run');
  });

  it('lets a fresh trigger cut a one-shot short', () => {
    expect(nextAnimState('swing', standing, ['hurt'], false)).toBe('flinch');
    expect(nextAnimState('flinch', standing, ['strike'], false)).toBe('swing');
  });

  it('prefers the player\'s own action when it lands in the same tick as a blow taken', () => {
    expect(nextAnimState('idle', standing, ['hurt', 'strike'], false)).toBe('swing');
    expect(nextAnimState('idle', hookOut, ['hurt', 'cast'], false)).toBe('throw');
  });

  it('lets being dragged or dying override everything else', () => {
    expect(nextAnimState('throw', dragged, [], false)).toBe('dragged');
    expect(nextAnimState('swing', dead, [], false)).toBe('death');
    expect(nextAnimState('idle', dragged, ['hurt', 'strike'], false)).toBe('dragged');
    expect(nextAnimState('idle', dead, ['hurt'], false)).toBe('death');
  });

  it('holds the death pose until the respawn, then stands up at once', () => {
    expect(nextAnimState('death', dead, [], true)).toBe('death');
    expect(nextAnimState('death', standing, [], true)).toBe('idle');
    expect(fadeDuration('death', 'idle')).toBe(0);
    expect(fadeDuration('idle', 'run')).toBeGreaterThan(0);
  });

  it('cuts straight to the swing\'s contact pose, which is the frame the hit-stop holds', () => {
    expect(fadeDuration('idle', 'swing')).toBe(0);
    expect(fadeDuration('run', 'swing')).toBe(0);
    expect(ANIMATIONS.swing.startAt).toBeGreaterThan(0);
    expect(ANIMATIONS.swing.clip).not.toMatch(/Unarmed|Punch/);
  });

  it('is done swinging, and blended back to rest, before the next blow can land', () => {
    const clipSeconds = 1.0667;
    const { startAt, endAt, timeScale } = ANIMATIONS.swing;
    const swinging = ((endAt - startAt) * clipSeconds) / timeScale;
    expect(swinging + ANIMATIONS.idle.fadeIn).toBeLessThan(0.7);
  });

  it('maps every state to a clip with the right playback', () => {
    const states = Object.keys(ANIMATIONS) as AnimState[];
    expect(states.sort()).toEqual(['death', 'dragged', 'flinch', 'hold', 'idle', 'run', 'swing', 'throw']);
    states.forEach((s) => expect(ANIMATIONS[s].clip.length).toBeGreaterThan(0));
    expect(ANIMATIONS.idle.playback).toBe('loop');
    expect(ANIMATIONS.run.playback).toBe('loop');
    expect(ANIMATIONS.throw.playback).toBe('once');
    expect(ANIMATIONS.swing.playback).toBe('once');
    expect(ANIMATIONS.flinch.playback).toBe('once');
    expect(ANIMATIONS.death).toMatchObject({ clip: 'Death_A', playback: 'clamp' });
  });
});

describe('triggersFor', () => {
  const me = 'me' as PlayerId;
  const them = 'them' as PlayerId;
  const hookId = 'h1' as HookId;
  const at = { x: 0, y: 0 };

  it('reads casts, strikes and blows taken out of a tick of events', () => {
    const events: readonly GameEvent[] = [
      { kind: 'hookCast', hookId, ownerId: me },
      { kind: 'melee', attackerId: me, targetId: them, damage: 110, at },
      { kind: 'melee', attackerId: them, targetId: me, damage: 110, at },
      { kind: 'hookHit', hookId, ownerId: them, targetId: me, damage: 350, ally: false, at },
      { kind: 'hookBounce', hookId, at },
    ];
    expect([...triggersFor(me, events)].sort()).toEqual(['cast', 'hurt', 'hurt', 'strike']);
  });

  it('ignores events about other players', () => {
    const events: readonly GameEvent[] = [
      { kind: 'hookCast', hookId, ownerId: them },
      { kind: 'kill', killerId: them, victimId: 'x' as PlayerId, assistIds: [], at },
    ];
    expect(triggersFor(me, events)).toEqual([]);
  });
});
