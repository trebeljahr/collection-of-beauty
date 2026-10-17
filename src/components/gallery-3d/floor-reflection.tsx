"use client";

// The floor's reflection of the room: one extra render of the scene per
// frame, from a camera mirrored under the floor of the storey the
// visitor is on, blurred and handed to every floor material on that
// storey (floor-mirror.ts has the shader patch and the camera).
//
// One pass serves the whole storey because all its floors lie at one
// height. Floors of other storeys are told apart by that height in the
// shader and keep the plain environment reflection.
//
// On a spiral the pass is paused and the reflection fades out. Two
// storeys are mounted in full there, and the camera looks down at the
// floors at angles where Fresnel leaves a few percent of reflection to
// see. The stairwell's own floor reflects like any other. Where it is
// cut out round the spiral there is no floor and so nothing to reflect
// in, and the storey below, seen through the hole, lies under the
// mirror's clip plane and stays out of the image.
//
// A grand stair hall is not the stairs: the pass runs on its floor as in
// any room. It was paused there until 13 October 2026, and a gallery's
// floor then changed as the visitor stepped out of the hall: with the
// pass off a floor shows the even sheen of the environment map, with it
// on the room itself, which in a crimson room is far darker. Up a hall's
// flight the reflection thins out with the eye's height (`FLIGHT_FADE_M`)
// and is gone before the visitor's floor becomes the one above.
//
// It is off on touch devices and switches itself off for the rest of the
// visit when the frame rate stays low (createFrameRateGuard). Off means
// the floor materials compile to three's stock shader.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import { INTER_FLOOR_HEIGHT } from "@/lib/gallery-layout/world-coords";
import {
  createFrameRateGuard,
  floorMirrorUniforms,
  hideDistantWorks,
  placeFloorMirrorCamera,
  setFloorReflectionCompiled,
} from "./floor-mirror";
import { resumeRoomCulling, suspendRoomCulling } from "./room-culling";

/** Mirror image size. The blur below leaves no detail that needs more. */
const MIRROR_PX = 512;
const BLUR_PX = 256;
/** Share of the environment radiance replaced by the mirror image. The
 *  rest keeps the floor's sheen even through changes in viewing angle
 *  and when the pass fades out on stairs or slower devices. */
const MIRROR_MIX = 0.5;
const FADE_S = 0.5;
/** Eye heights over the floor of the visitor's storey between which the
 *  reflection thins to nothing, on the way up a grand stair's flight.
 *  It is a matter of height and not of time, so it is gone at any pace
 *  before the storey above becomes the visitor's: that happens half a
 *  storey up, with a ducked eye above 4.1 m. A jump off a bench on tiptoe
 *  reaches 3.42 m and stays under the range. */
const FLIGHT_FADE_M: readonly [number, number] = [3.6, 4.1];
/** Blur taps move this far per pass, in uv. Four passes at 0.5, 1.5,
 *  2.5 and 3.5 steps spread a point over about 4 % of the image's width
 *  and 11 % of its height: a satin floor smears a reflection along the
 *  line of sight, which on screen is the vertical. */
const BLUR_STEP = new THREE.Vector2(1 / 200, 1 / 70);
const BLUR_PASSES = 4;

/** What the debug HUD prints about the pass. `cpuMs` is the time spent
 *  issuing it, smoothed; the GPU's share is not in it. */
export const floorReflectionDebug = { state: "off", calls: 0, triangles: 0, cpuMs: 0 };

// Two things decide whether the pass runs, beside the device: the guard's
// verdict, which outlives a Canvas remount (a lost WebGL context is no
// reason to try again on a machine that was already too slow), and a dev
// override that pins the reflection on or off past every gate so one
// pose can be measured both ways.
const gate = { forced: null as boolean | null, gaveUp: false };
const gateListeners = new Set<() => void>();
function setGate(patch: Partial<typeof gate>): void {
  Object.assign(gate, patch);
  for (const notify of gateListeners) notify();
}
function subscribeGate(notify: () => void): () => void {
  gateListeners.add(notify);
  return () => {
    gateListeners.delete(notify);
  };
}

/** Dev only, reached through `window.__galleryFloorReflection` while the
 *  debug HUD is on. `null` hands the decision back to the gates. */
export function forceFloorReflection(on: boolean | null): void {
  setGate({ forced: on });
}

const blurVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Kawase blur: four bilinear taps on a rectangle that grows each pass.
const blurFragment = /* glsl */ `
uniform sampler2D uSource;
uniform vec2 uOffset;
varying vec2 vUv;
void main() {
  gl_FragColor = 0.25 * (
    texture2D(uSource, vUv + uOffset) +
    texture2D(uSource, vUv - uOffset) +
    texture2D(uSource, vUv + vec2(uOffset.x, -uOffset.y)) +
    texture2D(uSource, vUv + vec2(-uOffset.x, uOffset.y))
  );
}
`;

type MirrorRig = {
  image: THREE.WebGLRenderTarget;
  blurA: THREE.WebGLRenderTarget;
  blurB: THREE.WebGLRenderTarget;
  blurMaterial: THREE.ShaderMaterial;
  blurScene: THREE.Scene;
  blurCamera: THREE.Camera;
  dispose(): void;
};

function createMirrorRig(): MirrorRig {
  const image = new THREE.WebGLRenderTarget(MIRROR_PX, MIRROR_PX, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: true,
  });
  // three compiles a second variant of every program it draws into an
  // ordinary render target (linear output, no tone mapping) and looks
  // the variant up again each time a material changes sides. Every
  // painting has two materials of its own, so that is hundreds of
  // lookups a frame and a second set of shaders to compile. Marked as an
  // XR target in the canvas's colour space, this target gets the canvas's
  // output transform instead (WebGLPrograms.getParameters) and both
  // passes run the same programs. It also makes the picture lights'
  // pools, which multiply what is already in the framebuffer, come out
  // as they do on screen. The image is display-encoded as a result; the
  // floor shader decodes it. `isXRRenderTarget` is internal to three:
  // re-check this on an upgrade.
  image.texture.colorSpace = THREE.SRGBColorSpace;
  (image as THREE.WebGLRenderTarget & { isXRRenderTarget?: boolean }).isXRRenderTarget = true;

  const blurOptions = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
  };
  const blurA = new THREE.WebGLRenderTarget(BLUR_PX, BLUR_PX, blurOptions);
  const blurB = new THREE.WebGLRenderTarget(BLUR_PX, BLUR_PX, blurOptions);

  const blurMaterial = new THREE.ShaderMaterial({
    vertexShader: blurVertex,
    fragmentShader: blurFragment,
    uniforms: { uSource: { value: null }, uOffset: { value: new THREE.Vector2() } },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMaterial);
  quad.frustumCulled = false;
  const blurScene = new THREE.Scene();
  blurScene.add(quad);

  return {
    image,
    blurA,
    blurB,
    blurMaterial,
    blurScene,
    blurCamera: new THREE.Camera(),
    dispose() {
      image.dispose();
      blurA.dispose();
      blurB.dispose();
      blurMaterial.dispose();
      quad.geometry.dispose();
    },
  };
}

