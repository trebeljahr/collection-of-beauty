"use client";

import { ERAS } from "@/lib/gallery-eras";
import type { RoomLayout } from "@/lib/gallery-layout/types";
import type * as THREE from "three";
import {
  CELL_SIZE,
  DOOR_HEIGHT,
  ROOM_HEIGHT,
  STAIR_DEPTH,
  STAIR_WIDTH,
} from "@/lib/gallery-layout/world-coords";
import { Painting } from "./painting";
import { getPaletteMaterials, getRoomFloorMaterial } from "./palette-materials";
import { WallWithDoors } from "./wall";

/**
 * Render a single room: floor, ceiling, 4 walls with the room's door
 * openings cut out, plus simple lighting. Uses shared per-palette
 * materials so every room of the same era reuses the same 4 materials
 * instead of allocating fresh ones.
 */
export function RoomGeometry({
  room,
  isActive,
}: {
  room: RoomLayout;
  isActive: boolean;
}) {
  const era = ERAS[room.floorIndex];
  const mats = getPaletteMaterials(era.palette);
  const floorMat = getRoomFloorMaterial(room.floorColor);
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
  const wallMidY = floorY + ROOM_HEIGHT / 2;

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
    height: DOOR_HEIGHT,
  }));
  const sDoors = doorsBySide.south.map((d) => ({
    centerLocalX: -(d.worldX - cxWorld),
    width: d.width,
    height: DOOR_HEIGHT,
  }));
  const eDoors = doorsBySide.east.map((d) => ({
    centerLocalX: d.worldZ - czWorld,
    width: d.width,
    height: DOOR_HEIGHT,
  }));
  const wDoors = doorsBySide.west.map((d) => ({
    centerLocalX: -(d.worldZ - czWorld),
    width: d.width,
    height: DOOR_HEIGHT,
  }));

  const hasFloor = !room.isStairwell;
  const hasCeiling = !room.isStairwell;

  return (
    <group>
      {hasFloor && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cxWorld, floorY, czWorld]}>
          <planeGeometry args={[width, depth]} />
          <primitive object={floorMat} attach="material" />
        </mesh>
      )}
      {hasCeiling && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[cxWorld, floorY + ROOM_HEIGHT, czWorld]}>
          <planeGeometry args={[width, depth]} />
          <primitive object={mats.ceiling} attach="material" />
        </mesh>
      )}

      {/* Stairwell main floor — four slabs around the stair footprint
          so the descending flights below remain visible from above
          (without the cutout, the floor at this floor's Y would hide
          the lower flight running down to the floor below). The stair
          sits at the centre, STAIR_WIDTH × STAIR_DEPTH metres. */}
      {room.isStairwell && (
        <StairwellFloor
          cxWorld={cxWorld}
          czWorld={czWorld}
          width={width}
          depth={depth}
          floorY={floorY}
          floorMat={floorMat}
        />
      )}

      {/* Four walls — each may be suppressed when a neighbouring room
          owns the shared wall (and draws it with a door cut). */}
      {!room.suppressWalls?.north && (
        <WallWithDoors
          position={[cxWorld, wallMidY, zMin]}
          rotation={[0, 0, 0]}
          width={width}
          height={ROOM_HEIGHT}
          material={mats.wall}
          doors={nDoors}
        />
      )}
      {!room.suppressWalls?.south && (
        <WallWithDoors
          position={[cxWorld, wallMidY, zMax]}
          rotation={[0, Math.PI, 0]}
          width={width}
          height={ROOM_HEIGHT}
          material={mats.wall}
          doors={sDoors}
        />
      )}
      {!room.suppressWalls?.west && (
        <WallWithDoors
          position={[xMin, wallMidY, czWorld]}
          rotation={[0, Math.PI / 2, 0]}
          width={depth}
          height={ROOM_HEIGHT}
          material={mats.wall}
          doors={wDoors}
        />
      )}
      {!room.suppressWalls?.east && (
        <WallWithDoors
          position={[xMax, wallMidY, czWorld]}
          rotation={[0, -Math.PI / 2, 0]}
          width={depth}
          height={ROOM_HEIGHT}
          material={mats.wall}
          doors={eDoors}
        />
      )}

      {/* Paintings */}
      {room.placements.map((p, i) => (
        <Painting key={`${room.id}-p${i}`} placement={p} />
      ))}

      {isActive && (
        <pointLight
          position={[cxWorld, floorY + ROOM_HEIGHT - 0.2, czWorld]}
          intensity={26}
          distance={Math.max(width, depth) * 1.6}
          decay={2}
          color={era.palette.lampTint}
        />
      )}
    </group>
  );
}

/** Four floor slabs around the central U-stair footprint. Skips the
 *  centre rectangle so the descending flights from the floor above (or
 *  the rising flights to the floor below) remain visible from this
 *  floor's vantage. */
function StairwellFloor({
  cxWorld,
  czWorld,
  width,
  depth,
  floorY,
  floorMat,
}: {
  cxWorld: number;
  czWorld: number;
  width: number;
  depth: number;
  floorY: number;
  floorMat: THREE.MeshStandardMaterial;
}) {
  const halfW = width / 2;
  const halfD = depth / 2;
  const stairHalfW = STAIR_WIDTH / 2;
  const stairHalfD = STAIR_DEPTH / 2;
  const y = floorY - 0.005;
  // North slab (low z): from room's north wall to the stair's north face.
  const northDepth = halfD - stairHalfD;
  const northZ = czWorld - halfD + northDepth / 2;
  // South slab (high z): from the stair's south face to the room's south wall.
  const southDepth = halfD - stairHalfD;
  const southZ = czWorld + halfD - southDepth / 2;
  // West / east slabs span only the stair's depth band.
  const sideDepth = STAIR_DEPTH;
  const sideWidth = halfW - stairHalfW;
  const westX = cxWorld - halfW + sideWidth / 2;
  const eastX = cxWorld + halfW - sideWidth / 2;
  return (
    <>
      {northDepth > 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cxWorld, y, northZ]}>
          <planeGeometry args={[width, northDepth]} />
          <primitive object={floorMat} attach="material" />
        </mesh>
      )}
      {southDepth > 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cxWorld, y, southZ]}>
          <planeGeometry args={[width, southDepth]} />
          <primitive object={floorMat} attach="material" />
        </mesh>
      )}
      {sideWidth > 0 && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[westX, y, czWorld]}>
            <planeGeometry args={[sideWidth, sideDepth]} />
            <primitive object={floorMat} attach="material" />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[eastX, y, czWorld]}>
            <planeGeometry args={[sideWidth, sideDepth]} />
            <primitive object={floorMat} attach="material" />
          </mesh>
        </>
      )}
    </>
  );
}
