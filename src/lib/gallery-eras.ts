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
