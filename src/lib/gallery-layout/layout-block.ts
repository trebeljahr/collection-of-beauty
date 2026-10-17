// The museum's floor plan.
//
// One rectangular block, 117.5 × 62.5 m, on four floors, the same plan
// on each. Down its middle runs a spine of five bays: a stair hall 27.5
// m wide and 25 m deep at each end, a court 27.5 m square in the
// centre, and a gallery between each pair. A range runs along the north of the spine
// and one along the south: a long gallery, a room beside the court (the
// artist's room in the north, a stair tower in the south), a long
// gallery.
//
//   ┌─────────────────┬─────────┬─────────────────┐
//   │       nw        │    n    │       ne        │   north
//   ├──────────┬──────┼─────────┼──────┬──────────┤
//   │ │hall-w  │  cw  │  court  │  ce  │  hall-e│ │   the spine
//   ├──────────┴──────┼─────────┼──────┴──────────┤
//   │       sw        │ stair-s │       se        │   south
//   └───────────────┬─┴────┬────┴─┬───────────────┘
//                   │      │      │
//                   │    salon    │                    beyond the block
//                   │             │
//                   └─────────────┘
//
// Three stairs, each in the same place on every floor:
//
// - A grand stair at each end of the spine (`grand-stair.ts`, the
//   loggia): one flight up the middle to a half landing and two back
//   along the sides, storey over storey. It stands in the front of its
//   hall and faces the portal of the spine. A door in each side wall
//   leads from the gallery beside it to a long gallery. Behind its
//   landings the hall is open from the floor to the roof, 16 m wide and
//   3.95 m deep, with a gallery along the end wall beyond it. The
//   hall's end wall stands a cell inside the building's: the strip
//   between is no room.
// - A spiral south of the court, in a room of its own (22.5 × 17.5 m)
//   with a door to the court and to the gallery on either side.
//
// The room north of the court, the same size, held a second spiral
// until 17 October 2026. Rico found it superfluous: the one beside the
// salon serves the floors. It is now the artist's room (`ARTIST_ROOM`,
// `Zone.own`), on each floor one painter of that floor in the colours
// of their era: Rembrandt and Hokusai among rows of panels, Turner
// between wing walls, and Monet's water garden open, with the Two
// Willows (17 m) across the north wall. That wall closes the court's
// short axis, seen through the portal from where a visit starts, and
// the room's largest work hangs on its middle, over a bench.
//
// The court has no stair. It is where a visit starts: a hall open to
// the roof, with a gallery round the opening on every floor above, a
// portal in each wall, the grand stairs at the two ends of one axis and
// the artist's room and the spiral at the two ends of the other.
//
// The halls and the court hang the works too large for a room, at their
// real size (`giants.ts`): one to a stretch of wall on each storey, a
// stair hall's storey composed about its stair's axis.
//
// The salon stands beyond the south front, 37.5 m square, and opens
// from the south spiral's room on the first two floors: the court's
// short axis runs on through the spiral into it. A gallery runs along
// its front and side walls on the second floor; its far wall stands
// sheer from the floor to the roof, 18.85 m up, and a glazed dome
// closes it. It hangs the largest works no hall holds (`hangSalon`):
// Michelangelo's Last Judgment, 13.7 m tall, on the far wall, and the
// rest in pairs on the two storeys. Rico, 17 October 2026, of the Last
// Judgment hung at a quarter of its size: "stuff like this is
// *exactly* what I want", and asked for a room over more than one
// storey for such works. It was four storeys high that morning; he
// asked for "2 floors and a bit", the ceiling where the middle of the
// Creation of Adam had hung over the Last Judgment, and a dome.
//
// The galleries take the dividers and benches of fittings.ts. A floor
// holds two or three eras, each in rooms that touch, each room in its
// era's colour.
//
// It replaced the tower (a storey per era round one spiral stairwell,
// `layout-museum.ts`, tag `museum-tower-default-2026-10-17`) on
// 17 October 2026. Five earlier plans were walked and changed:
//
// - `?plan=wings`, 12.5 m galleries in rings: rooms too small, too many
//   of them, no dividers, too few doors between rooms.
// - This block with three stair halls 40 m apart on the long axis, 22.5
//   m square, every stair stacked through all four floors (tag
//   `museum-block-stacked-stairs-2026-10-12`). The halls felt cramped:
//   the stair filled the room to within 3.3 m of the walls, and the
//   underside of the next storey's stair hung 5.8 m over every flight.
//   A hall was a room on the way from one gallery to the next.
// - The three halls wall to wall in the middle of the block, inside a
//   ring of twelve rooms, each hall with a door in all four walls (tag
//   `museum-block-core-of-three-2026-10-13`). On the second floor two
//   grand stairs stood in adjoining rooms, and most doors of a hall
//   opened on the side or the back of its stair.
// - The halls at the centre and both ends of the spine, one stair to a
//   hall: the middle one from the first floor to the second, the west
//   from the second to the third, the east from the third to the fourth
//   (tag `museum-block-spine-of-three-2026-10-13`). Rico, 13 October
//   2026: the staircase "should be at the end and not in the center of
//   the building", one at either side, the spirals "at the top and
//   bottom"; the stairs "don't 'stack' on the same levels neatly"; and
//   the giants "cluster too close together". He kept one thing: the
//   gallery seen from above.

import type { ArtworkListing } from "@/lib/data";
import {
  assignEra,
  type Era,
  type EraId,
  eraAccentColor,
  getEra,
  type PaletteId,
} from "@/lib/gallery-eras";
import { slugify } from "@/lib/utils";
import { computeBlockedEdges } from "./blocked-edges";
import { curatedQueue, roomDescription, roomTitle } from "./curation";
import type { DividerStyle } from "./divider-plans";
import {
  centredIsland,
  courtIslands,
  planPanelBenches,
  SCREEN_BENCH_ROOM,
  salonIslands,
  screenBenches,
  wallIsland,
} from "./feature-benches";
import {
  arrivalPoint,
  benchClearOf,
  benchRect,
  ceilingHeightFor,
  planBenches,
  planDividers,
} from "./fittings";
import {
  bucketByEra,
  dominantMovement,
  fillRooms,
  selectFloorWorks,
  shuffleByIdHash,
} from "./floor-works";
import {
  fitsStretch,
  giantSize,
  hallRuns,
  hangHallStoreys,
  hangSalon,
  type StairHallStorey,
  salonSize,
  stairHallHang,
  stretchMiddle,
  tallSize,
} from "./giants";
import {
  buildGrandStair,
  type CourtBridges,
  type GrandStair,
  type GrandStairDesign,
  grandHallArrival,
  IMPERIAL,
  openingInWorld,
  SALON_GALLERY,
  STAIR_SLAB,
} from "./grand-stair";
import {
  computeRoomRuns,
  distributePaintings,
  fitsSomeRun,
  runLength,
  type SizedWork,
  sizeWork,
  wallFootprint,
} from "./place-paintings";
import { floorTitle } from "./room-era";
import { texturePxPerMetre } from "./sharpness";
import type {
  Bench,
  CellRect,
  Door,
  FloorLayout,
  MuseumLayout,
  RoomLayout,
  Staircase,
} from "./types";
import {
  CELL_SIZE,
  FLOOR_SEPARATION,
  floorY,
  INTER_FLOOR_HEIGHT,
  PORTAL_HEIGHT,
  PORTAL_WIDTH,
  SPIRAL_INNER_RADIUS,
  SPIRAL_OUTER_RADIUS,
  SPIRAL_STEPS_PER_FLOOR,
  WALL_THICKNESS,
} from "./world-coords";

