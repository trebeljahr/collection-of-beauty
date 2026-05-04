"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { FloorLayout, HallwayLayout } from "@/lib/gallery-layout/types";
import {
  CELL_SIZE,
  CORRIDOR_HEIGHT,
  FLOOR_THICKNESS,
  INTER_FLOOR_HEIGHT,
} from "@/lib/gallery-layout/world-coords";
import { LampFixture } from "./lamp-fixture";
import { Painting } from "./painting";
import { getPaletteMaterials } from "./palette-materials";
import { SolidWall } from "./wall";

/** Build a CELL_SIZE × CELL_SIZE plane with UVs in WORLD units, anchored
 *  to the cell's grid position. World-anchored UVs are essential here:
 *  the floor texture uses RepeatWrapping with `repeat=1`, so it tiles
 *  every 1 m of UV-space. If every cell started its UVs at 0,0, the
 *  tile pattern would restart at every cell boundary — visible as a
 *  seam down the planks where two cells meet. Anchoring the UVs to the
 *  cell's world origin gives every cell a unique UV range that joins
 *  cleanly to its neighbours.
 *
 *  The Y inversion (1 - getY) is because the plane is rotated by
 *  -π/2 around X so it lies on the world XZ plane: local +Y then
 *  maps to world -Z, so without the flip the V axis would run
 *  opposite to world_z and two adjacent cells would see the V at the
 *  shared edge differ by depth, not 0. */
function buildCellFloorGeom(cellX: number, cellZ: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
  const uv = g.attributes.uv;
  if (uv) {
    const x0 = cellX * CELL_SIZE;
    const z0 = cellZ * CELL_SIZE;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * CELL_SIZE + x0, (1 - uv.getY(i)) * CELL_SIZE + z0);
    }
    uv.needsUpdate = true;
  }
  return g;
}

/** Slab body for a hallway cell — gives the corridor visible thickness
 *  when seen from the open well or any opening in the floor below. The
 *  walking surface above is the textured plane; this box just renders
 *  the underside + cross-section edges. */
const HALLWAY_CELL_SLAB_GEOM = new THREE.BoxGeometry(CELL_SIZE, FLOOR_THICKNESS, CELL_SIZE);

/** Stride between overhead lamps in the corridor — one lamp every N
 *  cells. Too dense and the cost to the renderer climbs; too sparse
 *  and paintings on the walls are invisible. 3 cells ≈ 7.5 m and
 *  reads as "a lamp halfway between every bay of paintings". */
const CORRIDOR_LAMP_STRIDE = 3;

/**
 * Render a hallway as a run of cells: floor + ceiling per cell, and a
 * wall segment on each side where the adjacent cell is non-walkable.
 * Walls/floors/ceilings use shared per-palette materials so the dozens
 * of cells on a big floor don't allocate dozens of materials.
 */
