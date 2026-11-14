/** How a group of parts is shaded. Every part that names the same paint is drawn in one call. */
export type Paint = {
  /** `lit` takes the scene's light and shadow; `glow` shows its own colour whatever the light, as a lit window or a neon tube does. */
  readonly surface: 'lit' | 'glow';
  readonly color: number;
  readonly roughness: number;
  readonly metalness: number;
  /** Key into the scene's textures. */
  readonly map: string | null;
  /** World units one repeat of the map covers; null stretches the map once over each face. */
  readonly tile: { readonly u: number; readonly v: number } | null;
  /** Light a lit surface gives off by itself, and the texture that says where. */
  readonly emissive: number;
  readonly emissiveIntensity: number;
  readonly emissiveMap: string | null;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
  /** False lets something far away show through the fog, as a lit skyline does. */
  readonly fog: boolean;
  readonly blend: 'solid' | 'alpha' | 'add';
  readonly opacity: number;
  /** Brightness past 1 burns through the tone mapping, for things that are light sources. */
  readonly gain: number;
  readonly doubleSided: boolean;
  /** The map's transparent texels are holes with hard edges, which also shape the shadow: railings, trusses, leaves. */
  readonly cutout: boolean;
  /** Drawn nowhere but in the shadow map: a caster that stands for branches out of the picture. */
  readonly unseen: boolean;
};

const DEFAULTS: Paint = {
  surface: 'lit',
  color: 0xffffff,
  roughness: 0.85,
  metalness: 0,
  map: null,
  tile: null,
  emissive: 0x000000,
  emissiveIntensity: 1,
  emissiveMap: null,
  castShadow: true,
  receiveShadow: true,
  fog: true,
  blend: 'solid',
  opacity: 1,
  gain: 1,
  doubleSided: false,
  cutout: false,
  unseen: false,
};

export function paint(overrides: Partial<Paint>): Paint {
  return { ...DEFAULTS, ...overrides };
}

/** Something that gives light and takes none: no shadows either way. */
export function glow(overrides: Partial<Paint>): Paint {
  return { ...DEFAULTS, surface: 'glow', castShadow: false, receiveShadow: false, ...overrides };
}

/** A texture drawn at load time with the 2D canvas API. */
export type TextureDef = {
  readonly width: number;
  readonly height: number;
  readonly repeats: boolean;
  /** False for data such as a mask; true for anything that is a colour. */
  readonly color: boolean;
  readonly draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
};