export const BLOCK_GRID = { x: 47, z: 40 };

/** Doors between rooms. One cell wide for the collision grid, so no
 *  jamb colliders (`doorOpenHalfSpan`), and wide enough for a thumb. */
export const BLOCK_DOOR_WIDTH = 2.4;
export const BLOCK_DOOR_HEIGHT = 2.9;

/** Share of a room's wall its works and plaques cover, dividers
 *  included. Rico found works hung too close at 0.55; below a half the
 *  gap between two works is wider than a work. The two floors of small
 *  sheets hang thinner still: many prints of one shape in a row read as
 *  wallpaper. It was 0.45 and 0.38 until 17 October 2026, when the
 *  clearances to doors, corners and wing walls took 5.5 % of the
 *  hangable wall and the plan hung 71 works fewer. Rico wanted them
 *  back, so the share went up by that much: the same works hang, the
 *  median gap between two works is 1.22 m where it was 1.34 m. */
export const BLOCK_WALL_COVERAGE = 0.475;
export const BLOCK_PRINT_COVERAGE = 0.4;

/** The galleries hang every work at its real size where that size is
 *  trusted, with no 3.2 m cap (`HangOptions`). */
const REAL_SIZE = { realSize: true } as const;

/** Floor between a bench and the nearest freestanding wall. */
const ISLAND_CLEARANCE = 2.2;
/** Floor between a bench and the nearest wall of its room. The end bay
 *  of a long gallery cut by wing walls is 7.5 m: a bench in the middle
 *  of it would stand 2.75 m off the end wall, in the way of its works. */
const BENCH_WALL_FLOOR = 4;

// Rows and columns, in cells, both ends inclusive. Every band is an odd
// number of cells, which puts the middle of a shared wall in the middle
// of a cell: the collision grid needs a door there.
const ROW_N = [0, 6] as const;
const ROW_M = [7, 17] as const;
const ROW_S = [18, 24] as const;
/** The salon, beyond the block's south front. */
const ROW_SALON = [25, 39] as const;

const span = (xMin: number, xMax: number, row: readonly [number, number]): CellRect => ({
  xMin,
  xMax,
  zMin: row[0],
  zMax: row[1],
});

type RoomKey = string;
type Side = Door["side"];
/** The rooms that hang an era's works: four long galleries, the two
 *  galleries of the spine, and the artist's room north of the court. */
export const BLOCK_ROOMS: ReadonlyArray<{ key: RoomKey; rect: CellRect }> = [
  { key: "nw", rect: span(0, 18, ROW_N) },
  { key: "n", rect: span(19, 27, ROW_N) },
  { key: "ne", rect: span(28, 46, ROW_N) },
  { key: "cw", rect: span(11, 17, ROW_M) },
  { key: "ce", rect: span(29, 35, ROW_M) },
  { key: "sw", rect: span(0, 18, ROW_S) },
  { key: "se", rect: span(28, 46, ROW_S) },
];
/** The spiral stair south of the court, through every floor. `door` is
 *  the wall the court is behind: the spiral's first step faces it. A
 *  second stood north of the court until 17 October 2026; that room is
 *  the artist's room now (`ARTIST_ROOM`). */
export const BLOCK_SPIRALS: ReadonlyArray<{ key: RoomKey; rect: CellRect; door: Side }> = [
  { key: "stair-s", rect: span(19, 27, ROW_S), door: "north" },
];
/** The room north of the court, on the court's short axis: on every
 *  floor the room of one artist of that floor (`Zone.own`). */
export const ARTIST_ROOM: RoomKey = "n";
/**
 * The halls of the spine, open from the first floor to the roof.
 *
 * The two at the ends are stair halls: a loggia, the grand stair on
 * every storey. Each faces the portal of the spine (`hallFront`) and
 * has a door in each side wall (`HALL_SIDE_DOOR`). Its end wall stands
 * three cells inside the building's end wall (cells 0 to 2 and 44 to 46
 * of the spine are no room), so a hall is 27.5 m wide and 20 m deep:
 * the end wall meets the far edge of every half landing (`LOGGIA`).
 * The stair is set out from the front wall (`buildStair`), so it
 * stands where it stood in the square hall.
 *
 * The court in the middle has no stair, and a door in every wall.
 */
export const BLOCK_HALLS: ReadonlyArray<{
  key: RoomKey;
  rect: CellRect;
  design: Extract<GrandStairDesign, "loggia" | "court" | "salon">;
  turns: GrandStair["turns"];
  /** The highest floor the hall stands on: the top floor, unset. */
  top?: number;
}> = [
  { key: "hall-w", rect: span(3, 10, ROW_M), design: "loggia", turns: 3 },
  { key: "court", rect: span(18, 28, ROW_M), design: "court", turns: 0 },
  { key: "hall-e", rect: span(36, 43, ROW_M), design: "loggia", turns: 1 },
  { key: "salon", rect: span(16, 30, ROW_SALON), design: "salon", turns: 2, top: 1 },
];
/** How high the salon's top storey runs, from its floor to the slab
 *  over it (`RoomLayout.storeyHeight`): past the floor above, so its
 *  ceiling is 18.85 m over the salon's floor, where the middle of the
 *  Creation of Adam hung when the salon was four storeys high. The dome
 *  rises from there. */
export const SALON_TOP_STOREY = 10.67;
/** The one room the salon opens from, on the floors it stands on: the south
 *  spiral's, so the court's short axis runs on through it into the
 *  salon. The long galleries beside it share 7.5 m of the salon's front
 *  wall and have no door to it: a door there stood in the line of the
 *  door screen in front of their door to the spiral. */
const SALON_DOOR: RoomKey = "stair-s";
/** The colours every storey of the stair halls and stair towers takes:
 *  the pale stone of the Gothic rooms. A hall is one room four storeys
 *  high, seen through all of them at once. */
const STAIR_PALETTE: PaletteId = "gothic";
/** The court and the salon hang no one era and are no stair: a warm
 *  sandstone of their own, so the spine does not read as one band of
 *  grey from end to end. */
const HALL_PALETTE: Readonly<Partial<Record<RoomKey, PaletteId>>> = {
  court: "court",
  salon: "court",
};
/** Where a visit starts, and where a visitor sent to a floor lands. */
export const GREAT_HALL: RoomKey = "court";

/** The wall of a hall its stair's foot faces: a design is drawn with the
 *  visitor coming in from the south, and turned a quarter at a time. */
