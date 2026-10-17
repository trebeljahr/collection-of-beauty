"use client";

// The stair rooms' lighting: a plaster ceiling, a glazed dome over a
// spiral's top floor, and a row of wall washers along each wall. A
// stair hall is lit the same way, a row to each stretch of its walls.
// See stairwell-light-rig.ts for where the cans hang and the reasoning,
// and wash-cans.ts for how their light is summed.
//
// Like the picture lights, none of it is a three.js light. The washers'
// pools are one mesh for the whole room, drawn with the picture lights'
// blend (painting-light.tsx): it multiplies what is on screen, so a pool
// takes the wall's own colour. The room's cans, and those of the other
// storeys of its shaft, are one list in the material's uniforms; every
// lit surface is cut into patches that each name the cans whose cone
// reaches them, and a fragment sums those, twelve at most. So the light
// is one field over the room, whichever row a can belongs to: it goes
// round a corner onto the next wall and across the line where one row's
// stretch ends and another's begins. The room adds five draw calls:
// ceiling, glass, glazing frame, pools, cans.
//
// On the floor the pools fade toward each doorway, as the picture
// lights' do (`THRESHOLD_FADE_M` in painting-light-rig.ts): the band a
// row of washers lays along the foot of its wall ran through the door
// openings and stopped dead on the threshold. They fade to half, not to
// nothing, and the half goes on through the door (`StairwellSpill`).

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { paletteOfRoom } from "@/lib/gallery-layout/room-era";
import type { Door, FloorLayout, RoomLayout } from "@/lib/gallery-layout/types";
import { CELL_SIZE, FLOOR_SEPARATION, INTER_FLOOR_HEIGHT } from "@/lib/gallery-layout/world-coords";
import { UNREFLECTED_LAYER } from "./floor-mirror";
import { buildGlowGeometry, type Glow, lampGlowMaterial } from "./glow";
import { getGlassMaterial, Laylight } from "./laylight";
import {
  buildFixtureGeometry,
  FOG_FAR,
  FOG_NEAR,
  fixtureUnlitMaterial,
  LIGHT_TINT,
  lensGlow,
  POOL_GAIN,
  POOL_SHOULDER,
  poolCapGlsl,
  SURFACE_LIFT,
  setThresholds,
  thresholdFadeGlsl,
  thresholdUniforms,
} from "./painting-light";
import {
  doorThreshold,
  type Rect2,
  type Threshold,
  wallInsetOf,
  wallSideOf,
} from "./painting-light-rig";
import { fixtureMaterial, getPaletteMaterials } from "./palette-materials";
import { rectsAround, spiralHole } from "./stair-opening";
import {
  DOME_HUB_R,
  DOME_PANES,
  dome,
  glazingOuterR,
  LONG_THROW_BEAM,
  spanWashRow,
  WASH_CORNER_GAP,
  WASH_DOOR_FADE_M,
  WASH_DOOR_SHARE,
  WASH_SPILL_JAMB,
  WASH_SPILL_M,
  type WashBeam,
  type WashDoor,
  type WashRow,
  washLampXs,
  washSpills,
  washStretches,
  washWallRects,
} from "./stairwell-light-rig";
import { poolGainScale } from "./wall-light";
import {
  assignCans,
  CANS_PER_PATCH,
  canUniforms,
  floorQuad,
  type LitPatch,
  type LitQuad,
  MAX_CANS,
  type RectXZ,
  type Vec3,
  type WashCan,
} from "./wash-cans";

/** The ceiling plane hangs just under the slab of the floor above, whose
 *  parquet underside it covers. */
const CEILING_Y = INTER_FLOOR_HEIGHT - 0.02;
/** A room's ceiling over its floor: CEILING_Y, or as far under the slab
 *  in a storey that runs higher (`RoomLayout.storeyHeight`). */
export function ceilingYOf(room: RoomLayout): number {
  return room.storeyHeight === undefined
    ? CEILING_Y
    : room.storeyHeight - (FLOOR_SEPARATION - CEILING_Y);
}
/** How far the glass and its frame hang below the ceiling plane. */
const GLASS_DROP = 0.012;
const FRAME_HALF_WIDTH = 0.045;
const FRAME_DROP = 0.05;
/** Segments round the dome, a whole number per pane so the glazing bars
 *  land on vertices. */
const DOME_SEGMENTS = DOME_PANES * 2;

// ── Pools ─────────────────────────────────────────────────────────────
// A room's cans are one list (`wash-cans.ts`), and every surface the
// light lands on is cut into patches that name the cans reaching them.
// A fragment sums those cans, whichever wall each hangs on, so the
// light is continuous across a corner, a landing's end and the line
// between two rows: see the note at the top of wash-cans.ts.

const washVaryings = /* glsl */ `
varying vec3 vPos;    // in the room's frame: the mesh sits on the middle of its floor
varying vec3 vNormal;
varying vec4 vCans0;  // indices of the cans that reach this patch, -1 for none
varying vec4 vCans1;
varying vec4 vCans2;
varying vec2 vLit;    // 1 on the floor, pool gain
varying float vVoid;  // 1 on a surface over a void
varying float vDepth;
`;

const washVertexShader = /* glsl */ `
attribute vec4 aCans0;
attribute vec4 aCans1;
attribute vec4 aCans2;
attribute vec2 aLit;
attribute float aVoid;
${washVaryings}
void main() {
  vPos = position;
  vNormal = normal;
  vCans0 = aCans0;
  vCans1 = aCans1;
  vCans2 = aCans2;
  vLit = aLit;
  vVoid = aVoid;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

/** Slots come in fours, so rooms with two doors and with four share a
 *  program. */
const washSlots = (doors: number) => Math.max(4, Math.ceil(doors / 4) * 4);

/** The light of a patch's cans at a fragment, `washLight()`. The pools
 *  in the room and the spill past its doors both take it. */
const washLightGlsl = /* glsl */ `
#define MAX_CANS ${MAX_CANS}
${poolCapGlsl}
uniform vec4 uCanA[MAX_CANS]; // where it hangs, intensity
uniform vec4 uCanB[MAX_CANS]; // beam axis, the floor it lights nothing under
uniform vec4 uCanC[MAX_CANS]; // cos outer, cos inner, aim distance squared (0: falls with its own),
                              // floor gain (negative: a storey's can, which lights a void surface under its floor)
