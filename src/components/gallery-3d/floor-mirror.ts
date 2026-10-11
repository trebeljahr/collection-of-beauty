// The pure half of the floor's planar reflection: the layer that keeps
// small parts out of the mirror, the shader patch every floor material
// carries, the mirrored camera and the frame-rate guard. The pass that
// uses them each frame is floor-reflection.tsx.
//
// The idea follows the floor of github.com/justdataplease/art-history-museum
// (MIT): a second render of the room from below the floor, fed to three's
// own indirect-specular term in place of the environment map's radiance.
// three then applies the dielectric Fresnel and the roughness response it
// applies to any environment: about 4 % underfoot, a clear sheen toward
// the far wall. Multiplying the mirror image into the albedo, the usual
// reflector shortcut, gives neither.

import * as THREE from "three";

/** Objects on this layer are drawn for the visitor and skipped by the
 *  mirror pass, whose camera sees layer 0 only. It holds the parts too
 *  small to read in a blurred 512 px reflection, which are also most of
 *  a room's draw calls: light fixtures, frame mouldings, plaques and
 *  their text, skirting, door trim, balusters. A three.js layer is per
 *  object, not inherited, so each mesh sets it itself. The main camera
 *  enables the layer in the Canvas's onCreated (index.tsx). */
export const UNREFLECTED_LAYER = 1;

/** One set of uniforms for every floor material in the building. The
 *  pass writes them once a frame; three reads a uniform's value each
 *  time it binds a material, so all floors follow. */
export const floorMirrorUniforms = {
  /** Blurred mirror image, display-encoded (see floor-reflection.tsx). */
  uFloorMirror: { value: null as THREE.Texture | null },
  /** World position to that image's uv, before the perspective divide. */
  uFloorMirrorMatrix: { value: new THREE.Matrix4() },
  /** Height of the mirrored storey's floor, world metres. */
  uFloorMirrorY: { value: 0 },
  /** Share of the environment radiance the mirror image replaces. */
  uFloorMirrorMix: { value: 0 },
};

/** A floor fragment takes the mirror image only within this distance of
 *  the mirrored plane. Room floors sit on it, their slab tops 1 mm and
 *  the stairwell floor 5 mm below; every other storey is 6 m away and
 *  keeps the plain environment reflection. */
const PLANE_TOLERANCE_M = 0.02;

const reflectiveFloors = new Set<THREE.MeshStandardMaterial>();
let compiledIn = false;

/**
 * Patch a floor material to reflect the mirror pass.
 *
 * The patch sits behind `#ifdef FLOOR_REFLECTION`. While the reflection
 * is off (touch devices, a low frame rate) the define is absent and the
 * program is three's stock one, with no extra sampler and no varyings.
 */
export function withFloorReflection<T extends THREE.MeshStandardMaterial>(material: T): T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, floorMirrorUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
#ifdef FLOOR_REFLECTION
uniform mat4 uFloorMirrorMatrix;
uniform float uFloorMirrorY;
varying vec4 vFloorMirrorUv;
varying float vFloorMirrorMask;
#endif`,
      )
      .replace(
        "#include <project_vertex>",
        /* glsl */ `#include <project_vertex>
#ifdef FLOOR_REFLECTION
{
  vec4 floorWorld = modelMatrix * vec4( transformed, 1.0 );
  vec3 floorNormal = normalize( mat3( modelMatrix ) * objectNormal );
  vFloorMirrorUv = uFloorMirrorMatrix * floorWorld;
  // Up-facing faces at the mirrored height: not the slab's sides or
  // underside, and not another storey's floor.
  vFloorMirrorMask = step( abs( floorWorld.y - uFloorMirrorY ), ${PLANE_TOLERANCE_M.toFixed(3)} )
    * step( 0.5, floorNormal.y );
}
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
#ifdef FLOOR_REFLECTION
uniform sampler2D uFloorMirror;
uniform float uFloorMirrorMix;
varying vec4 vFloorMirrorUv;
varying float vFloorMirrorMask;
#endif`,
      )
      .replace(
        "#include <lights_fragment_maps>",
        /* glsl */ `#include <lights_fragment_maps>
#if defined( FLOOR_REFLECTION ) && defined( RE_IndirectSpecular )
{
  // \`radiance\` is what the environment map sends along the mirror
  // direction. Swap in what the room sends; RE_IndirectSpecular then
  // weighs it by Fresnel and roughness as it would the environment.
  vec3 mirrored = sRGBTransferEOTF( texture2DProj( uFloorMirror, vFloorMirrorUv ) ).rgb;
  radiance = mix( radiance, mirrored, uFloorMirrorMix * vFloorMirrorMask );
}
#endif`,
      );
  };
  // One program for all floors, whatever closure patched them.
  material.customProgramCacheKey = () => "floor-reflection";
  if (compiledIn) material.defines = { ...material.defines, FLOOR_REFLECTION: "" };
  reflectiveFloors.add(material);
  return material;
}