const FRONTS: readonly Side[] = ["south", "west", "north", "east"];
export function hallFront(hall: { turns: GrandStair["turns"] }): Side {
  return FRONTS[hall.turns];
}

/** A stair hall's side doors, metres in from its front wall. Each opens
 *  from the gallery beside the stair into the long gallery behind the
 *  side wall, on every floor, by the foot of the side flight. Rico, 17
 *  October 2026, of the bare wall between Liberty and the balustrade
 *  over the void: "here should be a door for the stair ways". The door
 *  also cuts the stretch a giant hangs in from 15 m to 10 m: one work in
 *  the middle of 15 m read as a work on an empty wall. A cell's middle,
 *  so the grid opens there. */
export const HALL_SIDE_DOOR = 11.25;

/** Doors a portal wide: the spine from end to end, and the short axis
 *  from the artist's room through the court to the spiral. */
const PORTALS: ReadonlyArray<readonly [RoomKey, RoomKey]> = [
  ["hall-w", "cw"],
  ["cw", "court"],
  ["court", "ce"],
  ["ce", "hall-e"],
  [ARTIST_ROOM, "court"],
  ["court", "stair-s"],
];
/** Cells of wall two rooms have to share for a door between them. A
 *  long gallery meets the court at one cell, in the court's corner. */
const MIN_SHARED_CELLS = 3;

type Zone = {
  era: EraId;
  cells: readonly RoomKey[];
  coverage?: number;
  /** A room of one artist's works (`OwnRoom`). The era's other rooms on
   *  the floor hang none of them. */
  own?: OwnRoom;
};
/** The works of a room of their own: an artist's, as the catalogue
 *  spells the name, or those of them whose title names a `motif`, from
 *  the year `since` (a work with no year passes). `name` is the room's
 *  sign; unset, `roomTitle` names the artist. */
export type OwnRoom = { artist: string; motif?: RegExp; since?: number; name?: string };
export function ownRoomHolds(own: OwnRoom, artwork: ArtworkListing): boolean {
  if (artwork.artist !== own.artist) return false;
  if (own.since !== undefined && artwork.year != null && artwork.year < own.since) return false;
  return !own.motif || own.motif.test(artwork.title) || own.motif.test(artwork.englishTitle ?? "");
}
/** Monet's water garden at Giverny, which he painted from 1897 until he
 *  died: the water lilies, the Japanese bridge and the Orangerie's
 *  panels. His earlier works hang with the Impressionists. */
const MONETS_WATER_GARDEN: OwnRoom = {
  artist: "Claude Monet",
  motif:
    /water[- ]?lil|nymph|lily pond|japanese bridge|bridge over the water|agapanth|rose arches/i,
  since: 1897,
  name: "Monet's Water Garden",
};
type FloorPlan = {
  title: string;
  /** One sentence for the entry card, under the title. Era blurbs
   *  describe one era each; a floor here holds two or three. */
  blurb: string;
  /** Eras in the order they are walked, each with the rooms it hangs
   *  in, in the order of the walk: out of the court to the west, round
   *  the block by the north, and back by the south-east. An era's rooms
   *  touch, or stand either side of a room beside the court. One zone
   *  is the artist's room (`ARTIST_ROOM`), of an era the floor hangs. */
  zones: readonly Zone[];
  /** The order the map numbers the rooms, when it is not the order of
   *  `zones`. Each era's rooms keep consecutive numbers. */
  numbering?: readonly RoomKey[];
  /** How a room's freestanding walls are set out (`DividerStyle`). A
   *  room not named takes rows of panels in a gallery of the spine and
   *  bays in a long gallery. No two rooms that share a door are divided
   *  the same way. */
  styles: Readonly<Record<RoomKey, DividerStyle>>;
  /** Door screens: in the first room, in front of its door to the
   *  second. Never both sides of one door, and never a portal. */
  screens: ReadonlyArray<readonly [RoomKey, RoomKey]>;
};
/** The names the halls and stairs go by on the plan and the map: the
 *  same on every floor, so a visitor can say where they are. */
const HALL_NAMES: Readonly<Partial<Record<RoomKey, string>>> = {
  "hall-w": "West Stair Hall",
  "hall-e": "East Stair Hall",
  court: "Central Court",
  "stair-s": "South Stair",
  salon: "Grand Salon",
};

/** What hangs on each floor and where. The two collections that stand
 *  beside the timeline share the top floor. */
export const BLOCK_PLAN: readonly FloorPlan[] = [
  {
    title: "Old Masters",
    blurb:
      "European painting up to about 1700, with Botticelli and Dürer in room 3 and Poussin in room 5.",
    styles: {
      ne: "long-rows",
      cw: "bays",
      n: "rows",
      sw: "rows",
      ce: "bays",
      se: "long-rows",
    },
    screens: [
      ["ne", ARTIST_ROOM],
      ["nw", "cw"],
      ["ce", "se"],
    ],
    // Round the court from the west gallery of the spine, so the blue
    // rooms are 1 and 2 and the red ones 4 to 7. Rico, 17 October 2026:
    // in the order of the zones room 1 stood in the north-east and room 2
    // in the spine.
    numbering: ["cw", "nw", "ne", "ce", "se", "sw", ARTIST_ROOM],
    zones: [
      // One long gallery. The era has 69 works that are sharp enough to
      // hang: in three rooms they covered a third of the wall and read
      // as a collection with works missing. It stands in the north-east
      // and the Baroque's first room in the south-west: Rico, 17
      // October 2026, with the Gothic in the south-west the map read
      // west to east as the French flag.
      { era: "gothic", cells: ["ne"] },
      { era: "renaissance", cells: ["cw", "nw"] },
      { era: "baroque", cells: [ARTIST_ROOM], own: { artist: "Rembrandt van Rijn" } },
      { era: "baroque", cells: ["sw", "ce", "se"] },
    ],
  },
  {
    title: "Salon and Academy",
    blurb:
      "Boucher's Rococo, David's Neoclassicism, the Romantics and the Realists, painted between about 1720 and 1900.",
    styles: {
      sw: "bays",
      nw: "long-rows",
      n: "staggered",
      ce: "staggered",
      se: "long-rows",
    },
    screens: [
      ["ne", ARTIST_ROOM],
      ["cw", "sw"],
      ["se", "ce"],
    ],
    zones: [
      { era: "enlightenment", cells: ["sw", "cw"] },
      { era: "romantic", cells: ["nw", "ne"] },
      { era: "romantic", cells: [ARTIST_ROOM], own: { artist: "J. M. W. Turner" } },
      { era: "realism", cells: ["ce", "se"] },
    ],
  },
  {
    title: "Impressionism and After",
    blurb:
      "Manet and Monet in the 1860s, Cézanne and Van Gogh after them, and the abstraction of the 1910s and 1920s.",
    styles: {
      cw: "bays",
      nw: "long-rows",
      n: "open",
      ne: "long-rows",
      ce: "staggered",
    },
    screens: [
      ["nw", ARTIST_ROOM],
      ["sw", "cw"],
      ["ce", "ne"],
    ],
    zones: [
      { era: "fin-de-siecle", cells: ["sw", "cw", "nw"] },
      // Its works are the water garden's panels, 4 to 17 m long: at the
      // share of the other rooms they were three, and two walls stood
      // bare.
      { era: "fin-de-siecle", cells: [ARTIST_ROOM], own: MONETS_WATER_GARDEN, coverage: 0.7 },
      { era: "post-impressionism", cells: ["ne", "ce"] },
      { era: "modernism", cells: ["se"] },
    ],
  },
  {
    title: "Natural History and East Asian Art",
    blurb:
      "Book plates of plants and animals in one half; prints and paintings from Japan, China and Korea in the other.",
    styles: {
      sw: "long-rows",
      cw: "staggered",
      n: "rows",
      ne: "bays",
      ce: "long-rows",
      se: "long-rows",
    },
    screens: [
      ["se", "stair-s"],
      ["cw", "nw"],
      ["ne", "ce"],
    ],
    zones: [
      { era: "natural-history", cells: ["sw", "cw", "nw"], coverage: BLOCK_PRINT_COVERAGE },
      {
        era: "ukiyo-e",
        cells: [ARTIST_ROOM],
        own: { artist: "Katsushika Hokusai" },
        coverage: BLOCK_PRINT_COVERAGE,
      },
      { era: "ukiyo-e", cells: ["ne", "ce", "se"], coverage: BLOCK_PRINT_COVERAGE },
    ],
  },
];

