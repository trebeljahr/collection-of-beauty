"use client";

import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  grantReveals,
  REVEAL_BYTE_BUDGET,
  type RevealClaim,
  roomRevealBytes,
} from "@/lib/gallery-layout/reveal-budget";
import { paletteOfRoom } from "@/lib/gallery-layout/room-era";
import { shaftKey, visibilityRoom } from "@/lib/gallery-layout/room-visibility";
import type { Door, Placement, RoomLayout, WorldOpening } from "@/lib/gallery-layout/types";
import {
  CELL_SIZE,
  FLOOR_SEPARATION,
  FLOOR_THICKNESS,
  hasStairwellCutout,
  INTER_FLOOR_HEIGHT,
  SPIRAL_FLOOR_CUTOUT_RADIUS,
} from "@/lib/gallery-layout/world-coords";
import { RoomBenches } from "./bench";
import { RoomDividers } from "./divider";
import { registerMirrorRoom } from "./floor-mirror";
import { ceilingAround, Laylight } from "./laylight";
import { laylightPanels } from "./laylight-layout";
import { Painting } from "./painting";
import { wallInsetOf } from "./painting-light-rig";
import {
  darkWoodTrimMaterial,
  fixtureMaterial,
  getPaletteMaterials,
  getRoomFloorMaterial,
} from "./palette-materials";
import { registerCulledRoom } from "./room-culling";
import { inRoomLight } from "./room-light";
import { openingHole, rectsAround } from "./stair-opening";
import { type SkirtingClip, WallWithDoors } from "./wall";

type Side = Door["side"];
const SIDES: readonly Side[] = ["north", "south", "east", "west"];

/**
 * Render a single room: floor, ceiling with its laylights, 4 walls with
 * the room's door openings cut out, its dividers and benches, and its
 * paintings. Uses shared per-palette
 * materials so every room of the same era reuses the same 4 materials
 * instead of allocating fresh ones.
 */
// What stands in a doorway for a room that is not mounted: the dim of
// an unlit room, where the scene's background would read as a hole in
// the building. Seen only from a stair hall, across its well, on a floor
// two or more storeys from the visitor's.
const doorBlindMaterial = new THREE.MeshBasicMaterial({
  color: "#4a443b",
  side: THREE.DoubleSide,
});
const DOOR_BLIND_SETBACK = 0.45;

