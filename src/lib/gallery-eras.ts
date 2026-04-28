// Era definitions for the multi-floor dungeon gallery.
// Each era becomes one floor: floor 0 (ground) = oldest, floor N = newest.
// Eras group art movements into 7 broader historical periods. Movement
// names match what `scripts/build-data.mjs` emits.

import type { Artwork } from "./data";

export type Palette = {
  wallColor: string;
  floorColor: string;
  ceilingColor: string;
  lampTint: string;
  accent: string;
  /** Per-room floor tints. Each room hashes its id into this list so
   *  every room on a floor reads as a slightly different shade while
   *  the era as a whole still feels cohesive. Authored dark — these
   *  multiply against the era's `floorColor` mood, they don't pop. */
  roomAccents: string[];
  /** Poly Haven texture slugs (downloaded by `pnpm textures`). The
   *  diffuse / normal / ARM maps land at /public/textures/<slug>/.
   *  Leave undefined to keep the surface as a flat tinted material —
   *  useful while assets are still downloading or for eras that read
   *  better un-textured. */
  wallTexture?: string;
  floorTexture?: string;
};

export type AnchorSpec = {
  /** Movement name that should always get the era's grand hall. */
  movement: string;
  /** Minimum room footprint in generator cells. */
  minCells: { x: number; z: number };
  /** Where to place it on the floor's grid. */
  preferredLocation: "center" | "back" | "wing";
};

export type Era = {
  id: EraId;
  index: number;
  title: string;
  /** Inclusive year range. */
  yearMin: number;
  yearMax: number;
  /** Canonical movement names this era claims. */
  movements: string[];
  palette: Palette;
  blurb: string;
  anchor: AnchorSpec;
};

export type EraId =
  | "gothic"
  | "renaissance"
  | "baroque"
  | "enlightenment"
  | "romantic"
  | "fin-de-siecle"
  | "modern";

