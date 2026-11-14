import { TUNING } from '@hookbrawl/sim';
import type { SeenPlayer, Vec2 } from '@hookbrawl/sim';
import {
  AnimationMixer,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
  type AnimationAction,
  type BufferGeometry,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
} from 'three';
import type { CharacterAsset } from '../assets/loadAssets';
import type { Impact } from '../impact/impacts';
import { facingToYaw, simToWorld, toWorldLength } from '../space';
import type { Tints } from '../scenes/types';
import { GRAPPLE_LOOK, SIZES } from '../theme';
import { ANIMATIONS, fadeDuration, nextAnimState, type AnimFacts, type AnimState, type AnimTrigger } from './animation';
import { createFlash } from './flash';
import { createFlourishView, type FlourishView } from './flourishView';
import { createHeldHook } from './heldHook';
import { createHitReaction } from './hitReaction';
import { instantiateCharacter } from './model';

export type CharacterUpdate = {
  readonly player: SeenPlayer;
  readonly pos: Vec2;
  readonly facts: AnimFacts;
  readonly triggers: readonly AnimTrigger[];
  /** The blow this player landed and the blow they took since the last update, if any. */
  readonly dealt: Impact | null;
  readonly taken: Impact | null;
  /** Sim facing the body should take instead of the player's own, while a chain is hauling it. */
  readonly pulledTowards: number | null;
  /** Whether a purchase should light this player up on this update. */
  readonly bought: boolean;
  /** 0..1: how far into sight the fighter is, under fog. */
  readonly presence: number;
  readonly simTime: number;
  readonly dt: number;
};

export type CharacterView = {
  readonly group: Group;
  update(input: CharacterUpdate): void;
  /** World position of the hand that holds the chain, valid after `update`. */
  handPosition(): Vector3;
  /** World position of the other hand, which holds the grapple rope, valid after `update`. */
  offHandPosition(): Vector3;
  dispose(): void;
};

const TURN_HALF_LIFE = 0.05;
/** Bodies leave the ground and land back on it over a few frames instead of popping. */
const TILT_HALF_LIFE = 0.06;
type Tilt = { readonly pitch: number; readonly lift: number };
const UPRIGHT: Tilt = { pitch: 0, lift: 0 };
const DRAG: Tilt = { pitch: 0.75, lift: 0.5 };
const HAUL: Tilt = { pitch: GRAPPLE_LOOK.haulPitch, lift: GRAPPLE_LOOK.haulLift };
/** Fraction of the respawn wait a body lies whole before it starts to fade. */
const FADE_FROM = 0.3;
const LOCAL_RING_GAP = 0.2;
/** The team ring, then the local player's inner ring. */
const RING_OPACITY = [0.95, 0.55] as const;

function shortestTurn(from: number, to: number): number {
  const tau = Math.PI * 2;
  return ((((to - from) % tau) + tau + Math.PI) % tau) - Math.PI;
}

