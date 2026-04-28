"use client";

import { ERAS } from "@/lib/gallery-eras";
import type { RoomLayout } from "@/lib/gallery-layout/types";
import {
  CELL_SIZE,
  DOOR_HEIGHT,
  ROOM_HEIGHT,
  SPIRAL_FLOOR_CUTOUT_RADIUS,
} from "@/lib/gallery-layout/world-coords";
import { useMemo } from "react";
import * as THREE from "three";
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
  onPaintingLoaded,
}: {
  room: RoomLayout;
  isActive: boolean;
  /** Fires once per painting after its 960 px texture loads. Optional —
   *  GalleryDungeon only passes it for the entry room so the start
   *  overlay can show first-room load progress. */
  onPaintingLoaded?: () => void;
}) {
  const era = ERAS[room.floorIndex];
  const mats = getPaletteMaterials(era.palette);
  const floorMat = getRoomFloorMaterial(room.floorColor, era.palette.floorTexture);
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
          cutHole={room.floorIndex > 0}
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
        <Painting key={`${room.id}-p${i}`} placement={p} onLoaded={onPaintingLoaded} />
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
  cutHole,
}: {
  cxWorld: number;
  czWorld: number;
  width: number;
  depth: number;
  floorY: number;
  floorMat: THREE.MeshStandardMaterial;
  cutHole: boolean;
}) {
  const geom = useMemo(() => {
    const shape = new THREE.Shape();
    const halfW = width / 2;
    const halfD = depth / 2;
    shape.moveTo(-halfW, -halfD);
    shape.lineTo(halfW, -halfD);
    shape.lineTo(halfW, halfD);
    shape.lineTo(-halfW, halfD);
    shape.closePath();
    if (cutHole) {
      const hole = new THREE.Path();
      hole.absarc(0, 0, SPIRAL_FLOOR_CUTOUT_RADIUS, 0, Math.PI * 2, false);
      shape.holes.push(hole);
    }
    const g = new THREE.ShapeGeometry(shape, 32);
    // Shape lives on XY plane; rotate it down onto XZ so it lies flat.
    g.rotateX(-Math.PI / 2);
    return g;
  }, [width, depth, cutHole]);
  return (
    <mesh geometry={geom} position={[cxWorld, floorY - 0.005, czWorld]} receiveShadow>
      <primitive object={floorMat} attach="material" />
    </mesh>
  );
}
