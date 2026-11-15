import { HalfFloatType, Matrix4, PerspectiveCamera, Plane, Vector2, Vector3, Vector4, WebGLRenderTarget, type Camera, type Scene, type Texture, type WebGLRenderer } from 'three';

/** The scene as a level sheet of water sees it, redrawn each frame from the camera's mirror image below the surface. */
export type Mirror = {
  readonly texture: Texture;
  /** World position to where that point's reflection sits in `texture`. */
  readonly matrix: Matrix4;
  /** The caller hides whatever must not be reflected, the sheet itself included, before calling. */
  render(gl: WebGLRenderer, scene: Scene, camera: Camera): void;
  dispose(): void;
};

/** Of the canvas's pixels each way: the swell smears the image, so a quarter of the pixels is not missed. */
const SCALE = 0.5;
const UP = new Vector3(0, 1, 0);
/** Clip space (-1..1) to texture space (0..1). */
const TO_UV = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

const mirrored = (v: Vector3): Vector3 => v.reflect(UP).negate();

/** Puts `eye` where `camera` would be seen from under the surface, looking at the mirror image of what it looks at. */
function placeBelow(eye: PerspectiveCamera, camera: Camera, surface: Vector3): void {
  const rotation = new Matrix4().extractRotation(camera.matrixWorld);
  const from = camera.getWorldPosition(new Vector3());
  const ahead = new Vector3(0, 0, -1).applyMatrix4(rotation).add(from);
  eye.position.copy(mirrored(surface.clone().sub(from)).add(surface));
  eye.up.set(0, 1, 0).applyMatrix4(rotation).reflect(UP);
  eye.lookAt(mirrored(surface.clone().sub(ahead)).add(surface));
  eye.updateMatrixWorld();
  eye.projectionMatrix.copy(camera.projectionMatrix);
}

/**
 * Bends the near plane onto the water's surface (Lengyel's oblique frustum), so nothing under the water, such as the
 * foot of a quay wall, is drawn into the reflection.
 */
function clipAtSurface(eye: PerspectiveCamera, surface: Vector3): void {
  const plane = new Plane().setFromNormalAndCoplanarPoint(UP, surface).applyMatrix4(eye.matrixWorldInverse);
  const clip = new Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  const p = eye.projectionMatrix.elements;
  const q = new Vector4(
    (Math.sign(clip.x) + (p[8] ?? 0)) / (p[0] ?? 1),
    (Math.sign(clip.y) + (p[9] ?? 0)) / (p[5] ?? 1),
    -1,
    (1 + (p[10] ?? 0)) / (p[14] ?? 1),
  );
  clip.multiplyScalar(2 / clip.dot(q));
  p[2] = clip.x;
  p[6] = clip.y;
  p[10] = clip.z + 1;
  p[14] = clip.w;
}

export function createMirror(level: number): Mirror {
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  const eye = new PerspectiveCamera();
  const matrix = new Matrix4();
  const surface = new Vector3(0, level, 0);
  const buffer = new Vector2();
  // The first image is drawn before the scene has ever been, so that once the shadows have to be drawn here.
  let shadowsDrawn = false;

  return {
    texture: target.texture,
    matrix,
    render(gl, scene, camera) {
      gl.getDrawingBufferSize(buffer).multiplyScalar(SCALE).floor();
      if (buffer.x !== target.width || buffer.y !== target.height) target.setSize(Math.max(1, buffer.x), Math.max(1, buffer.y));
      camera.updateMatrixWorld();
      placeBelow(eye, camera, surface);
      matrix.copy(TO_UV).multiply(eye.projectionMatrix).multiply(eye.matrixWorldInverse);
      clipAtSurface(eye, surface);

      const restore = { target: gl.getRenderTarget(), shadows: gl.shadowMap.autoUpdate };
      // The shadows drawn for the last frame serve: a frame's lag in a rippled reflection cannot be seen.
      gl.shadowMap.autoUpdate = !shadowsDrawn;
      shadowsDrawn = true;
      gl.setRenderTarget(target);
      gl.render(scene, eye);
      gl.setRenderTarget(restore.target);
      gl.shadowMap.autoUpdate = restore.shadows;
    },
    dispose() {
      target.dispose();
    },
  };
}
