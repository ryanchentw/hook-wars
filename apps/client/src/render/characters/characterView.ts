import { TUNING } from '@hookbrawl/sim';
import type { Player, Vec2 } from '@hookbrawl/sim';
import { AnimationMixer, Group, LoopOnce, LoopRepeat, Mesh, MeshBasicMaterial, RingGeometry, Vector3, type AnimationAction } from 'three';
import type { CharacterAsset } from '../assets/loadAssets';
import { facingToYaw, simToWorld, toWorldLength } from '../space';
import { SIZES, TEAM_COLORS } from '../theme';
import { ANIMATIONS, fadeDuration, nextAnimState, type AnimFacts, type AnimState, type AnimTrigger } from './animation';
import { instantiateCharacter } from './model';

export type CharacterUpdate = {
  readonly player: Player;
  readonly pos: Vec2;
  readonly facts: AnimFacts;
  readonly triggers: readonly AnimTrigger[];
  /** Sim facing the body should take instead of the player's own, while a chain is hauling it. */
  readonly pulledTowards: number | null;
  readonly simTime: number;
  readonly dt: number;
};

export type CharacterView = {
  readonly group: Group;
  update(input: CharacterUpdate): void;
  /** World position of the hand that holds the chain, valid after `update`. */
  handPosition(): Vector3;
  dispose(): void;
};

const TURN_HALF_LIFE = 0.05;
const DRAG = { pitch: 0.75, lift: 0.5 } as const;
/** Fraction of the respawn wait a body lies whole before it starts to fade. */
const FADE_FROM = 0.3;
const LOCAL_RING_GAP = 0.2;

function shortestTurn(from: number, to: number): number {
  const tau = Math.PI * 2;
  return ((((to - from) % tau) + tau + Math.PI) % tau) - Math.PI;
}

function deathOpacity(player: Player, simTime: number): number {
  if (player.status.kind !== 'dead') return 1;
  const progress = 1 - (player.status.respawnAt - simTime) / TUNING.respawnDelay;
  return 1 - Math.min(1, Math.max(0, (progress - FADE_FROM) / (1 - FADE_FROM)));
}

function createRing(radius: number, color: number, opacity: number): Mesh<RingGeometry, MeshBasicMaterial> {
  const ring = new Mesh(
    new RingGeometry(radius - SIZES.ringWidth, radius, 48),
    new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = SIZES.ringLift;
  return ring;
}

export function createCharacterView(asset: CharacterAsset, player: Player, isLocal: boolean): CharacterView {
  const model = instantiateCharacter(asset, player.team);
  const group = new Group();
  const body = new Group();
  body.add(model.root);
  const radius = toWorldLength(TUNING.playerRadius);
  const rings = [
    createRing(radius, TEAM_COLORS[player.team].signal, 0.95),
    ...(isLocal ? [createRing(radius - SIZES.ringWidth - LOCAL_RING_GAP, TEAM_COLORS[player.team].glow, 0.55)] : []),
  ];
  group.add(body, ...rings);

  const mixer = new AnimationMixer(model.root);
  const actions = Object.fromEntries(
    (Object.keys(ANIMATIONS) as AnimState[]).map((state) => {
      const spec = ANIMATIONS[state];
      const clip = asset.clips.get(spec.clip);
      if (clip === undefined) throw new Error(`Character model has no "${spec.clip}" animation`);
      // A clone per state keeps two states that share a clip from sharing one action.
      const action = mixer.clipAction(clip.clone());
      action.setLoop(spec.playback === 'loop' ? LoopRepeat : LoopOnce, Infinity);
      action.clampWhenFinished = true;
      return [state, action];
    }),
  ) as Record<AnimState, AnimationAction>;

  let state: AnimState = 'idle';
  let yaw = facingToYaw(player.facing);
  let faded = false;
  const hand = new Vector3();

  const enter = (next: AnimState): void => {
    const spec = ANIMATIONS[next];
    const action = actions[next];
    const fade = fadeDuration(state, next);
    action.reset();
    action.time = spec.startAt * action.getClip().duration;
    action.setEffectiveTimeScale(spec.timeScale);
    action.setEffectiveWeight(1);
    if (fade > 0) action.crossFadeFrom(actions[state], fade, false);
    else actions[state].stop();
    action.play();
    state = next;
  };

  const clipFinished = (): boolean => {
    const action = actions[state];
    return action.time >= ANIMATIONS[state].endAt * action.getClip().duration - 1e-3;
  };

  const setOpacity = (opacity: number): void => {
    const fading = opacity < 1;
    if (fading !== faded) {
      model.materials.forEach((m) => {
        m.transparent = fading;
        m.needsUpdate = true;
      });
      faded = fading;
    }
    if (fading) model.materials.forEach((m) => (m.opacity = opacity));
    body.visible = opacity > 0.01;
  };

  actions.idle.play();

  return {
    group,
    update({ player: p, pos, facts, triggers, pulledTowards, simTime, dt }) {
      const next = nextAnimState(state, facts, triggers, clipFinished());
      const retrigger = next === state && ANIMATIONS[next].playback === 'once' && triggers.length > 0;
      if (next !== state || retrigger) enter(next);
      mixer.update(dt);

      const at = simToWorld(pos);
      group.position.set(at.x, 0, at.z);
      const dragged = p.status.kind === 'dragged';
      const targetYaw = facingToYaw(dragged && pulledTowards !== null ? pulledTowards : p.facing);
      yaw += shortestTurn(yaw, targetYaw) * (1 - 0.5 ** (dt / TURN_HALF_LIFE));
      body.rotation.set(0, yaw, 0);
      // Hauled bodies pitch forward off their feet, towards whoever is reeling them in.
      model.root.rotation.x = dragged ? DRAG.pitch : 0;
      model.root.position.y = dragged ? DRAG.lift : 0;

      const dead = p.status.kind === 'dead';
      setOpacity(deathOpacity(p, simTime));
      rings.forEach((ring) => (ring.visible = !dead));
      group.updateMatrixWorld(true);
      model.hand.getWorldPosition(hand);
    },
    handPosition: () => hand,
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model.root);
      model.materials.forEach((m) => m.dispose());
      rings.forEach((ring) => {
        ring.geometry.dispose();
        ring.material.dispose();
      });
    },
  };
}