uniform vec3 uColor;
uniform float uShoulder;
uniform vec2 uFog;
${washVaryings}
float canLight(int i) {
  vec4 a = uCanA[i];
  vec4 b = uCanB[i];
  vec4 c = uCanC[i];
  // Under the can's floor the slab is in the way, unless this surface
  // stands in a void and the can is a storey's, beside it.
  if (vPos.y < b.w && !(vVoid > 0.5 && c.w < 0.0)) return 0.0;
  vec3 toL = a.xyz - vPos;
  float d2 = dot(toL, toL);
  vec3 l = toL * inversesqrt(d2);
  float spot = smoothstep(c.x, c.y, dot(-l, b.xyz));
  // A long-throw can keeps on the wall the light it has at its aim
  // point (\`WashBeam.graze\`).
  float fall = (c.z > 0.0 && vLit.x < 0.5) ? c.z : d2;
  return a.w * mix(1.0, abs(c.w), vLit.x) * max(dot(l, vNormal), 0.0) * spot / fall;
}
float slot(float s) {
  return s < -0.5 ? 0.0 : canLight(int(s + 0.5));
}
vec3 washLight() {
  float e = slot(vCans0.x) + slot(vCans0.y) + slot(vCans0.z) + slot(vCans0.w)
    + slot(vCans1.x) + slot(vCans1.y) + slot(vCans1.z) + slot(vCans1.w)
    + slot(vCans2.x) + slot(vCans2.y) + slot(vCans2.z) + slot(vCans2.w);
  e = e / (1.0 + uShoulder * e);
  float k = 1.0 - smoothstep(uFog.x, uFog.y, vDepth);
  return capPool(uColor * e * k * vLit.y);
}
`;

const washFragmentShader = (slots: number) => /* glsl */ `
${washLightGlsl}
${thresholdFadeGlsl(slots)}
void main() {
  float k = vLit.x > 0.5 ? thresholdFade(vPos.xz) : 1.0;
  gl_FragColor = vec4(washLight() * k, 1.0);
}
`;

const spillVertexShader = /* glsl */ `
attribute vec4 aCans0;
attribute vec4 aCans1;
attribute vec4 aCans2;
attribute vec2 aLit;
attribute float aVoid;
attribute vec2 aLocal;
attribute vec2 aDoor;
${washVaryings}
varying vec2 vLocal;
varying vec2 vDoor;
void main() {
  vPos = position;
  vNormal = normal;
  vCans0 = aCans0;
  vCans1 = aCans1;
  vCans2 = aCans2;
  vLit = aLit;
  vVoid = aVoid;
  vLocal = aLocal;
  vDoor = aDoor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

/** The band's share on the threshold, dying away past it: straight on
 *  over WASH_SPILL_M, faster past a jamb. */
const spillFragmentShader = /* glsl */ `
${washLightGlsl}
varying vec2 vLocal;  // along the wall from its middle, and out past the threshold
varying vec2 vDoor;   // the door's two ends along the wall
uniform float uSpill;
uniform float uJamb;
uniform float uShare;
void main() {
  float aside = max(max(vDoor.x - vLocal.x, vLocal.x - vDoor.y), 0.0);
  float d = length(vec2(aside * uJamb, vLocal.y));
  gl_FragColor = vec4(washLight() * uShare * (1.0 - smoothstep(0.0, uSpill, d)), 1.0);
}
`;

/** The uniforms every pool material shares, and the room's cans. */
function washUniforms(cans: readonly WashCan[]) {
  const u = canUniforms(cans);
  return {
    uCanA: { value: u.a },
    uCanB: { value: u.b },
    uCanC: { value: u.c },
    uColor: { value: LIGHT_TINT.clone().multiplyScalar(POOL_GAIN) },
    uShoulder: { value: POOL_SHOULDER },
    uFog: { value: new THREE.Vector2(FOG_NEAR, FOG_FAR) },
  };
}

/** dst · src.rgb + dst · src.a, as for the picture lights' pools. */
const POOL_BLEND = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.DstColorFactor,
  blendDst: THREE.SrcAlphaFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -2,
} as const;

/** A room's pools: its cans, and its doorways for the floor's fade.
 *  One material a room; every room with the same count of door slots
 *  shares the program. */
function makeWashMaterial(cans: readonly WashCan[], thresholds: Threshold[]): THREE.ShaderMaterial {
  const slots = washSlots(thresholds.length);
  const doors = thresholdUniforms(slots);
  setThresholds(doors.uDoor.value, thresholds);
  doors.uDoorFade.value = WASH_DOOR_FADE_M;
  doors.uDoorShare.value = WASH_DOOR_SHARE;
  return new THREE.ShaderMaterial({
    vertexShader: washVertexShader,
    fragmentShader: washFragmentShader(slots),
    uniforms: { ...doors, ...washUniforms(cans) },
    ...POOL_BLEND,
  });
}

/** The spill past a room's doors. */
function makeSpillMaterial(cans: readonly WashCan[]): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: spillVertexShader,
    fragmentShader: spillFragmentShader,
    uniforms: {
      ...washUniforms(cans),
      uSpill: { value: WASH_SPILL_M },
      uJamb: { value: WASH_SPILL_JAMB },
      uShare: { value: WASH_DOOR_SHARE },
    },
    ...POOL_BLEND,
  });
}

