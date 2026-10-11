"use client";

// Frame materials: one per surface (gilt, walnut, ash, lacquer, mat,
// silk), shared by every frame that uses it. Only geometry is per work.
//
// Each is a MeshStandardMaterial with the procedural maps from
// frame-maps.ts and one shader patch, `patchFrameShader`, that adds what
// the stock material cannot do:
//
//  - a second normal map, the carve atlas, read with the geometry's
//    `aCarveUv` and gated per vertex, on top of the surface's own;
//  - per-vertex roughness (burnished high points, matte hollows) and,
//    on gilt, wear that shows the red bole on the high points;
//  - the picture light. Frames sit in front of the quad that draws a
//    work's pool of light (painting-light.tsx), so that light never
//    reached them and carving lit only by the environment map is flat.
//    The patch adds one directional term from where the ceiling can
//    hangs. It is arithmetic in the frame's own fragment shader, not a
//    three.js light: it costs nothing on the walls or floor.

import * as THREE from "three";
import type { FrameVariantId } from "@/lib/gallery-layout/frame-profiles";
import { getFrameMaps } from "./frame-maps";

/** Direction to the picture light in the frame's own space (x right,
 *  y up, z out of the wall): above and in front, like the can. */
const LIGHT_DIR = new THREE.Vector3(0, 0.8, 0.6).normalize();
/** Its colour and strength, shared by every frame material. */
const lightUniform = { value: new THREE.Color("#ffecd0").multiplyScalar(2.7) };