// --- Public entry ---------------------------------------------------------

/** How the court's void is crossed on the floors over its first
 *  (`CourtBridges`). `/gallery-3d?bridges=none` shows it without. */
export const DEFAULT_COURT_BRIDGES: CourtBridges = "alternate";

export function layoutBlock(
  allArtworks: ArtworkListing[],
  options: { courtBridges?: CourtBridges } = {},
): MuseumLayout {
  const courtBridges = options.courtBridges ?? DEFAULT_COURT_BRIDGES;
  const byEra = bucketByEra(allArtworks);
  const built = BLOCK_PLAN.map((plan, index) => buildFloor(index, plan));
  const floors = built.map((b) => b.floor);
  const top = floors.length - 1;

  // A hall is one room through every storey. A loggia has a stair from
  // each floor to the next, and each stair's opening is the hole in the
  // floor it arrives on. The court has one opening, in every floor over
  // the first.
  const grandStairs: GrandStair[] = [];
  for (const hall of BLOCK_HALLS) {
    const hallTop = hall.top ?? top;
    const stairs =
      hall.design !== "loggia"
        ? [
            buildStair(
              floors[0],
              floors[1],
              hall,
              hallTop,
              false,
              false,
              hall.design === "court" ? courtBridges : undefined,
            ),
          ]
        : floors
            .slice(0, top)
            .map((lower, i) => buildStair(lower, floors[i + 1], hall, i + 1, i > 0, i + 1 < top));
    for (const stair of stairs) {
      floors[stair.lowerFloor].grandStairsOut!.push(stair);
      floors[stair.upperFloor].grandStairsIn!.push(stair);
      for (let f = stair.lowerFloor; f <= stair.topFloor; f++) floors[f].grandHalls!.push(stair);
      grandStairs.push(stair);
    }
    const court = hall.design !== "loggia";
    for (let f = 0; f <= hallTop; f++) {
      const room = hallRoom(floors[f], hall.key);
      // The stair whose opening is in this floor, and the one whose
      // opening is in the ceiling: the floor above's.
      const below = court ? stairs[0] : stairs[f - 1];
      const above = court ? stairs[0] : stairs[f];
      room.floorOpening = f > 0 ? openingInWorld(below, f) : null;
      room.ceilingOpening = f < hallTop ? openingInWorld(above, f + 1) : null;
      room.stairGlyph = court ? "void" : f === 0 ? "up" : f === top ? "down" : "both";
      // The salon's far wall stands sheer from its floor to the roof:
      // its galleries run along the other three. Its top storey rises
      // past the floor above to a glazed dome.
      if (hall.design === "salon") {
        if (f === hallTop) {
          room.storeyHeight = SALON_TOP_STOREY;
          room.domed = true;
        }
        room.sheer = {
          side: OPPOSITE[hallFront(hall)],
          depth: 0,
          base: floors[0].y,
          roof: floors[hallTop].y + SALON_TOP_STOREY - (FLOOR_SEPARATION - INTER_FLOOR_HEIGHT),
        };
      }
      // A loggia's half landings run back to its end wall: the wall's
      // middle stands over a landing, clear to the next landing's
      // underside or, over the last, to the roof.
      if (hall.design === "loggia") {
        const landing = FLOOR_SEPARATION / 2;
        room.endWall = {
          side: OPPOSITE[hallFront(hall)],
          half: IMPERIAL.half,
          landing:
            f === top
              ? null
              : {
                  y: landing,
                  top:
                    f === top - 1
                      ? FLOOR_SEPARATION + INTER_FLOOR_HEIGHT
                      : landing + FLOOR_SEPARATION - STAIR_SLAB,
                },
        };
      }
    }
  }

  const allStaircases: Staircase[] = [];
  for (let i = 0; i < top; i++) {
    for (const shaft of BLOCK_SPIRALS) {
      const stair = buildSpiral(floors[i], floors[i + 1], shaft);
      floors[i].stairsOut.push(stair);
      floors[i + 1].stairsIn.push(stair);
      allStaircases.push(stair);
    }
  }

  // The giants go to the halls first; each era then hangs what is left.
  // A giant no hall took hangs in its era's rooms, at its real size,
  // where a wall holds it. So does a work the salon would take and has
  // no place for: too coarse a scan for a room at 3.2 m, fine for one
  // at its real size and seen from across a gallery. Rico, 17 October
  // 2026: "let the 34 salon-eligible works that have no place in the
  // salon hang in their era's galleries at real size".
  const { hung: inHalls, spirals } = hangGiants(floors, byEra, allArtworks);
  const forRooms = new Map(
    [...byEra].map(([era, works]) => [era, works.filter((a) => !inHalls.has(a.id))]),
  );
  const inBuckets = new Set([...byEra.values()].flat().map((a) => a.id));
  for (const artwork of allArtworks) {
    if (inHalls.has(artwork.id) || inBuckets.has(artwork.id) || !salonSize(artwork)) continue;
    const era = assignEra(artwork);
    if (era) forRooms.set(era, [...(forRooms.get(era) ?? []), artwork]);
  }
  const leftGiants = new Set(
    [...forRooms.values()]
      .flat()
      .filter((a) => salonSize(a))
      .map((a) => a.id),
  );
  for (const b of built) b.hang(forRooms, leftGiants);
  hangTallInSpirals(floors, forRooms, spirals);

  const ground = floors[0];
  const anchor = ground.rooms.find((r) => r.isAnchor) ?? ground.rooms[0];
  const layout: MuseumLayout = {
    floors,
    entry: { floorIndex: 0, worldPosition: [0, anchor.worldRect.y, 0] },
    allRooms: floors.flatMap((f) => f.rooms),
    allStaircases,
    grandStairs,
  };
  const arrival = blockArrivalPoint(layout, anchor);
  layout.entry.worldPosition = [arrival.x, anchor.worldRect.y, arrival.z];
  return layout;
}