// ── Walls and rows ────────────────────────────────────────────────────

/** A wall of the room, about the room's middle on its floor: the
 *  turn about y that carries the wall's frame onto it, the middle of its
 *  foot, its length and its doors. */
type Wall = {
  side: Door["side"];
  rotation: number;
  origin: [number, number];
  length: number;
  doors: WashDoor[];
  /** How far over the room's floor the wall's foot stands: a stair
   *  hall's end wall over its half landing (`RoomLayout.endWall`). */
  lift?: number;
  /** Height over the room's floor the cans hang from, when not the
   *  ceiling: the underside of the next landing, or the roof. */
  hangFrom?: number;
  /** The ceiling the row is fitted under, over the wall's foot, when not
   *  a storey's: the salon's top storey's, and its roof over the hall
   *  floor for the far wall. */
  ceilingY?: number;
  beam?: WashBeam;
};

/** A wall less `start` metres at the low end of its local x and `end`
 *  at the high end. */
function trimWall(wall: Wall, start: number, end: number): Wall {
  const shift = (start - end) / 2;
  const dir = fromWall(wall, [1, 0, 0], false);
  const length = wall.length - start - end;
  return {
    ...wall,
    origin: [wall.origin[0] + dir[0] * shift, wall.origin[1] + dir[2] * shift],
    length,
    doors: wall.doors
      .map((d) => ({ ...d, center: d.center - shift }))
      .filter((d) => Math.abs(d.center) < length / 2),
  };
}

/** The end of each meeting wall's local x that a wall of `side` is at. */
const LOW_END: Record<string, boolean> = {
  "north:east": true,
  "north:west": false,
  "south:east": false,
  "south:west": true,
  "west:north": true,
  "west:south": false,
  "east:north": false,
  "east:south": true,
};

/** The walls a hall's washers hang on: all four, but for a sheer wall,
 *  which has no ceiling to hang them from, and the strip in front of it
 *  on the two walls that meet it (`RoomLayout.sheer`). The storey under
 *  the roof lights the sheer wall from there, from the hall floor up,
 *  with a long-throw beam (`LONG_THROW_BEAM`): the salon's far wall, the
 *  Last Judgment on it, was the one unlit wall of the building. The
 *  strip's wall is still lit, by the far wall's cans and the side
 *  wall's (`wallFaces`). */
function washedWalls(room: RoomLayout, walls: Wall[]): Wall[] {
  const sheer = room.sheer;
  if (!sheer) return walls;
  const ceiling = ceilingYOf(room);
  const underRoof = Math.abs(room.worldRect.y + ceiling - sheer.roof) < 0.05;
  return walls.flatMap((wall): Wall[] => {
    if (wall.side === sheer.side) {
      if (!underRoof) return [];
      const lift = sheer.base - room.worldRect.y;
      return [
        {
          ...wall,
          lift,
          hangFrom: ceiling,
          ceilingY: ceiling - lift,
          beam: LONG_THROW_BEAM,
        },
      ];
    }
    const low = LOW_END[`${sheer.side}:${wall.side}`];
    if (low === undefined) return [wall];
    return [trimWall(wall, low ? sheer.depth : 0, low ? 0 : sheer.depth)];
  });
}

/** A row of washers on a wall. The row's middle is the origin of
 *  `wall`; `along` is where that stands along the room's wall, whose
 *  doors are measured from the wall's own middle. */
type Wash = {
  wall: Wall;
  row: WashRow;
  along: number;
};

/** One row for a whole wall: a stairwell's, which hangs nothing. Its end
 *  cans stand WASH_CORNER_GAP from the corners. */
function wholeWall(wall: Wall): Wash {
  const row = spanWashRow(
    wall.length / 2 - WASH_CORNER_GAP,
    wall.ceilingY ?? CEILING_Y,
    true,
    wall.beam,
  );
  return { wall, row, along: 0 };
}

/** The end wall of a stair hall as its three parts: the stretch either
 *  side of the landings over the storey's floor, and the middle over
 *  the half landing, whose cans hang under the next landing up
 *  (`RoomLayout.endWall`). */
function endWallParts(room: RoomLayout, wall: Wall): Wall[] {
  const over = room.endWall;
  if (!over || over.side !== wall.side) return [wall];
  const outer = wall.length / 2 - over.half;
  const parts = [trimWall(wall, 0, wall.length - outer), trimWall(wall, wall.length - outer, 0)];
  if (over.landing) {
    const { y, top } = over.landing;
    parts.push({
      ...trimWall(wall, outer, outer),
      lift: y,
      hangFrom: Math.max(top, y + CEILING_Y),
    });
  }
  return parts;
}

/** The rows of a hall's wall: one to each stretch of each part. */
function hallWashes(room: RoomLayout, wall: Wall, cx: number, cz: number): Wash[] {
  return endWallParts(room, wall).flatMap((part) => wallStretches(room, part, cx, cz));
}

/** A row for each stretch of a hall's wall, its cones set out about the
 *  giant that hangs there (`washStretches`). */
function wallStretches(room: RoomLayout, wall: Wall, cx: number, cz: number): Wash[] {
  const dir = fromWall(wall, [1, 0, 0], false);
  // The works on this wall's storey.
  const works = room.placements
    .filter((p) => p.divider === undefined && wallSideOf(p.rotation[1]) === wall.side)
    .map(
      (p) =>
        (p.position[0] - cx - wall.origin[0]) * dir[0] +
        (p.position[2] - cz - wall.origin[1]) * dir[2],
    );
  return washStretches(wall.length, wall.doors, wall.ceilingY ?? CEILING_Y, works, wall.beam).map(
    (stretch) => ({
      wall: {
        ...wall,
        origin: [
          wall.origin[0] + dir[0] * stretch.center,
          wall.origin[1] + dir[2] * stretch.center,
        ],
      },
      row: stretch.row,
      along: stretch.center,
    }),
  );
}

