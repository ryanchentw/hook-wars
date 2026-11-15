import type { SeenEvent, PlayerId } from '@hookwars/sim';
import { Group, type Vector3 } from 'three';
import type { Assets } from '../assets/loadAssets';
import type { Impact } from '../impact/impacts';
import type { PlayerFrame, RenderFrame } from '../interpolate';
import { factsFor, triggersFor } from './animation';
import { createCharacterView, type CharacterView, type SharedLooks } from './characterView';
import { startsFlourish } from './flourish';

export type CharactersView = {
  readonly group: Group;
  /** `events` are the sim events since the previous call, each delivered exactly once, and `impacts` the blows among them. */
  update(frame: RenderFrame, events: readonly SeenEvent[], impacts: readonly Impact[], dt: number): void;
  handPosition(playerId: PlayerId): Vector3 | null;
  offHandPosition(playerId: PlayerId): Vector3 | null;
  clear(): void;
};

/** Sim facing from a dragged player towards the owner of the hook that has them. */
function pullDirection(frame: RenderFrame, pf: PlayerFrame): number | null {
  if (pf.player.status.kind !== 'dragged') return null;
  const hookId = pf.player.status.hookId;
  const hook = frame.hooks.find((h) => h.hook.id === hookId);
  const owner = frame.players.find((p) => p.player.id === hook?.hook.ownerId);
  if (owner === undefined) return null;
  return Math.atan2(owner.pos.y - pf.pos.y, owner.pos.x - pf.pos.x);
}

/** Keeps one character per player id, creating and dropping them as players come and go. */
export function createCharactersView(assets: Assets, looks: SharedLooks, localId: PlayerId): CharactersView {
  const group = new Group();
  let views = new Map<PlayerId, CharacterView>();

  const drop = (view: CharacterView): void => {
    group.remove(view.group);
    view.dispose();
  };

  return {
    group,
    update(frame, events, impacts, dt) {
      const next = new Map<PlayerId, CharacterView>();
      for (const pf of frame.players) {
        const { player } = pf;
        const existing = views.get(player.id);
        const view = existing ?? createCharacterView(assets.characters[player.team], looks, player, player.id === localId);
        if (existing === undefined) group.add(view.group);
        view.update({
          player,
          pos: pf.pos,
          facts: factsFor(player, frame.state.hooks, frame.state.grapples),
          triggers: triggersFor(player.id, events),
          dealt: impacts.length === 0 ? null : (impacts.find((impact) => impact.attackerId === player.id) ?? null),
          taken: impacts.length === 0 ? null : (impacts.find((impact) => impact.targetId === player.id) ?? null),
          pulledTowards: pullDirection(frame, pf),
          bought: events.length > 0 && startsFlourish(player, events),
          presence: pf.presence,
          simTime: frame.state.time,
          dt,
        });
        next.set(player.id, view);
      }
      views.forEach((view, id) => {
        if (!next.has(id)) drop(view);
      });
      views = next;
    },
    handPosition: (playerId) => views.get(playerId)?.handPosition() ?? null,
    offHandPosition: (playerId) => views.get(playerId)?.offHandPosition() ?? null,
    clear() {
      views.forEach(drop);
      views = new Map();
    },
  };
}