/** The eras a floor hangs, each once: an era with a room of its own has
 *  two zones. */
const erasOf = (plan: FloorPlan): EraId[] => [...new Set(plan.zones.map((z) => z.era))];

const hallKey = (room: RoomLayout) => room.id.replace(/^f\d+-/, "");
const hallRoom = (floor: FloorLayout, key: RoomKey) =>
  floor.rooms.find((r) => r.isStairwell && hallKey(r) === key)!;

/**
 * Hang the works too large for a room in the halls, at their real size
 * (`giants.ts`), on the floor of their era where there is a place. Each
 * storey of a stair hall takes its floor's largest work on the middle
 * of its end wall, where a visitor sees it from the foot of the stair.
 * The court then takes one work to a stretch: it is the middle of its
 * floor. The stair halls hang pairs from what is left, and the spiral
 * rooms what no hall holds. Returns the ids hung, and the spiral rooms'
 * hang for the tall works (`hangTallInSpirals`).
 */
function hangGiants(
  floors: FloorLayout[],
  byEra: Map<EraId, ArtworkListing[]>,
  allArtworks: readonly ArtworkListing[],
): { hung: Set<string>; spirals: ReturnType<typeof stairHallHang> } {
  const works: Array<{ work: SizedWork; start: number }> = [];
  BLOCK_PLAN.forEach((plan, floorIndex) => {
    for (const era of erasOf(plan)) {
      for (const artwork of byEra.get(era) ?? []) {
        const work = giantSize(artwork);
        if (work) works.push({ work, start: floorIndex });
      }
    }
  });

  const stairHalls = BLOCK_HALLS.filter((h) => h.design === "loggia");
  const stairs = stairHallHang(
    floors.map((floor) =>
      stairHalls.map(
        (h): StairHallStorey => ({
          room: hallRoom(floor, h.key),
          end: OPPOSITE[hallFront(h)],
          front: hallFront(h),
        }),
      ),
    ),
  );
  const startOf = new Map(works.map((w) => [w.work.artwork.id, w.start]));
  const courts = floors.map((floor) => [
    BLOCK_HALLS.filter((h) => h.design === "court").map((h) => hallRoom(floor, h.key)),
  ]);
  const left = hangHallStoreys(courts, stairs.axes(works));
  const unhung = stairs.pairs(
    left.map((work) => ({ work, start: startOf.get(work.artwork.id) ?? 0 })),
  );
  // The salon takes the largest works no hall holds, on its own rule
  // (`salonSize`): what the halls left, and the works too thin a scan
  // for a hall. So it reads the whole catalogue.
  const hungSoFar = new Set(
    floors.flatMap((f) => f.rooms.flatMap((r) => r.placements.map((p) => p.artwork.id))),
  );
  const salon = BLOCK_HALLS.find((h) => h.design === "salon");
  const salonStoreys = salon
    ? floors.slice(0, (salon.top ?? floors.length - 1) + 1).map((f) => hallRoom(f, salon.key))
    : [];
  if (salon) {
    const forSalon = allArtworks.flatMap((artwork) => {
      if (hungSoFar.has(artwork.id) || !assignEra(artwork)) return [];
      const work = salonSize(artwork);
      return work ? [work] : [];
    });
    const front = hallFront(salon);
    const width = (salon.rect.xMax - salon.rect.xMin + 1) * CELL_SIZE;
    hangSalon(salonStoreys, forSalon, { far: OPPOSITE[front], front }, width / 2 - SALON_GALLERY);
  }
  const inSalon = new Set(salonStoreys.flatMap((r) => r.placements.map((p) => p.artwork.id)));

  // The spiral's room takes only what no hall's wall holds: its outer
  // wall, 22.5 m, is the one wall left for a handscroll 12 m long once
  // the end walls have their works, on the floors over the salon (on
  // the first two it has the salon's door). Any other work a pair left
  // hangs in its era's rooms.
  const stretches = floors.flatMap((floor) => [
    ...courts[floor.index].flat().flatMap(hallRuns),
    ...stairHalls.flatMap((h) =>
      hallRuns(hallRoom(floor, h.key)).filter((run) => run.side !== OPPOSITE[hallFront(h)]),
    ),
  ]);
  const spirals = stairHallHang(
    floors.map((floor) =>
      BLOCK_SPIRALS.map(
        (s): StairHallStorey => ({
          room: hallRoom(floor, s.key),
          end: OPPOSITE[s.door],
          front: s.door,
        }),
      ),
    ),
    { ownFloor: true },
  );
  spirals.axes(
    unhung.filter((e) => !fitsStretch(stretches, e.work) && !inSalon.has(e.work.artwork.id)),
  );

  const halls = floors.flatMap((f) => f.rooms.filter((r) => r.isStairwell));
  for (const room of halls) room.artworks = room.placements.map((p) => p.artwork);
  return { hung: new Set(halls.flatMap((r) => r.artworks).map((a) => a.id)), spirals };
}

/**
 * Hang tall works on the spiral room's storeys: full-length portraits
 * and altarpieces no gallery hung, each on its own floor (`tallSize`).
 * Rico, 17 October 2026: "the spiral stair case rooms could also hold
 * tall paintings nicely". A storey is 8.2 m high. There were two
 * spiral rooms that day; the north one is the artist's room now.
 *
 * It runs after the galleries, from what they left, so it takes no
 * work from a gallery and changes none of their hang. A storey is one
 * composition, as in a stair hall (`stairHallHang`): the largest work
 * on the middle of the outer wall, a pair beside it, and pairs that
 * mirror each other across the stair on the side walls and either
 * side of the portal to the court. A storey whose outer wall holds a
 * handscroll keeps it as the work on the axis. On the floors the salon
 * stands on, the outer wall has the door to it: a pair either side of
 * it, and no work on the axis.
 */
function hangTallInSpirals(
  floors: FloorLayout[],
  byEra: Map<EraId, ArtworkListing[]>,
  spirals: ReturnType<typeof stairHallHang>,
) {
  const hung = new Set(
    floors.flatMap((f) => f.rooms.flatMap((r) => r.placements.map((p) => p.artwork.id))),
  );
  const works = BLOCK_PLAN.flatMap((plan, start) =>
    erasOf(plan).flatMap((era) =>
      (byEra.get(era) ?? []).flatMap((artwork) => {
        const work = hung.has(artwork.id) ? null : tallSize(artwork);
        return work ? [{ work, start }] : [];
      }),
    ),
  );
  spirals.pairs(spirals.axes(works));
  for (const floor of floors) {
    for (const s of BLOCK_SPIRALS) {
      const room = hallRoom(floor, s.key);
      room.artworks = room.placements.map((p) => p.artwork);
    }
  }
}

/** Where a visitor sent to a room lands. A hall's centre is a flight or
 *  the open well, so there it is inside the door its stair faces: floor
 *  on every storey of the hall. */