type PatchOptions = {
  /** Strength of the carve atlas, 0 for a material that is never carved. */
  carve?: number;
  /** How much of the per-vertex burnishing to apply, 0..1. */
  burnish?: number;
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
    uCarve: { value: options.carve ?? 0 },
    uBurnish: { value: options.burnish ?? 0 },
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
attribute vec3 aFrame;
attribute vec2 aCarveUv;
uniform vec3 uFrameLightDir;
varying vec3 vFrame;
varying vec2 vCarveUv;
varying vec2 vFrameUv;
varying vec3 vFrameLightDir;`,
      )
      .replace(
        "#include <uv_vertex>",
        /* glsl */ `#include <uv_vertex>
vFrame = aFrame;
vCarveUv = aCarveUv;
vFrameUv = uv;
vFrameLightDir = normalMatrix * uFrameLightDir;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
${defines}
uniform sampler2D uCarveMap;
uniform float uCarve;
uniform float uBurnish;
uniform vec3 uWearColor;
uniform vec2 uWear;
uniform vec3 uRecess;
uniform vec3 uFrameLight;
varying vec3 vFrame;
varying vec2 vCarveUv;
varying vec2 vFrameUv;
varying vec3 vFrameLightDir;`,
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
diffuseColor.rgb *= mix( uRecess, vec3( 1.0 ), smoothstep( 0.45, 0.95, vColor.r ) );`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        /* glsl */ `#include <metalnessmap_fragment>
roughnessFactor *= mix( 1.0, vFrame.x, uBurnish );
#if defined( FRAME_ALPHA_ROUGHNESS ) && defined( USE_MAP )
	roughnessFactor *= sampledDiffuseColor.a;
#endif
#if defined( FRAME_WEAR ) && defined( USE_MAP )
	// The leaf is thinnest where it is handled: the red clay under it
	// shows through in patches, matte and no longer metal.
	float frameWorn = smoothstep( uWear.x, uWear.y, vFrame.z * ( 0.3 + 0.7 * sampledDiffuseColor.a ) );
	frameWorn *= 0.7;
	diffuseColor.rgb = mix( diffuseColor.rgb, uWearColor * vColor.r, frameWorn );
	metalnessFactor *= 1.0 - frameWorn;
	roughnessFactor = mix( roughnessFactor, 0.66, frameWorn );
#endif
roughnessFactor = clamp( roughnessFactor, 0.05, 1.0 );`,
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
		mapN.xy += carveN.xy * abs( vFrame.y ) * uCarve;
	#endif
	normal = normalize( frameTbn * mapN );
}`,
      )
      // three widens the highlight where the mesh normal changes fast
      // across a pixel. Feed it the mapped normal too, so carving and
      // beads that shrink under a pixel blur instead of sparkling.
      .replace(
        "#include <lights_physical_fragment>",
        THREE.ShaderChunk.lights_physical_fragment.replace(/nonPerturbedNormal/g, "normal"),
      )
      // An emissive surface (the mat) still sits in the frame's shadow.
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `#include <emissivemap_fragment>
totalEmissiveRadiance *= vColor.r;`,
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

// Water gilding over red bole. The colour is antique gold, below pure
// gold's reflectance: old leaf is toned and a little dirty.
const gilt = new THREE.MeshStandardMaterial({
  color: "#d8aa55",
  metalness: 1,
  roughness: 0.46,
  map: maps.giltColor,
  roughnessMap: maps.giltRough,
  normalMap: maps.giltNormal,
  normalScale: new THREE.Vector2(0.55, 0.55),
  vertexColors: true,
});
patchFrameShader(gilt, {
  carve: 1,
  burnish: 1,
  wear: { color: "#4f1d12", from: 0.66, to: 0.8 },
  recess: "#a2743a",
});
// Most of what gilt shows is the room mirrored in it. Take that down
// and the picture light and the lamp glints model the carving instead.
gilt.userData.envScale = 0.6;

const walnut = new THREE.MeshStandardMaterial({
  map: maps.walnutColor,
  normalMap: maps.walnutNormal,
  normalScale: new THREE.Vector2(0.7, 0.7),
  roughness: 0.5,
  metalness: 0,
  vertexColors: true,
});
patchFrameShader(walnut, { carve: 0.8, burnish: 0.35, alphaRoughness: true });

const ash = new THREE.MeshStandardMaterial({
  map: maps.ashColor,
  normalMap: maps.ashNormal,
  normalScale: new THREE.Vector2(0.8, 0.8),
  roughness: 0.62,
  metalness: 0,
  vertexColors: true,
});
patchFrameShader(ash, { burnish: 0.25, alphaRoughness: true });

// Black-stained wood for a floater: ash grain under a dark stain.
const stained = new THREE.MeshStandardMaterial({
  color: "#2b2622",
  map: maps.ashColor,
  normalMap: maps.ashNormal,
  normalScale: new THREE.Vector2(0.8, 0.8),
  roughness: 0.7,
  metalness: 0,
  vertexColors: true,
});
patchFrameShader(stained, { alphaRoughness: true });

// Ebonised and polished.
const ebony = new THREE.MeshStandardMaterial({
  color: "#12100f",
  map: maps.lacquerColor,
  normalMap: maps.lacquerNormal,
  normalScale: new THREE.Vector2(0.3, 0.3),
  roughness: 0.3,
  metalness: 0,
  vertexColors: true,
});
patchFrameShader(ebony, { carve: 1, burnish: 0.3, alphaRoughness: true });

// Red-black urushi.
const redLacquer = new THREE.MeshStandardMaterial({
  color: "#4a100c",
  map: maps.lacquerColor,
  normalMap: maps.lacquerNormal,
  normalScale: new THREE.Vector2(0.3, 0.3),
  roughness: 0.26,
  metalness: 0,
  vertexColors: true,
});
patchFrameShader(redLacquer, { burnish: 0.3, alphaRoughness: true });

// Mat board. The works are drawn unlit at full brightness, so a mat lit
// only by the room would sit grey beside the white margin of its own
// print: it carries some light of its own, like the plaque card.
const matBoard = new THREE.MeshStandardMaterial({
  color: "#f3eee2",
  emissive: "#f3eee2",
  emissiveIntensity: 0.2,
  normalMap: maps.paperNormal,
  normalScale: new THREE.Vector2(0.25, 0.25),
  roughness: 0.94,
  metalness: 0,
  vertexColors: true,
});
patchFrameShader(matBoard, {});

// The primed canvas edge a floater shows.
const canvasEdge = new THREE.MeshStandardMaterial({
  color: "#d9d2c2",
  normalMap: maps.weaveNormal,
  normalScale: new THREE.Vector2(0.6, 0.6),
  roughness: 0.9,
  metalness: 0,
  vertexColors: true,
});
patchFrameShader(canvasEdge, {});

const silk = new THREE.MeshStandardMaterial({
  map: maps.silkColor,
  normalMap: maps.weaveNormal,
  normalScale: new THREE.Vector2(0.35, 0.35),
  roughness: 0.62,
  metalness: 0,
  vertexColors: true,
});
patchFrameShader(silk, { alphaRoughness: true });

export type FrameVariant = {
  /** [moulding, slip]: indexed by the frame geometry's groups. */
  materials: THREE.MeshStandardMaterial[];
};

export const FRAME_VARIANTS: Record<FrameVariantId, FrameVariant> = {
  gilded: { materials: [gilt] },
  giltCove: { materials: [gilt] },
  cassetta: { materials: [gilt] },
  walnut: { materials: [walnut, gilt] },
  ebony: { materials: [ebony] },
  paleAsh: { materials: [ash] },
  print: { materials: [ash, matBoard] },
  redLacquer: { materials: [redLacquer, matBoard] },
  mount: { materials: [walnut, silk] },
  floater: { materials: [stained, canvasEdge] },
};

/** Frame materials polished enough to show a glint: they reflect the
 *  highlight map (frame-env.ts) instead of the plain room gradient. */
export const FRAME_HIGHLIGHT_MATERIALS: THREE.MeshStandardMaterial[] = [
  gilt,
  walnut,
  ash,
  stained,
  ebony,
  redLacquer,
  silk,
];
