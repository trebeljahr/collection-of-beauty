"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { ERAS } from "@/lib/gallery-eras";
import type { RoomLayout } from "@/lib/gallery-layout/types";
import {
  CELL_SIZE,
  DOOR_HEIGHT,
  FLOOR_THICKNESS,
  INTER_FLOOR_HEIGHT,
  ROOM_HEIGHT,
  SPIRAL_FLOOR_CUTOUT_RADIUS,
} from "@/lib/gallery-layout/world-coords";
import { LampFixture } from "./lamp-fixture";
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
   *  Gallery3D only passes it for the entry room so the start
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
  // Walls span floor-to-next-slab so the building has no visible gap
  // above the interior ceiling when seen from across the open well;
  // the ceiling plane at ROOM_HEIGHT covers the plenum from inside.
  const wallMidY = floorY + INTER_FLOOR_HEIGHT / 2;

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
          height={INTER_FLOOR_HEIGHT}
          material={mats.wall}
          doors={nDoors}
        />
      )}
      {!room.suppressWalls?.south && (
        <WallWithDoors
          position={[cxWorld, wallMidY, zMax]}
          rotation={[0, Math.PI, 0]}
          width={width}
          height={INTER_FLOOR_HEIGHT}
          material={mats.wall}
          doors={sDoors}
        />
      )}
      {!room.suppressWalls?.west && (
        <WallWithDoors
          position={[xMin, wallMidY, czWorld]}
          rotation={[0, Math.PI / 2, 0]}
          width={depth}
          height={INTER_FLOOR_HEIGHT}
          material={mats.wall}
          doors={wDoors}
        />
      )}
      {!room.suppressWalls?.east && (
        <WallWithDoors
          position={[xMax, wallMidY, czWorld]}
          rotation={[0, -Math.PI / 2, 0]}
          width={depth}
          height={INTER_FLOOR_HEIGHT}
          material={mats.wall}
          doors={eDoors}
        />
      )}

      {/* Paintings */}
      {room.placements.map((p, i) => (
        <Painting key={`${room.id}-p${i}`} placement={p} onLoaded={onPaintingLoaded} />
      ))}

      {/* Four pendant lamps at the centres of the room's quadrants
          instead of one in the middle. With one lamp per quadrant each
          painting is at most ~half a quadrant's diagonal from a light,
          so wall coverage is much more even than the old single centre
          lamp left it. The fixture geometry is rendered for every room,
          regardless of whether the player is inside — only the point
          light is gated on `isActive`, so adjacent rooms visible
          through doorways still show their lamps (with the bulbs
          glowing via the basic-material colour) and the lights
          "switch on" only as the player walks in.
          Stairwell rooms have no rendered ceiling at ROOM_HEIGHT — the
          well is open all the way up, so the visible "ceiling" from
          inside one is the underside of the next floor's slab at
          INTER_FLOOR_HEIGHT. Mounting the rosette there keeps the cap
          flush with that surface; otherwise it would dangle 1.7 m
          below it in mid-air. Same bulbDrop as regular rooms so it
          reads as the *same* fixture, just hung from a higher ceiling. */}
      {(
        [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const
      ).map(([sx, sz]) => (
        <LampFixture
          key={`lamp-${sx}-${sz}`}
          position={[
            cxWorld + sx * (width / 4),
            floorY + (room.isStairwell ? INTER_FLOOR_HEIGHT : ROOM_HEIGHT),
            czWorld + sz * (depth / 4),
          ]}
          era={era}
          lit={isActive}
          bulbDrop={0.65}
          intensity={11}
          distance={Math.max(width, depth) * 1.2}
        />
      ))}
    </group>
  );
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
  const { topGeom, slabGeom } = useMemo(() => {
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
  }, [width, depth, cutHole, cxWorld, czWorld]);
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