function roomWalls(room: RoomLayout, width: number, depth: number, cx: number, cz: number): Wall[] {
  // Same four placements as RoomGeometry's walls, so a door's place
  // along the wall takes the same sign.
  const doors = (side: string, along: (x: number, z: number) => number): WashDoor[] =>
    room.doors
      .filter((d) => d.side === side)
      .map((d) => ({
        center: along(d.worldX, d.worldZ),
        width: d.width,
        height: d.height,
      }));
  return [
    {
      side: "north",
      rotation: 0,
      origin: [0, -depth / 2],
      length: width,
      doors: doors("north", (x) => x - cx),
    },
    {
      side: "south",
      rotation: Math.PI,
      origin: [0, depth / 2],
      length: width,
      doors: doors("south", (x) => -(x - cx)),
    },
    {
      side: "west",
      rotation: Math.PI / 2,
      origin: [-width / 2, 0],
      length: depth,
      doors: doors("west", (_, z) => -(z - cz)),
    },
    {
      side: "east",
      rotation: -Math.PI / 2,
      origin: [width / 2, 0],
      length: depth,
      doors: doors("east", (_, z) => z - cz),
    },
  ];
}

/** Carry a point or a direction from a wall's frame into the room's. */
function fromWall(
  wall: Wall,
  p: [number, number, number],
  point: boolean,
): [number, number, number] {
  const c = Math.cos(wall.rotation);
  const s = Math.sin(wall.rotation);
  const x = p[0] * c + p[2] * s;
  const z = -p[0] * s + p[2] * c;
  return point ? [x + wall.origin[0], p[1], z + wall.origin[1]] : [x, p[1], z];
}

/** A point of the room's frame in the wall's: along it from its
 *  middle, up, and out into the room. */
function toWall(wall: Wall, p: Vec3): [number, number, number] {
  const c = Math.cos(wall.rotation);
  const s = Math.sin(wall.rotation);
  const dx = p[0] - wall.origin[0];
  const dz = p[2] - wall.origin[1];
  return [dx * c - dz * s, p[1], dx * s + dz * c];
}

// ── Surfaces ──────────────────────────────────────────────────────────

/** A part of a wall's plane the washers may light, from `yMin` to
 *  `yMax` over the room's floor. */
type WallFace = { wall: Wall; yMin: number; yMax: number; inVoid: boolean };

/**
 * The faces of a room's walls. Every wall is lit whole, whatever rows
 * hang on it: the strip of the salon's side walls that has no row of
 * its own takes the far wall's cans. A stair hall's end wall is three
 * faces, since its middle stands on the landings: that one runs from
 * the half landing to the underside of the next, over the void, and
 * so takes light from the storey below's cans under this storey's
 * floor. A sheer wall is one face from the hall floor, on the storey
 * under the roof only (`washedWalls`).
 */
function wallFaces(room: RoomLayout, walls: Wall[]): WallFace[] {
  const ceiling = ceilingYOf(room);
  return walls.flatMap((wall): WallFace[] => {
    const sheer = room.sheer;
    if (sheer && wall.side === sheer.side) {
      const [lit] = washedWalls(room, [wall]);
      if (!lit) return [];
      return [{ wall: lit, yMin: lit.lift ?? 0, yMax: ceiling, inVoid: true }];
    }
    return endWallParts(room, wall).map((part) =>
      part.lift === undefined
        ? { wall: part, yMin: 0, yMax: ceiling, inVoid: false }
        : {
            wall: part,
            yMin: part.lift,
            yMax: part.hangFrom ?? ceiling,
            inVoid: true,
          },
    );
  });
}

/** The lit rectangles of a face in its wall's frame: every clear
 *  stretch between its doors, and the lintel over each door. A doorway
 *  itself is left out, or the pool would brighten the room seen
 *  through it. */
function faceRects(face: WallFace): Rect2[] {
  return washWallRects(face.wall.length, face.wall.doors, face.yMin, face.yMax);
}

/** A spill quad knows the wall and door it lies past, for the fade. */
type SpillQuad = LitQuad & { wall: Wall; door: [number, number] };

/** The cans of a room's rows, in the frame of a room `dy` below. */
function cansOf(washes: readonly Wash[], dy: number): WashCan[] {
  const out: WashCan[] = [];
  for (const { wall, row } of washes) {
    const lift = wall.lift ?? 0;
    const axis = fromWall(wall, [0, row.dirY, row.dirZ], false);
    for (const x of washLampXs(row)) {
      const [px, py, pz] = fromWall(wall, [x, row.lampY + lift, row.throwM], true);
      out.push({
        pos: [px, py + dy, pz],
        axis,
        cosOuter: row.cosOuter,
        cosInner: row.cosInner,
        intensity: row.intensity,
        floorGain: row.floorGain,
        aim2: row.graze ? row.aim2 : 0,
        floorY: lift + dy,
        throughVoid: lift === 0,
      });
    }
  }
  return out;
}

/** A room's rows, cans and lit surfaces. */
type RoomLighting = {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  width: number;
  depth: number;
  cx: number;
  cz: number;
  washes: Wash[];
  /** The room's cans and those of its shaft that reach its surfaces. */
  cans: WashCan[];
  patches: LitPatch[];
  spill: { cans: WashCan[]; patches: Array<SpillQuad & LitPatch> };
  /** Cans a patch had to leave out: none on the plan
   *  (`stairwell-light.test.ts`). */
  dropped: number;
};

