"use client";

// The stairwell's lighting: a plaster ceiling with a glazed ring round
// the well, and a row of wall washers along each wall. See
// stairwell-light-rig.ts for the geometry and the reasoning.
//
// Like the picture lights, none of it is a three.js light. The washers'
// pools are one mesh for the whole room, drawn with the picture lights'
// blend (painting-light.tsx): it multiplies what is on screen, so a pool
// takes the wall's own colour. A fragment finds the can it stands under
// from its position along the wall and adds that can and its two
// neighbours, so 24 cans cost three evaluations a fragment, whatever
// the length of the wall. The room adds five draw calls: ceiling,
// glass, glazing frame, pools, cans.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FloorLayout, RoomLayout } from "@/lib/gallery-layout/types";
import {
  CELL_SIZE,
  INTER_FLOOR_HEIGHT,
  SPIRAL_FLOOR_CUTOUT_RADIUS,
} from "@/lib/gallery-layout/world-coords";
import { UNREFLECTED_LAYER } from "./floor-mirror";
import { getGlassMaterial } from "./laylight";
import {
  buildFixtureGeometry,
  FOG_FAR,
  FOG_NEAR,
  fixtureUnlitMaterial,
  LIGHT_TINT,
  POOL_GAIN,
  POOL_SHOULDER,
  SURFACE_LIFT,
} from "./painting-light";
import { fixtureMaterial, getPaletteMaterials } from "./palette-materials";
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
void main() {
  vWall = aWall;
  vRow = aRow;
  vFloor = aFloor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const washFragmentShader = /* glsl */ `
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
  gl_FragColor = vec4(uColor * e * k * vRow.z, 1.0);
}
`;

let washMaterial: THREE.ShaderMaterial | null = null;

/** Shared by every stairwell: the cans hang at one height, so the
 *  uniforms are the same. What differs from wall to wall and floor to
 *  floor rides on the vertices. */
function getWashMaterial(row: WashRow): THREE.ShaderMaterial {
  if (washMaterial) return washMaterial;
  washMaterial = new THREE.ShaderMaterial({
    vertexShader: washVertexShader,
    fragmentShader: washFragmentShader,
    uniforms: {
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
  return washMaterial;
}

/** A wall in the room's frame (origin at the middle of the floor): the
 *  turn about y that carries the wall's frame onto it, the middle of its
 *  foot, its length and its doors. */
type Wall = { rotation: number; origin: [number, number]; length: number; doors: WashDoor[] };

function roomWalls(room: RoomLayout, width: number, depth: number, cx: number, cz: number): Wall[] {
  // Same four placements as RoomGeometry's walls, so a door's place
  // along the wall takes the same sign.
  const doors = (side: string, along: (x: number, z: number) => number): WashDoor[] =>
    room.doors
      .filter((d) => d.side === side)
      .map((d) => ({ center: along(d.worldX, d.worldZ), width: d.width, height: d.height }));
  return [
    { rotation: 0, origin: [0, -depth / 2], length: width, doors: doors("north", (x) => x - cx) },
    {
      rotation: Math.PI,
      origin: [0, depth / 2],
      length: width,
      doors: doors("south", (x) => -(x - cx)),
    },
    {
      rotation: Math.PI / 2,
      origin: [-width / 2, 0],
      length: depth,
      doors: doors("west", (_, z) => -(z - cz)),
    },
    {
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
function buildWashGeometry(walls: Wall[], rows: WashRow[], wallGain: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const local: number[] = [];
  const rowAttr: number[] = [];
  const floorAttr: number[] = [];
  const idx: number[] = [];
  walls.forEach((wall, w) => {
    const row = rows[w];
    const quad = (corners: Array<[number, number, number]>, floor: number) => {
      const base = pos.length / 3;
      for (const c of corners) {
        pos.push(...fromWall(wall, c, true));
        local.push(...c);
        rowAttr.push(row.spacing, wall.length / 2, floor ? 1 : wallGain);
        floorAttr.push(floor);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    for (const r of washWallRects(row, wall.length, wall.doors)) {
      quad(
        [
          [r.xMin, r.yMin, SURFACE_LIFT],
          [r.xMax, r.yMin, SURFACE_LIFT],
          [r.xMax, r.yMax, SURFACE_LIFT],
          [r.xMin, r.yMax, SURFACE_LIFT],
        ],
        0,
      );
    }
    const half = wall.length / 2;
    quad(
      [
        [-half, SURFACE_LIFT, row.floorReach],
        [half, SURFACE_LIFT, row.floorReach],
        [half, SURFACE_LIFT, 0],
        [-half, SURFACE_LIFT, 0],
      ],
      1,
    );
  });
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
function buildCansGeometry(walls: Wall[], rows: WashRow[]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  walls.forEach((wall, w) => {
    const row = rows[w];
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
  });
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

// ── Ceiling and glazing ───────────────────────────────────────────────

/** The plaster ceiling, facing down, with the well cut out of it unless
 *  the room is `closed`. */
function buildCeilingGeometry(width: number, depth: number, closed: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -depth / 2);
  shape.lineTo(width / 2, -depth / 2);
  shape.lineTo(width / 2, depth / 2);
  shape.lineTo(-width / 2, depth / 2);
  shape.closePath();
  if (!closed) {
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
  const room = useMemo(() => floor.rooms.find((r) => r.isStairwell) ?? null, [floor.rooms]);
  // No flight climbs through the top floor's ceiling, so its well is
  // closed with an oculus instead of left open to nothing.
  const closed = floor.stairsOut.length === 0;
  const { wallColor } = floor.era.palette;

  const built = useMemo(() => {
    if (!room) return null;
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
    const rows = walls.map((w) => fitWashRow(w.length, CEILING_Y));
    return {
      position: [cx, room.worldRect.y, cz] as [number, number, number],
      washMaterial: getWashMaterial(rows[0]),
      wash: buildWashGeometry(walls, rows, poolGainScale(wallColor)),
      cans: buildCansGeometry(walls, rows),
      ceiling: buildCeilingGeometry(width, depth, closed),
      glass: buildGlassGeometry(closed),
      frame: buildGlazingFrame(closed),
    };
  }, [room, closed, wallColor]);

  useEffect(
    () => () => {
      built?.wash.dispose();
      built?.cans.dispose();
      built?.ceiling.dispose();
      built?.glass.dispose();
      built?.frame.dispose();
    },
    [built],
  );

  if (!built) return null;
  return (
    <group position={built.position}>
      <mesh
        geometry={built.ceiling}
        material={getPaletteMaterials(floor.era.palette).ceiling}
        position={[0, CEILING_Y, 0]}
      />
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
      <mesh geometry={built.wash} material={built.washMaterial} renderOrder={1} />
      <mesh geometry={built.cans} material={fixtureUnlitMaterial} layers={UNREFLECTED_LAYER} />
    </group>
  );
}