export const ERAS: Era[] = [
  {
    id: "gothic",
    index: 0,
    title: "Gothic & Early Renaissance",
    yearMin: 0,
    yearMax: 1499,
    movements: [
      "Early Renaissance",
      "Gothic",
      "International Gothic",
      "Proto-Renaissance",
      "Byzantine",
    ],
    palette: {
      wallColor: "#e8dcbd",
      floorColor: "#3a2a1f",
      ceilingColor: "#f3e9cf",
      lampTint: "#ffcfa0",
      accent: "#c68642",
      // Cool stone + plum + teal — medieval cathedral floor stones, each
      // worn a different colour from centuries of foot traffic.
      roomAccents: ["#3a2a1f", "#2e3540", "#3a2e3f", "#293a36", "#3d2e22"],
      wallTexture: "medieval_blocks_02",
      floorTexture: "worn_planks",
    },
    blurb: "Gold ground and tempera — the long medieval morning.",
    anchor: {
      movement: "Early Renaissance",
      minCells: { x: 7, z: 7 },
      preferredLocation: "center",
    },
  },
  {
    id: "renaissance",
    index: 1,
    title: "Renaissance & Mannerism",
    yearMin: 1500,
    yearMax: 1599,
    movements: [
      "High Renaissance",
      "Northern Renaissance",
      "Venetian Renaissance",
      "Mannerism",
      "Northern Mannerism",
      "Renaissance",
    ],
    palette: {
      wallColor: "#ece2c9",
      floorColor: "#3a2a1f",
      ceilingColor: "#f4ead2",
      lampTint: "#ffd9a5",
      accent: "#b98a4f",
      // Warm earth: terracotta, sienna, olive, chocolate.
      roomAccents: ["#3a2a1f", "#3f2820", "#3a2e1c", "#322318", "#42301f"],
      wallTexture: "plastered_stone_wall",
      floorTexture: "marble_01",
    },
    blurb: "Leonardo, Michelangelo, Raphael — perspective made a language.",
    anchor: {
      movement: "High Renaissance",
      minCells: { x: 9, z: 9 },
      preferredLocation: "center",
    },
  },
  {
    id: "baroque",
    index: 2,
    title: "Baroque & the Dutch Golden Age",
    yearMin: 1600,
    yearMax: 1699,
    movements: [
      "Baroque",
      "Dutch Golden Age",
      "Caravaggisti",
      "Flemish Baroque",
      "Spanish Golden Age",
    ],
    palette: {
      wallColor: "#d4cdb9",
      floorColor: "#221711",
      ceilingColor: "#e8ddc3",
      lampTint: "#ffd09a",
      accent: "#8a5a2b",
      // Tenebrist velvets: charcoal, wine, midnight, forest.
      roomAccents: ["#221711", "#2a1418", "#1a1822", "#1f261b", "#1a1612"],
      wallTexture: "plastered_stone_wall",
      floorTexture: "marble_tiles",
    },
    blurb: "Drama, tenebrism, motion — Caravaggio's shadow across Europe.",
    anchor: {
      movement: "Baroque",
      minCells: { x: 9, z: 9 },
      preferredLocation: "center",
    },
  },
  {
    id: "enlightenment",
    index: 3,
    title: "Rococo & Neoclassicism",
    yearMin: 1700,
    yearMax: 1799,
    movements: ["Rococo", "Neoclassicism", "Enlightenment", "Ukiyo-e"],
    palette: {
      wallColor: "#e4d7b4",
      floorColor: "#2e2015",
      ceilingColor: "#f1e7cd",
      lampTint: "#ffe0b5",
      accent: "#c49a66",
      // Refined drawing-room tones: muted plum, sage, rose-brown, dusty blue.
      roomAccents: ["#2e2015", "#3a2a35", "#28332a", "#3a2c22", "#28303a"],
      wallTexture: "painted_plaster_wall",
      floorTexture: "wood_floor_deck",
    },
    blurb: "Ornament gives way to antique clarity.",
    anchor: {
      movement: "Neoclassicism",
      minCells: { x: 7, z: 7 },
      preferredLocation: "back",
    },
  },
  {
    id: "romantic",
    index: 4,
    title: "Romanticism & Realism",
    yearMin: 1800,
    yearMax: 1869,
    movements: [
      "Romanticism",
      "Realism",
      "Pre-Raphaelite",
      "Pre-Raphaelite Brotherhood",
      "Hudson River School",
      "Academicism",
      "Academicism / Orientalism",
      "Academic art",
      "Orientalism",
      "Natural history illustration",
      "Tonalism / Aestheticism",
    ],
    palette: {
      wallColor: "#c8c1ad",
      floorColor: "#1e1711",
      ceilingColor: "#dcd3bd",
      lampTint: "#ffd6a0",
      accent: "#6e4f2e",
      // Stormy weather underfoot: storm-blue, slate, rust, moss.
      roomAccents: ["#1e1711", "#1a2230", "#2a221c", "#2e1f17", "#1f261c"],
      wallTexture: "beige_wall_001",
      floorTexture: "worn_planks",
    },
    blurb: "The sublime, the storm, and nothing staged.",
    anchor: {
      movement: "Romanticism",
      minCells: { x: 7, z: 7 },
      preferredLocation: "center",
    },
  },
  {
    id: "fin-de-siecle",
    index: 5,
    title: "Impressionism & Fin-de-siècle",
    yearMin: 1870,
    yearMax: 1909,
    movements: [
      "Impressionism",
      "Impressionism / Realism",
      "Realism / Impressionism",
      "Post-Impressionism",
      "Post-Impressionism / Naïve Art",
      "Neo-Impressionism",
      "Symbolism",
      "Symbolism / Expressionism",
      "Art Nouveau",
      "Scientific illustration / Art Nouveau influence",
      "Nihonga / Bijinga",
      "Pointillism",
      "Les Nabis",
    ],
    palette: {
      wallColor: "#f0e7d2",
      floorColor: "#2a1d14",
      ceilingColor: "#f9f1db",
      lampTint: "#ffe3b4",
      accent: "#c88a47",
      // Garden dapple: sage, dusty rose, lavender, butter.
      roomAccents: ["#2a1d14", "#283325", "#3a2a2e", "#2e2838", "#3a3220"],
      wallTexture: "painted_plaster_wall",
      floorTexture: "wood_floor_deck",
    },
    blurb: "Plein-air light and interior weather.",
    anchor: {
      movement: "Impressionism",
      minCells: { x: 9, z: 9 },
      preferredLocation: "center",
    },
  },
  {
    id: "modern",
    index: 6,
    title: "Modernism",
    yearMin: 1910,
    yearMax: 9999,
    movements: [
      "Fauvism / Modernism",
      "Expressionism",
      "Cubism",
      "Surrealism",
      "Abstract Expressionism",
      "Regionalism",
      "American Realism",
      "Fauvism",
      "Dada",
      "Futurism",
      "Constructivism",
      "Bauhaus",
      "De Stijl",
      "Precisionism",
    ],
    palette: {
      wallColor: "#e8e5de",
      floorColor: "#1a1712",
      ceilingColor: "#f2efe8",
      lampTint: "#ffe6bd",
      accent: "#4a3b2a",
      // Bold-but-darkened modernist: brick, cobalt, mustard, jet, teal.
      roomAccents: ["#1a1712", "#3a1f1a", "#1a2230", "#3a2f15", "#1f3030"],
      wallTexture: "painted_plaster_wall",
      floorTexture: "concrete_floor_painted",
    },
    blurb: "Form shattered, rebuilt, and made raw.",
    anchor: {
      movement: "Fauvism / Modernism",
      minCells: { x: 7, z: 7 },
      preferredLocation: "wing",
    },
  },
];

// --- Era assignment --------------------------------------------------------

const MOVEMENT_TO_ERA: Map<string, EraId> = (() => {
  const m = new Map<string, EraId>();
  for (const era of ERAS) {
    for (const mov of era.movements) {
      m.set(mov.toLowerCase(), era.id);
    }
  }
  return m;
})();

/**
 * Assign an artwork to an era. Priority: explicit movement → year fallback.
 * Returns null only if neither year nor movement produces a match.
 */
export function assignEra(artwork: Artwork): EraId | null {
  if (artwork.movement) {
    const hit = MOVEMENT_TO_ERA.get(artwork.movement.toLowerCase());
    if (hit) return hit;
  }
  if (artwork.year != null) {
    for (const era of ERAS) {
      if (artwork.year >= era.yearMin && artwork.year <= era.yearMax) {
        return era.id;
      }
    }
  }
  return null;
}

export function getEra(id: EraId): Era {
  const era = ERAS.find((e) => e.id === id);
  if (!era) throw new Error(`Unknown era id: ${id}`);
  return era;
}

/** Deterministic per-room floor tint. Same room id always picks the
 *  same accent — keeps the visual identity stable across reloads and
 *  layout regenerations as long as the room id is stable. Falls back
 *  to the era's base floorColor if the palette has no accents
 *  authored. */
export function roomFloorColor(era: Era, roomId: string): string {
  const accents = era.palette.roomAccents;
  if (!accents || accents.length === 0) return era.palette.floorColor;
  // FNV-1a 32-bit — small, deterministic, no allocations.
  let h = 0x811c9dc5;
  for (let i = 0; i < roomId.length; i++) {
    h ^= roomId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const idx = (h >>> 0) % accents.length;
  return accents[idx];
}