export function blockArrivalPoint(
  layout: MuseumLayout,
  room: RoomLayout,
): { x: number; z: number } {
  if (room.isStairwell) {
    const stair = layout.grandStairs?.find((s) => s.id.startsWith(`${hallKey(room)}-`));
    if (stair) return grandHallArrival(stair);
  }
  return arrivalPoint(room);
}

// --- One floor ------------------------------------------------------------

function buildFloor(
  index: number,
  plan: (typeof BLOCK_PLAN)[number],
): {
  floor: FloorLayout;
  hang: (byEra: Map<EraId, ArtworkListing[]>, must: ReadonlySet<string>) => void;
} {
  // The floor as a whole answers to its first era: the id a saved visit
  // is filed under.
  const floorEra = getEra(plan.zones[0].era);

  // Which era each room shows, and the walk through them.
  const eraOfKey = new Map<RoomKey, Era>();
  for (const zone of plan.zones)
    for (const cell of zone.cells) eraOfKey.set(cell, getEra(zone.era));
  const route = plan.zones.flatMap((zone) => [...zone.cells]);
  const numbering = plan.numbering ?? route;
  const titleOfKey = new Map<RoomKey, string>();
  for (const zone of plan.zones)
    for (const cell of zone.cells) if (zone.own?.name) titleOfKey.set(cell, zone.own.name);

  const rooms: RoomLayout[] = [];
  const byKey = new Map<RoomKey, RoomLayout>();
  const add = (key: RoomKey, room: RoomLayout) => {
    rooms.push(room);
    byKey.set(key, room);
  };
  for (const { key, rect: r, design, top } of BLOCK_HALLS) {
    if (top !== undefined && index > top) continue;
    const room = makeRoom(index, key, r, floorEra, {
      title: HALL_NAMES[key] ?? (design === "court" ? "Court" : "Stair Hall"),
      isStairwell: true,
      isAnchor: key === GREAT_HALL,
    });
    room.paletteId = HALL_PALETTE[key] ?? STAIR_PALETTE;
    add(key, room);
  }
  for (const { key, rect: r } of BLOCK_SPIRALS) {
    const room = makeRoom(index, key, r, floorEra, {
      title: HALL_NAMES[key] ?? "Stairs",
      isStairwell: true,
    });
    room.paletteId = STAIR_PALETTE;
    add(key, room);
  }
  for (const { key, rect: r } of BLOCK_ROOMS) {
    const era = eraOfKey.get(key) ?? floorEra;
    add(key, makeRoom(index, key, r, era, { title: era.title }));
  }

  // A door in the middle of every wall two rooms share, but for a stair
  // hall: on every floor the portal its stair faces, and a door in each
  // side wall by the foot of the side flight (`HALL_SIDE_DOOR`). The
  // back wall faces the cell of the spine that is no room.
  const fronts = new Map<RoomKey, Side>(
    BLOCK_HALLS.filter((h) => h.design === "loggia").map((h) => [h.key, hallFront(h)]),
  );
  const sideDoorAt = (hall: RoomLayout, front: Side): number => {
    const r = hall.cellBounds;
    if (front === "east") return (r.xMax + 1) * CELL_SIZE - HALL_SIDE_DOOR;
    if (front === "west") return r.xMin * CELL_SIZE + HALL_SIDE_DOOR;
    if (front === "south") return (r.zMax + 1) * CELL_SIZE - HALL_SIDE_DOOR;
    return r.zMin * CELL_SIZE + HALL_SIDE_DOOR;
  };
  const keys = [...byKey.keys()];
  const isPortal = (a: RoomKey, b: RoomKey) =>
    PORTALS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = byKey.get(keys[i])!;
      const b = byKey.get(keys[j])!;
      const side = wallBetween(a.cellBounds, b.cellBounds);
      if (!side) continue;
      const salon = keys[i] === "salon" ? keys[j] : keys[j] === "salon" ? keys[i] : null;
      if (salon !== null && salon !== SALON_DOOR) continue;
      const aFront = fronts.get(keys[i]);
      const bFront = fronts.get(keys[j]);
      // A hall's back wall stands against no room, so a wall it shares
      // is its front or a side.
      let along: number | undefined;
      if (aFront && aFront !== side) along = sideDoorAt(a, aFront);
      if (bFront && bFront !== OPPOSITE[side]) along = sideDoorAt(b, bFront);
      const portal = isPortal(keys[i], keys[j]);
      connect(
        a,
        b,
        side,
        portal ? PORTAL_WIDTH : BLOCK_DOOR_WIDTH,
        portal ? PORTAL_HEIGHT : BLOCK_DOOR_HEIGHT,
        along,
      );
    }
  }

  // Dividers and benches need the doors.
  for (const { key } of BLOCK_ROOMS) {
    const room = byKey.get(key)!;
    const screens = plan.screens
      .filter(([cell]) => cell === key)
      .map(([, toward]) => byKey.get(toward)?.id)
      .flatMap((id) => room.doors.filter((d) => d.connectsTo.roomId === id));
    room.dividers = planDividers(room.cellBounds, room.doors, {
      style: plan.styles[key],
      screens,
    });
    // Benches keep further from a screen than `planBenches` does: a
    // bay bench a metre from a screen's picture is in the way of it.
    room.benches = planBenches(room.cellBounds, room.doors, room.dividers).filter((b) =>
      benchClearOf(b, room.dividers, ISLAND_CLEARANCE),
    );
    // A room with no walls but a door screen is seated on its own
    // lines: on its centre when there is no way straight through it, in
    // front of its one wall without a door when there is. `planBenches`
    // keeps clear of every door's line and so stands the island in one
    // quarter of it.
    const clear = (island: Bench[] | null) =>
      island?.every((b) => benchClearOf(b, room.dividers, ISLAND_CLEARANCE)) ? island : null;
    if (room.dividers.every((d) => d.bare)) {
      room.benches =
        clear(centredIsland(room.cellBounds, room.doors)) ??
        clear(wallIsland(room.cellBounds, room.doors)) ??
        room.benches;
    }
    // A room with panels is seated on the lines of its panels. All of
    // it before the hang, which puts a work in front of each bench.
    room.benches = [...room.benches, ...planPanelBenches(room)];
    // A room whose panels give no place, and that no one walks straight
    // through, takes the island on its centre when that stands clear.
    if (room.benches.length === 0) {
      room.benches = clear(centredIsland(room.cellBounds, room.doors)) ?? [];
    }
    const { xMin, xMax, zMin, zMax } = room.cellBounds;
    const hasFloor = (bench: Bench) => {
      const r = benchRect(bench);
      const floor = Math.min(
        r.xMin - xMin * CELL_SIZE,
        (xMax + 1) * CELL_SIZE - r.xMax,
        r.zMin - zMin * CELL_SIZE,
        (zMax + 1) * CELL_SIZE - r.zMax,
      );
      return floor >= BENCH_WALL_FLOOR - 1e-9;
    };
    // A door screen's picture has a bench square in front of it, and
    // the benches of the room's other lines beside that one give way.
    const facing = screenBenches(room).filter(hasFloor);
    const apart = (bench: Bench) =>
      facing.every((f) => Math.hypot(f.x - bench.x, f.z - bench.z) >= SCREEN_BENCH_ROOM);
    room.benches = [...facing, ...room.benches.filter((b) => hasFloor(b) && apart(b))];
    // A room still without a seat takes an island in front of its one
    // wall without a door: in the artist's room, where its wing walls
    // leave the bays too shallow, the north wall that ends the court's
    // short axis.
    if (room.benches.length === 0) {
      const island = clear(wallIsland(room.cellBounds, room.doors));
      room.benches = island?.every(hasFloor) ? island : [];
    }
  }

  // The court's floor is seated in front of its north and south walls,
  // where the floor's largest giants hang, one to a stretch. Its floors
  // above are a gallery 5 m wide: no seat.
  if (index === 0) {
    const court = byKey.get(GREAT_HALL)!;
    const middles = hallRuns(court)
      .filter((run) => run.side === "north")
      .map(stretchMiddle);
    court.benches = courtIslands(court.cellBounds, middles);
    const salon = BLOCK_HALLS.find((h) => h.design === "salon");
    const room = salon && byKey.get(salon.key);
    const far = salon && OPPOSITE[hallFront(salon)];
    if (room && (far === "north" || far === "south")) {
      room.benches = salonIslands(room.cellBounds, far, room.doors[0]?.worldX ?? 0);
    }
  }

  const walkable = new Uint8Array(BLOCK_GRID.x * BLOCK_GRID.z);
  const cellOwner = new Int16Array(BLOCK_GRID.x * BLOCK_GRID.z).fill(-1);
  rooms.forEach((r, i) => {
    for (let x = r.cellBounds.xMin; x <= r.cellBounds.xMax; x++) {
      for (let z = r.cellBounds.zMin; z <= r.cellBounds.zMax; z++) {
        walkable[z * BLOCK_GRID.x + x] = 1;
        cellOwner[z * BLOCK_GRID.x + x] = i;
      }
    }
  });
  const { blockedEdgesEW, blockedEdgesNS } = computeBlockedEdges(BLOCK_GRID, rooms, cellOwner);

  const floor: FloorLayout = {
    index,
    era: floorEra,
    title: plan.title,
    blurb: plan.blurb,
    y: floorY(index),
    gridSize: { ...BLOCK_GRID },
    walkable,
    cellOwner,
    blockedEdgesEW,
    blockedEdgesNS,
    rooms,
    stairsIn: [],
    stairsOut: [],
    grandStairsIn: [],
    grandStairsOut: [],
    grandHalls: [],
  };

  // The works of a room of their own hang in it alone: the other rooms
  // of the floor take none of them.
  const owned = plan.zones.flatMap((z) => (z.own ? [z.own] : []));
  const hang = (byEra: Map<EraId, ArtworkListing[]>, must: ReadonlySet<string>) => {
    for (const zone of plan.zones) {
      const { own } = zone;
      const works = (byEra.get(zone.era) ?? []).filter((a) =>
        own ? ownRoomHolds(own, a) : !owned.some((o) => ownRoomHolds(o, a)),
      );
      hangZone(
        floor,
        zone.cells.map((k) => byKey.get(k)!),
        getEra(zone.era),
        works,
        zone.coverage ?? BLOCK_WALL_COVERAGE,
        must,
      );
    }

    for (const key of route) {
      const room = byKey.get(key)!;
      const era = eraOfKey.get(key) ?? floorEra;
      room.artworks = room.placements.map((p) => p.artwork);
      room.roomNumber = numbering.indexOf(key) + 1;
      room.movement = dominantMovement(room.artworks, era) ?? era.title;
      room.title = titleOfKey.get(key) ?? roomTitle(room.artworks, era);
      room.description = roomDescription(room.artworks, room.title);
    }
  };
  return { floor, hang };
}