/** The rows and footprint of a stair room. */
function roomRows(room: RoomLayout) {
  const { cellBounds } = room;
  const xMin = cellBounds.xMin * CELL_SIZE;
  const xMax = (cellBounds.xMax + 1) * CELL_SIZE;
  const zMin = cellBounds.zMin * CELL_SIZE;
  const zMax = (cellBounds.zMax + 1) * CELL_SIZE;
  const width = xMax - xMin;
  const depth = zMax - zMin;
  const cx = (xMin + xMax) / 2;
  const cz = (zMin + zMax) / 2;
  const walls = roomWalls(room, width, depth, cx, cz);
  // A storey that runs higher than a storey hangs its washers from its
  // own ceiling. They hung at a storey's height on stems 2.3 m long, and
  // Rico found the stems too long (17 October 2026).
  const ceiling = room.storeyHeight === undefined ? undefined : ceilingYOf(room);
  const hung = washedWalls(room, walls).map((wall) =>
    ceiling === undefined || wall.beam ? wall : { ...wall, hangFrom: ceiling, ceilingY: ceiling },
  );
  // A hall of the block plan hangs a giant on the middle of each
  // stretch of wall, and has a row to each stretch; so does a spiral
  // room given a work too long for any hall. A stairwell that hangs
  // nothing has a row to each wall.
  const washes =
    room.ceilingOpening !== undefined || room.placements.length > 0
      ? hung.flatMap((wall) => hallWashes(room, wall, cx, cz))
      : hung.map(wholeWall);
  return { xMin, xMax, zMin, zMax, width, depth, cx, cz, walls, washes };
}

/** The stair rooms of the other floors on this room's footprint: the
 *  storeys of its shaft. */
function shaftRooms(room: RoomLayout, floors: readonly FloorLayout[]): RoomLayout[] {
  const b = room.cellBounds;
  return floors.flatMap((f) =>
    f.rooms.filter(
      (r) =>
        r !== room &&
        r.isStairwell &&
        r.cellBounds.xMin === b.xMin &&
        r.cellBounds.xMax === b.xMax &&
        r.cellBounds.zMin === b.zMin &&
        r.cellBounds.zMax === b.zMax,
    ),
  );
}

/**
 * A stair room's rows of washers, the cans that light it, and its lit
 * surfaces cut into patches. The cans are the room's own and those of
 * the other storeys of its shaft, moved into this room's frame: a stair
 * hall's end wall is one plane through four storeys, and the wall over
 * a landing is lit by the row under the next landing and by the
 * storey's cans beside it alike. Each can lights nothing under its own
 * floor unless the surface stands in a void (`WashCan.floorY`).
 */
export function roomLighting(
  room: RoomLayout,
  floors: readonly FloorLayout[],
  wallGain: number,
): RoomLighting {
  const rows = roomRows(room);
  const { washes, walls, cx, cz, width, depth } = rows;
  const cans = [
    ...cansOf(washes, 0),
    ...shaftRooms(room, floors).flatMap((other) =>
      cansOf(roomRows(other).washes, other.worldRect.y - room.worldRect.y),
    ),
  ];
  const wallZ = wallInsetOf(room) + SURFACE_LIFT;
  const quads: LitQuad[] = [];
  const levels: Array<{ y: number; rects: RectXZ[]; inVoid: boolean }> = [];
  for (const face of wallFaces(room, walls)) {
    const normal = fromWall(face.wall, [0, 0, 1], false);
    for (const r of faceRects(face)) {
      quads.push({
        corners: [
          fromWall(face.wall, [r.xMin, r.yMin, wallZ], true),
          fromWall(face.wall, [r.xMax, r.yMin, wallZ], true),
          fromWall(face.wall, [r.xMax, r.yMax, wallZ], true),
          fromWall(face.wall, [r.xMin, r.yMax, wallZ], true),
        ],
        normal,
        floor: false,
        inVoid: face.inVoid,
        gain: wallGain,
      });
    }
    // A band of floor in front of a wall that stands on a landing. A
    // wall whose foot stands below the room's floor (the salon's far
    // wall, from the hall floor) has that floor lit by the room below.
    const lift = face.wall.lift ?? 0;
    if (lift > 0) {
      const reach = Math.max(
        0,
        ...washes.filter((w) => w.wall.lift === lift).map((w) => w.row.floorReach),
      );
      const half = face.wall.length / 2;
      const a = fromWall(face.wall, [-half, 0, 0], true);
      const b = fromWall(face.wall, [half, 0, reach], true);
      levels.push({
        y: lift,
        rects: [
          {
            xMin: Math.min(a[0], b[0]),
            xMax: Math.max(a[0], b[0]),
            zMin: Math.min(a[2], b[2]),
            zMax: Math.max(a[2], b[2]),
          },
        ],
        inVoid: false,
      });
    }
  }
  // The room's floor, less the hall's void. The band a row lays along
  // the foot of its wall and the one its neighbour lays round the
  // corner are one floor here: lit twice, the corner was twice as
  // bright.
  const opening = room.floorOpening;
  levels.push({
    y: 0,
    rects: opening
      ? rectsAround(opening.rects, cx, cz, width, depth)
      : [
          {
            xMin: -width / 2,
            xMax: width / 2,
            zMin: -depth / 2,
            zMax: depth / 2,
          },
        ],
    inVoid: false,
  });
  for (const f of levels) {
    for (const r of f.rects) quads.push(floorQuad(r, f.y + SURFACE_LIFT, f.inVoid));
  }
  const lit = assignCans(quads, cans);
  // The floor past each door of the room, in the room's frame.
  const spillQuads: SpillQuad[] = [];
  for (const wall of walls) {
    const half = wall.length / 2;
    for (const spill of washSpills([-half, half], wall.doors)) {
      const corner = (x: number, z: number) => fromWall(wall, [x, SURFACE_LIFT, z], true);
      spillQuads.push({
        corners: [
          corner(spill.xMin, 0),
          corner(spill.xMax, 0),
          corner(spill.xMax, spill.zMin),
          corner(spill.xMin, spill.zMin),
        ],
        normal: [0, 1, 0],
        floor: true,
        inVoid: false,
        gain: 1,
        wall,
        door: spill.door,
      });
    }
  }
  const spilt = assignCans(spillQuads, cans);
  return {
    ...rows,
    cans: lit.used,
    patches: lit.patches,
    spill: { cans: spilt.used, patches: spilt.patches },
    dropped: lit.dropped + spilt.dropped,
  };
}

