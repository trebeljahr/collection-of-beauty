"use client";

import type { FloorLayout, HallwayLayout } from "@/lib/gallery-layout/types";
import {
  CELL_SIZE,
  CORRIDOR_HEIGHT,
} from "@/lib/gallery-layout/world-coords";
import { SolidWall } from "./wall";
import { Painting } from "./painting";
import { getPaletteMaterials } from "./palette-materials";

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

  const lampCells = hallway.cells.filter(
    (_, i) => i % CORRIDOR_LAMP_STRIDE === 0,
  );

  return (
    <group>
      {hallway.placements.map((p, i) => (
        <Painting key={`${hallway.id}-p${i}`} placement={p} />
      ))}

      {lampCells.map((c) => {
        const cx = c.x * CELL_SIZE + CELL_SIZE / 2;
        const cz = c.z * CELL_SIZE + CELL_SIZE / 2;
        return (
          <pointLight
            key={`${hallway.id}-lamp-${c.x}-${c.z}`}
            position={[cx, floorY + CORRIDOR_HEIGHT - 0.25, cz]}
            intensity={6}
            distance={9}
            decay={2}
            color={floor.era.palette.lampTint}
          />
        );
      })}

      {hallway.cells.map((c) => {
        const x0 = c.x * CELL_SIZE;
        const z0 = c.z * CELL_SIZE;
        const cx = x0 + CELL_SIZE / 2;
        const cz = z0 + CELL_SIZE / 2;
        const wallMidY = floorY + CORRIDOR_HEIGHT / 2;

        const needsWall = (nx: number, nz: number): boolean => {
          if (
            nx < 0 ||
            nx >= floor.gridSize.x ||
            nz < 0 ||
            nz >= floor.gridSize.z
          ) {
            return true;
          }
          const idx = nz * floor.gridSize.x + nx;
          return floor.walkable[idx] !== 1;
        };

        const key = `${c.x}-${c.z}`;
        return (
          <group key={key}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, floorY, cz]}>
              <planeGeometry args={[CELL_SIZE, CELL_SIZE]} />
              <primitive object={mats.floor} attach="material" />
            </mesh>
            <mesh
              rotation={[Math.PI / 2, 0, 0]}
              position={[cx, floorY + CORRIDOR_HEIGHT, cz]}
            >
              <planeGeometry args={[CELL_SIZE, CELL_SIZE]} />
              <primitive object={mats.ceiling} attach="material" />
            </mesh>

            {needsWall(c.x, c.z - 1) && (
              <SolidWall
                position={[cx, wallMidY, z0]}
                rotation={[0, 0, 0]}
                width={CELL_SIZE}
                height={CORRIDOR_HEIGHT}
                material={mats.wall}
              />
            )}
            {needsWall(c.x, c.z + 1) && (
              <SolidWall
                position={[cx, wallMidY, z0 + CELL_SIZE]}
                rotation={[0, Math.PI, 0]}
                width={CELL_SIZE}
                height={CORRIDOR_HEIGHT}
                material={mats.wall}
              />
            )}
            {needsWall(c.x - 1, c.z) && (
              <SolidWall
                position={[x0, wallMidY, cz]}
                rotation={[0, Math.PI / 2, 0]}
                width={CELL_SIZE}
                height={CORRIDOR_HEIGHT}
                material={mats.wall}
              />
            )}
            {needsWall(c.x + 1, c.z) && (
              <SolidWall
                position={[x0 + CELL_SIZE, wallMidY, cz]}
                rotation={[0, -Math.PI / 2, 0]}
                width={CELL_SIZE}
                height={CORRIDOR_HEIGHT}
                material={mats.wall}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
