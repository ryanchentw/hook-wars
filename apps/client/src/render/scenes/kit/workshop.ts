import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  FrontSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  TorusGeometry,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Paint, TextureDef } from './paint';
import { partMatrix, type Part, type Shape } from './parts';

export type Workshop = {
  /** Turns parts into meshes, one per paint. Call it once per thing that moves as a unit. */
  build(parts: readonly Part[]): Group;
  texture(name: string): Texture;
  /** Frees every geometry, material and texture this workshop has made. */
  dispose(): void;
};

const ANISOTROPY = 8;
/** Texels of a cutout paint's map more transparent than this are holes. */
const CUTOUT = 0.5;
/** Vertices per face of a box, and the size of each face as [u axis, v axis] in the order three.js lays them out. */
const BOX_FACE_VERTICES = 4;
const BOX_FACES: readonly (readonly ['x' | 'y' | 'z', 'x' | 'y' | 'z'])[] = [['z', 'y'], ['z', 'y'], ['x', 'z'], ['x', 'z'], ['x', 'y'], ['x', 'y']];

function createTexture(def: TextureDef): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = def.width;
  canvas.height = def.height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('This browser could not make a 2D canvas to paint the scene with');
  def.draw(ctx, def.width, def.height);
  const texture = new CanvasTexture(canvas);
  if (def.color) texture.colorSpace = SRGBColorSpace;
  if (def.repeats) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
  }
  texture.anisotropy = ANISOTROPY;
  return texture;
}

function createMaterial(spec: Paint, textureOf: (name: string) => Texture): Material {
  const common = {
    color: new Color(spec.color).multiplyScalar(spec.gain),
    map: spec.map === null ? null : textureOf(spec.map),
    vertexColors: true,
    fog: spec.fog,
    transparent: spec.blend !== 'solid',
    opacity: spec.opacity,
    depthWrite: spec.blend === 'solid' && !spec.unseen,
    blending: spec.blend === 'add' ? AdditiveBlending : NormalBlending,
    side: spec.doubleSided ? DoubleSide : FrontSide,
    alphaTest: spec.cutout ? CUTOUT : 0,
    colorWrite: !spec.unseen,
  };
  if (spec.surface === 'glow') return new MeshBasicMaterial(common);
  return new MeshStandardMaterial({
    ...common,
    roughness: spec.roughness,
    metalness: spec.metalness,
    emissive: spec.emissive,
    emissiveIntensity: spec.emissiveIntensity,
    emissiveMap: spec.emissiveMap === null ? null : textureOf(spec.emissiveMap),
  });
}

function shapeGeometry(shape: Shape): BufferGeometry {
  switch (shape.kind) {
    case 'box':
      return new BoxGeometry(shape.size.x, shape.size.y, shape.size.z);
    case 'cylinder':
      return new CylinderGeometry(shape.topRadius, shape.radius, shape.height, shape.sides);
    case 'ball':
      return new IcosahedronGeometry(shape.radius, shape.detail);
    case 'ring':
      return new TorusGeometry(shape.radius, shape.tube, 6, shape.sides).rotateX(Math.PI / 2);
    case 'sheet':
      return new PlaneGeometry(shape.size.x, shape.size.z).rotateX(-Math.PI / 2);
  }
}

/** How many times the paint's map repeats across each vertex's face, so texels stay one size whatever the part's. */
function repeatsAt(part: Part, tile: NonNullable<Paint['tile']>, vertex: number): readonly [number, number] {
  const { shape, stretch } = part;
  if (shape.kind === 'box') {
    const [u, v] = BOX_FACES[Math.floor(vertex / BOX_FACE_VERTICES)] ?? ['x', 'y'];
    return [(shape.size[u] * stretch[u]) / tile.u, (shape.size[v] * stretch[v]) / tile.v];
  }
  if (shape.kind === 'cylinder') return [(2 * Math.PI * Math.max(shape.radius, shape.topRadius) * stretch.x) / tile.u, (shape.height * stretch.y) / tile.v];
  if (shape.kind === 'sheet') return [(shape.size.x * stretch.x) / tile.u, (shape.size.z * stretch.z) / tile.v];
  return [1, 1];
}

function partGeometry(part: Part, spec: Paint): BufferGeometry {
  const source = shapeGeometry(part.shape);
  // Icosahedra come without an index; everything merged together must agree on having one or not.
  const geometry = source.index === null ? source : source.toNonIndexed();
  const count = geometry.getAttribute('position').count;
  const uv = geometry.getAttribute('uv');
  if (spec.tile !== null) {
    const indexOf = source.index;
    for (let i = 0; i < count; i += 1) {
      const original = indexOf === null ? i : indexOf.getX(i);
      const [ru, rv] = repeatsAt(part, spec.tile, original);
      uv.setXY(i, uv.getX(i) * ru + part.slide.u, uv.getY(i) * rv + part.slide.v);
    }
  }
  const tint = new Color(part.tint);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) tint.toArray(colors, i * 3);
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.applyMatrix4(partMatrix(part));
  if (geometry !== source) source.dispose();
  return geometry;
}

/** Makes the meshes of one scene from its parts, and remembers everything it allocated so the scene can be freed whole. */
export function createWorkshop(paints: Readonly<Record<string, Paint>>, textures: Readonly<Record<string, TextureDef>>): Workshop {
  const madeTextures = new Map<string, Texture>();
  const madeMaterials = new Map<string, Material>();
  const madeGeometries: BufferGeometry[] = [];

  const texture = (name: string): Texture => {
    const def = textures[name];
    if (def === undefined) throw new Error(`Scene has no texture named "${name}"`);
    const made = madeTextures.get(name) ?? createTexture(def);
    madeTextures.set(name, made);
    return made;
  };
  const paintOf = (name: string): Paint => {
    const spec = paints[name];
    if (spec === undefined) throw new Error(`Scene has no paint named "${name}"`);
    return spec;
  };
  const material = (name: string): Material => {
    const made = madeMaterials.get(name) ?? createMaterial(paintOf(name), texture);
    madeMaterials.set(name, made);
    return made;
  };

  return {
    texture,
    build(parts) {
      const group = new Group();
      const names = [...new Set(parts.map((p) => p.paint))];
      names.forEach((name) => {
        const spec = paintOf(name);
        const pieces = parts.filter((p) => p.paint === name).map((p) => partGeometry(p, spec));
        const merged = mergeGeometries(pieces);
        pieces.forEach((piece) => piece.dispose());
        if (merged === null) throw new Error(`Parts painted "${name}" could not be merged into one mesh`);
        madeGeometries.push(merged);
        const mesh = new Mesh(merged, material(name));
        mesh.castShadow = spec.castShadow;
        mesh.receiveShadow = spec.receiveShadow;
        group.add(mesh);
      });
      return group;
    },
    dispose() {
      madeGeometries.forEach((geometry) => geometry.dispose());
      madeMaterials.forEach((made) => made.dispose());
      madeTextures.forEach((made) => made.dispose());
    },
  };
}
