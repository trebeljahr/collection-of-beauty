"use client";

// The picture light: a ceiling can per work and the pool it throws on
// the wall and floor, with the frame's shadow inside it. See
// painting-light-rig.ts for the geometry and why this is a shader quad
// rather than a three.js SpotLight.
//
// The pool is drawn after the room's opaque pass as a quad 2 mm in front
// of the wall and a second one just above the floor. Its blend multiplies
// what is already on screen, `dst · (src.a + src.rgb)`: src.rgb is the
// light the spot adds, src.a darkens for contact shadow. Multiplying the
// wall's own colour makes the pool take the wall's hue, which is what a
// white light does to a painted surface, and needs no wall colour here.
// Frames, canvas and plaque sit in front of the quad, so the depth test
// keeps the pool off them and the works keep their true colours.

import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LightRig } from "./painting-light-rig";

/** Warm tungsten-halogen tint, about 3000 K. */
const LIGHT_TINT = new THREE.Color("#ffe9cc");
/** How much the pool brightens the wall: the displayed colour is
 *  (1 + POOL_GAIN × light) × the unlit wall, where light is 1 at the
 *  aim point before the shoulder below. */
const POOL_GAIN = 0.55;
/** Shoulder on the pool's brightness, e / (1 + k·e). The top of a pool
 *  is nearer the lamp and would otherwise run to twice the aim point's
 *  light, which clips a pale wall: red and green reach white before
 *  blue does, and the pool turns yellow. */
const POOL_SHOULDER = 0.35;
/** Darkening right at the frame's edge from ambient occlusion. */
const CONTACT_SHADOW = 0.3;
/** The pool fades with the scene fog so it never brightens the fog. */
const FOG_NEAR = 20;
const FOG_FAR = 80;
const FADE_IN_S = 0.6;
/** Offset of the quads off their surfaces, metres. */
const SURFACE_LIFT = 0.002;

const vertexShader = /* glsl */ `
varying vec3 vPos;
varying vec3 vNormal;
varying float vDepth;
void main() {
  vPos = position;
  vNormal = normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uLightPos[2];
uniform vec3 uLightDir[2];
uniform vec2 uCone[2];
uniform float uLightI[2];
uniform vec3 uFrame;   // half width, half height, front plane z
uniform vec4 uPlaque;  // centre x, centre y, half width, half height
uniform float uPlaqueZ;
uniform vec3 uColor;
uniform float uShoulder;
uniform float uContact;
uniform float uFade;
uniform vec2 uFog;
varying vec3 vPos;
varying vec3 vNormal;
varying float vDepth;

float boxSdf(vec2 p, vec2 c, vec2 h) {
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Is the light visible from p past a rectangle standing on the plane
// z = planeZ? Soft edge widens with the gap, like a real penumbra.
float occlusion(vec3 p, vec3 toL, float planeZ, vec2 c, vec2 h) {
  float gap = planeZ - p.z;
  if (gap <= 0.0 || toL.z <= 1e-4) return 1.0;
  vec2 q = p.xy + toL.xy * (gap / toL.z);
  float soft = 0.003 + 0.3 * gap;
  return smoothstep(-soft, soft, boxSdf(q, c, h));
}

void main() {
  vec3 n = normalize(vNormal);
  float e = 0.0;
  for (int i = 0; i < 2; i++) {
    vec3 toL = uLightPos[i] - vPos;
    float d2 = dot(toL, toL);
    vec3 l = toL * inversesqrt(d2);
    float spot = smoothstep(uCone[i].x, uCone[i].y, dot(-l, uLightDir[i]));
    float lambert = max(dot(n, l), 0.0);
    float vis = occlusion(vPos, toL, uFrame.z, vec2(0.0), uFrame.xy)
              * occlusion(vPos, toL, uPlaqueZ, uPlaque.xy, uPlaque.zw);
    e += uLightI[i] * lambert * spot * vis / d2;
  }
  float contact = 0.0;
  if (n.z > 0.5) {
    // Ambient light comes mostly from above, so the dark rim hangs a
    // little low on the frame and on the plaque.
    contact = uContact * exp(-max(boxSdf(vPos.xy, vec2(0.0, -0.01), uFrame.xy), 0.0) / 0.03);
    contact += uContact * 0.5 * exp(-max(boxSdf(vPos.xy, uPlaque.xy - vec2(0.0, 0.004), uPlaque.zw), 0.0) / 0.012);
  }
  e = e / (1.0 + uShoulder * e);
  float k = uFade * (1.0 - smoothstep(uFog.x, uFog.y, vDepth));
  gl_FragColor = vec4(uColor * e * k, 1.0 - min(contact, 0.6) * k);
}
`;

function makePoolMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uLightPos: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      uLightDir: { value: [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0)] },
      uCone: { value: [new THREE.Vector2(0.5, 0.6), new THREE.Vector2(0.5, 0.6)] },
      uLightI: { value: [0, 0] },
      uFrame: { value: new THREE.Vector3() },
      uPlaque: { value: new THREE.Vector4() },
      uPlaqueZ: { value: 0 },
      uColor: { value: LIGHT_TINT.clone().multiplyScalar(POOL_GAIN) },
      uShoulder: { value: POOL_SHOULDER },
      uContact: { value: CONTACT_SHADOW },
      uFade: { value: 0 },
      uFog: { value: new THREE.Vector2(FOG_NEAR, FOG_FAR) },
    },
    transparent: true,
    depthWrite: false,
    // dst · src.rgb + dst · src.a
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.SrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
}

/** Wall rectangles facing +z and a floor rectangle facing +y. */
function buildPoolGeometry(rig: LightRig, wallZ: number, floorY: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const quad = (corners: number[][], n: number[]) => {
    const base = pos.length / 3;
    for (const c of corners) {
      pos.push(c[0], c[1], c[2]);
      nrm.push(n[0], n[1], n[2]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const z = wallZ + SURFACE_LIFT;
  for (const r of rig.wall) {
    quad(
      [
        [r.xMin, r.yMin, z],
        [r.xMax, r.yMin, z],
        [r.xMax, r.yMax, z],
        [r.xMin, r.yMax, z],
      ],
      [0, 0, 1],
    );
  }
  if (rig.floor) {
    const f = rig.floor;
    const y = floorY + SURFACE_LIFT;
    // Floor rect's yMin/yMax hold local z.
    quad(
      [
        [f.xMin, y, f.yMax],
        [f.xMax, y, f.yMax],
        [f.xMax, y, f.yMin],
        [f.xMin, y, f.yMin],
      ],
      [0, 1, 0],
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ── Fixture ───────────────────────────────────────────────────────────
// A stem from the ceiling, a can aimed at the work and a glowing lens,
// merged into one geometry per head so a fixture is a single draw call.
// It is unlit: the dark body carries a baked top-down shade in its
// vertex colours, which is all a can against a ceiling shows, and the
// lens is simply bright.

const CAN_RADIUS = 0.042;
const CAN_LENGTH = 0.15;
const STEM_RADIUS = 0.007;

const canGeometry = new THREE.CylinderGeometry(CAN_RADIUS, CAN_RADIUS * 0.82, CAN_LENGTH, 18, 1);
// Cylinder axis is +y; the lens end is the bottom cap at y = -L/2.
const lensGeometry = new THREE.CircleGeometry(CAN_RADIUS * 0.78, 18);
lensGeometry.rotateX(Math.PI / 2);
lensGeometry.translate(0, -CAN_LENGTH / 2 - 0.001, 0);
const stemGeometry = new THREE.CylinderGeometry(STEM_RADIUS, STEM_RADIUS, 1, 8, 1);

const fixtureBodyColor = new THREE.Color("#2b2927");
const fixtureLensColor = new THREE.Color("#fff1d6");
const fixtureUnlitMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

const UP = new THREE.Vector3(0, 1, 0);

/** Give a part its vertex colours. `shaded` bakes a top-down falloff
 *  from the normals so the can reads as round. */
function tint(g: THREE.BufferGeometry, color: THREE.Color, shaded: boolean): THREE.BufferGeometry {
  const normal = g.getAttribute("normal");
  const colors = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i++) {
    const k = shaded ? 0.55 + 0.45 * (0.5 + 0.5 * normal.getY(i)) : 1;
    colors[i * 3] = color.r * k;
    colors[i * 3 + 1] = color.g * k;
    colors[i * 3 + 2] = color.b * k;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

function buildFixtureGeometry(
  position: [number, number, number],
  direction: [number, number, number],
  ceilingY: number,
): THREE.BufferGeometry {
  // The can's +y axis points away from the work, so the lens (its -y
  // end) faces along the beam.
  const aim = new THREE.Quaternion().setFromUnitVectors(
    UP,
    new THREE.Vector3(-direction[0], -direction[1], -direction[2]),
  );
  const stemLength = Math.max(0.02, ceilingY - position[1]);
  const parts = [
    tint(
      stemGeometry
        .clone()
        .scale(1, stemLength, 1)
        .translate(position[0], position[1] + stemLength / 2, position[2]),
      fixtureBodyColor,
      true,
    ),
    tint(
      canGeometry
        .clone()
        .applyQuaternion(aim)
        .translate(...position),
      fixtureBodyColor,
      true,
    ),
    tint(
      lensGeometry
        .clone()
        .applyQuaternion(aim)
        .translate(...position),
      fixtureLensColor,
      false,
    ),
  ];
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged;
}

function Fixture({
  position,
  direction,
  ceilingY,
}: {
  position: [number, number, number];
  direction: [number, number, number];
  ceilingY: number;
}) {
  const geometry = useMemo(
    () => buildFixtureGeometry(position, direction, ceilingY),
    [position, direction, ceilingY],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={fixtureUnlitMaterial} />;
}

export type PaintingLightProps = {
  rig: LightRig;
  /** Local z of the wall plane and y of the floor and ceiling. */
  wallZ: number;
  floorY: number;
  ceilingY: number;
  /** Outer half extents and front plane of the frame. */
  frameHalfW: number;
  frameHalfH: number;
  frameFrontZ: number;
  /** Plaque mount rectangle on the wall. */
  plaque: { x: number; y: number; halfW: number; halfH: number; frontZ: number };
  /** Draw the ceiling cans as well as the pool. */
  fixtures: boolean;
};

export const PaintingLight = memo(function PaintingLight({
  rig,
  wallZ,
  floorY,
  ceilingY,
  frameHalfW,
  frameHalfH,
  frameFrontZ,
  plaque,
  fixtures,
}: PaintingLightProps) {
  const material = useMemo(makePoolMaterial, []);
  const geometry = useMemo(() => buildPoolGeometry(rig, wallZ, floorY), [rig, wallZ, floorY]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const u = material.uniforms;
    for (let i = 0; i < 2; i++) {
      const head = rig.heads[i];
      u.uLightI.value[i] = head ? head.intensity : 0;
      if (!head) continue;
      (u.uLightPos.value[i] as THREE.Vector3).set(...head.position);
      (u.uLightDir.value[i] as THREE.Vector3).set(...head.direction);
      (u.uCone.value[i] as THREE.Vector2).set(head.cosOuter, head.cosInner);
    }
    (u.uFrame.value as THREE.Vector3).set(frameHalfW, frameHalfH, frameFrontZ);
    (u.uPlaque.value as THREE.Vector4).set(plaque.x, plaque.y, plaque.halfW, plaque.halfH);
    u.uPlaqueZ.value = plaque.frontZ;
  }, [material, rig, frameHalfW, frameHalfH, frameFrontZ, plaque]);

  // Fade in when the work mounts, so a room's pools come up like a
  // circuit being switched on rather than popping in one by one.
  const fade = useRef(0);
  useFrame((_, dt) => {
    if (fade.current >= 1) return;
    fade.current = Math.min(1, fade.current + dt / FADE_IN_S);
    material.uniforms.uFade.value = fade.current * fade.current * (3 - 2 * fade.current);
  });

  return (
    <>
      <mesh geometry={geometry} material={material} renderOrder={1} frustumCulled />
      {fixtures &&
        rig.heads.map((h) => (
          <Fixture
            key={`${h.position[0]}`}
            position={h.position}
            direction={h.direction}
            ceilingY={ceilingY}
          />
        ))}
    </>
  );
});
