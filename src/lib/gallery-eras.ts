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
      // National Gallery London, Sainsbury Wing: paintings before 1500
      // on pale grey walls with grey pietra serena stone.
      wallColor: "#e0dcd0",
      floorColor: "#3a2a1f",
      ceilingColor: "#f0eee8",
      accent: "#c68642",
      // Cool stone + plum + teal — medieval cathedral floor stones, each
      // worn a different colour from centuries of foot traffic.
      roomAccents: ["#3a2a1f", "#2e3540", "#3a2e3f", "#293a36", "#3d2e22"],
    },
    blurb: "Tempera on wooden panel over gold leaf, painted mostly for altars.",
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
      // Louvre, Salle des États: the Venetians (Titian, Veronese's
      // Wedding Feast at Cana) and the Mona Lisa on midnight blue since
      // the 2019 repaint.
      wallColor: "#24385c",
      floorColor: "#3a2a1f",
      ceilingColor: "#e9e7e0",
      accent: "#b98a4f",
      // Warm earth: terracotta, sienna, olive, chocolate.
      roomAccents: ["#3a2a1f", "#3f2820", "#3a2e1c", "#322318", "#42301f"],
    },
    blurb: "Sixteenth-century painting in Italy and the north, and its Mannerist tail end.",
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
      // Wallace Collection, Great Gallery: Hals, Velázquez, Rubens and
      // Poussin on crimson silk damask, rehung in 2014. The colour only:
      // the wall carries no woven figure.
      wallColor: "#8e1b2b",
      floorColor: "#221711",
      ceilingColor: "#efe6d4",
      accent: "#8a5a2b",
      // Tenebrist velvets: charcoal, wine, midnight, forest.
      roomAccents: ["#221711", "#2a1418", "#1a1822", "#1f261b", "#1a1612"],
    },
    blurb:
      "Hard light out of deep shadow after Caravaggio, and a picture trade in the Dutch Republic.",
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
      // Wallace Collection, Oval Drawing Room: Fragonard's Swing and
      // Boucher's Madame de Pompadour on pale blue-grey silk. The colour
      // is read from photographs; no written source names it.
      wallColor: "#b9c8ce",
      floorColor: "#2e2015",
      ceilingColor: "#f2f1ea",
      accent: "#c49a66",
      // Refined drawing-room tones: muted plum, sage, rose-brown, dusty blue.
      roomAccents: ["#2e2015", "#3a2a35", "#28332a", "#3a2c22", "#28303a"],
    },
    blurb:
      "Rococo pastel and gilt for the first half of the century, Roman severity for the second.",
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
      // Hamburger Kunsthalle, the Caspar David Friedrich room as it
      // reopened in 2016: the Wanderer on green-grey walls.
      wallColor: "#6e7b74",
      floorColor: "#1e1711",
      ceilingColor: "#e8e8e1",
      accent: "#6e4f2e",
      // Stormy weather underfoot: storm-blue, slate, rust, moss.
      roomAccents: ["#1e1711", "#1a2230", "#2a221c", "#2e1f17", "#1f261c"],
    },
    blurb: "Storms, mountains, shipwrecks and ruins, with the figures painted small.",
    anchor: {
      movement: "Romanticism",
      minCells: { x: 9, z: 9 },
      preferredLocation: "center",
    },
  },
  {
    id: "natural-history",
    index: 5,
    title: "Natural History & Botanical Illustration",
    // Movement-only — see ukiyo-e for the rationale on yearMin>yearMax.
    // The cohort (Audubon 1827–1838, Haeckel 1899–1904, Redouté
    // 1802–1816) spans a century, so a year range would either
    // undershoot the later plates or overshoot into Romantic and
    // fin-de-siècle European painting.
    yearMin: 9999,
    yearMax: 0,
    // Zoology and botany share one floor the way a natural-history
    // museum keeps them under one roof. The combined corpus (~1,200
    // works) is far more than one storey can hang one-per-cell, so the
    // floor builder samples it down (see `selectFloorWorks`) — every
    // plate still has its own page, the 3D floor just shows a slice.
    movements: ["Natural history illustration", "Botanical illustration"],
    palette: {
      // No permanent gallery of book plates with a documented wall
      // colour was found. The nearest is a 2016 show of Audubon's Birds
      // of America at the Paine Art Center, hung on green. Deep moss
      // floor and brass-olive accent as before; the cream sheets stand
      // off a green wall where they sank into a cream one.
      wallColor: "#55663f",
      floorColor: "#1a1f17",
      ceilingColor: "#ece6cf",
      accent: "#6a7d3f",
      // Field colours under glass: moss, walnut, slate-sky, deep bog, ochre-soil.
      roomAccents: ["#1a1f17", "#241a12", "#1c2630", "#1a241c", "#2a2218"],
    },
    blurb: "Book plates: Audubon's birds at life size, Redouté's flowers, Haeckel's radiolarians.",
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
      // Musée d'Orsay, as its 2008 annual report describes the Courbet
      // hang: The Painter's Studio and A Burial at Ornans on "rouge
      // pompéien". The Russian Museum's academic hall, where Bryullov's
      // Last Day of Pompeii hangs, is a similar terracotta. Dark walnut
      // floor and salon-red accent as before.
      wallColor: "#8f4a36",
      floorColor: "#221814",
      ceilingColor: "#efe2cf",
      accent: "#8a3a2c",
      // Salon velvets: wine, deep teal, olive, charcoal, plum.
      roomAccents: ["#221814", "#1c2628", "#262218", "#1d1614", "#28181f"],
    },
    blurb:
      "Painting as the academies taught it and the Paris Salon judged it, Orientalism included.",
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
      // Charcoal. The Nezu Museum in Tokyo and the Ando Gallery at the
      // Art Institute of Chicago show screens and scrolls in darkened
      // rooms; sources document the darkness, not a paint colour. Dark
      // walnut floor and red lacquer accent as before, and the
      // redLacquer frame variant is coded for these works.
      wallColor: "#403a34",
      floorColor: "#1a120c",
      ceilingColor: "#efe9d6",
      accent: "#a23b2c",
      roomAccents: ["#1a120c", "#2c1a18", "#1a1c25", "#1f2418", "#2a1a16"],
    },
    blurb:
      "Japanese woodblock prints sold cheaply in editions, alongside older East Asian painting.",
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
      // Musée d'Orsay, the Galerie des Impressionnistes as Wilmotte
      // reopened it in October 2011: deep slate grey over dark parquet,
      // where the walls had been off-white. The hex is read from
      // photographs. Until 17 October 2026 this floor was the off-white
      // of the Orangerie's Nymphéas rooms, and beside the Modernism
      // room it read as a second white room.
      wallColor: "#4a5058",
      floorColor: "#2a1d14",
      ceilingColor: "#f8f6f0",
      accent: "#c88a47",
      // Garden dapple: sage, dusty rose, lavender, butter.
      roomAccents: ["#2a1d14", "#283325", "#3a2a2e", "#2e2838", "#3a3220"],
    },
    blurb: "Painted outdoors and fast, in separate strokes of unmixed colour.",
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
      // Barnes Foundation: Cézanne, Seurat, Rousseau and Van Gogh on
      // ochre burlap, as Albert Barnes specified and the 2012 building
      // repeats. Deep aubergine floor and violet accent as before.
      wallColor: "#c2a15e",
      floorColor: "#1a1419",
      ceilingColor: "#f0e8d2",
      accent: "#6e3a8a",
      // Sunflower ochre, starry-night blue, deep wine, Mucha jade, Gauguin red-clay.
      roomAccents: ["#1a1419", "#1a1c30", "#2a1418", "#1a2a22", "#2e1a14"],
    },
    blurb: "Colour and outline used for their own sake, and subjects taken from dream and myth.",
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
      // Malevich's corpus here is 1910–1928 — the Suprematist decade.
      // Year fallback already lands him on this floor; the tag keeps him
      // off it by accident and out of the artist-page movement gap.
      "Suprematism",
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
      // The Museum of Modern Art under Alfred Barr: beige monk's cloth
      // at first, white paint soon after. Near-black floor tint and
      // primary-red accent as before.
      wallColor: "#f4f4f2",
      floorColor: "#101010",
      ceilingColor: "#fafaf8",
      accent: "#c5402c",
      // Mondrian-leaning primaries muted to room tints: blue, red, ochre, charcoal, off-black.
      roomAccents: ["#101010", "#10182a", "#2a1010", "#2a2210", "#181818"],
    },
    blurb: "Fauvism, Cubism, Surrealism and abstraction, from 1900 onwards.",
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
 * The era a movement name belongs to, case-insensitive. Visitors only see
 * eras; this translates the old `?movement=` and `?from=movement:` URLs,
 * which were shared before the timeline filter and the lightbox scope
 * switched to eras. Ignores the pre-1500 Renaissance rule, which needs a
 * year a URL doesn't carry.
 */