/** The patches as one geometry, with each vertex naming its patch's
 *  cans. `extra` adds a spill quad's attributes. */
function buildPatchGeometry<T extends LitPatch>(
  patches: readonly T[],
  extra?: (patch: T, corner: Vec3) => { local: [number, number]; door: [number, number] },
): THREE.BufferGeometry | null {
  if (patches.length === 0) return null;
  const pos: number[] = [];
  const nrm: number[] = [];
  const cans0: number[] = [];
  const cans1: number[] = [];
  const cans2: number[] = [];
  const lit: number[] = [];
  const inVoid: number[] = [];
  const local: number[] = [];
  const door: number[] = [];
  const idx: number[] = [];
  for (const p of patches) {
    const base = pos.length / 3;
    const slots = Array.from({ length: CANS_PER_PATCH }, (_, i) => p.cans[i] ?? -1);
    for (const c of p.corners) {
      pos.push(c[0], c[1], c[2]);
      nrm.push(p.normal[0], p.normal[1], p.normal[2]);
      cans0.push(slots[0], slots[1], slots[2], slots[3]);
      cans1.push(slots[4], slots[5], slots[6], slots[7]);
      cans2.push(slots[8], slots[9], slots[10], slots[11]);
      lit.push(p.floor ? 1 : 0, p.gain);
      inVoid.push(p.inVoid ? 1 : 0);
      if (extra) {
        const e = extra(p, c);
        local.push(e.local[0], e.local[1]);
        door.push(e.door[0], e.door[1]);
      }
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("aCans0", new THREE.Float32BufferAttribute(cans0, 4));
  g.setAttribute("aCans1", new THREE.Float32BufferAttribute(cans1, 4));
  g.setAttribute("aCans2", new THREE.Float32BufferAttribute(cans2, 4));
  g.setAttribute("aLit", new THREE.Float32BufferAttribute(lit, 2));
  g.setAttribute("aVoid", new THREE.Float32BufferAttribute(inVoid, 1));
  if (extra) {
    g.setAttribute("aLocal", new THREE.Float32BufferAttribute(local, 2));
    g.setAttribute("aDoor", new THREE.Float32BufferAttribute(door, 2));
  }
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** The floor past each door that the room's light reaches, as one
 *  geometry in the room's frame. */
function buildSpillGeometry(
  patches: ReadonlyArray<SpillQuad & LitPatch>,
): THREE.BufferGeometry | null {
  return buildPatchGeometry(patches, (p, c) => {
    const [x, , z] = toWall(p.wall, c);
    return { local: [x, z], door: p.door };
  });
}

function buildCansGeometry(washes: Wash[]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const { wall, row } of washes) {
    const direction = fromWall(wall, [0, row.dirY, row.dirZ], false);
    const lift = wall.lift ?? 0;
    for (const x of washLampXs(row)) {
      parts.push(
        buildFixtureGeometry(
          fromWall(wall, [x, row.lampY + lift, row.throwM], true),
          direction,
          wall.hangFrom ?? CEILING_Y,
        ),
      );
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** The lens of every can in the room, as one geometry. */
function buildCanGlowGeometry(washes: Wash[]): THREE.BufferGeometry | null {
  const glows: Glow[] = [];
  for (const { wall, row } of washes) {
    const direction = fromWall(wall, [0, row.dirY, row.dirZ], false);
    const lift = wall.lift ?? 0;
    for (const x of washLampXs(row)) {
      glows.push(lensGlow(fromWall(wall, [x, row.lampY + lift, row.throwM], true), direction));
    }
  }
  return buildGlowGeometry(glows);
}

// ── Ceiling and glazing ───────────────────────────────────────────────

/** The plaster ceiling, facing down, with the well cut out of it unless
 *  the room is `closed`: the spiral's round well, or the opening a grand
 *  stair climbs out through (`hole`, already about the room's centre).
 *  A closed stair room is cut for its dome instead. */
function buildCeilingGeometry(
  width: number,
  depth: number,
  closed: boolean,
  /** A grand stair's opening of rectangles, or the laylight over the
   *  top of its void, as the ceiling round it (`rectsAround`): it may
   *  reach the walls, where a hole cannot. */
  around: ReturnType<typeof rectsAround> | null = null,
  /** The rim of the dome that closes a stair room's top floor. */
  domeR: number | null = null,
): THREE.BufferGeometry {
  if (around) {
    const parts = around.map((c) => {
      const g = new THREE.PlaneGeometry(c.xMax - c.xMin, c.zMax - c.zMin);
      g.rotateX(Math.PI / 2);
      g.translate((c.xMin + c.xMax) / 2, 0, (c.zMin + c.zMax) / 2);
      return g;
    });
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    return merged;
  }
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -depth / 2);
  shape.lineTo(width / 2, -depth / 2);
  shape.lineTo(width / 2, depth / 2);
  shape.lineTo(-width / 2, depth / 2);
  shape.closePath();
  if (closed && domeR !== null) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, domeR, 0, Math.PI * 2, false);
    shape.holes.push(hole);
  } else if (!closed) {
    shape.holes.push(spiralHole());
  }
  const g = new THREE.ShapeGeometry(shape, 32);
  g.rotateX(Math.PI / 2);
  return g;
}

/** The dome's rows of panes, facing down into the room. The pane
 *  texture tiles once per pane round the dome and once per row, so its
 *  glazing bars come out as ribs and rings. */
function buildDomeRows(d: ReturnType<typeof dome>): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= d.rows; j++) {
    const { r, y } = d.rowEdge(j);
    for (let i = 0; i <= DOME_SEGMENTS; i++) {
      const a = (i / DOME_SEGMENTS) * Math.PI * 2;
      pos.push(r * Math.cos(a), y, r * Math.sin(a));
      uv.push((i / DOME_SEGMENTS) * DOME_PANES, j);
    }
  }
  const stride = DOME_SEGMENTS + 1;
  for (let j = 0; j < d.rows; j++) {
    for (let i = 0; i < DOME_SEGMENTS; i++) {
      const a = j * stride + i;
      const b = a + stride;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** The round pane at the top of the dome: the inside of one pane of the
 *  texture, clear of its bars, raised to the dome's crown. */
function buildDomeHub(heightAt: (r: number) => number): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(DOME_HUB_R, DOME_SEGMENTS);
  g.deleteAttribute("normal");
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, 0.5 + (uv.getX(i) - 0.5) * 0.7, 0.5 + (uv.getY(i) - 0.5) * 0.7);
  }
  g.rotateX(Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(Math.hypot(pos.getX(i), pos.getZ(i))));
  }
  return g;
}