export function HallwayRenderer({
  hallway,
  floor,
}: {
  hallway: HallwayLayout;
  floor: FloorLayout;
}) {
  const floorY = floor.y;
  const mats = getPaletteMaterials(floor.era.palette);

  const lampCells = hallway.cells.filter((_, i) => i % CORRIDOR_LAMP_STRIDE === 0);

  // Per-cell floor geometries with world-anchored UVs. Allocating one
  // PlaneGeometry per cell sounds wasteful, but each is just 4 verts +
  // 6 indices (~few hundred bytes), and three batches them under the
  // shared material so draw-call count stays bounded by material, not
  // cell count. Disposed when the hallway unmounts so floor swaps
  // don't leak the old set into VRAM.
  const cellFloorGeoms = useMemo(
    () => hallway.cells.map((c) => buildCellFloorGeom(c.x, c.z)),
    [hallway.cells],
  );
  useEffect(
    () => () => {
      for (const g of cellFloorGeoms) g.dispose();
    },
    [cellFloorGeoms],
  );

  return (
    <group>
      {hallway.placements.map((p, i) => (
        <Painting key={`${hallway.id}-p${i}`} placement={p} />
      ))}

      {/* Corridor lamps — same fixture as room pendants, but with a
          much shorter drop so the bulb sits close to the lower
          corridor ceiling (3.12 m vs 4.2 m in rooms) and the player
          isn't ducking under stems. Hallways stay lit at all times,
          so `lit` is unconditionally true here. */}
      {lampCells.map((c) => {
        const cx = c.x * CELL_SIZE + CELL_SIZE / 2;
        const cz = c.z * CELL_SIZE + CELL_SIZE / 2;
        return (
          <LampFixture
            key={`${hallway.id}-lamp-${c.x}-${c.z}`}
            position={[cx, floorY + CORRIDOR_HEIGHT, cz]}
            era={floor.era}
            lit={true}
            bulbDrop={0.3}
            intensity={4}
            distance={9}
          />
        );
      })}

      {hallway.cells.map((c, idx) => {
        const x0 = c.x * CELL_SIZE;
        const z0 = c.z * CELL_SIZE;
        const cx = x0 + CELL_SIZE / 2;
        const cz = z0 + CELL_SIZE / 2;
        const cellFloorGeom = cellFloorGeoms[idx];
        // Hallway walls reach the next slab too — the interior
        // CORRIDOR_HEIGHT ceiling plane keeps the corridor reading as
        // low and tunnel-like, while the structural wall above it
        // closes the gap between floors when viewed from the well.
        const wallMidY = floorY + INTER_FLOOR_HEIGHT / 2;

        const needsWall = (nx: number, nz: number): boolean => {
          if (nx < 0 || nx >= floor.gridSize.x || nz < 0 || nz >= floor.gridSize.z) {
            return true;
          }
          const idx = nz * floor.gridSize.x + nx;
          return floor.walkable[idx] !== 1;
        };

        const key = `${c.x}-${c.z}`;
        return (
          <group key={key}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[cx, floorY, cz]}
              geometry={cellFloorGeom}
            >
              <primitive object={mats.floor} attach="material" />
            </mesh>
            {/* Slab body — 1 mm below the walking plane, so the
                visible top is the UV-scaled plane and this just adds
                the thickness underneath. */}
            <mesh
              position={[cx, floorY - FLOOR_THICKNESS / 2 - 0.001, cz]}
              geometry={HALLWAY_CELL_SLAB_GEOM}
            >
              <primitive object={mats.floor} attach="material" />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, floorY + CORRIDOR_HEIGHT, cz]}>
              <planeGeometry args={[CELL_SIZE, CELL_SIZE]} />
              <primitive object={mats.ceiling} attach="material" />
            </mesh>

            {needsWall(c.x, c.z - 1) && (
              <SolidWall
                position={[cx, wallMidY, z0]}
                rotation={[0, 0, 0]}
                width={CELL_SIZE}
                height={INTER_FLOOR_HEIGHT}
                material={mats.wall}
              />
            )}
            {needsWall(c.x, c.z + 1) && (
              <SolidWall
                position={[cx, wallMidY, z0 + CELL_SIZE]}
                rotation={[0, Math.PI, 0]}
                width={CELL_SIZE}
                height={INTER_FLOOR_HEIGHT}
                material={mats.wall}
              />
            )}
            {needsWall(c.x - 1, c.z) && (
              <SolidWall
                position={[x0, wallMidY, cz]}
                rotation={[0, Math.PI / 2, 0]}
                width={CELL_SIZE}
                height={INTER_FLOOR_HEIGHT}
                material={mats.wall}
              />
            )}
            {needsWall(c.x + 1, c.z) && (
              <SolidWall
                position={[x0 + CELL_SIZE, wallMidY, cz]}
                rotation={[0, -Math.PI / 2, 0]}
                width={CELL_SIZE}
                height={INTER_FLOOR_HEIGHT}
                material={mats.wall}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
