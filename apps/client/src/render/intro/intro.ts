import type { CameraPose } from '../camera/framing';
import type { CameraShot, IntroShot, SceneId } from '../scenes/types';
import type { Vec3 } from '../space';

/** Seconds. `moving` false holds the shot still and cuts, for people who ask their system for less motion. */
export type IntroTiming = { readonly shot: number; readonly ease: number; readonly moving: boolean };

export const INTRO_TIMING: Readonly<Record<'full' | 'reduced', IntroTiming>> = {
  full: { shot: 2.4, ease: 0.9, moving: true },
  reduced: { shot: 2, ease: 0, moving: false },
};

/** Seconds the place name takes to come up, and to go as the camera leaves. */
const TITLE_FADE = 0.5;

export type IntroState =
  | { readonly kind: 'shot'; readonly age: number }
  | { readonly kind: 'ease'; readonly age: number }
  | { readonly kind: 'done' };

/** What one frame of the intro shows. */
export type IntroFrame = {
  /** 0..1 along the shot's own camera move. */
  readonly along: number;
  /** 0 is the shot's camera, 1 the gameplay camera. */
  readonly blend: number;
  /** Opacity of the place name. */
  readonly title: number;
};

const DONE: IntroState = { kind: 'done' };

/** A match opens on the shot the first time, and again only when the scene it is played in has changed. */
export function playsIntro(enabled: boolean, previous: SceneId | null, next: SceneId): boolean {
  return enabled && previous !== next;
}

export function startIntro(): IntroState {
  return { kind: 'shot', age: 0 };
}

/** Skipping ends the intro from wherever it is. */
export function skipIntro(): IntroState {
  return DONE;
}

export function stepIntro(state: IntroState, dt: number, timing: IntroTiming): IntroState {
  if (state.kind === 'done') return state;
  const age = state.age + Math.max(0, dt);
  if (state.kind === 'shot') {
    if (age < timing.shot) return { kind: 'shot', age };
    return timing.ease > 0 ? stepIntro({ kind: 'ease', age: 0 }, age - timing.shot, timing) : DONE;
  }
  return age < timing.ease ? { kind: 'ease', age } : DONE;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

export function introFrame(state: IntroState, timing: IntroTiming): IntroFrame | null {
  if (state.kind === 'done') return null;
  if (state.kind === 'shot') {
    // A still shot sits part-way along the move, where the landmark is framed best.
    const along = timing.moving ? state.age / timing.shot : 0.5;
    return { along, blend: 0, title: clamp01(state.age / TITLE_FADE) };
  }
  const t = clamp01(state.age / timing.ease);
  return { along: 1, blend: smooth(t), title: clamp01(1 - state.age / TITLE_FADE) };
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t) };
}

function mixShot(a: CameraShot, b: CameraShot, t: number): CameraShot {
  return { position: mixVec(a.position, b.position, t), target: mixVec(a.target, b.target, t), fovDeg: mix(a.fovDeg, b.fovDeg, t) };
}

/** How much thicker than the scene's own the fog is for a frame of the intro: the shot's haze, thinning to none as the camera comes down. */
export function introHaze(shot: IntroShot, frame: IntroFrame | null): number {
  return frame === null ? 1 : mix(shot.haze, 1, frame.blend);
}

/** Where the camera is for a frame of the intro: on the shot's slow move, or part-way down to the gameplay camera. */
export function introPose(shot: IntroShot, gameplay: CameraPose, frame: IntroFrame): CameraPose {
  const onShot = mixShot(shot.from, shot.to, frame.along);
  return { ...mixShot(onShot, gameplay, frame.blend), aspect: gameplay.aspect };
}