/** The dome's glass on a rim of radius `rimR`. */
function buildDomeGlass(rimR: number): THREE.BufferGeometry {
  const d = dome(rimR);
  const parts = [buildDomeRows(d), buildDomeHub(d.heightAt)];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  // The glass is unlit, and in one tone a dome read as a flat disc. Its
  // lower rows take less of the sky than its crown: shaded by height.
  const pos = merged.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    // The rim lies a rounding error under 0, and a negative base to a
    // fractional power is NaN: the whole bottom row drew black.
    const up = Math.max(0, pos.getY(i) / d.rise);
    const shade = DOME_RIM_SHADE + (1 - DOME_RIM_SHADE) * up ** 0.7;
    colors.set([shade, shade, shade], i * 3);
  }
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return merged;
}

/** How bright the dome's glass is at its rim, of its crown. */
const DOME_RIM_SHADE = 0.62;

let domeGlassMaterial: THREE.MeshBasicMaterial | null = null;
/** The laylights' glass, shaded by the dome's vertex colours. */
function getDomeGlassMaterial(): THREE.MeshBasicMaterial {
  if (!domeGlassMaterial) {
    domeGlassMaterial = getGlassMaterial().clone();
    domeGlassMaterial.vertexColors = true;
  }
  return domeGlassMaterial;
}

/** Bronze bars round the dome's rim and its crown pane. */
function buildDomeFrame(rimR: number): THREE.BufferGeometry {
  const bars = [
    { r: DOME_HUB_R, y: dome(rimR).heightAt(DOME_HUB_R) },
    { r: rimR, y: 0 },
  ].map(({ r, y }) =>
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(r - FRAME_HALF_WIDTH, 0),
        new THREE.Vector2(r - FRAME_HALF_WIDTH, -FRAME_DROP),
        new THREE.Vector2(r + FRAME_HALF_WIDTH, -FRAME_DROP),
        new THREE.Vector2(r + FRAME_HALF_WIDTH, 0),
      ],
      DOME_SEGMENTS,
    ).translate(0, y, 0),
  );
  const merged = mergeGeometries(bars, false);
  for (const b of bars) b.dispose();
  return merged;
}

/**
 * Ceiling, glazing and wall washers for a floor's stairwell. Mounted
 * with the stairwell's other accents, so a neighbouring floor seen
 * through the well is lit the same way. `floors` are every floor of
 * the museum: a stair room's light takes in the cans of the other
 * storeys of its shaft (`roomLighting`).
 */
export function StairwellLight({
  floor,
  floors,
}: {
  floor: FloorLayout;
  floors: readonly FloorLayout[];
}) {
  // One for each stair room: two halls, the court and two spirals.
  const rooms = useMemo(() => floor.rooms.filter((r) => r.isStairwell), [floor.rooms]);
  return (
    <>
      {rooms.map((room) => (
        <StairHallLight key={room.id} floor={floor} floors={floors} room={room} />
      ))}
    </>
  );
}

/** The wall colour a stair room's pools multiply: a stair hall is one
 *  colour through every storey. */
function wallColorOf(floor: FloorLayout, room: RoomLayout) {
  const palette = room.paletteId ? paletteOfRoom(room) : floor.era.palette;
  return { palette, wallColor: palette.wallColor };
}

/**
 * The washers' light that goes on through each door of a floor's stair
 * rooms onto the floor of the room next door (`washSpills`). One mesh
 * a room, and not with the stairwell's fittings: room culling hides
 * those while no stair room is seen, and the spill lies on the
 * neighbour's floor, which can be in view with the door behind the
 * visitor.
 */
export function StairwellSpill({
  floor,
  floors,
}: {
  floor: FloorLayout;
  floors: readonly FloorLayout[];
}) {
  const built = useMemo(
    () =>
      floor.rooms
        .filter((r) => r.isStairwell)
        .flatMap((room) => {
          const { wallColor } = wallColorOf(floor, room);
          const { cx, cz, spill } = roomLighting(room, floors, poolGainScale(wallColor));
          const geometry = buildSpillGeometry(spill.patches);
          if (!geometry) return [];
          return [
            {
              key: room.id,
              position: [cx, room.worldRect.y, cz] as [number, number, number],
              geometry,
              material: makeSpillMaterial(spill.cans),
            },
          ];
        }),
    [floor, floors],
  );
  useEffect(
    () => () => {
      for (const b of built) {
        b.geometry.dispose();
        b.material.dispose();
      }
    },
    [built],
  );
  return (
    <>
      {built.map((b) => (
        <mesh
          key={b.key}
          position={b.position}
          geometry={b.geometry}
          material={b.material}
          renderOrder={1}
        />
      ))}
    </>
  );
}

