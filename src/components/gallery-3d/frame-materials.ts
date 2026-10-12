"use client";

// Frame materials: one per surface (leaf, wood, lacquer, paint, board,
// silk, cloth), shared by every frame that uses it. Only geometry is
// per work, and a frame's colour, wear and polish ride in its vertices.
//
// Each is a MeshStandardMaterial with the procedural maps from
// frame-maps.ts and one shader patch, `patchFrameShader`, that adds what
// the stock material cannot do:
//
//  - a second normal map, the carve atlas, read with the geometry's
//    `aCarveUv` and gated per vertex, on top of the surface's own;
//  - per-vertex roughness (burnished high points, matte hollows) and,
//    on gilt, wear that shows the red bole on the high points;
//  - shading by distance: a moulding too small on screen to resolve is
//    drawn smooth and matte, or its gold crawls as the visitor walks;
//  - the picture light. Frames sit in front of the quad that draws a
//    work's pool of light (painting-light.tsx), so that light never
//    reached them and carving lit only by the environment map is flat.
//    The patch adds one directional term from where the ceiling can
//    hangs. It is arithmetic in the frame's own fragment shader, not a
//    three.js light: it costs nothing on the walls or floor.

import * as THREE from "three";
import type { FrameDesign, FrameSurface } from "@/lib/gallery-layout/frame-design";
import { getFrameMaps } from "./frame-maps";

/** Direction to the picture light in the frame's own space (x right,
 *  y up, z out of the wall): above and in front, like the can. */
const LIGHT_DIR = new THREE.Vector3(0, 0.8, 0.6).normalize();
/** Its colour and strength, shared by every frame material. */
const lightUniform = { value: new THREE.Color("#ffecd0").multiplyScalar(2.7) };

type PatchOptions = {
  /** The surface can be carved: it reads the carve atlas. */
  carve?: boolean;
  /** Gilt only: the bole colour and the wear thresholds. */
  wear?: { color: string; from: number; to: number };
  /** The map's alpha is a roughness multiplier. */
  alphaRoughness?: boolean;
  /** Tint of the recesses, multiplied in where occlusion is low. */
  recess?: string;
};

function patchFrameShader(material: THREE.MeshStandardMaterial, options: PatchOptions): void {
  const maps = getFrameMaps();
  const uniforms = {
    uCarveMap: { value: maps.carve },
    uWearColor: { value: new THREE.Color(options.wear?.color ?? "#000000") },
    uWear: { value: new THREE.Vector2(options.wear?.from ?? 2, options.wear?.to ?? 3) },
    uRecess: { value: new THREE.Color(options.recess ?? "#ffffff") },
    uFrameLight: lightUniform,
    uFrameLightDir: { value: LIGHT_DIR },
  };
  const defines = [
    options.carve ? "#define FRAME_CARVE" : "",
    options.wear ? "#define FRAME_WEAR" : "",
    options.alphaRoughness ? "#define FRAME_ALPHA_ROUGHNESS" : "",
  ].join("\n");

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
attribute vec4 aFrame;
attribute vec2 aCarveUv;
uniform vec3 uFrameLightDir;
varying vec4 vFrame;
varying vec2 vCarveUv;
varying vec2 vFrameUv;
varying vec3 vFrameLightDir;
varying vec3 vFrameFace;`,
      )
      .replace(
        "#include <uv_vertex>",
        /* glsl */ `#include <uv_vertex>
vFrame = aFrame;
vCarveUv = aCarveUv;
vFrameUv = uv;
vFrameLightDir = normalMatrix * uFrameLightDir;
vFrameFace = normalMatrix * vec3( 0.0, 0.0, 1.0 );`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
${defines}
uniform sampler2D uCarveMap;
uniform vec3 uWearColor;
uniform vec2 uWear;
uniform vec3 uRecess;
uniform vec3 uFrameLight;
varying vec4 vFrame;
varying vec2 vCarveUv;
varying vec2 vFrameUv;
varying vec3 vFrameLightDir;
varying vec3 vFrameFace;`,
      )
      // The vertex colour is the frame's tint times its occlusion; the
      // occlusion alone is in vFrame.w.
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
diffuseColor.rgb *= mix( uRecess, vec3( 1.0 ), smoothstep( 0.45, 0.95, vFrame.w ) );
// Metres of moulding under one pixel (the frame's uv is in metres).
// From across a room a bead or a carved leaf is smaller than a pixel:
// each pixel then lands on a different facet, and on polished metal
// under lamps that is a highlight on one frame and none on the next,
// so the moulding crawls as the visitor walks. Past a few millimetres
// a pixel the frame is shaded as what it averages to: a smooth, matte
// band that keeps its baked shadows.
vec2 framePx = max( abs( dFdx( vFrameUv ) ), abs( dFdy( vFrameUv ) ) );
float frameFar = smoothstep( 0.002, 0.010, max( framePx.x, framePx.y ) );`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        /* glsl */ `#include <metalnessmap_fragment>
roughnessFactor *= vFrame.x;
#if defined( FRAME_ALPHA_ROUGHNESS ) && defined( USE_MAP )
	roughnessFactor *= sampledDiffuseColor.a;