/** Hang one era in its rooms. Works with the sharpest scans come first:
 *  an artist's share of the wall goes to their best-scanned works. */
function hangZone(
  floor: FloorLayout,
  zoneRooms: RoomLayout[],
  era: Era,
  allCandidates: ArtworkListing[],
  coverage: number,
  /** Works that hang whenever a wall of the era's rooms holds them,
   *  whatever the sample: the giants no hall took. */
  must: ReadonlySet<string>,
) {
  // A work hangs at its real size or not at all. One that no wall of
  // the era's rooms holds, and no hall took, is left out here, before
  // it takes a share of the wall.
  const runs = zoneRooms.flatMap((room) => computeRoomRuns(room, REAL_SIZE));
  const candidates = allCandidates.filter((a) => fitsSomeRun(sizeWork(a, REAL_SIZE), runs));
  const wallOf = (room: RoomLayout) =>
    computeRoomRuns(room).reduce((sum, run) => sum + runLength(run), 0);
  const walls = zoneRooms.map(wallOf);
  const budget = walls.reduce((a, b) => a + b, 0) * coverage;

  const metres = (works: ArtworkListing[]) =>
    works.reduce((sum, a) => sum + wallFootprint(a, REAL_SIZE), 0);
  const sample = (count: number) =>
    selectFloorWorks(candidates, count, (a) => texturePxPerMetre(a) ?? 0);
  // The sample is by count and the wall is in metres. An artist's
  // sharpest scans are their smaller works, so a count from the era's
  // mean footprint covered 0.38 of two eras' wall where 0.45 was asked.
  // Take more until the sample covers the wall.
  let count = Math.floor(
    budget / Math.max(0.5, metres(candidates) / Math.max(1, candidates.length)),
  );
  let chosen = sample(count);
  while (chosen.length < candidates.length && metres(chosen) < budget) {
    count = Math.min(candidates.length, Math.ceil(count * 1.1) + 1);
    chosen = sample(count);
  }
  // Then trim to the wall it has to fit, the works that must hang first.
  chosen = [
    ...candidates.filter((a) => must.has(a.id)),
    ...shuffleByIdHash(chosen).filter((a) => !must.has(a.id)),
  ];
  let used = 0;
  chosen = chosen.filter((a) => {
    const need = wallFootprint(a, REAL_SIZE);
    if (used + need > budget) return false;
    used += need;
    return true;
  });

  // Hung as a museum hangs them: school by school, each artist's works
  // together (curation.ts), dealt into the rooms in the order of the walk.
  const queue = curatedQueue(era, chosen);
  const fills = fillRooms(walls, queue, era);
  zoneRooms.forEach((room, i) => {
    room.artworks = fills[i].artworks;
  });

  // Spill stays inside the era: the placer sees only its rooms.
  const stats = distributePaintings(
    { ...floor, rooms: zoneRooms },
    {
      anchorToBenches: true,
      ...REAL_SIZE,
    },
  );
  if (stats.dropped > 0 && process.env.NODE_ENV !== "production") {
    console.warn(`[gallery-layout] ${era.title}: ${stats.dropped} works did not fit their rooms`);
  }

  const accentByMovement = new Map<string, number>();
  for (const room of zoneRooms) {
    const movement =
      dominantMovement(
        room.placements.map((p) => p.artwork),
        era,
      ) ?? era.title;
    let accent = accentByMovement.get(movement);
    if (accent === undefined) {
      accent = accentByMovement.size;
      accentByMovement.set(movement, accent);
    }
    room.floorColor = eraAccentColor(era, accent);
  }
}