export function eraForMovement(movement: string): EraId | null {
  return MOVEMENT_TO_ERA.get(movement.toLowerCase()) ?? null;
}

const ERA_ID_SET: ReadonlySet<string> = new Set(ERAS.map((e) => e.id));

export function isEraId(value: string): value is EraId {
  return ERA_ID_SET.has(value);
}

const RENAISSANCE_YEAR_MIN = ERAS.find((e) => e.id === "renaissance")!.yearMin;

/**
 * Assign an artwork to an era. Priority: explicit movement → year fallback.
 * Returns null only if neither year nor movement produces a match.
 */
export function assignEra(artwork: Pick<Artwork, "movement" | "year">): EraId | null {
  if (artwork.movement) {
    const hit = MOVEMENT_TO_ERA.get(artwork.movement.toLowerCase());
    // A 15th-century "Renaissance" work (Botticelli, Schongauer, early
    // Dürer, van Eyck) is Early Renaissance, which is the ground floor's
    // half of its title. Routed by tag alone, all 56 of them went up to
    // the 1500s floor and left the entry storey with 17 works in two rooms.
    if (hit === "renaissance" && artwork.year != null && artwork.year < RENAISSANCE_YEAR_MIN) {
      return "gothic";
    }
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

/**
 * Display label for an era's year range. The sentinels in ERAS are not
 * dates: movement-only eras use yearMin > yearMax, and the open ends of
 * the dated run use 0 and 9999, which used to print as "0–1499" and
 * "1900–9999".
 */
export function eraYearLabel(era: Era): string {
  if (era.yearMin > era.yearMax) return "Movement-tagged only";
  if (era.yearMin <= 0) return `Before ${era.yearMax + 1}`;
  if (era.yearMax >= 9999) return `${era.yearMin} onward`;
  return `${era.yearMin}–${era.yearMax}`;
}

/**
 * Movements actually present among an era's works, largest first.
 * `Era.movements` is routing config: it holds aliases ("Academic art"
 * next to "Academicism") and tags no catalogued work carries, and it
 * misses what year and the pre-1500 Renaissance rule bring in. Shown as
 * chips it listed four empty movements on the Gothic floor and none of
 * the 56 Renaissance works actually hanging there. Untagged works have
 * no movement to link to, so they are left out.
 */
export function movementCounts(
  works: Pick<Artwork, "movement">[],
): { movement: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const w of works) {
    if (w.movement) counts.set(w.movement, (counts.get(w.movement) ?? 0) + 1);
  }
  return [...counts]
    .map(([movement, count]) => ({ movement, count }))
    .sort((a, b) => b.count - a.count || a.movement.localeCompare(b.movement));
}

export function getEra(id: EraId): Era {
  const era = ERAS.find((e) => e.id === id);
  if (!era) throw new Error(`Unknown era id: ${id}`);
  return era;
}

/** Colours of rooms that hang no one era: the museum's court and salon.
 *  Rico, 17 October 2026, asked for them to differ from the grey stone
 *  of the stair halls and stair towers, and to stay light. Not modelled
 *  on a room: a warm sandstone beside the stairs' cool grey. */
export const HALL_PALETTES = {
  court: {
    wallColor: "#e2cfa9",
    floorColor: "#3a2a1f",
    ceilingColor: "#f3eee2",
    accent: "#c68642",
    roomAccents: ["#3a2a1f"],
  },
} as const satisfies Record<string, Palette>;

/** An era's palette, or one of `HALL_PALETTES`. */
export type PaletteId = EraId | keyof typeof HALL_PALETTES;

export function getPalette(id: PaletteId): Palette {
  return id in HALL_PALETTES
    ? HALL_PALETTES[id as keyof typeof HALL_PALETTES]
    : getEra(id as EraId).palette;
}

/**
 * Nth accent of an era's palette, wrapping. Floor tints are handed out
 * by movement rank rather than by hashing a room id, so every distinct
 * movement on a storey gets its own accent and rooms showing the same
 * movement read as one wing — underfoot in 3D and as a colour zone on
 * the map, which is what lets the map drop room labels entirely. Falls
 * back to the era's base floorColor if no accents are authored.
 */
export function eraAccentColor(era: Era, index: number): string {
  const accents = era.palette.roomAccents;
  if (!accents || accents.length === 0) return era.palette.floorColor;
  return accents[index % accents.length];
}