export function RoomGeometry({
  room,
  sharedWalls,
  mountedRooms,
  worksInFull = true,
  onPaintingSettled,
}: {
  room: RoomLayout;
  /** False on a floor that is mounted only because a hall shows its
   *  doors: its galleries keep their stand-ins however near they are on
   *  the plan. A hall is one room through every storey and shows its
   *  works in full from any of them. */
  worksInFull?: boolean;
  /** The rooms of this floor that are mounted, when not all are. A door
   *  to any other gets a blind. */
  mountedRooms?: ReadonlySet<string>;
  /** For each side, the rooms across it, whose wall this room's is
   *  too (`wallSharers`). */
  sharedWalls: Record<Side, readonly string[]>;
  /** Fires once per painting after its 960 px texture loads. Optional —
   *  Gallery3D only passes it for the entry room so the start
   *  overlay can show first-room load progress / failures. */
  onPaintingSettled?: (key: string, status: "loaded" | "failed") => void;
}) {
  const palette = paletteOfRoom(room);
  const mats = getPaletteMaterials(palette);
  // A room that carries its own era stands beside rooms in other
  // colours. It draws all four of its walls on its own side only, and
  // its neighbour does the same from the other side. In the tower a
  // floor is one colour and a shared wall is one two-sided plane.
  const ownWalls = room.era !== undefined;
  const wallMat = ownWalls ? mats.wallInside : mats.wall;
  const suppress = ownWalls ? undefined : room.suppressWalls;
  // Stairwell rooms drop the per-room accent and use the era's base
  // floor colour instead, so the floor reads as continuous when
  // stepping between the spiral and the surrounding corridor — accents
  // created a visible colour edge at the doorway into the stairwell.
  // Regular rooms keep their accent: their walls + frames break the
  // line of sight to the corridor floor, so any edge stays hidden.
  const floorMat = getRoomFloorMaterial(room.isStairwell ? palette.floorColor : room.floorColor);
  // What every room shares, lit as this one is (room-light.ts).
  const trim = inRoomLight(darkWoodTrimMaterial, palette);
  const fixture = inRoomLight(fixtureMaterial, palette);
  const { cellBounds } = room;

  const xMin = cellBounds.xMin * CELL_SIZE;
  const xMax = (cellBounds.xMax + 1) * CELL_SIZE;
  const zMin = cellBounds.zMin * CELL_SIZE;
  const zMax = (cellBounds.zMax + 1) * CELL_SIZE;
  const width = xMax - xMin;
  const depth = zMax - zMin;
  const cxWorld = (xMin + xMax) / 2;
  const czWorld = (zMin + zMax) / 2;
  const floorY = room.worldRect.y;
  // Walls span floor-to-next-slab so the building has no visible gap
  // above the interior ceiling when seen from across the open well;
  // the ceiling plane, at the room's own height, covers the plenum
  // from inside.
  //
  // A grand stair hall is one room through every storey, and one of its
  // walls may stand sheer with no gallery against it (`room.sheer`):
  // there the wall runs on through the slab's depth to the storey above.
  const wallHeight = room.ceilingOpening !== undefined ? FLOOR_SEPARATION : INTER_FLOOR_HEIGHT;
  const wallMidY = floorY + wallHeight / 2;
  // A hall with a sheer wall stands its walls a few millimetres inside
  // their lines. On the sheer wall nothing hides the edge of the floor
  // slab of the room behind, which lies in the wall's own plane. The
  // hall's light pools stand on the same line (`wallInsetOf`).
  const wallInset = wallInsetOf(room);
  const ceilingY = floorY + room.ceilingHeight;
  // Skirting follows the floor: none along a sheer wall on the storeys
  // where the hall's void lies in front of it.
  const skirting = (side: Side): SkirtingClip => {
    if (!room.sheer || !room.floorOpening) return undefined;
    const { side: sheer, depth: strip } = room.sheer;
    if (side === sheer) return null;
    const alongX = side === "north" || side === "south";
    if (alongX === (sheer === "north" || sheer === "south")) return undefined;
    const half = (alongX ? width : depth) / 2;
    // Which end of this wall's local x the sheer wall is at (see the
    // door mapping below for each wall's local frame).
    const atLow =
      (side === "east" && sheer === "north") ||
      (side === "west" && sheer === "south") ||
      (side === "north" && sheer === "west") ||
      (side === "south" && sheer === "east");
    return atLow ? { xMin: -half + strip, xMax: half } : { xMin: -half, xMax: half - strip };
  };
  const laylights = useMemo(() => laylightPanels(room), [room]);
  // The ceiling, cut where each laylight is recessed into it.
  const ceilingGeom = useMemo(
    () => ceilingAround(laylights, cxWorld, czWorld, width, depth),
    [laylights, cxWorld, czWorld, width, depth],
  );
  useEffect(() => () => ceilingGeom.dispose(), [ceilingGeom]);

  // Floor plane with world-unit UVs so 1 m of floor = 1 m of texture
  // tile, regardless of room size. UVs are anchored to the room's
  // world-space corner (xMin, zMin) so the tile pattern joins
  // continuously across room-to-room and room-to-hallway boundaries
  // — without that anchor, every room would restart its UVs at 0,0
  // and adjacent floors with the same texture would seam visibly at
  // the doorway thresholds.
  const floorGeom = useWorldUVPlane(width, depth, xMin, zMin);

  const doorsBySide = {
    north: room.doors.filter((d) => d.side === "north"),
    south: room.doors.filter((d) => d.side === "south"),
    east: room.doors.filter((d) => d.side === "east"),
    west: room.doors.filter((d) => d.side === "west"),
  };

  // Map a world-space door position into the wall's local frame. Each
  // wall is a plane rotated around Y; the wall's local +X axis after
  // rotation maps to a different world axis depending on the side:
  //   north (rot 0):     local +X →  world +X
  //   south (rot π):     local +X →  world -X    (mirror of cxWorld)
  //   east  (rot -π/2):  local +X →  world +Z
  //   west  (rot +π/2):  local +X →  world -Z    (mirror of czWorld)
  // So doors on the south/west walls need a sign flip; the older code
  // had this inverted, which painted the cut on the mirror side of the
  // wall whenever the door wasn't centred on the wall's midpoint.
  const nDoors = doorsBySide.north.map((d) => ({
    centerLocalX: d.worldX - cxWorld,
    width: d.width,
    height: d.height,
    portal: d.portal,
  }));
  const sDoors = doorsBySide.south.map((d) => ({
    centerLocalX: -(d.worldX - cxWorld),
    width: d.width,
    height: d.height,
    portal: d.portal,
  }));
  const eDoors = doorsBySide.east.map((d) => ({
    centerLocalX: d.worldZ - czWorld,
    width: d.width,
    height: d.height,
    portal: d.portal,
  }));
  const wDoors = doorsBySide.west.map((d) => ({
    centerLocalX: -(d.worldZ - czWorld),
    width: d.width,
    height: d.height,
    portal: d.portal,
  }));

  // Stairwell rooms render neither the plain floor (the well is open
  // down to the storey below) nor the ceiling at room height: theirs is
  // a storey up, with the well cut out of it and its own lighting (see
  // stairwell-light.tsx).
  const isStandardRoom = !room.isStairwell;

  // Paintings load lazily, image by image, only once the player is near
  // this room (see useRoomWorks). Until then each is its picture light
  // and a stand-in, so a room seen from afar is lit and hung.
  const works = useRoomWorks(room, worksInFull || room.isStairwell);
  const settledHandler = usePaintingSettledHandlers(onPaintingSettled);

  // The floor's mirror pass draws this room's works only while the
  // visitor is in or next to the room (floor-mirror.ts).
  const worksRef = useRef<THREE.Group>(null);
  useEffect(() => {
    const works = worksRef.current;
    if (!works) return;
    return registerMirrorRoom({ works, xMin, xMax, zMin, zMax, y: floorY });
  }, [xMin, xMax, zMin, zMax, floorY]);

  // Room culling draws the room only while it can be on screen, and each
  // wall while this room or the one it is shared with can
  // (room-culling.ts). The walls stay out of `contentsRef` for that.
  const contentsRef = useRef<THREE.Group>(null);
  const wallRefs = useRef<Partial<Record<Side, THREE.Group | null>>>({});
  useEffect(() => {
    const contents = contentsRef.current;
    const works = worksRef.current;
    if (!contents || !works) return;
    const walls = SIDES.flatMap((side) => {
      const object = wallRefs.current[side];
      return object ? [{ object, sharedWith: sharedWalls[side] }] : [];
    });
    return registerCulledRoom({ room: visibilityRoom(room), contents, walls, works });
  }, [room, sharedWalls]);

  return (
    <group>
      <group ref={contentsRef}>
        {isStandardRoom && (
          <>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[cxWorld, floorY, czWorld]}
              geometry={floorGeom}
            >
              <primitive object={floorMat} attach="material" />
            </mesh>
            {/* Slab body — same XZ footprint as the walking surface
              above, dropped 1 mm so the textured plane wins the
              z-fight on top. Renders the underside + cross-section
              edges that make the floor read as a real slab from the
              open well or any wall opening. */}
            <mesh position={[cxWorld, floorY - FLOOR_THICKNESS / 2 - 0.001, czWorld]}>
              <boxGeometry args={[width, FLOOR_THICKNESS, depth]} />
              <primitive object={floorMat} attach="material" />
            </mesh>
          </>
        )}
        {isStandardRoom && (
          <>
            <mesh position={[cxWorld, ceilingY, czWorld]} geometry={ceilingGeom}>
              <primitive object={mats.ceiling} attach="material" />
            </mesh>
            {laylights.map((p) => (
              <Laylight
                key={`${p.xMin}:${p.zMin}`}
                cx={(p.xMin + p.xMax) / 2}
                cz={(p.zMin + p.zMax) / 2}
                ceilingY={ceilingY}
                w={p.xMax - p.xMin}
                d={p.zMax - p.zMin}
                reveal={mats.ceiling}
                fixture={fixture}
              />
            ))}
          </>
        )}

        {/* Stairwell main floor. On the ground floor the spiral only
          rises (no stair below), so the floor stays solid — a hole
          there would just expose blackness. On every other floor the
          stair from below ascends through this level, so we cut a
          clean circular hole around the spiral so the descending
          flights stay visible. */}
        {room.isStairwell && (
          <StairwellFloor
            cxWorld={cxWorld}
            czWorld={czWorld}
            width={width}
            depth={depth}
            floorY={floorY}
            floorMat={floorMat}
            hole={
              room.floorOpening !== undefined
                ? room.floorOpening
                : hasStairwellCutout(room.floorIndex)
                  ? "spiral"
                  : null
            }
          />
        )}

        {mountedRooms &&
          room.doors
            .filter((door) => !mountedRooms.has(door.connectsTo.roomId))
            .map((door) => {
              const alongX = door.side === "north" || door.side === "south";
              const out = door.side === "north" || door.side === "west" ? -1 : 1;
              return (
                <mesh
                  key={`blind:${door.side}:${door.worldX}:${door.worldZ}`}
                  material={doorBlindMaterial}
                  position={[
                    door.worldX + (alongX ? 0 : out * DOOR_BLIND_SETBACK),
                    floorY + door.height / 2,
                    door.worldZ + (alongX ? out * DOOR_BLIND_SETBACK : 0),
                  ]}
                  rotation={[0, alongX ? 0 : Math.PI / 2, 0]}
                >
                  <planeGeometry args={[door.width + 1.2, door.height + 0.6]} />
                </mesh>
              );
            })}

        {/* Freestanding walls and benches. Both are part of the shell:
          they are colliders whether or not they are drawn, so they
          mount with the room, not with its paintings. */}
        <RoomDividers room={room} material={mats.wall} screenMaterial={mats.screen} trim={trim} />
        <RoomBenches benches={room.benches} floorY={floorY} palette={palette} />

        {/* Paintings — lit from the start, revealed lazily once the
          player nears this room, then a few per frame, nearest first. */}
        <group ref={worksRef}>
          {works.mounted.map((p) => {
            const paintingKey = `${room.id}-${p.artwork.id}-${p.position.join(",")}`;
            return (
              <Painting
                key={paintingKey}
                placement={p}
                room={room}
                revealed={works.revealed.has(p)}
                onSettled={settledHandler(paintingKey)}
              />
            );
          })}
        </group>
      </group>

      {/* Four walls — each may be suppressed when a neighbouring room
          owns the shared wall (and draws it with a door cut). */}
      {!suppress?.north && (
        <WallWithDoors
          position={[cxWorld, wallMidY, zMin + wallInset]}
          rotation={[0, 0, 0]}
          width={width}
          height={wallHeight}
          material={wallMat}
          trim={trim}
          doors={nDoors}
          skirting={skirting("north")}
          ownFace={ownWalls}
          groupRef={(group) => {
            wallRefs.current.north = group;
          }}
        />
      )}
      {!suppress?.south && (
        <WallWithDoors
          position={[cxWorld, wallMidY, zMax - wallInset]}
          rotation={[0, Math.PI, 0]}
          width={width}
          height={wallHeight}
          material={wallMat}
          trim={trim}
          doors={sDoors}
          skirting={skirting("south")}
          ownFace={ownWalls}
          groupRef={(group) => {
            wallRefs.current.south = group;
          }}
        />
      )}
      {!suppress?.west && (
        <WallWithDoors
          position={[xMin + wallInset, wallMidY, czWorld]}
          rotation={[0, Math.PI / 2, 0]}
          width={depth}
          height={wallHeight}
          material={wallMat}
          trim={trim}
          doors={wDoors}
          skirting={skirting("west")}
          ownFace={ownWalls}
          groupRef={(group) => {
            wallRefs.current.west = group;
          }}
        />
      )}
      {!suppress?.east && (
        <WallWithDoors
          position={[xMax - wallInset, wallMidY, czWorld]}
          rotation={[0, -Math.PI / 2, 0]}
          width={depth}
          height={wallHeight}
          material={wallMat}
          trim={trim}
          doors={eDoors}
          skirting={skirting("east")}
          ownFace={ownWalls}
          groupRef={(group) => {
            wallRefs.current.east = group;
          }}
        />
      )}
    </group>
  );
}

