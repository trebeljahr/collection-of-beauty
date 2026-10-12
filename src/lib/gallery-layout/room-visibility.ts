// Which rooms of the museum can be on screen.
//
// three.js culls by the view frustum alone, so a storey used to draw
// every room and every mounted work in the direction of view, walls or
// not. This is the test that replaces it: a portal walk over the door
// graph. The room the visitor stands in is seen whole. A room next to it
// is seen through the door between them, and only in the part of the
// screen that door covers. A room beyond that is seen through both
// doors, in the part of the screen both cover, and so on outward. The
// walk ends by itself where that part becomes empty, so it has no depth
// limit: a limit would hide the last room of a long enfilade while it
// is in view.
//
// Nothing here knows the floor plan. It reads room boxes, the doors
// between them (`Door.connectsTo`) and which rooms are stairwells. The
// renderer side, which hides what this leaves out, is
// components/gallery-3d/room-culling.ts.
//
// The stairwell is open through the storeys, so the stairwells that
// stand on one footprint are one room here (`shaft`): reach one and all
// of them are seen, in the same part of the screen, and the walk goes on
// through the doors of every storey. The well itself is not tested as
// an opening. That draws a few stairwell shells too many and can never
// hide a storey seen up or down the well.
//
// The answer is for the visitor's own eye. The floor's mirror pass
// (floor-reflection.tsx) looks up from under the floor, past the foot of
// every wall, and is drawn without it.

import type { RoomLayout } from "./types";
import { CELL_SIZE, FLOOR_SEPARATION } from "./world-coords";

/** A door as the walk sees it: an upright rectangle in world metres. */
export type Opening = {
  /** Id of the room on the other side. */
  to: string;
  /** The two ends of the threshold on the plan. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Threshold and lintel. */
  yMin: number;
  yMax: number;
};

export type VisibilityRoom = {
  id: string;
  /** The box a visitor in this room is inside: wall line to wall line,
   *  floor to the floor above. */
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  yMin: number;
  yMax: number;
  openings: Opening[];
  /** Set on a stairwell: the rooms that share the value are open to one
   *  another through their floors. */
  shaft: string | null;
};

/** Part of the screen in normalised device coordinates, -1 to 1. */
export type ScreenRect = { x0: number; y0: number; x1: number; y1: number };

export const WHOLE_SCREEN: ScreenRect = Object.freeze({ x0: -1, y0: -1, x1: 1, y1: 1 });

export type Eye = { x: number; y: number; z: number };

/** The stairwells of one stair share a footprint, storey over storey. */
export function shaftKey(room: RoomLayout): string | null {
  if (!room.isStairwell) return null;
  const { xMin, zMin, xMax, zMax } = room.cellBounds;
  return `shaft:${xMin},${zMin},${xMax},${zMax}`;
}

/** A room of the layout as the walk needs it. */
export function visibilityRoom(room: RoomLayout): VisibilityRoom {
  const { cellBounds: cells } = room;
  return {
    id: room.id,
    xMin: cells.xMin * CELL_SIZE,
    xMax: (cells.xMax + 1) * CELL_SIZE,
    zMin: cells.zMin * CELL_SIZE,
    zMax: (cells.zMax + 1) * CELL_SIZE,
    yMin: room.worldRect.y,
    yMax: room.worldRect.y + FLOOR_SEPARATION,
    openings: room.doors.map((door) => {
      const alongX = door.side === "north" || door.side === "south";
      const half = door.width / 2;
      return {
        to: door.connectsTo.roomId,
        x0: alongX ? door.worldX - half : door.worldX,
        z0: alongX ? door.worldZ : door.worldZ - half,
        x1: alongX ? door.worldX + half : door.worldX,
        z1: alongX ? door.worldZ : door.worldZ + half,
        yMin: door.worldY,
        yMax: door.worldY + door.height,
      };
    }),
    shaft: shaftKey(room),
  };
}

type Side = "north" | "south" | "east" | "west";

/**
 * For each side of `room`, the rooms that stand against it. The wall
 * `room` draws there is their wall too, and has to be drawn while any of
 * them is seen, whether or not `room` is.
 *
 * That holds for a neighbour that draws the same wall itself as much as
 * for one that leaves it out (`RoomLayout.suppressWalls`). Where both
 * draw, the two planes coincide and the copy three draws last shows. If
 * one copy went with its room, a damask wall would change its figure the
 * moment that room came into view.
 */
