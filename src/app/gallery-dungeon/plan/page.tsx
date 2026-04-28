// Top-down 2D debug view of the multi-floor dungeon layout.
// Server-rendered SVG — no client JS required. Each floor is one SVG.
//
// Colours:
//   dark base     → non-walkable (None)
//   era accent    → room cells (saturated for anchor, desaturated otherwise)
//   soft grey     → hallway cells
//   label         → room movement name, centred on the room
//   door ticks    → short marks on room walls where openings sit

import type { Metadata } from "next";
import { artworks } from "@/lib/data";
import { layoutMuseum } from "@/lib/gallery-layout/layout-museum";
import type { FloorLayout, RoomLayout } from "@/lib/gallery-layout/types";
import { CELL_SIZE } from "@/lib/gallery-layout/world-coords";

export const metadata: Metadata = {
  title: "Dungeon floor plan · debug",
  robots: { index: false, follow: false },
};

const CELL_PX = 18; // svg px per grid cell
const PADDING = 16;

export default function FloorPlanPage() {
  const layout = layoutMuseum(artworks);

  const totalDoors = layout.allRooms.reduce((n, r) => n + r.doors.length, 0);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-6 py-10">
      <div className="max-w-6xl mx-auto space-y-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Dungeon floor plans</h1>
          <p className="text-neutral-400 max-w-3xl text-sm">
            Debug view for the multi-floor gallery layout. Each era is one floor; rooms are
            era-coloured, anchor rooms are saturated, and connecting corridors show in grey. Rooms
            without a movement label are slots the generator produced that didn&apos;t have a
            movement to claim them.
          </p>
          <p className="text-neutral-500 text-xs">
            Floors: {layout.floors.length} · Rooms: {layout.allRooms.length} · Hallways:{" "}
            {layout.allHallways.length} · Doors: {totalDoors}
          </p>
        </header>

        {layout.floors.map((floor) => (
          <FloorSvg key={floor.index} floor={floor} />
        ))}
      </div>
    </div>
  );
}

function FloorSvg({ floor }: { floor: FloorLayout }) {
  const w = floor.gridSize.x;
  const h = floor.gridSize.z;
  const svgW = w * CELL_PX + PADDING * 2;
  const svgH = h * CELL_PX + PADDING * 2;

  const accent = floor.era.palette.accent;
  const wall = floor.era.palette.wallColor;

  const eraArtworkCount = floor.rooms.reduce((acc, r) => acc + r.artworks.length, 0);
  const doorCount = floor.rooms.reduce((n, r) => n + r.doors.length, 0);
  const placedInRooms = floor.rooms.reduce((n, r) => n + r.placements.length, 0);
  const placedInHallways = floor.hallways.reduce((n, h) => n + h.placements.length, 0);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="text-xs font-mono text-neutral-500">FLOOR {floor.index}</span>
        <h2 className="text-xl font-semibold">{floor.era.title}</h2>
        <span className="text-neutral-500 text-xs">
          {floor.era.yearMin}–{floor.era.yearMax === 9999 ? "now" : floor.era.yearMax} ·{" "}
          {floor.rooms.length} rooms · {floor.hallways.length} hallways · {doorCount} doors ·{" "}
          {eraArtworkCount} works ({placedInRooms}+{placedInHallways} placed)
        </span>
      </div>
      <p className="text-neutral-400 text-sm italic">{floor.era.blurb}</p>

      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-label={`${floor.era.title} floor plan`}
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="border border-neutral-800 bg-neutral-900 rounded"
        >
          <rect x={PADDING} y={PADDING} width={w * CELL_PX} height={h * CELL_PX} fill="#0c0a08" />

          {cellsOfKind(floor, "hallway").map((c) => (
            <rect
              key={`hall-${c.x}-${c.z}`}
              x={PADDING + c.x * CELL_PX}
              y={PADDING + c.z * CELL_PX}
              width={CELL_PX}
              height={CELL_PX}
              fill="#35302a"
            />
          ))}

          {floor.rooms.map((room) => (
            <RoomRect key={room.id} room={room} accent={accent} wall={wall} />
          ))}

          {floor.rooms.flatMap((room) =>
            room.doors.map((d, di) => (
              <DoorMark
                key={`${room.id}-door-${di}`}
                worldX={d.worldX}
                worldZ={d.worldZ}
                side={d.side}
                accent={accent}
              />
            )),
          )}

          {floor.rooms.map((room) => (
            <RoomLabel key={`l-${room.id}`} room={room} />
          ))}
        </svg>
      </div>
    </section>
  );
}