// Painting reveal tuning. A room's paintings mount in full only once the
// camera is within PAINTING_LOAD_RADIUS (metres, XZ) of the room, and
// then PAINTINGS_PER_FRAME at a time, so a dense room never mounts its
// whole wall of paintings (each carrying troika-text plaques) in one
// hitching frame. ~14 m reaches the rooms directly off the stairwell
// while the player is still on the spiral, so the arrival view is
// loading before they crest.
const PAINTING_LOAD_RADIUS = 14;
const PAINTING_LOAD_RADIUS_SQ = PAINTING_LOAD_RADIUS * PAINTING_LOAD_RADIUS;
const PAINTINGS_PER_FRAME = 2;
// Rooms this far behind the player drop their paintings again. Well
// outside the 14 m mount radius so a player pacing a doorway can't flap
// between the two.
const PAINTING_UNLOAD_RADIUS = 34;
const PAINTING_UNLOAD_RADIUS_SQ = PAINTING_UNLOAD_RADIUS * PAINTING_UNLOAD_RADIUS;
// The two radii say which rooms are in reach. They do not bound what
// the rooms in reach hold: from the middle of a floor every room of it
// is within 34 m, and a floor that has been walked had all of its ~300
// paintings in full, each pinning a base texture on every LOD tick, in
// a pool that holds about 200. So reach is a request. Each mounted room
// files a claim, `RoomReveals` ranks the claims once a frame, and the
// rooms nearest the visitor take the pool for as long as their works
// fit it (reveal-budget.ts). A room acts on an answer one frame old.
type RoomClaim = RevealClaim & {
  /** The room's footprint on the plan, and the height of its floor. */
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  floorY: number;
  /** It has works and is on a storey that shows them in full. */
  eligible: boolean;
};
const revealClaims = new Map<string, RoomClaim>();
let revealGrants: ReadonlySet<string> = new Set();
// A room that loses its place gives its paintings up this many a frame,
// the last revealed first. It can lose it with the visitor a few metres
// off, and 80 paintings unmounted in one frame is a hitch.
const STAND_INS_PER_FRAME = 8;
/** Standing eye height (player.tsx): the camera is this far over the
 *  visitor's feet. */
