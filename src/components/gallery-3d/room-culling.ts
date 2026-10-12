"use client";

// Hides the rooms and works the visitor cannot see, once a frame.
//
// lib/gallery-layout/room-visibility.ts decides what can be on screen by
// walking the door graph from the room the camera is in. This module
// holds the scene objects that go with each room and sets `visible` on
// them from that answer. three skips an invisible object and everything
// under it.
//
// A room is three kinds of object, hidden separately:
//
// - Its contents: floor, ceiling, laylights, dividers, benches and the
//   group of its works. Drawn while the room is seen.
// - Its walls, one group a side. A wall between two rooms belongs to
//   both, whichever of them draws it, so it is drawn while either is
//   seen (`wallSharers`).
// - Each work. In a room the visitor stands in, all of them are left to
//   three's frustum test. In a room seen through a door, a work is
//   drawn only if it can show inside the part of the screen the door
//   covers: a door 20 m away shows two or three works of the thirty
//   behind it.
//
// The stair flights, railings and stairwell lights of a storey go with
// the stairwell (`registerShaftFittings`).
//
// Nothing is hidden for good: every flag is written again each frame,
// and a camera the walk cannot place (outside every room) gets the whole
// museum drawn.
//
// The floor's mirror pass is not culled (`suspendRoomCulling`). Its
// camera is under the floor and sees every room of the storey from
// below, past the foot of the walls, and its image is blurred: the strip
// of floor along a wall takes some of its colour from the room behind
// that wall. With that room hidden the strip went darker by up to 13
// levels of 255, and changed again the moment a door brought the room
// into view.

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  isWholeScreen,
  type ScreenRect,
  sphereInScreenRect,
  type VisibilityRoom,
  visibleRooms,
} from "@/lib/gallery-layout/room-visibility";

export type CulledRoom = {
  room: VisibilityRoom;
  /** Everything the room draws but its walls. */
  contents: THREE.Object3D;
  /** The wall groups the room draws, each with the ids of the rooms
   *  on its other side. */
  walls: ReadonlyArray<{ object: THREE.Object3D; sharedWith: readonly string[] }>;
  /** The group under `contents` whose children are the room's works. */
  works: THREE.Object3D;
};

const rooms = new Map<string, CulledRoom>();
const visibility = new Map<string, VisibilityRoom>();
const shaftFittings = new Set<{ shafts: readonly string[]; object: THREE.Object3D }>();
const workBounds = new WeakMap<THREE.Object3D, THREE.Sphere>();

/** Returns the function that takes the room out again. */
export function registerCulledRoom(entry: CulledRoom): () => void {
  rooms.set(entry.room.id, entry);
  visibility.set(entry.room.id, entry.room);
  return () => {
    if (rooms.get(entry.room.id) === entry) {
      rooms.delete(entry.room.id);
      visibility.delete(entry.room.id);
    }
    // The objects can outlive the registration (a room re-registers
    // when its layout object changes): leave them drawn.
    entry.contents.visible = true;
    for (const wall of entry.walls) wall.object.visible = true;
    for (const work of entry.works.children) work.visible = true;
  };
}

/** Objects drawn while one of the stairwells `shafts` (see `shaftKey`)
 *  is seen: a storey's flights, railings and stairwell lights. */
export function registerShaftFittings(
  shafts: readonly string[],
  object: THREE.Object3D,
): () => void {
  const entry = { shafts, object };
  shaftFittings.add(entry);
  return () => {
    shaftFittings.delete(entry);
    object.visible = true;
  };
}

/** A work tells the pass how far it reaches: frame, plaque, picture
 *  light and pool, as a sphere in world space. A work without one is
 *  always drawn with its room. */
export function setWorkBounds(work: THREE.Object3D, bounds: THREE.Sphere): void {
  workBounds.set(work, bounds);
}

/** What the debug HUD prints about the last frame. */
export const roomCullingDebug = { on: true, rooms: 0, ofRooms: 0, works: 0, ofWorks: 0 };

let forcedOff = false;

/** Dev only, reached through `window.__galleryRoomCulling` while the
 *  debug HUD is on: `false` draws every mounted room as three alone
 *  would, to compare the two at one pose. */
export function forceRoomCulling(on: boolean | null): void {
  forcedOff = on === false;
}

const _eye = new THREE.Vector3();
const _viewProjection = new THREE.Matrix4();
const _seen = new Map<string, ScreenRect>();
const _shafts = new Set<string>();
/** What the last `cullRooms` hid. */
const _hidden: THREE.Object3D[] = [];

function show(object: THREE.Object3D, visible: boolean): void {
  object.visible = visible;
  if (!visible) _hidden.push(object);
}

/**
 * Set `visible` on every registered object for a frame drawn from
 * `camera`. Call it after the camera has been moved for the frame and
 * before anything is rendered.
 */
export function cullRooms(camera: THREE.Camera): void {
  // three refreshes these inside its own render, which comes later.
  camera.updateMatrixWorld();
  _eye.setFromMatrixPosition(camera.matrixWorld);
  _viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const viewProjection = _viewProjection.elements;
  const seen = forcedOff ? null : visibleRooms(visibility, _eye, viewProjection, _seen);

  const debug = roomCullingDebug;
  debug.on = seen !== null;
  debug.rooms = 0;
  debug.ofRooms = rooms.size;
  debug.works = 0;
  debug.ofWorks = 0;
  _shafts.clear();
  _hidden.length = 0;

  for (const entry of rooms.values()) {
    const rect = seen ? seen.get(entry.room.id) : undefined;
    const shown = !seen || rect !== undefined;
    show(entry.contents, shown);
    for (const wall of entry.walls) {
      show(wall.object, shown || wall.sharedWith.some((id) => seen?.has(id)));
    }
    const works = entry.works.children;
    debug.ofWorks += works.length;
    if (!shown) {
      // Hidden with the room. Their own flags go back to drawn, so a
      // work left out through a door last frame is there for the mirror
      // pass, which shows the room again without asking.
      for (const work of works) work.visible = true;
      continue;
    }
    debug.rooms++;
    if (entry.room.shaft !== null) _shafts.add(entry.room.shaft);
    const through = rect && !isWholeScreen(rect) ? rect : null;
    for (const work of works) {
      const bounds = through ? workBounds.get(work) : undefined;
      let inView = true;
      if (through && bounds) {
        const { center: c, radius } = bounds;
        inView = sphereInScreenRect(viewProjection, through, c.x, c.y, c.z, radius);
      }
      show(work, inView);
      if (inView) debug.works++;
    }
  }
  for (const fitting of shaftFittings) {
    show(fitting.object, !seen || fitting.shafts.some((shaft) => _shafts.has(shaft)));
  }
}

/** Draw everything again, for a render that is not from the visitor's
 *  eye. `resumeRoomCulling` puts the frame's flags back. */
export function suspendRoomCulling(): void {
  for (const object of _hidden) object.visible = true;
}

export function resumeRoomCulling(): void {
  for (const object of _hidden) object.visible = false;
}

/** Runs the pass each frame. Mount it after `<Player>`, which moves the
 *  camera in its own frame callback, and before `<FloorReflection>`,
 *  which renders. */
export function RoomCulling(): null {
  useFrame((state) => cullRooms(state.camera));
  return null;
}
