import * as THREE from "three";

// The bloom round a light the visitor looks at: a lamp's globe, the lens
// of a picture light. There is no post-processing pass. A full-screen
// bloom would draw the frame into a render target of its own, which
// changes the output transform the floor's mirror pass is matched to
// (`floor-mirror.ts`) and the encoding the picture lights' pools
// multiply. So each light carries its own glow: a quad that faces the
// camera, drawn additively, bright in the middle and gone at its edge.
//
// All the glows of one fitting are one geometry, one draw call. The quad
// is pulled toward the camera by half its radius, so the fitting it
// surrounds does not cut it in half, and it keeps its size on screen.
// A glow with a direction is a lens: it shows when the lens looks
// toward the camera and is gone from behind.

export type Glow = {
  position: readonly [number, number, number];
  /** Metres from the centre to where the glow ends. */
  radius: number;
  /** Peak brightness added at the centre, in linear light. */
  strength: number;
  /** Which way the lens looks; omit for a globe, which glows all round. */
  direction?: readonly [number, number, number];
};

const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

export function buildGlowGeometry(glows: readonly Glow[]): THREE.BufferGeometry | null {
  if (glows.length === 0) return null;
  const n = glows.length * 4;
  const center = new Float32Array(n * 3);
  const corner = new Float32Array(n * 2);
  const glow = new Float32Array(n * 2);
  const dir = new Float32Array(n * 3);
  const index: number[] = [];
  glows.forEach((g, i) => {
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      center.set(g.position, v * 3);
      corner.set(CORNERS[k], v * 2);
      glow[v * 2] = g.radius;
      glow[v * 2 + 1] = g.strength;
      if (g.direction) dir.set(g.direction, v * 3);
    }
    const b = i * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geometry = new THREE.BufferGeometry();
  // `position` is the centre: three bounds and culls the geometry by it.
  geometry.setAttribute("position", new THREE.BufferAttribute(center, 3));
  geometry.setAttribute("aCorner", new THREE.BufferAttribute(corner, 2));
  geometry.setAttribute("aGlow", new THREE.BufferAttribute(glow, 2));
  geometry.setAttribute("aDir", new THREE.BufferAttribute(dir, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  // A quad reaches its radius past its centre.
  if (geometry.boundingSphere) {
    geometry.boundingSphere.radius += Math.max(...glows.map((g) => g.radius));
  }
  return geometry;
}

const vertexShader = /* glsl */ `
attribute vec2 aCorner;
attribute vec2 aGlow;
attribute vec3 aDir;
uniform float fogNear;
uniform float fogFar;
varying vec2 vCorner;
varying float vStrength;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float strength = aGlow.y;
  if (dot(aDir, aDir) > 0.0) {
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 look = normalize((modelMatrix * vec4(aDir, 0.0)).xyz);
    strength *= smoothstep(-0.2, 0.8, dot(look, normalize(cameraPosition - world)));
  }
  float dist = max(-mv.z, 1e-4);
  // Fades into the scene's fog as the fitting does.
  strength *= 1.0 - smoothstep(fogNear, fogFar, dist);
  float pull = min(0.5 * aGlow.x, 0.5 * dist);
  float s = (dist - pull) / dist;
  mv.xyz *= s;
  mv.xy += aCorner * aGlow.x * s;
  vCorner = aCorner;
  vStrength = strength;
  gl_Position = projectionMatrix * mv;
  // Nothing to add: put the quad outside the clip volume.
  if (strength <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
varying vec2 vCorner;
varying float vStrength;
void main() {
  float r2 = dot(vCorner, vCorner);
  if (r2 >= 1.0) discard;
  // A tight core and a wide skirt, the shape a lens blooms in, brought
  // to nothing at the quad's rim.
  float g = 0.55 * exp(-r2 * 22.0) + 0.45 * exp(-r2 * 3.5);
  g *= 1.0 - r2;
  gl_FragColor = vec4(uColor * g * vStrength, 1.0);
}
`;

export function makeGlowMaterial(color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: true,
  });
}

/** The warm white of a picture light's lens and of a washer's. */
export const lampGlowMaterial = makeGlowMaterial("#ffe2b0");

const globeGlowFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uCore;
varying vec2 vCorner;
varying float vStrength;
void main() {
  float r2 = dot(vCorner, vCorner);
  if (r2 >= 1.0) discard;
  // Light scattered round a bright source falls off as 1 / (1 + (r/k)^2):
  // most of it hugs the globe, and a long faint tail runs out from it.
  // A corona a fifth of the globe's radius wide lies over its edge, so
  // the white disc runs into the halo with no line, and a wide gaussian
  // skirt warms the air round the lamp. The lens profile above, a tight
  // core inside a skirt, ended in a ring at the globe's edge and read as
  // a sticker, not as a lamp glowing.
  float k2 = uCore * uCore;
  float past = max(sqrt(r2) - uCore, 0.0) / (0.2 * uCore);
  float g = 1.0 / (1.0 + r2 / (1.6 * k2)) + 0.5 * exp(-past * past) + 0.12 * exp(-r2 * 5.0);
  g *= (1.0 - r2) * (1.0 - r2);
  gl_FragColor = vec4(uColor * g * vStrength, 1.0);
}
`;

/**
 * The glow round a lamp's globe. `core` is the globe's radius as a share
 * of the glow's: the halo is brightest there and falls off softly past
 * it.
 */
export function makeGlobeGlowMaterial(
  color: THREE.ColorRepresentation,
  core: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uColor: { value: new THREE.Color(color) },
      uCore: { value: core },
    },
    vertexShader,
    fragmentShader: globeGlowFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: true,
  });
}

/** An opal glass globe with a lamp inside: white where the glass faces
 *  the eye and warmer toward its rim, where the light crosses more
 *  glass. One flat colour read as a paper disc. Unlit, and past tone
 *  mapping, so its middle is the brightest white on screen. */
export function makeGlobeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uCore: { value: new THREE.Color("#fffbf2") },
      uRim: { value: new THREE.Color("#f9d6a0") },
    },
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform vec3 uCore;
      uniform vec3 uRim;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float facing = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
        gl_FragColor = vec4(mix(uRim, uCore, smoothstep(0.0, 0.85, facing)), 1.0);
        #include <fog_fragment>
        // Written to the canvas as authored. Left linear, the rim's pale
        // amber showed as a saturated orange ring round a white disc.
        #include <colorspace_fragment>
      }
    `,
    toneMapped: false,
    fog: true,
  });
}