export function FloorReflection({
  floorY,
  touch,
  onStairs,
  watchFrameRate,
}: {
  /** Floor height of the storey the visitor is on. */
  floorY: number;
  /** `useTouchDevice()`: null until known, and the pass waits for it. */
  touch: boolean | null;
  /** The visitor is riding a spiral between two storeys. */
  onStairs: boolean;
  /** Let slow frames count against the reflection. False behind the
   *  start curtain, where the entry room's uploads are no measure of how
   *  the museum will run. */
  watchFrameRate: boolean;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  const forced = useSyncExternalStore(subscribeGate, () => gate.forced);
  const gaveUp = useSyncExternalStore(subscribeGate, () => gate.gaveUp);
  const on = forced ?? (touch === false && !gaveUp);

  // Targets belong to the renderer that made them: the Canvas remounts
  // with a new one after a lost WebGL context, and this component with it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `gl` keys the targets to their renderer.
  const rig = useMemo(() => (on ? createMirrorRig() : null), [on, gl]);
  useEffect(() => {
    if (!rig) return;
    setFloorReflectionCompiled(true);
    return () => {
      setFloorReflectionCompiled(false);
      floorMirrorUniforms.uFloorMirror.value = null;
      floorMirrorUniforms.uFloorMirrorMix.value = 0;
      scene.matrixWorldAutoUpdate = true;
      rig.dispose();
    };
  }, [rig, scene]);

  const mirror = useMemo(() => new THREE.PerspectiveCamera(), []);
  const guard = useMemo(createFrameRateGuard, []);
  const mix = useRef(0);
  const closing = useRef(false);
  const hidden = useRef<THREE.Object3D[]>([]);

  // Mounted after Player, so this runs after Player's useFrame and the
  // camera is where this frame will draw it.
  useFrame((_, dt) => {
    const debug = floorReflectionDebug;
    debug.calls = 0;
    debug.triangles = 0;
    // Undo last frame's hand-over (below) before anything can return.
    scene.matrixWorldAutoUpdate = true;
    if (!rig) {
      mix.current = 0;
      debug.state = forced === false ? "off (forced)" : gaveUp ? "off (slow)" : "off (touch)";
      return;
    }

    const eye = camera.position.y - floorY;
    const standing = !onStairs && eye > 0 && eye < INTER_FLOOR_HEIGHT;
    const target = standing && !closing.current ? MIRROR_MIX : 0;
    const step = (MIRROR_MIX / FADE_S) * Math.min(dt, 0.1);
    mix.current =
      mix.current < target
        ? Math.min(target, mix.current + step)
        : Math.max(target, mix.current - step);
    const shown =
      mix.current * (1 - THREE.MathUtils.smoothstep(eye, FLIGHT_FADE_M[0], FLIGHT_FADE_M[1]));
    floorMirrorUniforms.uFloorMirrorMix.value = shown;
    debug.state = standing ? "on" : "paused";
    if (shown === 0) {
      // Faded out after the guard tripped: drop the targets and the
      // shader patch for the rest of the visit.
      if (closing.current && mix.current === 0) setGate({ gaveUp: true });
      return;
    }

    // three refreshes the camera's world matrix inside its own render,
    // which comes after this.
    camera.updateMatrixWorld();
    const placed = placeFloorMirrorCamera(
      camera as THREE.PerspectiveCamera,
      floorY,
      mirror,
      floorMirrorUniforms.uFloorMirrorMatrix.value,
    );
    if (!placed) {
      mix.current = 0;
      floorMirrorUniforms.uFloorMirrorMix.value = 0;
      return;
    }
    floorMirrorUniforms.uFloorMirrorY.value = floorY;

    // The floors sample the blurred image, never `rig.image`, so drawing
    // into it is safe even though the mirror camera can see a floor: the
    // storey above's, up the stairwell.
    const started = performance.now();
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(rig.image);
    // The mirror sees under the walls into every room, so room culling
    // steps aside for it (room-culling.ts says why) and the pass keeps
    // its own, coarser rule for the works.
    suspendRoomCulling();
    hideDistantWorks(camera.position.x, camera.position.z, floorY, hidden.current);
    try {
      gl.render(scene, mirror);
    } finally {
      for (const works of hidden.current) works.visible = true;
      hidden.current.length = 0;
      resumeRoomCulling();
    }
    debug.calls = gl.info.render.calls;
    debug.triangles = gl.info.render.triangles;
    // three walks the whole scene graph to refresh world matrices at the
    // start of every render. This render has just done it, and nothing
    // moves between here and the frame's own render, which follows at
    // once: let that one reuse them. The second walk was about half of
    // what this pass cost the CPU. An object moved by a frame callback
    // that runs after this one would be drawn a frame late; the museum
    // has none.
    scene.matrixWorldAutoUpdate = false;

    const blur = rig.blurMaterial.uniforms;
    let source = rig.image;
    for (let i = 0; i < BLUR_PASSES; i++) {
      const destination = i % 2 === 0 ? rig.blurA : rig.blurB;
      blur.uSource.value = source.texture;
      (blur.uOffset.value as THREE.Vector2).copy(BLUR_STEP).multiplyScalar(i + 0.5);
      gl.setRenderTarget(destination);
      gl.render(rig.blurScene, rig.blurCamera);
      source = destination;
    }
    floorMirrorUniforms.uFloorMirror.value = source.texture;
    gl.setRenderTarget(previous);
    debug.cpuMs += (performance.now() - started - debug.cpuMs) * 0.05;

    // Only frames that paid for the pass say whether it is affordable.
    if (watchFrameRate && forced === null && guard.sample(dt)) closing.current = true;
  });

  return null;
}