/** Compile the reflection into every floor material, or back out. */
export function setFloorReflectionCompiled(on: boolean): void {
  if (compiledIn === on) return;
  compiledIn = on;
  for (const material of reflectiveFloors) {
    const defines = { ...material.defines };
    if (on) defines.FLOOR_REFLECTION = "";
    else delete defines.FLOOR_REFLECTION;
    material.defines = defines;
    material.needsUpdate = true;
  }
}

// ── Works the mirror skips ────────────────────────────────────────────
// A storey keeps the works of every room the visitor has been near
// mounted, up to 300, and three culls by frustum alone: without this the
// mirror pass would draw the works of rooms behind walls. Each room hands
// in the group that holds its works; the pass hides the groups of rooms
// the visitor is neither in nor close to while it renders. Their walls
// and ceilings stay, so a doorway still reflects a lit room.

export type MirrorRoom = {
  /** Group holding the room's works: canvases, frames, pools, plaques. */
  works: THREE.Object3D;
  /** Floor rectangle and height, world metres. */
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  y: number;
};

/** A room's works are mirrored while the visitor is within this distance
 *  of the room. Standing in a doorway counts for both rooms; from further
 *  back, the strip of the next room seen through the door is too small
 *  a part of the reflection to miss its works. */
export const MIRROR_WORKS_RANGE_M = 5;

const mirrorRooms = new Set<MirrorRoom>();

/** Returns the function that takes the room out again. */
export function registerMirrorRoom(room: MirrorRoom): () => void {
  mirrorRooms.add(room);
  return () => {
    mirrorRooms.delete(room);
  };
}

/** Hide the works of rooms on other storeys or out of range of (x, z),
 *  and append each hidden group to `hidden` so the caller can show them
 *  again after the mirror render. */
export function hideDistantWorks(
  x: number,
  z: number,
  floorY: number,
  hidden: THREE.Object3D[],
): void {
  for (const room of mirrorRooms) {
    if (!room.works.visible) continue;
    const dx = x - Math.min(Math.max(x, room.xMin), room.xMax);
    const dz = z - Math.min(Math.max(z, room.zMin), room.zMax);
    const near = Math.abs(room.y - floorY) < 0.5 && dx * dx + dz * dz <= MIRROR_WORKS_RANGE_M ** 2;
    if (near) continue;
    room.works.visible = false;
    hidden.push(room.works);
  }
}

// ── Mirrored camera ───────────────────────────────────────────────────

/** How far above the floor the mirror pass starts drawing. It has to
 *  clear the floor itself and the picture lights' floor pools, which lie
 *  2 mm above it: both face up, and a mirror camera looking up from
 *  below must not see their undersides. */
const CLIP_LIFT_M = 0.004;

const _position = new THREE.Vector3();
const _target = new THREE.Vector3();
const _up = new THREE.Vector3();
const _rotation = new THREE.Matrix4();
const _plane = new THREE.Plane();
const _planeNormal = new THREE.Vector3(0, 1, 0);
const _planePoint = new THREE.Vector3();
const _clip = new THREE.Vector4();
const _corner = new THREE.Vector4();

/**
 * Place `mirror` where `camera` would be seen in a mirror lying at
 * height `planeY`, and write the matrix that takes a world position to
 * its uv in the mirror's image into `uvMatrix`.
 *
 * Returns false, leaving both untouched, when the camera is at or below
 * the plane: there is no reflection to see from there.
 *
 * `camera.matrixWorld` must be current. The mirror's projection is the
 * camera's with its near plane swung onto the floor (Lengyel's oblique
 * clipping), so nothing under the floor, the storey below included, is
 * drawn into the reflection.
 */