const EYE_HEIGHT_M = 1.75;

/** For the debug HUD: what the last ranking granted. */
export const roomRevealDebug = {
  /** Rooms with works that are in reach. */
  asking: 0,
  /** Those granted the pool. */
  granted: 0,
  /** Base texture bytes of the granted rooms' works. */
  bytes: 0,
  budget: REVEAL_BYTE_BUDGET,
};

/** For the debug HUD's console hook: every mounted room's claim and
 *  whether the last ranking granted it. */
export function roomRevealClaims(): Array<RevealClaim & { id: string; granted: boolean }> {
  return [...revealClaims].map(([id, claim]) => ({
    id,
    cost: claim.cost,
    distance: claim.distance,
    rise: claim.rise,
    doors: claim.doors,
    shaft: claim.shaft,
    asks: claim.asks,
    holds: claim.holds,
    granted: revealGrants.has(id),
  }));
}

/** Ranks the rooms' claims on the base texture pool, once a frame.
 *  Mount one per scene: without it no room shows its works in full. */
export function RoomReveals() {
  useFrame(({ camera }) => {
    // Every room is measured here, from one camera position. Measured
    // each in its own frame callback, the rooms of the frame a visitor
    // is sent to another floor or room were ranked half from the old
    // place and half from the new: a room that had left reach still
    // counted, and a room that fitted was denied and gave its works up.
    const { x, y, z } = camera.position;
    const feet = y - EYE_HEIGHT_M;
    for (const claim of revealClaims.values()) {
      const dx = x - Math.min(Math.max(x, claim.xMin), claim.xMax);
      const dz = z - Math.min(Math.max(z, claim.zMin), claim.zMax);
      claim.distance = Math.hypot(dx, dz);
      claim.rise = Math.abs(feet - claim.floorY);
      claim.asks =
        claim.eligible &&
        claim.distance <= (claim.holds ? PAINTING_UNLOAD_RADIUS : PAINTING_LOAD_RADIUS);
    }
    revealGrants = grantReveals(revealClaims);
    let asking = 0;
    let bytes = 0;
    for (const [id, claim] of revealClaims) {
      if (!claim.asks) continue;
      asking++;
      if (revealGrants.has(id)) bytes += claim.cost;
    }
    roomRevealDebug.asking = asking;
    roomRevealDebug.granted = revealGrants.size;
    roomRevealDebug.bytes = bytes;
  });
  return null;
}

