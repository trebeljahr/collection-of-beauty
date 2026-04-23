"use client";

import type { FloorLayout, HallwayLayout } from "@/lib/gallery-layout/types";
import {
  CELL_SIZE,
  CORRIDOR_HEIGHT,
} from "@/lib/gallery-layout/world-coords";
import { CellType3D } from "@/lib/dungeon/types";
import { SolidWall } from "./wall";

/**
 * Render a hallway as a run of cells: floor + ceiling per cell, and a
 * wall segment on each side where the adjacent cell is non-walkable.
 *
 * Walls between hallway cells and rooms are drawn by the room (with
 * door openings already cut), so we only draw hallway walls where the
 * neighbour is None. This avoids z-fighting with room walls.
 */
export function HallwayRenderer({
  hallway,
  floor,
}: {
  hallway: HallwayLayout;
  floor: FloorLayout;
}) {
  const floorY = floor.y;
  const palette = floor.era.palette;

  // Build a fast "is this cell part of this hallway?" lookup so we know
  // when the neighbour is another hallway cell (no wall) vs None (wall).
  const hallCellKeys = new Set<number>();
  for (const c of hallway.cells) {
    hallCellKeys.add(c.z * floor.gridSize.x + c.x);
  }

  return (
    <group>
      {hallway.cells.map((c) => {
        const x0 = c.x * CELL_SIZE;
        const z0 = c.z * CELL_SIZE;
        const cx = x0 + CELL_SIZE / 2;
        const cz = z0 + CELL_SIZE / 2;
        const wallMidY = floorY + CORRIDOR_HEIGHT / 2;

        // Determine which sides need walls: a side needs a wall if the
        // neighbour cell is None (not walkable at all in the layout).
        // If the neighbour is a room cell, the room draws its own wall
        // with the door cut there. If the neighbour is another hallway
        // cell, no wall — open passage.
        const needsWall = (nx: number, nz: number): boolean => {
          if (
            nx < 0 ||
            nx >= floor.gridSize.x ||
            nz < 0 ||
            nz >= floor.gridSize.z
          ) {
            return true; // off the grid → wall
          }
          const idx = nz * floor.gridSize.x + nx;
          const walk = floor.walkable[idx] === 1;
          return !walk;
        };

        const key = `${c.x}-${c.z}`;
        return (
          <group key={key}>
            {/* Floor slab for this cell */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, floorY, cz]}>
              <planeGeometry args={[CELL_SIZE, CELL_SIZE]} />
              <meshStandardMaterial
                color={palette.floorColor}
                roughness={0.88}
                metalness={0.05}
              />
            </mesh>
            {/* Ceiling slab */}
            <mesh
              rotation={[Math.PI / 2, 0, 0]}
              position={[cx, floorY + CORRIDOR_HEIGHT, cz]}
            >
              <planeGeometry args={[CELL_SIZE, CELL_SIZE]} />
              <meshStandardMaterial
                color={palette.ceilingColor}
                roughness={0.96}
              />
            </mesh>

            {/* N wall (low z) */}
            {needsWall(c.x, c.z - 1) && (
              <SolidWall
                position={[cx, wallMidY, z0]}
                rotation={[0, 0, 0]}
                width={CELL_SIZE}
                height={CORRIDOR_HEIGHT}
                color={palette.wallColor}
              />
            )}
            {/* S wall (high z) */}
            {needsWall(c.x, c.z + 1) && (
              <SolidWall
                position={[cx, wallMidY, z0 + CELL_SIZE]}
                rotation={[0, Math.PI, 0]}
                width={CELL_SIZE}
                height={CORRIDOR_HEIGHT}
                color={palette.wallColor}
              />
            )}
            {/* W wall (low x) */}
            {needsWall(c.x - 1, c.z) && (
              <SolidWall
                position={[x0, wallMidY, cz]}
                rotation={[0, Math.PI / 2, 0]}
                width={CELL_SIZE}
                height={CORRIDOR_HEIGHT}
                color={palette.wallColor}
              />
            )}
            {/* E wall (high x) */}
            {needsWall(c.x + 1, c.z) && (
              <SolidWall
                position={[x0 + CELL_SIZE, wallMidY, cz]}
                rotation={[0, -Math.PI / 2, 0]}
                width={CELL_SIZE}
                height={CORRIDOR_HEIGHT}
                color={palette.wallColor}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

// Suppress unused-import warning in some build modes.
export const _cellTypeRef = CellType3D;