export function placeFloorMirrorCamera(
  camera: THREE.PerspectiveCamera,
  planeY: number,
  mirror: THREE.PerspectiveCamera,
  uvMatrix: THREE.Matrix4,
): boolean {
  _position.setFromMatrixPosition(camera.matrixWorld);
  if (_position.y <= planeY + CLIP_LIFT_M) return false;

  // Mirror the eye, a point straight ahead of it and its up vector.
  // lookAt then builds a proper (right-handed) camera from them, so
  // triangle winding is unchanged; the image comes out flipped left to
  // right, which the uv matrix accounts for by construction.
  _rotation.extractRotation(camera.matrixWorld);
  _target.set(0, 0, -1).applyMatrix4(_rotation).add(_position);
  _up.set(0, 1, 0).applyMatrix4(_rotation);
  _position.y = 2 * planeY - _position.y;
  _target.y = 2 * planeY - _target.y;
  _up.y = -_up.y;

  mirror.position.copy(_position);
  mirror.up.copy(_up);
  mirror.lookAt(_target);
  mirror.near = camera.near;
  mirror.far = camera.far;
  mirror.updateMatrixWorld();
  mirror.projectionMatrix.copy(camera.projectionMatrix);

  // ndc [-1, 1] → uv [0, 1], then projection and view.
  uvMatrix
    .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
    .multiply(mirror.projectionMatrix)
    .multiply(mirror.matrixWorldInverse);

  // Oblique near plane. With the floor plane c in the mirror's view
  // space, the third row of the projection becomes a multiple of c such
  // that the far corner opposite the plane still lands on the far side.
  _planePoint.set(0, planeY + CLIP_LIFT_M, 0);
  _plane.setFromNormalAndCoplanarPoint(_planeNormal, _planePoint);
  _plane.applyMatrix4(mirror.matrixWorldInverse);
  _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
  const e = mirror.projectionMatrix.elements;
  _corner.set(
    (Math.sign(_clip.x) + e[8]) / e[0],
    (Math.sign(_clip.y) + e[9]) / e[5],
    -1,
    (1 + e[10]) / e[14],
  );
  _clip.multiplyScalar(2 / _clip.dot(_corner));
  e[2] = _clip.x;
  e[6] = _clip.y;
  e[10] = _clip.z + 1;
  e[14] = _clip.w;
  mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();
  return true;
}

// ── Frame-rate guard ──────────────────────────────────────────────────

/** Length of one verdict's window, seconds. */
const GUARD_WINDOW_S = 1.5;
/** A frame longer than this is slow: under 48 fps, which on a 60 Hz
 *  screen means a missed refresh. The pass adds 15 to 20 % to a frame,
 *  enough to push a machine near its limit over it. A 50 Hz screen stays
 *  clear of the line. */
const GUARD_SLOW_FRAME_S = 1 / 48;
/** Consecutive slow windows before the reflection is given up. */
const GUARD_STRIKES = 3;

export type FrameRateGuard = {
  /** Feed one frame's duration in seconds. True once the frame rate has
   *  stayed low long enough; it then stays true. */
  sample(dt: number): boolean;
};

/**
 * Decides when the museum is too slow to afford the mirror pass. A
 * window is slow when most of its frames are, so the hitches of a room
 * loading its textures, or the one long frame after a hidden tab comes
 * back, do not count, and a machine stuck at 6 fps does. Three slow
 * windows in a row, about five seconds, trip it for good: the pass is
 * never switched back on, so it cannot flicker at the threshold.
 */
export function createFrameRateGuard(): FrameRateGuard {
  let frames = 0;
  let slowFrames = 0;
  let elapsed = 0;
  let strikes = 0;
  let tripped = false;
  return {
    sample(dt) {
      if (tripped) return true;
      if (!(dt > 0)) return false;
      frames++;
      elapsed += dt;
      if (dt > GUARD_SLOW_FRAME_S) slowFrames++;
      if (elapsed < GUARD_WINDOW_S) return false;
      strikes = slowFrames * 2 > frames ? strikes + 1 : 0;
      frames = 0;
      slowFrames = 0;
      elapsed = 0;
      tripped = strikes >= GUARD_STRIKES;
      return tripped;
    },
  };
}