// --- Rooms, doors, stairs -------------------------------------------------

function makeRoom(
  floorIndex: number,
  key: string,
  r: CellRect,
  era: Era,
  opts: { title: string; isStairwell?: boolean; isAnchor?: boolean },
): RoomLayout {
  return {
    id: slugify(`f${floorIndex}-${key}`) || `f${floorIndex}-${key}`,
    floorIndex,
    era: era.id,
    movement: opts.title,
    title: opts.title,
    description: opts.title,
    isAnchor: opts.isAnchor ?? false,
    roomNumber: null,
    isStairwell: opts.isStairwell ?? false,
    cellBounds: { ...r },
    worldRect: {
      xMin: r.xMin * CELL_SIZE + WALL_THICKNESS,
      xMax: (r.xMax + 1) * CELL_SIZE - WALL_THICKNESS,
      zMin: r.zMin * CELL_SIZE + WALL_THICKNESS,
      zMax: (r.zMax + 1) * CELL_SIZE - WALL_THICKNESS,
      y: floorY(floorIndex),
    },
    doors: [],
    ceilingHeight: ceilingHeightFor(r),
    dividers: [],
    benches: [],
    placements: [],
    artworks: [],
    floorColor: era.palette.floorColor,
  };
}

/** The side of room `a` that room `b` stands against, or null when the
 *  two share no wall long enough for a door. */
function wallBetween(a: CellRect, b: CellRect): Side | null {
  const shared = (aMin: number, aMax: number, bMin: number, bMax: number) =>
    Math.min(aMax, bMax) - Math.max(aMin, bMin) + 1 >= MIN_SHARED_CELLS;
  const zOverlap = shared(a.zMin, a.zMax, b.zMin, b.zMax);
  const xOverlap = shared(a.xMin, a.xMax, b.xMin, b.xMax);
  if (zOverlap && a.xMax + 1 === b.xMin) return "east";
  if (zOverlap && b.xMax + 1 === a.xMin) return "west";
  if (xOverlap && a.zMax + 1 === b.zMin) return "south";
  if (xOverlap && b.zMax + 1 === a.zMin) return "north";
  return null;
}

const OPPOSITE: Record<Side, Side> = { north: "south", south: "north", east: "west", west: "east" };

/** A door between two rooms that share a wall, at `along` (world metres
 *  along the wall) or in the middle of the stretch they share. `side` is
 *  the side of `a` that `b` is on. */
function connect(
  a: RoomLayout,
  b: RoomLayout,
  side: Side,
  width: number,
  height: number,
  along?: number,
) {
  const ra = a.cellBounds;
  const rb = b.cellBounds;
  let worldX: number;
  let worldZ: number;
  const mid = (lo: number, hi: number) => along ?? (Math.floor((lo + hi) / 2) + 0.5) * CELL_SIZE;
  if (side === "east" || side === "west") {
    worldX = (side === "east" ? ra.xMax + 1 : ra.xMin) * CELL_SIZE;
    worldZ = mid(Math.max(ra.zMin, rb.zMin), Math.min(ra.zMax, rb.zMax));
  } else {
    worldZ = (side === "south" ? ra.zMax + 1 : ra.zMin) * CELL_SIZE;
    worldX = mid(Math.max(ra.xMin, rb.xMin), Math.min(ra.xMax, rb.xMax));
  }
  const door = (room: RoomLayout, s: Side, other: RoomLayout): Door => ({
    side: s,
    worldX,
    worldZ,
    worldY: room.worldRect.y,
    width,
    height,
    portal: true,
    connectsTo: { kind: "room", roomId: other.id },
  });
  a.doors.push(door(a, side, b));
  b.doors.push(door(b, OPPOSITE[side], a));
}

function buildStair(
  lower: FloorLayout,
  upper: FloorLayout,
  hall: (typeof BLOCK_HALLS)[number],
  topFloor: number,
  hasFlightBelow: boolean,
  hasFlightAbove: boolean,
  bridges?: CourtBridges,
): GrandStair {
  // The stair is set out from the hall's front wall: its frame is the
  // square the hall's width makes there, and the end wall may stand
  // inside that square (`back`).
  const r = hall.rect;
  const x0 = r.xMin * CELL_SIZE;
  const x1 = (r.xMax + 1) * CELL_SIZE;
  const z0 = r.zMin * CELL_SIZE;
  const z1 = (r.zMax + 1) * CELL_SIZE;
  const alongX = hall.turns % 2 === 1;
  const half = (alongX ? z1 - z0 : x1 - x0) / 2;
  const front = hallFront(hall);
  const centre = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  if (front === "east") centre.x = x1 - half;
  if (front === "west") centre.x = x0 + half;
  if (front === "south") centre.z = z1 - half;
  if (front === "north") centre.z = z0 + half;
  const back = alongX ? x1 - x0 - half : z1 - z0 - half;
  return buildGrandStair({
    id: `${hall.key}-${lower.index}-to-${upper.index}`,
    design: hall.design,
    lowerFloor: lower.index,
    upperFloor: upper.index,
    topFloor,
    lowerLabel: floorTitle(lower),
    upperLabel: floorTitle(upper),
    lowerY: lower.y,
    upperY: upper.y,
    centerX: centre.x,
    centerZ: centre.z,
    half,
    back,
    turns: hall.turns,
    hasFlightBelow,
    hasFlightAbove,
    bridges,
  });
}

/** One revolution of a spiral, from one floor to the next. */
function buildSpiral(
  lower: FloorLayout,
  upper: FloorLayout,
  shaft: (typeof BLOCK_SPIRALS)[number],
): Staircase {
  const r = shaft.rect;
  // `atan2(dz, dx)` of the wall the court is behind.
  const toward: Record<Side, number> = {
    east: 0,
    south: Math.PI / 2,
    west: Math.PI,
    north: -Math.PI / 2,
  };
  return {
    id: `${shaft.key}-${lower.index}-to-${upper.index}`,
    lowerFloor: lower.index,
    upperFloor: upper.index,
    lowerLabel: floorTitle(lower),
    upperLabel: floorTitle(upper),
    centerX: ((r.xMin + r.xMax + 1) / 2) * CELL_SIZE,
    centerZ: ((r.zMin + r.zMax + 1) / 2) * CELL_SIZE,
    innerRadius: SPIRAL_INNER_RADIUS,
    outerRadius: SPIRAL_OUTER_RADIUS,
    numSteps: SPIRAL_STEPS_PER_FLOOR,
    direction: 1,
    lowerY: lower.y,
    upperY: upper.y,
    entryAngle: toward[shaft.door],
  };
}