// A room out of reach, or in reach and not granted, is not bare. Every
// work keeps its picture light and a stand-in for frame and canvas
// (painting.tsx) for as long as its floor is mounted, at no cost in
// textures. They used to mount with the work, and the pools faded in as
// it did: a room seen through a portal from over 14 m away stood unlit,
// and its lights came on as the visitor walked up to it. In the tower a
// room that far is seldom in view. In the block plan the spine is five
// rooms in a line through 3.5 m portals. Lights mount this many a frame
// from the moment the floor does, nearest room first.
const LIGHTS_PER_FRAME = 6;

// Both ramps are serialised across rooms, nearest first. Several rooms
// are inside the mount radius at once (the room you're in plus whatever
// the doorways open onto), and letting each ramp in parallel interleaved
// their loads: the room you're standing in finished last because it was
// sharing the network gate and the GPU upload queue with rooms behind
// you. Rooms with paintings still to mount publish their distance here
// each frame, and only the closest one spends the frame's budget — so a
// floor fills outward from the player instead of all at once.
const pendingRooms = new Map<string, number>();
const pendingLights = new Map<string, number>();

/** Is `roomId` the closest room still waiting in `pending`? */
function isNearestPending(
  pending: ReadonlyMap<string, number>,
  roomId: string,
  distSq: number,
): boolean {
  for (const [otherId, otherDist] of pending) {
    if (otherId === roomId) continue;
    if (otherDist < distSq) return false;
  }
  return true;
}

/** Which of a room's works to mount right now, and which of those in
 *  full. A work not in `revealed` is its picture light and a stand-in.
 *
 *  Lights and stand-ins ramp up from the moment the room mounts,
 *  LIGHTS_PER_FRAME a frame, and stay. Works are revealed once the
 *  camera comes within PAINTING_LOAD_RADIUS of the room and the pool has
 *  room for them (`revealGrants`), PAINTINGS_PER_FRAME a frame, ordered
 *  nearest the player first. Each ramp runs only while this is the
 *  nearest room still waiting for it. Past PAINTING_UNLOAD_RADIUS, or
 *  when a nearer room needs the pool, the works go back to stand-ins. A
 *  return visit re-ramps from the texture cache while its textures are
 *  still there, so it costs frames, not network.
 *
 *  `mayReveal` is false for a gallery on a storey the visitor is not on
 *  (`RoomGeometry.worksInFull`). */