#endif
#if defined( FRAME_WEAR ) && defined( USE_MAP )
	// The leaf is thinnest where it is handled: the red clay under it
	// shows through in patches, matte and no longer metal.
	float frameWorn = smoothstep( uWear.x, uWear.y, vFrame.z * ( 0.3 + 0.7 * sampledDiffuseColor.a ) );
	frameWorn *= 0.7;
	diffuseColor.rgb = mix( diffuseColor.rgb, uWearColor * vFrame.w, frameWorn );
	metalnessFactor *= 1.0 - frameWorn;
	roughnessFactor = mix( roughnessFactor, 0.66, frameWorn );
#endif
roughnessFactor = clamp( mix( roughnessFactor, max( roughnessFactor, 0.62 ), frameFar ), 0.05, 1.0 );`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `{
	// The frame's uv is in metres on both axes, so a tangent frame built
	// from it is square whatever repeat a map uses.
	mat3 frameTbn = getTangentFrame( - vViewPosition, normal, vFrameUv );
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	#ifdef FRAME_CARVE
		vec3 carveN = texture2D( uCarveMap, vCarveUv ).xyz * 2.0 - 1.0;
		carveN.x *= sign( vFrame.y );
		mapN.xy += carveN.xy * abs( vFrame.y );
	#endif
	mapN.xy *= 1.0 - frameFar;
	normal = normalize( frameTbn * mapN );
	// The profile's own facets go the same way as its carving.
	normal = normalize( mix( normal, normalize( vFrameFace ), 0.7 * frameFar ) );
}`,
      )
      // three widens the highlight where the mesh normal changes fast
      // across a pixel. Feed it the mapped normal too, so carving and
      // beads that shrink under a pixel blur instead of sparkling.
      .replace(
        "#include <lights_physical_fragment>",
        THREE.ShaderChunk.lights_physical_fragment.replace(/nonPerturbedNormal/g, "normal"),
      )
      // An emissive surface (the mat) still sits in the frame's shadow,
      // and takes the frame's tint.
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `#include <emissivemap_fragment>
totalEmissiveRadiance *= vColor.rgb;`,
      )
      .replace(
        "#include <lights_fragment_begin>",
        /* glsl */ `#include <lights_fragment_begin>
{
	IncidentLight frameLight;
	frameLight.direction = normalize( vFrameLightDir );
	frameLight.color = uFrameLight;
	frameLight.visible = true;
	RE_Direct( frameLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
}`,
      );
  };
  material.customProgramCacheKey = () => `frame:${defines}`;
}

const maps = getFrameMaps();

// One material per surface. A finish (lib/gallery-layout/frame-design.ts)
// is a surface in a colour, and the colour is in the frame's vertices:
// yellow, lemon and red gold and silver leaf are all `leaf`; oak, maple
// and mahogany are all `paleWood`.

// Water gilding over red bole.
const leaf = new THREE.MeshStandardMaterial({
  metalness: 1,
  roughness: 0.46,
  map: maps.giltColor,
  roughnessMap: maps.giltRough,
  normalMap: maps.giltNormal,
  normalScale: new THREE.Vector2(0.55, 0.55),
  vertexColors: true,
});
patchFrameShader(leaf, {
  carve: true,
  wear: { color: "#4f1d12", from: 0.66, to: 0.8 },
  recess: "#a2743a",
});
// Most of what gilt shows is the room mirrored in it. Take that down
// and the picture light and the lamp glints model the carving instead.
leaf.userData.envScale = 0.6;

// Oil gilding on oak: the leaf follows the grain.
const leafOak = new THREE.MeshStandardMaterial({
  metalness: 1,
  roughness: 0.5,
  map: maps.giltColor,
  roughnessMap: maps.giltRough,
  normalMap: maps.ashNormal,
  normalScale: new THREE.Vector2(1.1, 1.1),
  vertexColors: true,
});
patchFrameShader(leafOak, {
  wear: { color: "#5a4326", from: 0.8, to: 0.95 },
  recess: "#a2743a",
});
leafOak.userData.envScale = 0.6;

const darkWood = new THREE.MeshStandardMaterial({
  map: maps.walnutColor,
  normalMap: maps.walnutNormal,
  normalScale: new THREE.Vector2(0.7, 0.7),
  roughness: 0.5,
  metalness: 0,
  vertexColors: true,
});
patchFrameShader(darkWood, { carve: true, alphaRoughness: true });

// Ash grain. Stained, it is every other wood a frame comes in.
const paleWood = new THREE.MeshStandardMaterial({
  map: maps.ashColor,
  normalMap: maps.ashNormal,
  normalScale: new THREE.Vector2(0.8, 0.8),
  roughness: 0.62,
  metalness: 0,
  vertexColors: true,
});
patchFrameShader(paleWood, { carve: true, alphaRoughness: true });

// Polished lacquer and ebonised wood.
const lacquer = new THREE.MeshStandardMaterial({
  map: maps.lacquerColor,
  normalMap: maps.lacquerNormal,
  normalScale: new THREE.Vector2(0.3, 0.3),
  roughness: 0.3,
  metalness: 0,
  vertexColors: true,
});
patchFrameShader(lacquer, { carve: true, alphaRoughness: true });

// Paint over gesso: chalky, with the brush's tooth.
const paint = new THREE.MeshStandardMaterial({
  normalMap: maps.paperNormal,
  normalScale: new THREE.Vector2(0.4, 0.4),
  roughness: 0.8,
  metalness: 0,
  vertexColors: true,
});
patchFrameShader(paint, { carve: true });

// Mat board. The works are drawn unlit at full brightness, so a mat lit
// only by the room would sit grey beside the white margin of its own
// print: it carries some light of its own, like the plaque card.
const board = new THREE.MeshStandardMaterial({
  emissive: "#ffffff",
  emissiveIntensity: 0.2,
  normalMap: maps.paperNormal,
  normalScale: new THREE.Vector2(0.25, 0.25),
  roughness: 0.94,
  metalness: 0,
  vertexColors: true,
});
patchFrameShader(board, {});

const silk = new THREE.MeshStandardMaterial({
  map: maps.silkColor,
  normalMap: maps.weaveNormal,
  normalScale: new THREE.Vector2(0.35, 0.35),
  roughness: 0.62,
  metalness: 0,
  vertexColors: true,
});
patchFrameShader(silk, { alphaRoughness: true });

// Linen on a liner, and the primed canvas edge a floater shows.
const cloth = new THREE.MeshStandardMaterial({
  normalMap: maps.weaveNormal,
  normalScale: new THREE.Vector2(0.6, 0.6),
  roughness: 0.9,
  metalness: 0,
  vertexColors: true,
});
patchFrameShader(cloth, {});

export const FRAME_SURFACES: Record<FrameSurface, THREE.MeshStandardMaterial> = {
  leaf,
  leafOak,
  darkWood,
  paleWood,
  lacquer,
  paint,
  board,
  silk,
  cloth,
};

const materialSets = new Map<string, THREE.MeshStandardMaterial[]>();

/** The materials of a design, indexed by the frame geometry's groups.
 *  Designs with the same surfaces share one array. */
export function frameMaterials(design: FrameDesign): THREE.MeshStandardMaterial[] {
  const key = design.slots.map((s) => s.surface).join("|");
  let set = materialSets.get(key);
  if (!set) {
    set = design.slots.map((s) => FRAME_SURFACES[s.surface]);
    materialSets.set(key, set);
  }
  return set;
}

/** Frame materials polished enough to show a glint: they reflect the
 *  highlight map (frame-env.ts) instead of the plain room gradient. */
export const FRAME_HIGHLIGHT_MATERIALS: THREE.MeshStandardMaterial[] = [
  leaf,
  leafOak,
  darkWood,
  paleWood,
  lacquer,
  silk,
];
