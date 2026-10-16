"use client";

// The stair rooms' lighting: a plaster ceiling, a glazed dome over a
// spiral's top floor, and a row of wall washers along each wall. A
// stair hall is lit the same way, a row to each stretch of its walls.
// See stairwell-light-rig.ts for the geometry and the reasoning.
//
// Like the picture lights, none of it is a three.js light. The washers'
// pools are one mesh for the whole room, drawn with the picture lights'
// blend (painting-light.tsx): it multiplies what is on screen, so a pool
// takes the wall's own colour. A fragment finds the can it stands under
// from its position along the wall and adds that can and two each side,
// so 24 cans cost five evaluations a fragment, whatever the length of
// the wall. The room adds five draw calls: ceiling,
// glass, glazing frame, pools, cans.
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
  spanWashRow,
  WASH_CORNER_GAP,
  WASH_DOOR_FADE_M,
  WASH_DOOR_SHARE,
  WASH_SPILL_JAMB,
  WASH_SPILL_M,
  type WashDoor,
  type WashRow,
  washLampXs,
  washSpills,
  washStretches,
  washWallRects,
} from "./stairwell-light-rig";
import { poolGainScale } from "./wall-light";

/** The ceiling plane hangs just under the slab of the floor above, whose
 *  parquet underside it covers. */
const CEILING_Y = INTER_FLOOR_HEIGHT - 0.02;
/** A room's ceiling over its floor: CEILING_Y, or as far under the slab
 *  in a storey that runs higher (`RoomLayout.storeyHeight`). */