function useRoomWorks(
  room: RoomLayout,
  mayReveal: boolean,
): {
  mounted: Placement[];
  revealed: ReadonlySet<Placement>;
} {
  const bounds = useMemo(() => {
    const cb = room.cellBounds;
    return {
      xMin: cb.xMin * CELL_SIZE,
      xMax: (cb.xMax + 1) * CELL_SIZE,
      zMin: cb.zMin * CELL_SIZE,
      zMax: (cb.zMax + 1) * CELL_SIZE,
    };
  }, [room]);

  const total = room.placements.length;
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const [lit, setLit] = useState(0);
  const litRef = useRef(0);
  const nearRef = useRef(false);
  // Reveal order, fixed when the room comes into range: nearest the
  // player's entry point first, so the wall you walk in facing fills
  // before the one behind you. Recomputing it every frame would reorder
  // works that are already mounted.
  const orderRef = useRef<Placement[]>(room.placements);
  // This room's claim on the pool, filed for as long as it is mounted.
  // A room with no works files one too: the ranking has to know where
  // the visitor stands, and that is often a stairwell.
  const claim = useMemo<RoomClaim>(
    () => ({
      cost: roomRevealBytes(room),
      distance: Number.POSITIVE_INFINITY,
      rise: 0,
      doors: room.doors.map((door) => door.connectsTo.roomId),
      shaft: shaftKey(room),
      asks: false,
      holds: false,
      ...bounds,
      floorY: room.worldRect.y,
      eligible: false,
    }),
    [room, bounds],
  );

  // Reset if this instance is ever reused for a different room.
  useEffect(() => {
    countRef.current = 0;
    litRef.current = 0;
    nearRef.current = false;
    orderRef.current = room.placements;
    setCount(0);
    setLit(0);
    claim.holds = false;
    revealClaims.set(room.id, claim);
    return () => {
      pendingRooms.delete(room.id);
      pendingLights.delete(room.id);
      if (revealClaims.get(room.id) === claim) revealClaims.delete(room.id);
    };
  }, [room, claim]);

  useFrame((state) => {
    const { x, y, z } = state.camera.position;
    const nx = Math.min(Math.max(x, bounds.xMin), bounds.xMax);
    const nz = Math.min(Math.max(z, bounds.zMin), bounds.zMax);
    const dx = x - nx;
    const dz = z - nz;
    const distSq = dx * dx + dz * dz;

    if (litRef.current >= total) {
      pendingLights.delete(room.id);
    } else {
      pendingLights.set(room.id, distSq);
      if (isNearestPending(pendingLights, room.id, distSq)) {
        litRef.current = Math.min(total, litRef.current + LIGHTS_PER_FRAME);
        setLit(litRef.current);
      }
    }

    claim.eligible = mayReveal && total > 0;
    const inReach =
      claim.eligible &&
      distSq <= (nearRef.current ? PAINTING_UNLOAD_RADIUS_SQ : PAINTING_LOAD_RADIUS_SQ);

    if (!inReach || !revealGrants.has(room.id)) {
      nearRef.current = false;
      claim.holds = false;
      pendingRooms.delete(room.id);
      if (countRef.current > 0) {
        countRef.current = Math.max(0, countRef.current - STAND_INS_PER_FRAME);
        setCount(countRef.current);
      }
      return;
    }
    if (!nearRef.current) {
      nearRef.current = true;
      claim.holds = true;
      // A room granted again while it was still giving its paintings up
      // keeps its order: the ones left are the first of it.
      if (countRef.current === 0) {
        orderRef.current = [...room.placements].sort(
          (a, b) => placementDistSq(a, x, y, z) - placementDistSq(b, x, y, z),
        );
      }
    }

    if (countRef.current >= total) {
      pendingRooms.delete(room.id);
      return;
    }
    // Queue up behind any room closer to the player that still has
    // paintings to mount.
    pendingRooms.set(room.id, distSq);
    if (!isNearestPending(pendingRooms, room.id, distSq)) return;
    countRef.current = Math.min(total, countRef.current + PAINTINGS_PER_FRAME);
    setCount(countRef.current);
  });

  const revealed = new Set(count >= total ? orderRef.current : orderRef.current.slice(0, count));
  // A work revealed ahead of the light ramp mounts whole, light and all.
  const mounted =
    lit >= total ? room.placements : room.placements.filter((p, i) => i < lit || revealed.has(p));
  return { mounted, revealed };
}

/** Per-painting `onSettled` callbacks that keep their identity across
 *  renders. `Painting` is memoised, and the reveal ramp above re-renders
 *  this component on every frame it runs — a fresh
 *  `(status) => onPaintingSettled(key, status)` arrow per painting per
 *  render would defeat the memo for exactly the room where it matters
 *  most (only the entry room passes `onPaintingSettled` at all; every
 *  other room passes undefined, which is already stable). The handler
 *  reads the latest callback through a ref, so the cached arrows never
 *  go stale. Bounded by the number of paintings the room can reveal. */
