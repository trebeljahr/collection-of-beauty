"use client";

import type { RoomLayout } from "@/lib/gallery-layout/types";
import {
  CELL_SIZE,
  DOOR_HEIGHT,
  ROOM_HEIGHT,
} from "@/lib/gallery-layout/world-coords";
import { SolidWall, WallWithDoors } from "./wall";
import { Painting } from "./painting";

/**
 * Render a single room: floor, ceiling, 4 walls with the room's door
 * openings cut out, plus simple lighting.
 *
 * World coordinates (layout → render):
 *  - worldRect defines the interior floor rectangle (walls sit on its
 *    outer edge).
 *  - Walls are placed at the cellBounds edge expressed in metres so
 *    that the hallway cell on the other side is flush with the opening.
 */
export function RoomGeometry({
  room,
  isActive,
}: {
  room: RoomLayout;
  isActive: boolean;
}) {
  const { cellBounds } = room;
  const { palette } = room.movement ? getPalette(room) : getPalette(room);

  // Wall planes live on the cellBounds edge, not on worldRect (which is
  // inset by WALL_THICKNESS). This way door openings line up with the
  // hallway cell just outside.
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

  // Group doors per side so we can pass them into WallWithDoors.
  const doorsBySide = {
    north: room.doors.filter((d) => d.side === "north"),
    south: room.doors.filter((d) => d.side === "south"),
    east: room.doors.filter((d) => d.side === "east"),
    west: room.doors.filter((d) => d.side === "west"),
  };

  // Convert world-space door centres to wall-local X (metres from the
  // wall's midpoint).
  // - North/south walls run along the X axis: local X = worldX - cx.
  // - East/west walls run along the Z axis: local X = worldZ - cz.
  //   But the wall faces in ±X, so rotation flips direction; we keep
  //   it simple and mirror the sign for one of the side walls.
  const nsDoors = (side: "north" | "south") =>
    doorsBySide[side].map((d) => ({
      centerLocalX: d.worldX - cxWorld,
      width: d.width,
      height: DOOR_HEIGHT,
    }));
  const wDoors = doorsBySide.west.map((d) => ({
    centerLocalX: d.worldZ - czWorld,
    width: d.width,
    height: DOOR_HEIGHT,
  }));
  const eDoors = doorsBySide.east.map((d) => ({
    // East wall normal is +X, same rotation sign as west but mirrored;
    // use negative to keep centerLocalX consistent with the wall's
    // rotated local frame.
    centerLocalX: -(d.worldZ - czWorld),
    width: d.width,
    height: DOOR_HEIGHT,
  }));

  const hasFloor = !room.isStairwell;
  const hasCeiling = !room.isStairwell;

  return (
    <group>
      {/* Floor — stairwells skip this; their walkable surface is the
          stair flight itself, plus the two landing tiles below. */}
      {hasFloor && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[cxWorld, floorY, czWorld]}
        >
          <planeGeometry args={[width, depth]} />
          <meshStandardMaterial
            color={palette.floorColor}
            roughness={0.88}
            metalness={0.05}
          />
        </mesh>
      )}
      {/* Ceiling — stairwells have no ceiling so the stair rising up
          through this floor to the next is visible overhead. */}
      {hasCeiling && (
        <mesh
          rotation={[Math.PI / 2, 0, 0]}
          position={[cxWorld, floorY + ROOM_HEIGHT, czWorld]}
        >
          <planeGeometry args={[width, depth]} />
          <meshStandardMaterial color={palette.ceilingColor} roughness={0.96} />
        </mesh>
      )}
      {/* Stairwell landing tiles — one at the low-Z end (entry) and
          one at the high-Z end (exit from the stair below). Each covers
          the full 2-cell X width and one cell of Z depth. */}
      {room.isStairwell && (
        <>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[
              cxWorld,
              floorY,
              cellBounds.zMin * CELL_SIZE + CELL_SIZE / 2,
            ]}
          >
            <planeGeometry args={[width, CELL_SIZE]} />
            <meshStandardMaterial
              color={palette.floorColor}
              roughness={0.88}
              metalness={0.05}
            />
          </mesh>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[
              cxWorld,
              floorY,
              (cellBounds.zMax + 0.5) * CELL_SIZE,
            ]}
          >
            <planeGeometry args={[width, CELL_SIZE]} />
            <meshStandardMaterial
              color={palette.floorColor}
              roughness={0.88}
              metalness={0.05}
            />
          </mesh>
        </>
      )}

      {/* North wall — z = zMin, facing +Z */}
      <WallWithDoors
        position={[cxWorld, wallMidY, zMin]}
        rotation={[0, 0, 0]}
        width={width}
        height={ROOM_HEIGHT}
        color={palette.wallColor}
        doors={nsDoors("north")}
      />
      {/* South wall — z = zMax, facing -Z */}
      <WallWithDoors
        position={[cxWorld, wallMidY, zMax]}
        rotation={[0, Math.PI, 0]}
        width={width}
        height={ROOM_HEIGHT}
        color={palette.wallColor}
        doors={nsDoors("south")}
      />
      {/* West wall — x = xMin, facing +X */}
      <WallWithDoors
        position={[xMin, wallMidY, czWorld]}
        rotation={[0, Math.PI / 2, 0]}
        width={depth}
        height={ROOM_HEIGHT}
        color={palette.wallColor}
        doors={wDoors}
      />
      {/* East wall — x = xMax, facing -X */}
      <WallWithDoors
        position={[xMax, wallMidY, czWorld]}
        rotation={[0, -Math.PI / 2, 0]}
        width={depth}
        height={ROOM_HEIGHT}
        color={palette.wallColor}
        doors={eDoors}
      />

      {/* Paintings */}
      {room.placements.map((p, i) => (
        <Painting key={`${room.id}-p${i}`} placement={p} />
      ))}

      {/* A single overhead point light per room; only in the active room
          so the total light count stays bounded no matter how many rooms
          we mount. */}
      {isActive && (
        <pointLight
          position={[cxWorld, floorY + ROOM_HEIGHT - 0.2, czWorld]}
          intensity={26}
          distance={Math.max(width, depth) * 1.6}
          decay={2}
          color={palette.lampTint}
        />
      )}
    </group>
  );
}

// Re-export a palette lookup that consumes the era on the room's
// floorIndex at runtime. Keeping the palette attached to the era
// (not the room) avoids duplicating it in every RoomLayout.
import { ERAS } from "@/lib/gallery-eras";
function getPalette(room: RoomLayout) {
  const era = ERAS[room.floorIndex];
  return { palette: era.palette };
}

// Silence a stray "unused export" lint for SolidWall (it may be useful
// in future, plus keeps the import graph stable while we iterate).
export const _SolidWall = SolidWall;