function deathOpacity(player: SeenPlayer, simTime: number): number {
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

function createActions(mixer: AnimationMixer, asset: CharacterAsset): Record<AnimState, AnimationAction> {
  return Object.fromEntries(
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
}

/** Plays the animation table on one figure: which clip is running, and the cut or blend into the next. */
function createAnimator(mixer: AnimationMixer, actions: Record<AnimState, AnimationAction>) {
  let state: AnimState = 'idle';
  actions.idle.play();

  const enter = (next: AnimState): void => {
    const spec = ANIMATIONS[next];
    const action = actions[next];
    const fade = fadeDuration(state, next);
    action.reset();
    action.time = spec.startAt * action.getClip().duration;
    action.setEffectiveTimeScale(spec.timeScale);
    action.setEffectiveWeight(1);
    if (fade > 0) action.crossFadeFrom(actions[state], fade, false);
    else if (next !== state) actions[state].stop();
    action.play();
    state = next;
  };

  const clipFinished = (): boolean => {
    const action = actions[state];
    return action.time >= ANIMATIONS[state].endAt * action.getClip().duration - 1e-3;
  };

  return {
    state: (): AnimState => state,
    /** `frozen` holds the pose where it is, as a blow that has just landed does. */
    advance(facts: AnimFacts, triggers: readonly AnimTrigger[], frozen: boolean, dt: number): void {
      const next = nextAnimState(state, facts, triggers, clipFinished());
      const retrigger = next === state && ANIMATIONS[next].playback === 'once' && triggers.length > 0;
      if (next !== state || retrigger) enter(next);
      mixer.update(frozen ? 0 : dt);
    },
  };
}

/** Fades a whole figure as one, switching its materials to blended only while it is part-way gone. */
function createFade(materials: readonly MeshStandardMaterial[], body: Group): (opacity: number) => void {
  let faded = false;
  return (opacity) => {
    const fading = opacity < 1;
    if (fading !== faded) {
      materials.forEach((m) => {
        m.transparent = fading;
        m.needsUpdate = true;
      });
      faded = fading;
    }
    if (fading) materials.forEach((m) => (m.opacity = opacity));
    body.visible = opacity > 0.01;
  };
}

type Turn = { readonly facing: number; readonly snap: boolean; readonly tilt: Tilt; readonly dt: number };

/** Turns the body towards a sim facing, quickly but not at once unless told to snap. */
function createFacing(body: Group, root: Object3D, facing: number): (turn: Turn) => void {
  let yaw = facingToYaw(facing);
  let pitch = 0;
  let lift = 0;
  return ({ facing: wanted, snap, tilt, dt }) => {
    const target = facingToYaw(wanted);
    yaw = snap ? target : yaw + shortestTurn(yaw, target) * (1 - 0.5 ** (dt / TURN_HALF_LIFE));
    body.rotation.set(0, yaw, 0);
    // Hauled bodies pitch forward off their feet, towards whoever or whatever is reeling them in.
    const ease = 1 - 0.5 ** (dt / TILT_HALF_LIFE);
    pitch += (tilt.pitch - pitch) * ease;
    lift += (tilt.lift - lift) * ease;
    root.rotation.x = pitch;
    root.position.y = lift;
  };
}

type Rig = {
  readonly group: Group;
  readonly pivot: Group;
  readonly body: Group;
  readonly rings: readonly Mesh<RingGeometry, MeshBasicMaterial>[];
  readonly flourish: FlourishView;
  dispose(): void;
};

/** What every character draws with and nobody but the renderer disposes of. */
export type SharedLooks = { readonly hookGeometry: BufferGeometry; readonly softDot: Texture; readonly tints: Tints };

/**
 * The figure's scene nodes. `group` is always the true sim position and carries the rings;
 * `pivot` takes the lunge and the recoil, and `body` the turn, so neither moves the rings.
 */
function createRig(root: Object3D, player: SeenPlayer, isLocal: boolean, { softDot, tints }: SharedLooks): Rig {
  const group = new Group();
  const pivot = new Group();
  const body = new Group();
  body.add(root);
  pivot.add(body);
  const radius = toWorldLength(TUNING.playerRadius);
  const rings = [
    createRing(radius, tints.teams[player.team].signal, RING_OPACITY[0]),
    ...(isLocal ? [createRing(radius - SIZES.ringWidth - LOCAL_RING_GAP, tints.teams[player.team].glow, RING_OPACITY[1])] : []),
  ];
  const flourish = createFlourishView(softDot);
  group.add(pivot, ...rings, flourish.group);
  const dispose = (): void => {
    flourish.dispose();
    rings.forEach((ring) => {
      ring.geometry.dispose();
      ring.material.dispose();
    });
  };
  return { group, pivot, body, rings, flourish, dispose };
}

function tiltFor(status: SeenPlayer['status']['kind'], hauled: boolean): Tilt {
  if (status === 'dragged') return DRAG;
  return hauled ? HAUL : UPRIGHT;
}

export function createCharacterView(asset: CharacterAsset, looks: SharedLooks, player: SeenPlayer, isLocal: boolean): CharacterView {
  const model = instantiateCharacter(asset, player.team, looks.tints);
  const heldHook = createHeldHook(looks.hookGeometry, player.team, looks.tints);
  model.hand.add(heldHook.mesh);
  const materials = [...model.materials, heldHook.material];
  const rig = createRig(model.root, player, isLocal, looks);
  const { group, pivot, body, rings, flourish } = rig;
  const mixer = new AnimationMixer(model.root);
  const animator = createAnimator(mixer, createActions(mixer, asset));
  const reaction = createHitReaction();
  const flash = createFlash(materials);
  const setOpacity = createFade(materials, body);
  const face = createFacing(body, model.root, player.facing);
  const [hand, offHand] = [new Vector3(), new Vector3()];

  return {
    group,
    update({ player: p, pos, facts, triggers, dealt, taken, pulledTowards, bought, presence, simTime, dt }) {
      reaction.step(dealt, taken, dt);
      animator.advance(facts, triggers, reaction.frozen(), dt);
      const at = simToWorld(pos);
      group.position.set(at.x, 0, at.z);
      reaction.pose(pivot);
      const dragged = p.status.kind === 'dragged';
      // The sim's facing follows the movement keys, so a brawler may be looking away from the enemy they swing at.
      const swingAt = animator.state() === 'swing' ? reaction.swingHeading() : null;
      const facing = dragged && pulledTowards !== null ? pulledTowards : (swingAt ?? p.facing);
      // The blow has already landed, so the body squares up to it at once: the frozen frame must show it.
      face({ facing, snap: dealt !== null && swingAt !== null, tilt: tiltFor(p.status.kind, facts.grapple === 'pulling'), dt });
      flash(reaction.flash());
      heldHook.update(p, facts.hookOut);
      flourish.step(bought, dt);

      setOpacity(deathOpacity(p, simTime) * presence);
      rings.forEach((ring, i) => {
        ring.visible = p.status.kind !== 'dead' && presence > 0;
        ring.material.opacity = (RING_OPACITY[i] ?? 1) * presence;
      });
      group.updateMatrixWorld(true);
      model.hand.getWorldPosition(hand);
      model.offHand.getWorldPosition(offHand);
    },
    handPosition: () => hand,
    offHandPosition: () => offHand,
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model.root);
      materials.forEach((m) => m.dispose());
      model.dispose();
      rig.dispose();
      heldHook.dispose();
    },
  };
}