function usePaintingSettledHandlers(
  onPaintingSettled: ((key: string, status: "loaded" | "failed") => void) | undefined,
): (key: string) => ((status: "loaded" | "failed") => void) | undefined {
  const latest = useRef(onPaintingSettled);
  useEffect(() => {
    latest.current = onPaintingSettled;
  }, [onPaintingSettled]);
  const cache = useRef(new Map<string, (status: "loaded" | "failed") => void>());

  return useCallback(
    (key: string) => {
      if (!onPaintingSettled) return undefined;
      let handler = cache.current.get(key);
      if (!handler) {
        handler = (status) => latest.current?.(key, status);
        cache.current.set(key, handler);
      }
      return handler;
    },
    [onPaintingSettled],
  );
}

function placementDistSq(p: Placement, x: number, y: number, z: number): number {
  const dx = p.position[0] - x;
  const dy = p.position[1] - y;
  const dz = p.position[2] - z;
  return dx * dx + dy * dy + dz * dz;
}

/** PlaneGeometry whose UV attribute is rescaled so 1 unit of UV maps
 *  to 1 metre of world. Combined with `texture.repeat = (1, 1)` and
 *  RepeatWrapping on the bound texture, this gives consistent 1 m²
 *  tile density on a floor of any size — a 22 m room shows ~22 tiles
 *  across instead of one stretched smear.
 *
 *  Memoised on (width, depth): rooms re-rendering with the same
 *  dimensions reuse the same buffer geometry. The companion useEffect
 *  disposes the GPU buffer when the geometry is replaced (deps change)
 *  or the room unmounts — without it, every floor swap leaks a fresh
 *  PlaneGeometry per room into VRAM. */
function useWorldUVPlane(
  width: number,
  depth: number,
  originX: number,
  originZ: number,
): THREE.PlaneGeometry {
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(width, depth);
    const uv = g.attributes.uv;
    if (uv) {
      for (let i = 0; i < uv.count; i++) {
        // The plane is rotated -π/2 around X by the caller so it lies
        // on the world XZ plane: local +X → world +X (so U just adds
        // originX), but local +Y → world -Z, so V has to be inverted
        // (1 - getY) before adding originZ — without that, two
        // neighbouring floors at the same world_z would see V values
        // that differ by depth and the texture would discontinue at
        // their shared edge.
        uv.setXY(i, uv.getX(i) * width + originX, (1 - uv.getY(i)) * depth + originZ);
      }
      uv.needsUpdate = true;
    }
    return g;
  }, [width, depth, originX, originZ]);
  useEffect(() => () => geom.dispose(), [geom]);
  return geom;
}

/** Rewrite a geometry's UV attribute so each vertex samples the floor
 *  texture at its WORLD (x, z) position. Combined with `texture.repeat
 *  = (1, 1)` and RepeatWrapping, this gives consistent 1 m² tile
 *  density and — more importantly — keeps the tile pattern continuous
 *  across geometry boundaries (room ↔ hallway ↔ stairwell), so seams
 *  don't show underfoot when the player crosses room edges.
 *
 *  Pass the world-space center the mesh will be positioned at; the
 *  function adds it to each local-space vertex position to derive the
 *  vertex's eventual world XZ.
 *
 *  Used by `StairwellFloor` whose ShapeGeometry / ExtrudeGeometry
 *  default UVs are the local shape XY (offset from world by an
 *  arbitrary amount per stairwell), which doesn't match the world-
 *  origin convention `useWorldUVPlane` uses for plain rooms. */
function applyWorldXZ_UV(geom: THREE.BufferGeometry, cxWorld: number, czWorld: number): void {
  const pos = geom.attributes.position;
  const uv = geom.attributes.uv;
  if (!pos || !uv) return;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, pos.getX(i) + cxWorld, pos.getZ(i) + czWorld);
  }
  uv.needsUpdate = true;
}

/** Floor slab for a stairwell room with a circular hole around the
 *  spiral well. Built once via ShapeGeometry — the hole hugs the
 *  spiral's outer radius (plus a tiny margin) so the descending
 *  flights below stay visible from this floor without the rectangular
 *  hole / spiral edge intersection artefacts the old four-slab
 *  approach produced. */