function ceilingYOf(room: RoomLayout): number {
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

const washVertexShader = /* glsl */ `
attribute vec3 aWall;
attribute vec3 aRow;
attribute float aFloor;
varying vec3 vWall;
varying vec3 vRow;
varying float vFloor;
varying float vDepth;
varying vec2 vRoom;
void main() {
  vWall = aWall;
  vRow = aRow;
  vFloor = aFloor;
  // The mesh sits at the middle of the room's floor.
  vRoom = position.xz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

/** Slots come in fours, so rooms with two doors and with four share a
 *  program. */
const washSlots = (doors: number) => Math.max(4, Math.ceil(doors / 4) * 4);

/** The light of a row of cans at a fragment, `washLight()`. The pools
 *  in the room and the spill past its doors both take it. */
const washLightGlsl = /* glsl */ `
uniform vec2 uLamp;   // height, distance from the wall
uniform vec2 uAxis;   // beam axis (y, z) in the wall's frame
uniform vec2 uCone;
uniform float uLampI;
uniform vec3 uColor;
uniform float uShoulder;
uniform vec2 uFog;
varying vec3 vWall;   // position in the wall's frame
varying vec3 vRow;    // can spacing, end can's distance from the middle, pool gain
varying float vFloor; // 0 on the wall, 1 on the floor
varying float vDepth;
float lamp(float x) {
  if (abs(x) > vRow.y + 1e-3) return 0.0;
  vec3 toL = vec3(x - vWall.x, uLamp.x - vWall.y, uLamp.y - vWall.z);
  float d2 = dot(toL, toL);
  vec3 l = toL * inversesqrt(d2);
  float spot = smoothstep(uCone.x, uCone.y, -(l.y * uAxis.x + l.z * uAxis.y));
  return uLampI * max(mix(l.z, l.y, vFloor), 0.0) * spot / d2;
}
vec3 washLight() {
  // The can nearest this fragment, then that one and two each side: under
  // a storey of 8.4 m a cone reaches 5.2 m along the wall at its foot,
  // more than a gap and a half. The cans stand vRow.x apart from -vRow.y
  // to vRow.y, an odd count or an even one. Past the row's end the
  // nearest can is the end can: unclamped, a fragment a gap beyond it
  // counted no can at all, and the pool stopped in a vertical line.
  float x = clamp(floor((vWall.x + vRow.y) / vRow.x + 0.5) * vRow.x - vRow.y, -vRow.y, vRow.y);
  float e = lamp(x - 2.0 * vRow.x) + lamp(x - vRow.x) + lamp(x) + lamp(x + vRow.x)
    + lamp(x + 2.0 * vRow.x);
  e = e / (1.0 + uShoulder * e);
  float k = 1.0 - smoothstep(uFog.x, uFog.y, vDepth);
  return uColor * e * k * vRow.z;
}
`;

const washFragmentShader = (slots: number) => /* glsl */ `
${washLightGlsl}
varying vec2 vRoom;   // position on the room's floor, from its middle
${thresholdFadeGlsl(slots)}
void main() {
  float k = vFloor > 0.5 ? thresholdFade(vRoom) : 1.0;
  gl_FragColor = vec4(washLight() * k, 1.0);
}
`;

const spillVertexShader = /* glsl */ `
attribute vec3 aWall;
attribute vec3 aRow;
attribute vec2 aDoor;
varying vec3 vWall;
varying vec3 vRow;
varying float vFloor;
varying float vDepth;
varying vec2 vDoor;
void main() {
  vWall = aWall;
  vRow = aRow;
  vFloor = 1.0;
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
varying vec2 vDoor;   // the door's two ends along the wall
uniform float uSpill;
uniform float uJamb;
uniform float uShare;
void main() {
  float aside = max(max(vDoor.x - vWall.x, vWall.x - vDoor.y), 0.0);
  float d = length(vec2(aside * uJamb, vWall.z));
  gl_FragColor = vec4(washLight() * uShare * (1.0 - smoothstep(0.0, uSpill, d)), 1.0);
}
`;

/** The uniforms every row shares: the cans hang at one height. */
function washUniforms(row: WashRow) {
  return {
    uLamp: { value: new THREE.Vector2(row.lampY, row.throwM) },
    uAxis: { value: new THREE.Vector2(row.dirY, row.dirZ) },
    uCone: { value: new THREE.Vector2(row.cosOuter, row.cosInner) },
    uLampI: { value: row.intensity },
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

const washMaterials = new Map<string, THREE.ShaderMaterial>();

/** One for each set of doorways, kept for the visit: a building has a
 *  dozen stairwells or so, and those with their doors in the same
 *  places share one. The cans hang at one height, so the other uniforms
 *  are the same in all of them. What differs from wall to wall rides on
 *  the vertices. */
function getWashMaterial(row: WashRow, thresholds: Threshold[]): THREE.ShaderMaterial {
  const key = thresholds.map((t) => t.map((v) => v.toFixed(3)).join(",")).join(";");
  const cached = washMaterials.get(key);
  if (cached) return cached;
  const slots = washSlots(thresholds.length);
  const doors = thresholdUniforms(slots);
  setThresholds(doors.uDoor.value, thresholds);
  // The band keeps a share on each threshold, which the spill carries on.
  doors.uDoorFade.value = WASH_DOOR_FADE_M;
  doors.uDoorShare.value = WASH_DOOR_SHARE;
  const washMaterial = new THREE.ShaderMaterial({
    vertexShader: washVertexShader,
    fragmentShader: washFragmentShader(slots),
    uniforms: { ...doors, ...washUniforms(row) },
    ...POOL_BLEND,
  });
  washMaterials.set(key, washMaterial);
  return washMaterial;
}

let spillMaterial: THREE.ShaderMaterial | null = null;

/** One for the building: what differs from door to door rides on the
 *  vertices. */
function getSpillMaterial(row: WashRow): THREE.ShaderMaterial {
  spillMaterial ??= new THREE.ShaderMaterial({
    vertexShader: spillVertexShader,
    fragmentShader: spillFragmentShader,
    uniforms: {
      ...washUniforms(row),
      uSpill: { value: WASH_SPILL_M },
      uJamb: { value: WASH_SPILL_JAMB },
      uShare: { value: WASH_DOOR_SHARE },
    },
    ...POOL_BLEND,
  });
  return spillMaterial;
}

/** A wall in the room's frame (origin at the middle of the floor): the
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

/** The walls a hall's washers light: all four, but for a sheer wall,
 *  which has no ceiling to hang them from, and the strip in front of it
 *  on the two walls that meet it (`RoomLayout.sheer`). */
function washedWalls(room: RoomLayout, walls: Wall[]): Wall[] {
  const sheer = room.sheer;
  if (!sheer) return walls;
  // The end of each meeting wall's local x that the sheer wall is at.
  const lowEnd: Record<string, boolean> = {
    "north:east": true,
    "north:west": false,
    "south:east": false,
    "south:west": true,
    "west:north": true,
    "west:south": false,
    "east:north": false,
    "east:south": true,
  };
  return walls.flatMap((wall) => {
    if (wall.side === sheer.side) return [];
    const low = lowEnd[`${sheer.side}:${wall.side}`];
    if (low === undefined) return [wall];
    return [trimWall(wall, low ? sheer.depth : 0, low ? 0 : sheer.depth)];
  });
}

/** A row of washers and what it lights. The rectangles on the wall and
 *  the floor's two ends are in the frame of `wall`, whose origin is the
 *  middle of the row. */
type Wash = {
  wall: Wall;
  row: WashRow;
  rects: Rect2[];
  floor: [number, number];
  /** Where the row's middle stands along the wall: `wall.doors` are
   *  measured from the wall's own middle. */
  along: number;
};

/** One row for a whole wall: a stairwell's, which hangs nothing. Its end
 *  cans stand WASH_CORNER_GAP from the corners. */
function wholeWall(wall: Wall): Wash {
  const row = spanWashRow(wall.length / 2 - WASH_CORNER_GAP, CEILING_Y, true);
  return {
    wall,
    row,
    rects: washWallRects(row, wall.length, wall.doors),
    floor: [-wall.length / 2, wall.length / 2],
    along: 0,
  };
}

/** The rows of a hall's wall. A stair hall's end wall has no floor in
 *  front of its middle, where the half landings meet it
 *  (`RoomLayout.endWall`): a row either side, over the storey's floor,
 *  and a row over the landing, its cans under the next landing up. */
function hallWashes(room: RoomLayout, wall: Wall, cx: number, cz: number): Wash[] {
  const over = room.endWall;
  if (!over || over.side !== wall.side) return wallStretches(room, wall, cx, cz);
  const outer = wall.length / 2 - over.half;
  const out = [
    ...wallStretches(room, trimWall(wall, 0, wall.length - outer), cx, cz),
    ...wallStretches(room, trimWall(wall, wall.length - outer, 0), cx, cz),
  ];
  if (over.landing) {
    const { y, top } = over.landing;
    // The row's cans hang a ceiling's height over the landing, which is
    // just under the next one. Over the last, they hang on stems from
    // the roof.
    out.push(
      ...wallStretches(
        room,
        { ...trimWall(wall, outer, outer), lift: y, hangFrom: Math.max(top, y + CEILING_Y) },
        cx,
        cz,
      ),
    );
  }
  return out;
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
  return washStretches(wall.length, wall.doors, CEILING_Y, works).map((stretch) => ({
    wall: {
      ...wall,
      origin: [wall.origin[0] + dir[0] * stretch.center, wall.origin[1] + dir[2] * stretch.center],
    },
    row: stretch.row,
    rects: stretch.rects,
    floor: stretch.floor,
    along: stretch.center,
  }));
}

function roomWalls(room: RoomLayout, width: number, depth: number, cx: number, cz: number): Wall[] {
  // Same four placements as RoomGeometry's walls, so a door's place
  // along the wall takes the same sign.
  const doors = (side: string, along: (x: number, z: number) => number): WashDoor[] =>
    room.doors
      .filter((d) => d.side === side)
      .map((d) => ({ center: along(d.worldX, d.worldZ), width: d.width, height: d.height }));
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

/** `wallGain` is the boost a deep wall colour needs for a pool to show
 *  on it (`poolGainScale` in wall-light.ts). As for the picture lights,
 *  it stays off the floor: every era has the same oak. */
function buildWashGeometry(
  washes: Wash[],
  wallGain: number,
  /** How far inside its line the wall is drawn (`wallInsetOf`). */
  inset: number,
): THREE.BufferGeometry {
  const wallZ = inset + SURFACE_LIFT;
  const pos: number[] = [];
  const local: number[] = [];
  const rowAttr: number[] = [];
  const floorAttr: number[] = [];
  const idx: number[] = [];
  for (const { wall, row, rects, floor: ends } of washes) {
    const lift = wall.lift ?? 0;
    const quad = (corners: Array<[number, number, number]>, floor: number) => {
      const base = pos.length / 3;
      for (const c of corners) {
        const p = fromWall(wall, c, true);
        pos.push(p[0], p[1] + lift, p[2]);
        local.push(...c);
        rowAttr.push(row.spacing, ((row.count - 1) * row.spacing) / 2, floor ? 1 : wallGain);
        floorAttr.push(floor);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    for (const r of rects) {
      quad(
        [
          [r.xMin, r.yMin, wallZ],
          [r.xMax, r.yMin, wallZ],
          [r.xMax, r.yMax, wallZ],
          [r.xMin, r.yMax, wallZ],
        ],
        0,
      );
    }
    quad(
      [
        [ends[0], SURFACE_LIFT, row.floorReach],
        [ends[1], SURFACE_LIFT, row.floorReach],
        [ends[1], SURFACE_LIFT, 0],
        [ends[0], SURFACE_LIFT, 0],
      ],
      1,
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aWall", new THREE.Float32BufferAttribute(local, 3));
  g.setAttribute("aRow", new THREE.Float32BufferAttribute(rowAttr, 3));
  g.setAttribute("aFloor", new THREE.Float32BufferAttribute(floorAttr, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** The floor past each door that a row's band reaches, as one geometry
 *  in world space: `origin` is the room's middle on its floor. */
function buildSpillGeometry(
  rooms: Array<{ washes: Wash[]; origin: [number, number, number] }>,
): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const local: number[] = [];
  const rowAttr: number[] = [];
  const doorAttr: number[] = [];
  const idx: number[] = [];
  for (const { washes, origin } of rooms) {
    for (const { wall, row, floor, along } of washes) {
      // A row over a half landing lights no door.
      if (wall.lift) continue;
      const doors = wall.doors.map((d) => ({ ...d, center: d.center - along }));
      for (const spill of washSpills(floor, doors)) {
        const base = pos.length / 3;
        const corners: Array<[number, number, number]> = [
          [spill.xMin, SURFACE_LIFT, 0],
          [spill.xMax, SURFACE_LIFT, 0],
          [spill.xMax, SURFACE_LIFT, spill.zMin],
          [spill.xMin, SURFACE_LIFT, spill.zMin],
        ];
        for (const c of corners) {
          const [x, y, z] = fromWall(wall, c, true);
          pos.push(x + origin[0], y + origin[1], z + origin[2]);
          local.push(...c);
          rowAttr.push(row.spacing, ((row.count - 1) * row.spacing) / 2, 1);
          doorAttr.push(...spill.door);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }
  if (idx.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aWall", new THREE.Float32BufferAttribute(local, 3));
  g.setAttribute("aRow", new THREE.Float32BufferAttribute(rowAttr, 3));
  g.setAttribute("aDoor", new THREE.Float32BufferAttribute(doorAttr, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Every can in the room as one geometry. */
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
    for (const x of washLampXs(row)) {
      glows.push(lensGlow(fromWall(wall, [x, row.lampY, row.throwM], true), direction));
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
 * through the well is lit the same way.
 */
export function StairwellLight({ floor }: { floor: FloorLayout }) {
  // One for each stair room: two halls, the court and two spirals.
  const rooms = useMemo(() => floor.rooms.filter((r) => r.isStairwell), [floor.rooms]);
  return (
    <>
      {rooms.map((room) => (
        <StairHallLight key={room.id} floor={floor} room={room} />
      ))}
    </>
  );
}

/** A stair room's footprint and its rows of washers. */
function roomWashes(room: RoomLayout) {
  const { cellBounds } = room;
  const xMin = cellBounds.xMin * CELL_SIZE;
  const xMax = (cellBounds.xMax + 1) * CELL_SIZE;
  const zMin = cellBounds.zMin * CELL_SIZE;
  const zMax = (cellBounds.zMax + 1) * CELL_SIZE;
  const width = xMax - xMin;
  const depth = zMax - zMin;
  const cx = (xMin + xMax) / 2;
  const cz = (zMin + zMax) / 2;
  // A storey that runs higher than a storey keeps its washers at a
  // storey's height, on stems from its ceiling: the light on its walls
  // is the light on every other.
  const hangFrom = room.storeyHeight === undefined ? undefined : ceilingYOf(room);
  const walls = washedWalls(room, roomWalls(room, width, depth, cx, cz)).map((wall) =>
    hangFrom === undefined ? wall : { ...wall, hangFrom },
  );
  // A hall of the block plan hangs a giant on the middle of each
  // stretch of wall, and has a row to each stretch; so does a spiral
  // room given a work too long for any hall. A stairwell that hangs
  // nothing has a row to each wall.
  const washes =
    room.ceilingOpening !== undefined || room.placements.length > 0
      ? walls.flatMap((wall) => hallWashes(room, wall, cx, cz))
      : walls.map(wholeWall);
  return { xMin, xMax, zMin, zMax, width, depth, cx, cz, washes };
}

/**
 * The washers' light that goes on through each door of a floor's stair
 * rooms onto the floor of the room next door (`washSpills`). One mesh
 * for the floor, and not with the stairwell's fittings: room culling
 * hides those while no stair room is seen, and the spill lies on the
 * neighbour's floor, which can be in view with the door behind the
 * visitor.
 */
export function StairwellSpill({ floor }: { floor: FloorLayout }) {
  const built = useMemo(() => {
    const rooms = floor.rooms
      .filter((r) => r.isStairwell)
      .map((room) => {
        const { cx, cz, washes } = roomWashes(room);
        return { washes, origin: [cx, room.worldRect.y, cz] as [number, number, number] };
      });
    const row = rooms.find((r) => r.washes.length > 0)?.washes[0].row;
    const geometry = row ? buildSpillGeometry(rooms) : null;
    return geometry && row ? { geometry, material: getSpillMaterial(row) } : null;
  }, [floor.rooms]);
  useEffect(() => () => built?.geometry.dispose(), [built]);
  if (!built) return null;
  return <mesh geometry={built.geometry} material={built.material} renderOrder={1} />;
}

function StairHallLight({ floor, room }: { floor: FloorLayout; room: RoomLayout }) {
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
  // A stair hall is one colour through every storey.
  const palette = room.paletteEra ? paletteOfRoom(room) : floor.era.palette;
  const { wallColor } = palette;

  const built = useMemo(() => {
    const { xMin, xMax, zMin, zMax, width, depth, cx, cz, washes } = roomWashes(room);
    // The dome's glass stops short of the washers' cans.
    const rimR = glazingOuterR(width, depth);
    const washed = washes.length > 0;
    return {
      position: [cx, room.worldRect.y, cz] as [number, number, number],
      ceilingY,
      washMaterial: washed
        ? getWashMaterial(
            washes[0].row,
            room.doors.map((d): Threshold => {
              const [x0, z0, x1, z1] = doorThreshold(d);
              return [x0 - cx, z0 - cz, x1 - cx, z1 - cz];
            }),
          )
        : null,
      wash: washed ? buildWashGeometry(washes, poolGainScale(wallColor), wallInsetOf(room)) : null,
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
  }, [room, closed, grand, wallColor, laylight, domed, ceilingY]);

  useEffect(
    () => () => {
      built.wash?.dispose();
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
    washMaterial: THREE.ShaderMaterial | null;
    wash: THREE.BufferGeometry | null;
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
      {built.wash && built.washMaterial && (
        <mesh geometry={built.wash} material={built.washMaterial} renderOrder={1} />
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