function RoomRect({ room, accent, wall }: { room: RoomLayout; accent: string; wall: string }) {
  const { xMin, xMax, zMin, zMax } = room.cellBounds;
  const cellW = (xMax - xMin + 1) * CELL_PX;
  const cellH = (zMax - zMin + 1) * CELL_PX;
  const fill = room.isAnchor ? accent : wall;
  const opacity = room.isAnchor ? 0.85 : 0.55;

  return (
    <rect
      x={PADDING + xMin * CELL_PX}
      y={PADDING + zMin * CELL_PX}
      width={cellW}
      height={cellH}
      fill={fill}
      fillOpacity={opacity}
      stroke={room.isAnchor ? accent : "#6a5e4a"}
      strokeWidth={room.isAnchor ? 2 : 1}
    />
  );
}

function RoomLabel({ room }: { room: RoomLayout }) {
  const { xMin, xMax, zMin, zMax } = room.cellBounds;
  const cx = PADDING + ((xMin + xMax + 1) / 2) * CELL_PX;
  const cy = PADDING + ((zMin + zMax + 1) / 2) * CELL_PX;
  const count = room.artworks.length;
  const isTiny = xMax - xMin < 3 || zMax - zMin < 3;

  return (
    <g pointerEvents="none">
      <text
        x={cx}
        y={cy - (isTiny ? 0 : 6)}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={isTiny ? 9 : 11}
        fill="#1a1410"
        fontWeight={room.isAnchor ? 700 : 500}
      >
        {room.movement}
      </text>
      {!isTiny && (
        <text
          x={cx}
          y={cy + 8}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={9}
          fill="#1a1410"
          opacity={0.7}
        >
          {count} {count === 1 ? "work" : "works"}
        </text>
      )}
    </g>
  );
}

function DoorMark({
  worldX,
  worldZ,
  side,
  accent,
}: {
  worldX: number;
  worldZ: number;
  side: "north" | "south" | "east" | "west";
  accent: string;
}) {
  const pxPerM = CELL_PX / CELL_SIZE;
  const cx = PADDING + worldX * pxPerM;
  const cy = PADDING + worldZ * pxPerM;
  const len = 10;
  const thick = 3;
  const horizontal = side === "north" || side === "south";

  return (
    <rect
      x={cx - (horizontal ? len / 2 : thick / 2)}
      y={cy - (horizontal ? thick / 2 : len / 2)}
      width={horizontal ? len : thick}
      height={horizontal ? thick : len}
      fill={accent}
      opacity={0.9}
    />
  );
}

function cellsOfKind(
  floor: FloorLayout,
  kind: "room" | "hallway" | "none",
): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  for (let x = 0; x < floor.gridSize.x; x++) {
    for (let z = 0; z < floor.gridSize.z; z++) {
      const idx = z * floor.gridSize.x + x;
      const walk = floor.walkable[idx] === 1;
      const owned = floor.cellOwner[idx] >= 0;
      const isRoom = walk && owned;
      const isHall = walk && !owned;
      const isNone = !walk;

      if (kind === "room" && isRoom) out.push({ x, z });
      if (kind === "hallway" && isHall) out.push({ x, z });
      if (kind === "none" && isNone) out.push({ x, z });
    }
  }
  return out;
}