function StairwellFloor({
  cxWorld,
  czWorld,
  width,
  depth,
  floorY,
  floorMat,
  hole: opening,
}: {
  cxWorld: number;
  czWorld: number;
  width: number;
  depth: number;
  floorY: number;
  floorMat: THREE.MeshStandardMaterial;
  /** The spiral's round well, a grand stair's opening, or no hole. */
  hole: WorldOpening | "spiral" | null;
}) {
  const { topGeom, slabGeom } = useMemo(() => {
    // An opening of rectangles may reach the hall's walls (a sheer
    // wall), and a hole that touches a shape's edge does not
    // triangulate. So the floor is built from the rectangles round the
    // opening instead: one box each, their inner faces never seen.
    if (opening && opening !== "spiral" && opening.kind === "rects") {
      const cells = rectsAround(opening.rects, cxWorld, czWorld, width, depth);
      const tops = cells.map((c) => {
        const g = new THREE.PlaneGeometry(c.xMax - c.xMin, c.zMax - c.zMin);
        g.rotateX(-Math.PI / 2);
        g.translate((c.xMin + c.xMax) / 2, 0, (c.zMin + c.zMax) / 2);
        return g;
      });
      const slabs = cells.map((c) => {
        const g = new THREE.BoxGeometry(c.xMax - c.xMin, FLOOR_THICKNESS, c.zMax - c.zMin);
        g.translate((c.xMin + c.xMax) / 2, -FLOOR_THICKNESS / 2, (c.zMin + c.zMax) / 2);
        return g;
      });
      const top = mergeGeometries(tops, false);
      const slab = mergeGeometries(slabs, false);
      for (const g of [...tops, ...slabs]) g.dispose();
      applyWorldXZ_UV(top, cxWorld, czWorld);
      applyWorldXZ_UV(slab, cxWorld, czWorld);
      return { topGeom: top, slabGeom: slab };
    }
    const shape = new THREE.Shape();
    const halfW = width / 2;
    const halfD = depth / 2;
    shape.moveTo(-halfW, -halfD);
    shape.lineTo(halfW, -halfD);
    shape.lineTo(halfW, halfD);
    shape.lineTo(-halfW, halfD);
    shape.closePath();
    if (opening === "spiral") {
      const hole = new THREE.Path();
      hole.absarc(0, 0, SPIRAL_FLOOR_CUTOUT_RADIUS, 0, Math.PI * 2, false);
      shape.holes.push(hole);
    } else if (opening) {
      shape.holes.push(openingHole(opening, cxWorld, czWorld, -1));
    }
    const top = new THREE.ShapeGeometry(shape, 32);
    // Shape lives on XY plane; rotate it down onto XZ so it lies flat.
    top.rotateX(-Math.PI / 2);
    // Slab body: same shape extruded by FLOOR_THICKNESS so the
    // underside and the cylindrical inner wall of the cutout (a real
    // ring of stone visible from below) both render. Local Y after
    // rotateX(-π/2) ends up in [0, FLOOR_THICKNESS]; offset it to
    // [-FLOOR_THICKNESS, 0] so the mesh's local origin matches the
    // top plane and we can position both at the same Y.
    const slab = new THREE.ExtrudeGeometry(shape, {
      depth: FLOOR_THICKNESS,
      bevelEnabled: false,
      curveSegments: 32,
    });
    slab.rotateX(-Math.PI / 2);
    slab.translate(0, -FLOOR_THICKNESS, 0);
    // Rewrite UVs so the texture pattern is keyed off WORLD (x, z)
    // instead of the geometry's local XY bounds. Without this, the
    // stairwell floor samples the texture from its own local origin
    // while the adjacent hallway / room floors sample from world
    // origin (see `useWorldUVPlane`), so the tile pattern jumps at
    // the shared edge — the seam is visible underfoot whenever you
    // walk from a hallway into the stairwell.
    //
    // The mesh is later positioned at (cxWorld, floorY, czWorld), so
    // a vertex at local (lx, _, lz) renders at world (cxWorld + lx,
    // _, czWorld + lz). Set UV = (world.x, world.z) directly.
    applyWorldXZ_UV(top, cxWorld, czWorld);
    applyWorldXZ_UV(slab, cxWorld, czWorld);
    return { topGeom: top, slabGeom: slab };
  }, [width, depth, opening, cxWorld, czWorld]);
  // Free GPU buffers when the stairwell unmounts or its dimensions
  // change. R3F only auto-disposes geometries it created from JSX
  // intrinsics; these were allocated by us, so we own teardown.
  useEffect(
    () => () => {
      topGeom.dispose();
      slabGeom.dispose();
    },
    [topGeom, slabGeom],
  );
  return (
    <>
      <mesh geometry={topGeom} position={[cxWorld, floorY - 0.005, czWorld]} receiveShadow>
        <primitive object={floorMat} attach="material" />
      </mesh>
      {/* Slab body — extruded floor underneath the walking surface,
          with the cutout punched through. Visible from below (open
          well) and provides the cylindrical inner wall of the hole. */}
      <mesh geometry={slabGeom} position={[cxWorld, floorY - 0.006, czWorld]}>
        <primitive object={floorMat} attach="material" />
      </mesh>
    </>
  );
}
