// Era definitions for the multi-floor 3D gallery.
// Each era becomes one floor: floor 0 (ground) = oldest, floor N = newest.
// Eras group art movements into broader historical periods. Movement
// names match what `scripts/build-data.mjs` emits.

import type { Artwork } from "./data";

export type Palette = {
  wallColor: string;
  floorColor: string;
  ceilingColor: string;
  accent: string;
  /** Per-room floor tints. Each room hashes its id into this list so
   *  every room on a floor reads as a slightly different shade while
   *  the era as a whole still feels cohesive. Authored dark — these
   *  multiply against the era's `floorColor` mood, they don't pop. */
  roomAccents: string[];
  /** Poly Haven wall texture slug (downloaded by `pnpm textures`).
   *  Currently unused: palette-materials.ts renders walls as flat
   *  tinted plaster regardless. The field stays here so re-enabling
   *  per-era wall textures is a one-line change in palette-materials.
   *  Floors are handled separately — every era shares one
   *  building-wide floor texture, hard-coded in palette-materials. */
  wallTexture?: string;
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
  | "natural-history"
  | "realism"
  | "ukiyo-e"
  | "fin-de-siecle"
  | "post-impressionism"
  | "modernism";

export const ERAS: Era[] = [
  {
    id: "gothic",
    index: 0,
    title: "Gothic & Early Renaissance",
    yearMin: 0,
    yearMax: 1499,
    movements: ["Gothic", "International Gothic", "Proto-Renaissance", "Byzantine"],
    palette: {
      wallColor: "#e8dcbd",
      floorColor: "#3a2a1f",
      ceilingColor: "#f3e9cf",
      accent: "#c68642",
      // Cool stone + plum + teal — medieval cathedral floor stones, each
      // worn a different colour from centuries of foot traffic.
      roomAccents: ["#3a2a1f", "#2e3540", "#3a2e3f", "#293a36", "#3d2e22"],
    },
    blurb: "Gold ground and tempera — the long medieval morning.",
    anchor: {
      // Most pre-1500 works in the corpus lack an explicit movement tag
      // and bucket under the era title. The configured anchor is mainly
      // a hint; resolveAnchorMovement falls back to the biggest bucket
      // when this name isn't present, which is the right behaviour here.
      movement: "Gothic",
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
    movements: ["Renaissance", "Northern Renaissance", "Mannerism"],
    palette: {
      wallColor: "#ece2c9",
      floorColor: "#3a2a1f",
      ceilingColor: "#f4ead2",
      accent: "#b98a4f",
      // Warm earth: terracotta, sienna, olive, chocolate.
      roomAccents: ["#3a2a1f", "#3f2820", "#3a2e1c", "#322318", "#42301f"],
    },
    blurb: "Leonardo, Michelangelo, Raphael — perspective made a language.",
    anchor: {
      movement: "Renaissance",
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
      accent: "#8a5a2b",
      // Tenebrist velvets: charcoal, wine, midnight, forest.
      roomAccents: ["#221711", "#2a1418", "#1a1822", "#1f261b", "#1a1612"],
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
    movements: ["Rococo", "Neoclassicism", "Enlightenment"],
    palette: {
      wallColor: "#e4d7b4",
      floorColor: "#2e2015",
      ceilingColor: "#f1e7cd",
      accent: "#c49a66",
      // Refined drawing-room tones: muted plum, sage, rose-brown, dusty blue.
      roomAccents: ["#2e2015", "#3a2a35", "#28332a", "#3a2c22", "#28303a"],
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
    title: "Romanticism & the Sublime",
    // Keeps the 1800–1869 year-fallback bucket — any untagged 19th-c
    // work without a movement lands here. The two sibling floors below
    // (natural-history, realism) are movement-only (yearMin>yearMax)
    // so they never poach the year-fallback.
    yearMin: 1800,
    yearMax: 1869,
    movements: [
      "Romanticism",
      "Pre-Raphaelite",
      "Pre-Raphaelite Brotherhood",
      "Hudson River School",
    ],
    palette: {
      wallColor: "#c8c1ad",
      floorColor: "#1e1711",
      ceilingColor: "#dcd3bd",
      accent: "#6e4f2e",
      // Stormy weather underfoot: storm-blue, slate, rust, moss.
      roomAccents: ["#1e1711", "#1a2230", "#2a221c", "#2e1f17", "#1f261c"],
    },
    blurb: "The sublime, the storm, and the literary dream.",
    anchor: {
      movement: "Romanticism",
      minCells: { x: 9, z: 9 },
      preferredLocation: "center",
    },
  },
  {
    id: "natural-history",
    index: 5,
    title: "Natural History Illustration",
    // Movement-only — see ukiyo-e for the rationale on yearMin>yearMax.
    // The cohort (Audubon 1827–1838, Haeckel 1899–1904) spans nearly a
    // century, so a year range would either undershoot Haeckel or
    // overshoot into Romantic and fin-de-siècle European painting.
    yearMin: 9999,
    yearMax: 0,
    movements: ["Natural history illustration"],
    palette: {
      // Specimen-plate cream walls, deep moss floor, brass-olive accent
      // — Victorian natural-history museum, lit so the plates' fine
      // line work reads cleanly against the wall.
      wallColor: "#ddd2af",
      floorColor: "#1a1f17",
      ceilingColor: "#ebe1c2",
      accent: "#6a7d3f",
      // Field colours under glass: moss, walnut, slate-sky, deep bog, ochre-soil.
      roomAccents: ["#1a1f17", "#241a12", "#1c2630", "#1a241c", "#2a2218"],
    },
    blurb: "Audubon's birds and Haeckel's forms — the natural world catalogued.",
    anchor: {
      movement: "Natural history illustration",
      minCells: { x: 9, z: 9 },
      preferredLocation: "center",
    },
  },
  {
    id: "realism",
    index: 6,
    title: "Realism & Academy",
    // Movement-only — see ukiyo-e. Year-fallback for 1800–1869
    // already lands on the Romanticism floor (above); claiming the
    // same range here would either split the fallback unpredictably
    // (first-match-wins iteration order) or duplicate works.
    yearMin: 9999,
    yearMax: 0,
    movements: ["Realism", "Academicism", "Academic art", "Orientalism"],
    palette: {
      // Warm rose-tan walls, dark walnut floor, salon-red accent —
      // 19th-c Paris Salon hang, deep velvet drag on the floor and
      // brick-red trim where the gilt frames would rest.
      wallColor: "#d8b9a3",
      floorColor: "#221814",
      ceilingColor: "#ecd9c2",
      accent: "#8a3a2c",
      // Salon velvets: wine, deep teal, olive, charcoal, plum.
      roomAccents: ["#221814", "#1c2628", "#262218", "#1d1614", "#28181f"],
    },
    blurb: "Studio realism, salon polish, and the gaze East.",
    anchor: {
      movement: "Realism",
      minCells: { x: 7, z: 7 },
      preferredLocation: "center",
    },
  },
  {
    id: "ukiyo-e",
    index: 7,
    title: "East Asian Painting",
    // Movement-tag only: yearMin > yearMax keeps the year-fallback in
    // assignEra from accidentally placing untagged 18th/19th-c
    // European work here. East Asian paintings span ~900–1940
    // chronologically; slotting them by year would scoop up Western
    // painting from the same period.
    yearMin: 9999,
    yearMax: 0,
    // The floor covers four East Asian traditions:
    //   - Ukiyo-e: Edo woodblock prints
    //   - Shin-hanga: early-20th-c successor to Ukiyo-e
    //   - Nihonga: Meiji-era Japanese painting (incl. Western-style Yōga)
    //   - Classical East Asian: everything pre-Edo — Song/Yuan/Ming
    //     Chinese landscape, Zen ink, Kanō school, Rinpa, Sumi-e.
    // Without these aliases the East Asian cohort falls through by
    // year and reads as wildly out of place on European floors
    // (Chinese Song-dynasty ink on the Gothic floor, Hokusai-era
    // prints on the Romantic floor, etc.).
    movements: ["Ukiyo-e", "Shin-hanga", "Nihonga", "Classical East Asian"],
    palette: {
      // Rice-paper warm white walls, dark walnut + black floor, red
      // lacquer accent. Mirrors a traditional Edo gallery — the
      // redLacquer frame variant is already coded for these works.
      wallColor: "#efe6ce",
      floorColor: "#1a120c",
      ceilingColor: "#f3eccf",
      accent: "#a23b2c",
      roomAccents: ["#1a120c", "#2c1a18", "#1a1c25", "#1f2418", "#2a1a16"],
    },
    blurb: "Edo woodblock prints, Song-dynasty ink, and the Floating World.",
    anchor: {
      movement: "Ukiyo-e",
      minCells: { x: 9, z: 9 },
      preferredLocation: "center",
    },
  },
  {
    // Era id retained as "fin-de-siecle" for URL backward compat —
    // /era/fin-de-siecle has been the Impressionism landing since the
    // first multi-floor cut. Title narrowed to Impressionism since
    // Post-Impressionism and Modernism now have their own floors.
    id: "fin-de-siecle",
    index: 8,
    title: "Impressionism",
    // Year fallback for 1870–1899 lands here. Late-19th-c works whose
    // movement is missing — Inness, Eakins, Cassatt, Serov, Levitan —
    // are Impressionism-adjacent and read at home on this floor. The
    // 1900-onwards untagged cohort falls through to the Modernism floor
    // below.
    yearMin: 1870,
    yearMax: 1899,
    // Tonalism (Whistler, late Inness) is an 1870s–1900s idiom — it
    // belongs with the Impressionism-era floor, not Romanticism.
    movements: ["Impressionism", "Neo-Impressionism", "Pointillism", "Tonalism"],
    palette: {
      wallColor: "#f0e7d2",
      floorColor: "#2a1d14",
      ceilingColor: "#f9f1db",
      accent: "#c88a47",
      // Garden dapple: sage, dusty rose, lavender, butter.
      roomAccents: ["#2a1d14", "#283325", "#3a2a2e", "#2e2838", "#3a3220"],
    },
    blurb: "Plein-air light, broken colour, and modern Paris.",
    anchor: {
      movement: "Impressionism",
      minCells: { x: 9, z: 9 },
      preferredLocation: "center",
    },
  },
  {
    id: "post-impressionism",
    index: 9,
    title: "Post-Impressionism & Symbolism",
    // Movement-only — year range would overlap both adjacent floors
    // (Imp 1870–1899, Modernism 1900+) and split unpredictably under
    // first-match-wins iteration. Symbolism + Art Nouveau merge here
    // because the cohort (Munch, Mucha) shares the colour-and-emotion-
    // past-impressionism identity with van Gogh and Gauguin more than
    // either the plein-air or fragmentation neighbours.
    yearMin: 9999,
    yearMax: 0,
    // "Naive art" lives here because Rousseau — the canonical Naive
    // painter — is chronologically and visually adjacent to the
    // Post-Impressionists / Symbolists. Musée d'Orsay groups them the
    // same way. Without this alias Rousseau falls through to the
    // year-fallback and splits awkwardly across Impressionism and
    // Modernism floors.
    movements: ["Post-Impressionism", "Les Nabis", "Symbolism", "Art Nouveau", "Naive art"],
    palette: {
      // Warm wheat walls, deep aubergine floor, violet accent —
      // van Gogh starry-night complementaries crossed with Munch
      // bruised palette and Mucha's jewel-tone posters.
      wallColor: "#e6d6b0",
      floorColor: "#1a1419",
      ceilingColor: "#f0e2bd",
      accent: "#6e3a8a",
      // Sunflower ochre, starry-night blue, deep wine, Mucha jade, Gauguin red-clay.
      roomAccents: ["#1a1419", "#1a1c30", "#2a1418", "#1a2a22", "#2e1a14"],
    },
    blurb: "Saturated colour, decorative line, and the dream made visible.",
    anchor: {
      movement: "Post-Impressionism",
      minCells: { x: 7, z: 7 },
      preferredLocation: "center",
    },
  },
  {
    id: "modernism",
    index: 10,
    title: "Modernism",
    // Takes the 1900+ year-fallback. Untagged early-20th-c works in
    // the corpus (Delaunay, Kirchner, Malevich, Gris, Bakst,
    // Kustodiev) are mostly avant-garde-adjacent and bucket cleanly
    // here. The 1930s American cohort (Wood, Hopper) lacks a better
    // home — Regionalism + American Realism live here for now.
    yearMin: 1900,
    yearMax: 9999,
    movements: [
      "Fauvism",
      "Expressionism",
      "Cubism",
      "Surrealism",
      "Abstract Expressionism",
      "Regionalism",
      "American Realism",
      "Dada",
      "Futurism",
      "Constructivism",
      "Bauhaus",
      "De Stijl",
      "Precisionism",
      // Russian turn-of-the-century group (Kustodiev, Bakst, Benois) —
      // its painters sit with the early-20th-c cohort already on this
      // floor, and the corpus' dated Kustodievs land here by year.
      "Mir Iskusstva",
    ],
    palette: {
      // Warm gallery-white walls, near-black polished floor, primary-
      // red accent — Bauhaus-adjacent without going full white cube.
      wallColor: "#efe8db",
      floorColor: "#101010",
      ceilingColor: "#f6f1e6",
      accent: "#c5402c",
      // Mondrian-leaning primaries muted to room tints: blue, red, ochre, charcoal, off-black.
      roomAccents: ["#101010", "#10182a", "#2a1010", "#2a2210", "#181818"],
    },
    blurb: "Fragmentation, abstraction, and the 20th century's break.",
    anchor: {
      movement: "Cubism",
      minCells: { x: 7, z: 7 },
      preferredLocation: "center",
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
export function assignEra(artwork: Pick<Artwork, "movement" | "year">): EraId | null {
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
