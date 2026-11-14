import type { TeamId } from '@hookbrawl/sim';

/** Every colour the 3D scene uses. Hex numbers so they can go straight into three.js materials. */
export const COLORS = {
  night: 0x05080b,
  fog: 0x070c10,
  moon: 0xb4c2dc,
  skyFill: 0x51607c,
  groundFill: 0x2b2622,
  torch: 0xff8a3c,
  torchGlow: 0xffb45e,
  stoneTint: 0x8f9aa6,
  timberTint: 0x9a8f86,
  wallTint: 0x77818c,
  propTint: 0x8b8580,
  ledge: 0x1b1f24,
  coping: 0x8f97a3,
  water: 0x0b1a1c,
  rust: 0x7a3f26,
  rustDark: 0x3a2018,
  rustBright: 0xb5622f,
  buoyLamp: 0xff5a2a,
  buoyPaint: 0x9c8e6e,
  iron: 0x9aa0a8,
  /** What shows through a helm's visor: nothing. */
  visorVoid: 0x0b0b0d,
  spark: 0xffc46b,
  flare: 0xfff0d2,
  blood: 0x9c1512,
  wisp: 0x4f9c8e,
} as const;

export type TeamPalette = {
  /** Ground ring and cloak: the colour a player is recognised by. */
  readonly signal: number;
  /** Multiplied into the model's own texture so the whole figure leans warm or cold. */
  readonly tint: number;
  readonly glow: number;
};

export const TEAM_COLORS: Readonly<Record<TeamId, TeamPalette>> = {
  west: { signal: 0xd9541c, tint: 0xf2a474, glow: 0xff6a2a },
  east: { signal: 0x2a74d0, tint: 0x76a3ee, glow: 0x4aa3ff },
};

/** World units unless a name ends in `Px`. Gameplay sizes are not here: they come from the sim's TUNING. */
export const SIZES = {
  /** Wider than tall, so the stock figure stands broad and heavy rather than doll-like. */
  characterScale: { x: 1.7, y: 1.5, z: 1.7 },
  /** Where the name and hp bar hang above the feet. */
  labelHeight: 4.3,
  /** CSS height of the name plus hp bar block, which sits above its anchor point. */
  labelBlockPx: 34,
  /** Height the hook flies at and the chain hangs at: about chest height on a character. */
  chainHeight: 1.7,
  ringWidth: 0.16,
  ringLift: 0.03,
  waterLevel: -1.7,
  quayDepth: 4,
  ledgeHeight: 1.3,
  ledgeDepth: 4,
  tile: 4,
  wallHeight: 4,
  buoyBob: 0.12,
  buoyTilt: 0.05,
} as const;

export const CAMERA = {
  fovDeg: 36,
  /** Degrees below the horizon the camera looks. */
  tiltDeg: 52,
  /** Aspect ratio the framing is designed for; wider screens simply see more to the sides. */
  designAspect: 16 / 9,
  /** Half the ground width visible at the look-at depth on a design-aspect screen. */
  halfView: 30,
  /** Ground kept visible behind the player, so they sit near one side and the rest shows what a hook can reach. */
  behindPlayer: 7,
  /** Fraction of the player's north-south offset from mid-arena that the camera follows. */
  depthFollow: 0.6,
  /** Looks this far north of the followed point, to keep the torch-lit back wall in frame. */
  northBias: 2,
  /** Share of the viewport height left between the HUD plates at 1280x720, where `depthFollow` applies as is. */
  designClearFraction: 0.8,
  /** At or below this share the camera follows the player's depth one to one. */
  tightClearFraction: 0.45,
  /** Narrow screens pull back by up to this factor instead of shrinking the view to a sliver. */
  maxPullBack: 1.6,
  followHalfLife: 0.16,
  near: 1,
  far: 400,
} as const;

/** CSS pixels at the top and bottom edges taken by HUD plates (see hud.css); nothing that matters is framed under them. */
export const HUD_INSETS = { top: 60, bottom: 84 } as const;

export const SHAKE = { duration: 0.28, amplitude: 0.22, hz: 34 } as const;

/** The hook while it is carried. A fighter is about 45 px tall on a laptop, so it is as big as the one in flight. */
export const HELD_HOOK = {
  /** World units, like the thrown hook's radius. */
  radius: 0.95,
  /** How far up the shank from the hook's centre the fist closes, in hook radii. */
  grip: 0.55,
  glow: 0.06,
} as const;

/** The arc of light a swung hook leaves. Angles are measured from straight ahead of the attacker, positive to their right. */
export const SLASH = {
  /** Seconds the arc takes to sweep on and die, once the hit-stop lets go. */
  life: 0.2,
  /** World units: the arc's outer edge from the attacker's centre, and its thickness at the widest. */
  radius: 2.2,
  width: 0.8,
  height: 1.45,
  /** How much of a circle the arc covers, trailing back to the attacker's left where the swing began. */
  spanDeg: 135,
  /** Where the arc's leading end is at contact, and how much further it carries during the follow-through. */
  leadDeg: 30,
  sweepDeg: 55,
  opacity: 0.95,
  /** Brightness of the leading end of the blade edge, as a multiple of the team colour: past 1 it burns towards white. */
  heat: 2.6,
} as const;

/** How a struck fighter is lit for the few frames after a blow. */
export const HIT_FLASH = { color: 0xffffff, intensity: 2.6 } as const;

export const LIGHTS = {
  moonIntensity: 3.4,
  rimIntensity: 0.9,
  hemiIntensity: 1.5,
  torchIntensity: 160,
  torchDistance: 30,
  torchDecay: 1.9,
  torchFlicker: 0.22,
  shadowMapSize: 2048,
  fogDensity: 0.0105,
  exposure: 1.3,
  /** How much of its own texture a character gives off, so a dark pelt never sinks into the night. */
  characterSelfLight: 0.22,
} as const;

export const CHAIN = {
  /** Sim units between link centres; successive links overlap so the chain reads as one line. */
  linkSpacing: 17,
  linkLength: 25,
  linkWidth: 15,
  linkThickness: 3.4,
  maxLinks: 120,
} as const;
