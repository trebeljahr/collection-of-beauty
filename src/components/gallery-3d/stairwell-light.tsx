"use client";

// The stairwell's lighting: a plaster ceiling with a glazed ring round
// the well, and a row of wall washers along each wall. A hall of the
// block plan is lit the same way, a row to each stretch of its walls.
// See stairwell-light-rig.ts for the geometry and the reasoning.
//
// Like the picture lights, none of it is a three.js light. The washers'
// pools are one mesh for the whole room, drawn with the picture lights'
// blend (painting-light.tsx): it multiplies what is on screen, so a pool
// takes the wall's own colour. A fragment finds the can it stands under
// from its position along the wall and adds that can and its two
// neighbours, so 24 cans cost three evaluations a fragment, whatever
// the length of the wall. The room adds five draw calls: ceiling,
// glass, glazing frame, pools, cans.
//
// On the floor the pools fade out toward each doorway, as the picture
// lights' do (`THRESHOLD_FADE_M` in painting-light-rig.ts): the band a
// row of washers lays along the foot of its wall ran through the door
// openings and stopped dead on the threshold.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { paletteOfRoom } from "@/lib/gallery-layout/room-era";
import type { Door, FloorLayout, RoomLayout } from "@/lib/gallery-layout/types";
import {
  CELL_SIZE,
  INTER_FLOOR_HEIGHT,
  SPIRAL_FLOOR_CUTOUT_RADIUS,
} from "@/lib/gallery-layout/world-coords";
import { UNREFLECTED_LAYER } from "./floor-mirror";
import { getGlassMaterial, Laylight } from "./laylight";
import {
  buildFixtureGeometry,
  FOG_FAR,
  FOG_NEAR,
  fixtureUnlitMaterial,
  LIGHT_TINT,
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
import { openingHole, rectsAround } from "./stair-opening";
import {
  fitWashRow,
  OCULUS_HUB_R,
  OCULUS_ROWS,
  RING_INNER_R,
  RING_OUTER_R,
  RING_PANES,
  RING_ROWS,
  type WashDoor,
  type WashRow,
  washLampXs,
  washStretches,
  washWallRects,
} from "./stairwell-light-rig";
import { poolGainScale } from "./wall-light";

/** The ceiling plane hangs just under the slab of the floor above, whose
 *  parquet underside it covers. */
const CEILING_Y = INTER_FLOOR_HEIGHT - 0.02;
/** How far the glass and its frame hang below the ceiling plane. */
const GLASS_DROP = 0.012;
const FRAME_HALF_WIDTH = 0.045;
const FRAME_DROP = 0.05;
/** Segments round the ring, a whole number per pane so the glazing bars
 *  land on vertices. */
const RING_SEGMENTS = RING_PANES * 2;

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

const washFragmentShader = (slots: number) => /* glsl */ `
uniform vec2 uLamp;   // height, distance from the wall
uniform vec2 uAxis;   // beam axis (y, z) in the wall's frame
uniform vec2 uCone;
uniform float uLampI;
uniform vec3 uColor;
uniform float uShoulder;
uniform vec2 uFog;
varying vec3 vWall;   // position in the wall's frame
varying vec3 vRow;    // can spacing, half the wall's length, pool gain
varying float vFloor; // 0 on the wall, 1 on the floor
varying float vDepth;
varying vec2 vRoom;   // position on the room's floor, from its middle
${thresholdFadeGlsl(slots)}
float lamp(float x) {
  if (abs(x) > vRow.y) return 0.0;
  vec3 toL = vec3(x - vWall.x, uLamp.x - vWall.y, uLamp.y - vWall.z);
  float d2 = dot(toL, toL);
  vec3 l = toL * inversesqrt(d2);
  float spot = smoothstep(uCone.x, uCone.y, -(l.y * uAxis.x + l.z * uAxis.y));
  return uLampI * max(mix(l.z, l.y, vFloor), 0.0) * spot / d2;
}

void main() {
  // The can this fragment stands under, then that one and its
  // neighbours: a cone is narrower than two spacings.
  float x = (floor(vWall.x / vRow.x) + 0.5) * vRow.x;
  float e = lamp(x - vRow.x) + lamp(x) + lamp(x + vRow.x);
  e = e / (1.0 + uShoulder * e);
  float k = 1.0 - smoothstep(uFog.x, uFog.y, vDepth);
  if (vFloor > 0.5) k *= thresholdFade(vRoom);
  gl_FragColor = vec4(uColor * e * k * vRow.z, 1.0);
}
`;

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
  const washMaterial = new THREE.ShaderMaterial({
    vertexShader: washVertexShader,
    fragmentShader: washFragmentShader(slots),
    uniforms: {
      ...doors,
      uLamp: { value: new THREE.Vector2(row.lampY, row.throwM) },
      uAxis: { value: new THREE.Vector2(row.dirY, row.dirZ) },
      uCone: { value: new THREE.Vector2(row.cosOuter, row.cosInner) },
      uLampI: { value: row.intensity },
      uColor: { value: LIGHT_TINT.clone().multiplyScalar(POOL_GAIN) },
      uShoulder: { value: POOL_SHOULDER },
      uFog: { value: new THREE.Vector2(FOG_NEAR, FOG_FAR) },
    },
    transparent: true,
    depthWrite: false,
    // dst · src.rgb + dst · src.a, as for the picture lights' pools.
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
  washMaterials.set(key, washMaterial);
  return washMaterial;
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
type Wash = { wall: Wall; row: WashRow; rects: Rect2[]; floor: [number, number] };

/** One row for a whole wall: a stairwell's, which hangs nothing. */
function wholeWall(wall: Wall): Wash {
  const row = fitWashRow(wall.length, CEILING_Y);
  return {
    wall,
    row,
    rects: washWallRects(row, wall.length, wall.doors),
    floor: [-wall.length / 2, wall.length / 2],
  };
}

/** A row for each stretch of a hall's wall, its cones set out about the
 *  giant that hangs there (`washStretches`). */
function wallStretches(room: RoomLayout, wall: Wall, cx: number, cz: number): Wash[] {
  const dir = fromWall(wall, [1, 0, 0], false);
  // The works on this wall's storey. One on the sheer strip beyond the
  // galleries hangs past the end of the wall as trimmed.
  const works = room.placements
    .filter((p) => p.divider === undefined && !p.sheer && wallSideOf(p.rotation[1]) === wall.side)
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
    const quad = (corners: Array<[number, number, number]>, floor: number) => {
      const base = pos.length / 3;
      for (const c of corners) {
        pos.push(...fromWall(wall, c, true));
        local.push(...c);
        rowAttr.push(row.spacing, (row.count * row.spacing) / 2, floor ? 1 : wallGain);
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

/** Every can in the room as one geometry. */
function buildCansGeometry(washes: Wash[]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const { wall, row } of washes) {
    const direction = fromWall(wall, [0, row.dirY, row.dirZ], false);
    for (const x of washLampXs(row)) {
      parts.push(
        buildFixtureGeometry(
          fromWall(wall, [x, row.lampY, row.throwM], true),
          direction,
          CEILING_Y,
        ),
      );
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

// ── Ceiling and glazing ───────────────────────────────────────────────

/** The plaster ceiling, facing down, with the well cut out of it unless
 *  the room is `closed`: the spiral's round well, or the opening a grand
 *  stair climbs out through (`hole`, already about the room's centre). */
function buildCeilingGeometry(
  width: number,
  depth: number,
  closed: boolean,
  grandHole: THREE.Path | null,
  /** A grand stair's opening of rectangles, as the ceiling round it
   *  (`rectsAround`): it may reach the walls, where a hole cannot. */
  around: ReturnType<typeof rectsAround> | null = null,
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
  if (grandHole) {
    shape.holes.push(grandHole);
  } else if (!closed) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, SPIRAL_FLOOR_CUTOUT_RADIUS, 0, Math.PI * 2, false);
    shape.holes.push(hole);
  }
  const g = new THREE.ShapeGeometry(shape, 32);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Rows of panes between two radii, facing down. The pane texture tiles
 *  once per pane round the ring and once per row outward, so its glazing
 *  bars come out as spokes and circles. */
function buildGlassRing(innerR: number, rows: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const r = innerR + ((RING_OUTER_R - innerR) * j) / rows;
    for (let i = 0; i <= RING_SEGMENTS; i++) {
      const a = (i / RING_SEGMENTS) * Math.PI * 2;
      pos.push(r * Math.cos(a), 0, r * Math.sin(a));
      uv.push((i / RING_SEGMENTS) * RING_PANES, j);
    }
  }
  const stride = RING_SEGMENTS + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < RING_SEGMENTS; i++) {
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

/** The round pane at the middle of the oculus: the inside of one pane
 *  of the texture, clear of its bars. */
function buildGlassHub(): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(OCULUS_HUB_R, RING_SEGMENTS);
  g.deleteAttribute("normal");
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, 0.5 + (uv.getX(i) - 0.5) * 0.7, 0.5 + (uv.getY(i) - 0.5) * 0.7);
  }
  g.rotateX(Math.PI / 2);
  return g;
}

function buildGlassGeometry(closed: boolean): THREE.BufferGeometry {
  if (!closed) return buildGlassRing(RING_INNER_R, RING_ROWS);
  const parts = [buildGlassRing(OCULUS_HUB_R, OCULUS_ROWS), buildGlassHub()];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** Bronze bars round the glazing: one at each edge of the ring, or
 *  round the oculus and its centre pane. */
function buildGlazingFrame(closed: boolean): THREE.BufferGeometry {
  const bars = [closed ? OCULUS_HUB_R : RING_INNER_R, RING_OUTER_R].map(
    (r) =>
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(r - FRAME_HALF_WIDTH, 0),
          new THREE.Vector2(r - FRAME_HALF_WIDTH, -FRAME_DROP),
          new THREE.Vector2(r + FRAME_HALF_WIDTH, -FRAME_DROP),
          new THREE.Vector2(r + FRAME_HALF_WIDTH, 0),
        ],
        RING_SEGMENTS,
      ),
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
  // One for each stair hall. The tower has one a floor.
  const rooms = useMemo(() => floor.rooms.filter((r) => r.isStairwell), [floor.rooms]);
  return (
    <>
      {rooms.map((room) => (
        <StairHallLight key={room.id} floor={floor} room={room} />
      ))}
    </>
  );
}

function StairHallLight({ floor, room }: { floor: FloorLayout; room: RoomLayout }) {
  // No flight climbs through the top floor's ceiling, so its well is
  // closed with an oculus instead of left open to nothing. A grand stair
  // hall says for itself whether a stair leaves it (`ceilingOpening`);
  // where one does, the ceiling is cut to that stair's opening and has
  // no glazing: the next floor's gallery is what is overhead.
  const grand = room.ceilingOpening;
  const closed = grand !== undefined ? grand === null : floor.stairsOut.length === 0;
  // The top of a grand stair hall is glazed over the void under it: a
  // laylight the shape of a rectangular opening, the oculus over a
  // round one.
  const voidUnder = closed && grand !== undefined ? room.floorOpening : null;
  const laylight = voidUnder?.kind === "rects" ? voidUnder.rects : null;
  const glazed = (closed || grand === undefined) && !laylight;
  // A stair hall is one colour through every storey.
  const palette = room.paletteEra ? paletteOfRoom(room) : floor.era.palette;
  const { wallColor } = palette;

  const built = useMemo(() => {
    const { cellBounds } = room;
    const xMin = cellBounds.xMin * CELL_SIZE;
    const xMax = (cellBounds.xMax + 1) * CELL_SIZE;
    const zMin = cellBounds.zMin * CELL_SIZE;
    const zMax = (cellBounds.zMax + 1) * CELL_SIZE;
    const width = xMax - xMin;
    const depth = zMax - zMin;
    const cx = (xMin + xMax) / 2;
    const cz = (zMin + zMax) / 2;
    const walls = washedWalls(room, roomWalls(room, width, depth, cx, cz));
    // A hall of the block plan hangs a giant on the middle of each
    // stretch of wall, and has a row to each stretch. A stairwell hangs
    // nothing and has a row to each wall.
    const washes =
      grand !== undefined
        ? walls.flatMap((wall) => wallStretches(room, wall, cx, cz))
        : walls.map(wholeWall);
    const washed = washes.length > 0;
    return {
      position: [cx, room.worldRect.y, cz] as [number, number, number],
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
      ceiling: buildCeilingGeometry(
        width,
        depth,
        closed,
        grand ? openingHole(grand, cx, cz, 1) : null,
        grand?.kind === "rects" ? rectsAround(grand.rects, cx, cz, width, depth) : null,
      ),
      glass: buildGlassGeometry(closed),
      frame: buildGlazingFrame(closed),
    };
  }, [room, closed, grand, wallColor]);

  useEffect(
    () => () => {
      built.wash?.dispose();
      built.cans?.dispose();
      built.ceiling.dispose();
      built.glass.dispose();
      built.frame.dispose();
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
          ceilingY={room.worldRect.y + CEILING_Y}
          w={r.xMax - r.xMin}
          d={r.zMax - r.zMin}
        />
      ))}
      <StairHallFixtures built={built} glazed={glazed} palette={palette} />
    </>
  );
}

function StairHallFixtures({
  built,
  glazed,
  palette,
}: {
  built: {
    position: [number, number, number];
    washMaterial: THREE.ShaderMaterial | null;
    wash: THREE.BufferGeometry | null;
    cans: THREE.BufferGeometry | null;
    ceiling: THREE.BufferGeometry;
    glass: THREE.BufferGeometry;
    frame: THREE.BufferGeometry;
  };
  glazed: boolean;
  palette: Parameters<typeof getPaletteMaterials>[0];
}) {
  return (
    <group position={built.position}>
      <mesh
        geometry={built.ceiling}
        material={getPaletteMaterials(palette).ceiling}
        position={[0, CEILING_Y, 0]}
      />
      {glazed && (
        <>
          <mesh
            geometry={built.glass}
            material={getGlassMaterial()}
            position={[0, CEILING_Y - GLASS_DROP, 0]}
          />
          <mesh
            geometry={built.frame}
            material={fixtureMaterial}
            position={[0, CEILING_Y, 0]}
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
    </group>
  );
}