function StairHallLight({
  floor,
  floors,
  room,
}: {
  floor: FloorLayout;
  floors: readonly FloorLayout[];
  room: RoomLayout;
}) {
  // No flight climbs through the top floor's ceiling, so its well is
  // closed with a glazed dome instead of left open to nothing. A grand stair
  // hall says for itself whether a stair leaves it (`ceilingOpening`);
  // where one does, the ceiling is cut to that stair's opening and has
  // no glazing: the next floor's gallery is what is overhead.
  const grand = room.ceilingOpening;
  const closed = grand !== undefined ? grand === null : floor.stairsOut.length === 0;
  // The top of a grand stair hall is glazed over the void under it: a
  // laylight the shape of the opening.
  const voidUnder = closed && grand !== undefined && !room.domed ? room.floorOpening : null;
  const laylight = voidUnder ? voidUnder.rects : null;
  // A spiral's room is closed on its top floor by a dome, and so is the
  // salon.
  const domed = closed && (grand === undefined || room.domed === true);
  const ceilingY = ceilingYOf(room);
  const { palette, wallColor } = wallColorOf(floor, room);

  const built = useMemo(() => {
    const { xMin, xMax, zMin, zMax, width, depth, cx, cz, washes, cans, patches } = roomLighting(
      room,
      floors,
      poolGainScale(wallColor),
    );
    // The dome's glass stops short of the washers' cans.
    const rimR = glazingOuterR(width, depth);
    const washed = washes.length > 0;
    const thresholds = room.doors.map((d): Threshold => {
      const [x0, z0, x1, z1] = doorThreshold(d);
      return [x0 - cx, z0 - cz, x1 - cx, z1 - cz];
    });
    const pools = buildPatchGeometry(patches);
    return {
      position: [cx, room.worldRect.y, cz] as [number, number, number],
      ceilingY,
      pools: pools ? { material: makeWashMaterial(cans, thresholds), geometry: pools } : null,
      cans: washed ? buildCansGeometry(washes) : null,
      canGlow: washed ? buildCanGlowGeometry(washes) : null,
      ceiling: buildCeilingGeometry(
        width,
        depth,
        closed,
        // The top of a hall is cut where its laylight is recessed.
        grand
          ? rectsAround(grand.rects, cx, cz, width, depth)
          : laylight
            ? rectsAround(laylight, cx, cz, width, depth)
            : null,
        domed ? rimR : null,
      ),
      bounds: { xMin, xMax, zMin, zMax },
      glass: domed ? buildDomeGlass(rimR) : null,
      frame: domed ? buildDomeFrame(rimR) : null,
    };
  }, [room, floors, closed, grand, wallColor, laylight, domed, ceilingY]);

  useEffect(
    () => () => {
      built.pools?.geometry.dispose();
      built.pools?.material.dispose();
      built.cans?.dispose();
      built.canGlow?.dispose();
      built.ceiling.dispose();
      built.glass?.dispose();
      built.frame?.dispose();
    },
    [built],
  );

  return (
    <>
      {laylight?.map((r) => (
        <Laylight
          key={`${r.xMin}:${r.zMin}`}
          cx={(r.xMin + r.xMax) / 2}
          cz={(r.zMin + r.zMax) / 2}
          ceilingY={room.worldRect.y + ceilingY}
          w={r.xMax - r.xMin}
          d={r.zMax - r.zMin}
          reveal={getPaletteMaterials(palette).ceiling}
          room={built.bounds}
        />
      ))}
      <StairHallFixtures built={built} palette={palette} />
    </>
  );
}

function StairHallFixtures({
  built,
  palette,
}: {
  built: {
    position: [number, number, number];
    ceilingY: number;
    pools: {
      material: THREE.ShaderMaterial;
      geometry: THREE.BufferGeometry;
    } | null;
    cans: THREE.BufferGeometry | null;
    canGlow: THREE.BufferGeometry | null;
    ceiling: THREE.BufferGeometry;
    glass: THREE.BufferGeometry | null;
    frame: THREE.BufferGeometry | null;
  };
  palette: Parameters<typeof getPaletteMaterials>[0];
}) {
  return (
    <group position={built.position}>
      <mesh
        geometry={built.ceiling}
        material={getPaletteMaterials(palette).ceiling}
        position={[0, built.ceilingY, 0]}
      />
      {built.glass && built.frame && (
        <>
          <mesh
            geometry={built.glass}
            material={getDomeGlassMaterial()}
            position={[0, built.ceilingY - GLASS_DROP, 0]}
          />
          <mesh
            geometry={built.frame}
            material={fixtureMaterial}
            position={[0, built.ceilingY, 0]}
            layers={UNREFLECTED_LAYER}
          />
        </>
      )}
      {built.pools && (
        <mesh geometry={built.pools.geometry} material={built.pools.material} renderOrder={1} />
      )}
      {built.cans && (
        <mesh geometry={built.cans} material={fixtureUnlitMaterial} layers={UNREFLECTED_LAYER} />
      )}
      {built.canGlow && (
        <mesh
          geometry={built.canGlow}
          material={lampGlowMaterial}
          renderOrder={2}
          layers={UNREFLECTED_LAYER}
        />
      )}
    </group>
  );
}
