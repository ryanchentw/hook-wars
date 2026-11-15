import { Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Vector2, type Camera, type Scene, type Texture, type WebGLRenderer } from 'three';
import { createWaterNormals, WATER_NORMAL_STEEPNESS } from '../../textures';
import type { Animated, WaterSheet, WaterSpec } from '../types';
import { createMirror, type Mirror } from './mirror';

export type Water = Animated & {
  /** Takes the spec's colours and strengths as they now are. `reflect` is whether the mirror image is drawn at all. */
  retune(spec: WaterSpec, reflect: boolean): void;
  /** Redraws the mirror image for the frame about to be drawn from `camera`; nothing when the water does not reflect. */
  mirror(gl: WebGLRenderer, scene: Scene, camera: Camera): void;
};

const MIRROR_DEFINE = 'USE_MIRROR';
/** The swell pushes the image along the view more than across it, as real ripples stretch a reflection towards the eye. */
const RIPPLE_STRETCH = '2.5';

type MirrorUniforms = {
  readonly mirrorMap: { value: Texture | null };
  readonly mirrorMatrix: { value: Matrix4 };
  readonly mirrorStrength: { value: number };
  readonly mirrorDistortion: { value: number };
};

/**
 * Mixes the mirror image into the water's body colour, pushed about by the same normal map that shades the swell.
 * The glints the lamps throw on the swell are left whole: they are reflections too, and a mirror that dimmed them
 * would make lamplit water duller, not shinier.
 */
function reflectIn(material: MeshStandardMaterial, uniforms: MirrorUniforms): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n#ifdef ${MIRROR_DEFINE}\nuniform mat4 mirrorMatrix;\nvarying vec4 vMirrorUv;\n#endif`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n#ifdef ${MIRROR_DEFINE}\nvMirrorUv = mirrorMatrix * modelMatrix * vec4(transformed, 1.0);\n#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n#ifdef ${MIRROR_DEFINE}\nuniform sampler2D mirrorMap;\nuniform float mirrorStrength;\nuniform float mirrorDistortion;\nvarying vec4 vMirrorUv;\n#endif`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#ifdef ${MIRROR_DEFINE}
  vec2 mirrorPush = (texture2D(normalMap, vNormalMapUv).xy * 2.0 - 1.0) * mirrorDistortion * vec2(1.0, ${RIPPLE_STRETCH});
  vec3 mirrorImage = texture2D(mirrorMap, vMirrorUv.xy / vMirrorUv.w + mirrorPush).rgb;
  outgoingLight = mix(totalDiffuse, mirrorImage, mirrorStrength) + totalSpecular + totalEmissiveRadiance;
#endif
#include <opaque_fragment>`,
      );
  };
}

function createSurface(spec: WaterSpec, normals: Texture): { readonly material: MeshStandardMaterial; readonly uniforms: MirrorUniforms } {
  // Undoes the exaggeration baked into the normal texture.
  const ripple = spec.ripple / WATER_NORMAL_STEEPNESS;
  const material = new MeshStandardMaterial({
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    normalMap: normals,
    normalScale: new Vector2(ripple, ripple),
  });
  const uniforms: MirrorUniforms = {
    mirrorMap: { value: null },
    mirrorMatrix: { value: new Matrix4() },
    mirrorStrength: { value: 0 },
    mirrorDistortion: { value: 0 },
  };
  reflectIn(material, uniforms);
  return { material, uniforms };
}

/** A define, not a zero strength: without reflections the water's shader is exactly the one it had before them. */
function setReflecting(material: MeshStandardMaterial, reflect: boolean): void {
  const others = Object.fromEntries(Object.entries(material.defines ?? {}).filter(([name]) => name !== MIRROR_DEFINE));
  material.defines = reflect ? { ...others, [MIRROR_DEFINE]: '' } : others;
  material.needsUpdate = true;
}

/** One big sheet under everything; whatever walls the platforms stand on cut the strip out of it. */
export function createWater(spec: WaterSpec, sheet: WaterSheet): Water {
  const normals = createWaterNormals();
  normals.repeat.set(sheet.width / spec.swellSize, sheet.depth / spec.swellSize);
  const { material, uniforms } = createSurface(spec, normals);
  const geometry = new PlaneGeometry(sheet.width, sheet.depth);
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(sheet.centre.x, spec.level, sheet.centre.z);
  mesh.receiveShadow = true;
  // Made the first time the water reflects, so a picture without reflections holds no buffer for them.
  let mirror: Mirror | null = null;
  let reflecting = false;

  return {
    group: mesh,
    update(elapsed) {
      normals.offset.set(elapsed * spec.drift.x, elapsed * spec.drift.y);
    },
    retune(next, reflect) {
      material.color.set(next.color);
      material.roughness = next.roughness;
      uniforms.mirrorStrength.value = next.reflection.strength;
      uniforms.mirrorDistortion.value = next.reflection.distortion;
      if (reflect === reflecting) return;
      reflecting = reflect;
      setReflecting(material, reflect);
    },
    mirror(gl, scene, camera) {
      if (!reflecting) return;
      mirror ??= createMirror(spec.level);
      uniforms.mirrorMap.value = mirror.texture;
      uniforms.mirrorMatrix.value = mirror.matrix;
      mesh.visible = false;
      mirror.render(gl, scene, camera);
      mesh.visible = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      normals.dispose();
      mirror?.dispose();
    },
  };
}