export function wallSharers(
  room: RoomLayout,
  floorRooms: readonly RoomLayout[],
): Record<Side, string[]> {
  const shared: Record<Side, string[]> = { north: [], south: [], east: [], west: [] };
  const a = room.cellBounds;
  for (const other of floorRooms) {
    if (other === room || other.floorIndex !== room.floorIndex) continue;
    const b = other.cellBounds;
    const overlapX = a.xMin <= b.xMax && b.xMin <= a.xMax;
    const overlapZ = a.zMin <= b.zMax && b.zMin <= a.zMax;
    if (overlapX && b.zMax + 1 === a.zMin) shared.north.push(other.id);
    else if (overlapX && a.zMax + 1 === b.zMin) shared.south.push(other.id);
    else if (overlapZ && a.xMax + 1 === b.xMin) shared.east.push(other.id);
    else if (overlapZ && b.xMax + 1 === a.xMin) shared.west.push(other.id);
  }
  return shared;
}

/** Closer to an opening than this, the visitor counts as standing in
 *  both rooms. On the threshold the door is seen edge-on and covers no
 *  part of the screen, while half the view is the room beyond. */
export const NEAR_OPENING_M = 0.75;

/** Depth in front of the eye below which an opening's corner is cut
 *  off before it is projected. */
const MIN_DEPTH_M = 1e-3;

function inside(room: VisibilityRoom, eye: Eye): boolean {
  return (
    eye.x >= room.xMin &&
    eye.x <= room.xMax &&
    eye.z >= room.zMin &&
    eye.z <= room.zMax &&
    eye.y >= room.yMin &&
    eye.y < room.yMax
  );
}

function nearOpening(o: Opening, eye: Eye): boolean {
  // Closest point of the threshold segment, then the height.
  const sx = o.x1 - o.x0;
  const sz = o.z1 - o.z0;
  const lengthSq = sx * sx + sz * sz;
  const t =
    lengthSq > 0
      ? Math.min(1, Math.max(0, ((eye.x - o.x0) * sx + (eye.z - o.z0) * sz) / lengthSq))
      : 0;
  const dx = eye.x - (o.x0 + t * sx);
  const dz = eye.z - (o.z0 + t * sz);
  const dy = Math.max(o.yMin - eye.y, 0, eye.y - o.yMax);
  return dx * dx + dy * dy + dz * dz < NEAR_OPENING_M * NEAR_OPENING_M;
}

// Scratch for the four corners of an opening in clip space: x, y, w.
const _corners = new Float64Array(12);

/**
 * The part of the screen an opening covers, written into `out`. Returns
 * false when all of it is behind the eye.
 *
 * `viewProjection` is the camera's projection times its view matrix,
 * column-major as in three's `Matrix4.elements`. The rectangle is cut at
 * the eye's own plane, not at the near plane: a ray that crosses the
 * opening nearer than the near plane still goes on into the room beyond.
 */
export function openingOnScreen(
  o: Opening,
  viewProjection: ArrayLike<number>,
  out: ScreenRect,
): boolean {
  const m = viewProjection;
  for (let i = 0; i < 4; i++) {
    const x = i === 0 || i === 3 ? o.x0 : o.x1;
    const z = i === 0 || i === 3 ? o.z0 : o.z1;
    const y = i < 2 ? o.yMin : o.yMax;
    _corners[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
    _corners[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    _corners[i * 3 + 2] = m[3] * x + m[7] * y + m[11] * z + m[15];
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const take = (cx: number, cy: number, cw: number) => {
    const nx = cx / cw;
    const ny = cy / cw;
    if (nx < x0) x0 = nx;
    if (nx > x1) x1 = nx;
    if (ny < y0) y0 = ny;
    if (ny > y1) y1 = ny;
  };
  for (let i = 0; i < 4; i++) {
    const a = i * 3;
    const b = ((i + 1) % 4) * 3;
    const wa = _corners[a + 2];
    const wb = _corners[b + 2];
    if (wa >= MIN_DEPTH_M) take(_corners[a], _corners[a + 1], wa);
    // Where the edge crosses the eye's plane, it leaves the screen.
    if (wa >= MIN_DEPTH_M !== wb >= MIN_DEPTH_M) {
      const t = (MIN_DEPTH_M - wa) / (wb - wa);
      take(
        _corners[a] + t * (_corners[b] - _corners[a]),
        _corners[a + 1] + t * (_corners[b + 1] - _corners[a + 1]),
        MIN_DEPTH_M,
      );
    }
  }
  if (x0 > x1) return false;
  out.x0 = x0;
  out.y0 = y0;
  out.x1 = x1;
  out.y1 = y1;
  return true;
}

const _seen: ScreenRect = { x0: 0, y0: 0, x1: 0, y1: 0 };

/**
 * The rooms that can be on screen, each with the part of the screen it
 * can be seen in: the whole of it for a room the visitor stands in, the
 * bounds of the doors in between for any other.
 *
 * Returns null when the eye is in none of `rooms`. The caller then draws
 * everything: a camera the walk cannot place must not blank the museum.
 *
 * `rooms` holds what is mounted. An opening into a room that is not
 * among them leads nowhere.
 */
export function visibleRooms(
  rooms: ReadonlyMap<string, VisibilityRoom>,
  eye: Eye,
  viewProjection: ArrayLike<number>,
  out: Map<string, ScreenRect> = new Map(),
): Map<string, ScreenRect> | null {
  out.clear();
  let home: VisibilityRoom | null = null;
  for (const room of rooms.values()) {
    if (inside(room, eye)) {
      home = room;
      break;
    }
  }
  if (!home) return null;

  const queue: VisibilityRoom[] = [];
  // A room can be reached through several doors. It keeps the bounds of
  // all of them, and is walked again whenever those bounds grow. Every
  // edge of every rectangle is an edge of some opening or of the screen,
  // so they can only grow so many times and the walk ends.
  const grow = (room: VisibilityRoom, rect: ScreenRect) => {
    const had = out.get(room.id);
    if (!had) {
      out.set(room.id, { ...rect });
    } else {
      if (had.x0 <= rect.x0 && had.y0 <= rect.y0 && had.x1 >= rect.x1 && had.y1 >= rect.y1) return;
      had.x0 = Math.min(had.x0, rect.x0);
      had.y0 = Math.min(had.y0, rect.y0);
      had.x1 = Math.max(had.x1, rect.x1);
      had.y1 = Math.max(had.y1, rect.y1);
    }
    queue.push(room);
  };
  const reach = (room: VisibilityRoom, rect: ScreenRect) => {
    grow(room, rect);
    if (room.shaft === null) return;
    for (const other of rooms.values()) {
      if (other !== room && other.shaft === room.shaft) grow(other, rect);
    }
  };

  reach(home, WHOLE_SCREEN);
  for (let room = queue.pop(); room; room = queue.pop()) {
    const through = out.get(room.id);
    if (!through) continue;
    for (const opening of room.openings) {
      const next = rooms.get(opening.to);
      if (!next) continue;
      if (nearOpening(opening, eye)) {
        reach(next, WHOLE_SCREEN);
        continue;
      }
      if (!openingOnScreen(opening, viewProjection, _seen)) continue;
      const x0 = Math.max(_seen.x0, through.x0);
      const y0 = Math.max(_seen.y0, through.y0);
      const x1 = Math.min(_seen.x1, through.x1);
      const y1 = Math.min(_seen.y1, through.y1);
      if (x0 >= x1 || y0 >= y1) continue;
      _seen.x0 = x0;
      _seen.y0 = y0;
      _seen.x1 = x1;
      _seen.y1 = y1;
      reach(next, _seen);
    }
  }
  return out;
}

/** True for the rectangle of a room the visitor stands in. */
export function isWholeScreen(rect: ScreenRect): boolean {
  return rect.x0 <= -1 && rect.y0 <= -1 && rect.x1 >= 1 && rect.y1 >= 1;
}

/**
 * Can a sphere show inside `rect`? Used for the works of a room seen
 * through a door: three would draw every one of them that is in the
 * view frustum, and the door shows two or three.
 *
 * Errs toward true. The sphere's centre and its depth are bounded
 * separately, so the answer is exact only for a sphere far from the eye.
 */
export function sphereInScreenRect(
  viewProjection: ArrayLike<number>,
  rect: ScreenRect,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
): boolean {
  const m = viewProjection;
  const w = m[3] * cx + m[7] * cy + m[11] * cz + m[15];
  // How fast depth changes with position: 1 for a perspective camera.
  const wSpan = radius * Math.hypot(m[3], m[7], m[11]);
  const near = w - wSpan;
  if (near <= MIN_DEPTH_M) return w + wSpan > 0;
  const far = w + wSpan;
  const x = m[0] * cx + m[4] * cy + m[8] * cz + m[12];
  const xSpan = radius * Math.hypot(m[0], m[4], m[8]);
  const left = x - xSpan;
  const right = x + xSpan;
  if (left / (left >= 0 ? far : near) >= rect.x1) return false;
  if (right / (right >= 0 ? near : far) <= rect.x0) return false;
  const y = m[1] * cx + m[5] * cy + m[9] * cz + m[13];
  const ySpan = radius * Math.hypot(m[1], m[5], m[9]);
  const bottom = y - ySpan;
  const top = y + ySpan;
  if (bottom / (bottom >= 0 ? far : near) >= rect.y1) return false;
  if (top / (top >= 0 ? near : far) <= rect.y0) return false;
  return true;
}
