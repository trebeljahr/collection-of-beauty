// Colour-family bucketing for the "browse by colour" filter.
//
// Single source of truth shared between:
//   - scripts/build-data.mjs (build time — decodes the smallest pre-built
//     variant, histograms its pixels, and bakes `colorBuckets` into
//     src/data/artworks.json)
//   - src/lib/artwork-pagination.ts + the swatch ring UI (runtime —
//     filters and labels using the same ids and swatch colours)
//
// Lives as `.mjs` for the same reason `variant-config.mjs` does: Node
// imports it natively from the build script without transpilation, and
// Next resolves it from the runtime side via "moduleResolution":
// "bundler". JSDoc annotations give the TypeScript callers real types.
//
// WHY PIXELS AND NOT `Artwork.dominantColor`
// ------------------------------------------
// `dominantColor` is a whole-image *average*, which is the wrong input
// for hue filtering: averaging a blue sky against a sandy shore lands on
// a muddy warm grey. Measured over the real corpus, those averages
// collapse almost entirely into the 45-105° warm wedge — median OKLCh
// chroma 0.028, and only ~9 of 4,571 works anywhere near the blue wedge.
// Bucketing them would make "show me the blues" return nine paintings.
// A pixel histogram recovers the actual palette instead: the blue in a
// seascape is a quarter of its pixels even when the mean is beige.
//
// WHY MEMBERSHIP AND STRENGTH ARE TWO DIFFERENT NUMBERS
// -----------------------------------------------------
// Membership answers "does this work belong under the red swatch"; it is
// a prior-normalised, thresholded yes/no (see below). Strength answers
// "how much red is in it" and is the raw chroma-weighted fraction of the
// whole image — no prior, no threshold. They have to be separate because
// the prior is what makes membership meaningful across families, and is
// exactly what makes it useless for ordering *within* one: dividing every
// red work by the same 0.082 is a monotone transform, so it cannot
// reorder them, and mixing in the share-of-chromatic-vote denominator
// actively lies — an engraving whose only colour is a red seal reads as
// 90% red by that measure while being a grey picture. Strength divides by
// total pixels, so the reddest work is the one with the most red in it.
//
// WHY SCORES ARE NORMALISED AGAINST A CORPUS PRIOR
// ------------------------------------------------
// Raw share doesn't work either. Public-domain painting is overwhelmingly
// warm — skin, wood, varnish, aged canvas — so the 55-100° wedge is the
// plurality colour of roughly every work in the collection. Ranking by
// raw share put 45-57% of the corpus in "gold" and left "orange" under
// 1%: the bucket stopped meaning anything beyond "is a painting". Each
// family's share is therefore divided by that family's mean share across
// the corpus (`FAMILY_PRIOR`), so a bucket means "unusually X *for this
// collection*" — which is what someone clicking a swatch actually wants.

/**
 * @typedef {"red"|"orange"|"gold"|"brown"|"green"|"teal"|"blue"|"purple"|"pink"|"white"|"grey"|"black"} ColorBucketId
 */

/**
 * @typedef {object} ColorBucket
 * @property {ColorBucketId} id      Stable id — baked into JSON, used as the `color=` query param.
 * @property {string} label          Human label for the swatch ring.
 * @property {string} swatch         CSS colour for the swatch itself.
 * @property {boolean} neutral       True for the achromatic bands (white/grey/black).
 */

/** Ring order: the chromatic families walk the hue circle the way a
 *  painter's colour wheel does, brown sits among the earths it belongs
 *  to, and the three neutral bands close the ring. Swatch values are
 *  hand-picked representatives of each family *as it appears in this
 *  corpus* (muted pigment, not primary-bright web colour) so the ring
 *  reads as a palette rather than a set of hyperlinks.
 *  @type {readonly ColorBucket[]} */
export const COLOR_BUCKETS = [
  { id: "red", label: "Red", swatch: "#a8322b", neutral: false },
  { id: "orange", label: "Orange", swatch: "#c2662a", neutral: false },
  { id: "gold", label: "Gold", swatch: "#c9a227", neutral: false },
  { id: "brown", label: "Earth", swatch: "#7a5230", neutral: false },
  { id: "green", label: "Green", swatch: "#4f7a3a", neutral: false },
  { id: "teal", label: "Teal", swatch: "#2f7d75", neutral: false },
  { id: "blue", label: "Blue", swatch: "#2f5d94", neutral: false },
  { id: "purple", label: "Purple", swatch: "#6b4a86", neutral: false },
  { id: "pink", label: "Pink", swatch: "#b9557f", neutral: false },
  { id: "white", label: "White", swatch: "#ece6da", neutral: true },
  { id: "grey", label: "Grey", swatch: "#8c8c88", neutral: true },
  { id: "black", label: "Black", swatch: "#2b2926", neutral: true },
];

/** @type {Set<string>} */
const BUCKET_IDS = new Set(COLOR_BUCKETS.map((b) => b.id));

/** Narrowing guard for anything arriving from a URL param or JSON.
 *  @param {unknown} value
 *  @returns {value is ColorBucketId} */
export function isColorBucketId(value) {
  return typeof value === "string" && BUCKET_IDS.has(value);
}

/** @param {ColorBucketId} id @returns {ColorBucket} */
export function getColorBucket(id) {
  const found = COLOR_BUCKETS.find((b) => b.id === id);
  if (!found) throw new Error(`unknown colour bucket: ${id}`);
  return found;
}

// --- tuning constants -------------------------------------------------
// Every threshold below was fitted against the real corpus (a 773-work
// stratified sample decoded at 64px), not derived from theory. They're
// exported so the tests assert against the same numbers build-data bakes
// with, and so a future re-tune has one place to change.

/** OKLCh chroma below which a pixel counts as achromatic. The corpus's
 *  per-pixel chroma histogram thins out sharply past 0.04; below that,
 *  hue angle is numerically unstable and perceptually absent anyway. */
export const CHROMA_FLOOR = 0.045;

/** Chroma at which a pixel casts a full-weight vote. Vivid pixels should
 *  outvote barely-tinted ones — a small saturated flag says more about
 *  "what colour is this painting" than a large expanse of near-grey wall.
 *  Votes ramp linearly and clamp here, so a vivid pixel counts for about
 *  2.5x a just-above-floor one. */
export const CHROMA_FULL_WEIGHT = 0.12;

/** Below this fraction of chromatic pixels a work is called achromatic
 *  (engraving, ink print, grisaille) and gets only a white/grey/black
 *  band. */
export const NEUTRAL_MAX_CHROMATIC_FRACTION = 0.07;

/** Works under this chromatic fraction get their neutral band appended
 *  *alongside* their hue families — a sepia print is legitimately both
 *  "brown" and "grey" to someone browsing by colour. */
export const MUTED_MAX_CHROMATIC_FRACTION = 0.16;

/** A family needs this raw share of the chromatic vote before it is even
 *  considered. Without it, prior normalisation lets a few stray pixels of
 *  a rare family (pink's corpus prior is 0.003) score arbitrarily high. */
export const MIN_FAMILY_SHARE = 0.13;

/** Floor applied to the prior before dividing, for the same reason: it
 *  caps how much amplification the rarest families can receive. */
export const MIN_PRIOR = 0.03;

/** Prior-normalised score a family must clear to be listed. 1.0 would
 *  mean "at least corpus-typical"; 1.2 asks for a visible margin above
 *  typical, which is what keeps the warm families from tagging
 *  everything. */
export const MIN_FAMILY_SCORE = 1.2;

/** Hard cap on families per work, so the filter stays discriminating. */
export const MAX_FAMILIES = 3;

/** Weighted-mean OKLCh lightness bounds for the neutral bands. */
export const WHITE_MIN_LIGHTNESS = 0.8;
export const BLACK_MAX_LIGHTNESS = 0.36;

/** Warm pixels both darker *and* duller than these bounds are earths,
 *  not oranges or golds. Without the split, umber and raw sienna — which
 *  is most of the warm wedge, and the warm wedge is most of the corpus —
 *  drown out the genuinely orange and golden works. */
export const BROWN_MAX_LIGHTNESS = 0.55;
export const BROWN_MAX_CHROMA = 0.08;

/** The mirror of the earth rule at the other end of the red arc: a red
 *  that is pale and soft is pink, not red. Hue alone can't separate the
 *  two — pale pink sits at 7° and crimson at 20°, well inside the same
 *  arc — so lightness and chroma do the work, exactly as they do for
 *  earths. */
export const PINK_MIN_LIGHTNESS = 0.76;
export const PINK_MAX_CHROMA = 0.12;

/** Mean share of the chromatic vote each family takes across the corpus.
 *  Measured over a 915-work stratified sample; see the header for why
 *  this normalisation exists at all. These drift slowly as the
 *  collection grows — they're a normaliser, not a hard boundary, so
 *  drift degrades the ranking gently rather than breaking it. Re-measure
 *  if the corpus composition changes materially (a large new folder in a
 *  different palette, say).
 *  @type {Readonly<Record<string, number>>} */
export const FAMILY_PRIOR = {
  red: 0.082,
  orange: 0.097,
  gold: 0.339,
  brown: 0.18,
  green: 0.162,
  teal: 0.017,
  blue: 0.064,
  purple: 0.009,
  pink: 0.007,
};

// --- colour space -----------------------------------------------------

/** @param {number} channel 0-255 @returns {number} */
function srgbChannelToLinear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Convert 8-bit sRGB to OKLCh. OKLab rather than HSL because HSL
 * saturation isn't perceptual — it calls both `#808000` and `#ffcccc`
 * "100% saturated", which scatters pale tints and deep pigments into the
 * same buckets. OKLab chroma tracks how colourful a pixel actually looks,
 * and its hue angle is near enough perceptually uniform that fixed degree
 * boundaries between families land where the eye puts them.
 *
 * @param {number} r 0-255
 * @param {number} g 0-255
 * @param {number} b 0-255
 * @returns {{ l: number, c: number, h: number }} l 0-1, c ~0-0.4, h 0-360
 */
export function rgbToOklch(r, g, b) {
  const lr = srgbChannelToLinear(r);
  const lg = srgbChannelToLinear(g);
  const lb = srgbChannelToLinear(b);

  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.hypot(a, bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  // Pure achromatic pixels have a meaningless atan2 result; pin them to 0
  // so callers never branch on floating-point noise.
  if (c < 1e-7) h = 0;
  return { l, c, h };
}

/** Parse `#rgb` / `#rrggbb` (case-insensitive, leading `#` optional).
 *  @param {string | null | undefined} hex
 *  @returns {{ r: number, g: number, b: number } | null} */
export function parseHex(hex) {
  if (typeof hex !== "string") return null;
  const raw = hex.trim().replace(/^#/, "");
  if (raw.length === 3) {
    if (!/^[0-9a-f]{3}$/i.test(raw)) return null;
    return {
      r: Number.parseInt(raw[0] + raw[0], 16),
      g: Number.parseInt(raw[1] + raw[1], 16),
      b: Number.parseInt(raw[2] + raw[2], 16),
    };
  }
  if (raw.length !== 6 || !/^[0-9a-f]{6}$/i.test(raw)) return null;
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  };
}

// --- family assignment ------------------------------------------------

/** Hue-family boundaries in OKLCh degrees, walking the circle from red.
 *  `to` is exclusive; anything outside these spans is red, which is how
 *  that family wraps past 358° through 0° to 35°.
 *
 *  These are not evenly spaced, because OKLCh hue is not evenly
 *  populated by named colours: sRGB red sits at 29°, orange-red at 35°,
 *  CSS `orange` at 71°, and pure yellow at 110° — so the whole
 *  red-through-yellow story happens in about 80° while blue gets 60° to
 *  itself. Boundaries were placed by measuring reference pigments
 *  (vermilion 29, sienna 45, ochre 60, amber 84, mustard 94, olive 110)
 *  rather than by dividing the circle into equal slices, which would put
 *  pure yellow in the green bucket.
 *  @type {ReadonlyArray<{ from: number, to: number, id: ColorBucketId }>} */
const HUE_FAMILIES = [
  { from: 35, to: 62, id: "orange" },
  { from: 62, to: 112, id: "gold" },
  { from: 112, to: 165, id: "green" },
  { from: 165, to: 215, id: "teal" },
  { from: 215, to: 275, id: "blue" },
  { from: 275, to: 318, id: "purple" },
  { from: 318, to: 358, id: "pink" },
];

/** Warm families that collapse to `brown` when dark *and* dull. */
const WARM_FAMILIES = new Set(["orange", "gold"]);

/** Chromatic families, in the order used for deterministic tie-breaks.
 *  @type {readonly ColorBucketId[]} */
export const CHROMATIC_FAMILIES = COLOR_BUCKETS.filter((b) => !b.neutral).map((b) => b.id);

/**
 * Classify one OKLCh sample into a chromatic family, or null when it's
 * too achromatic to carry a hue.
 *
 * @param {{ l: number, c: number, h: number }} sample
 * @returns {ColorBucketId | null}
 */
export function familyForOklch({ l, c, h }) {
  if (!(c >= CHROMA_FLOOR)) return null;
  const hue = ((h % 360) + 360) % 360;
  let id = /** @type {ColorBucketId} */ ("red");
  for (const family of HUE_FAMILIES) {
    if (hue >= family.from && hue < family.to) {
      id = family.id;
      break;
    }
  }
  if (WARM_FAMILIES.has(id) && l <= BROWN_MAX_LIGHTNESS && c <= BROWN_MAX_CHROMA) return "brown";
  if (id === "red" && l >= PINK_MIN_LIGHTNESS && c <= PINK_MAX_CHROMA) return "pink";
  return id;
}

/** @param {number} lightness @returns {ColorBucketId} */
export function neutralForLightness(lightness) {
  if (lightness >= WHITE_MIN_LIGHTNESS) return "white";
  if (lightness <= BLACK_MAX_LIGHTNESS) return "black";
  return "grey";
}

/**
 * Classify a single hex colour into exactly one bucket. This is the
 * one-colour unit the histogram path is built from — useful for a swatch
 * or a theme colour, and the readable thing to test family boundaries
 * against. Artworks go through `bucketsFromHistogram` instead, because a
 * single averaged colour is exactly the input this whole module exists to
 * avoid relying on.
 *
 * @param {string | null | undefined} hex
 * @returns {ColorBucketId | null} null when the input isn't a colour.
 */
export function bucketForHex(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const sample = rgbToOklch(rgb.r, rgb.g, rgb.b);
  return familyForOklch(sample) ?? neutralForLightness(sample.l);
}

/**
 * @typedef {object} HistogramEntry
 * @property {number} r     0-255
 * @property {number} g     0-255
 * @property {number} b     0-255
 * @property {number} count Pixels represented by this entry.
 */

/**
 * @typedef {object} ColorProfile
 * @property {ColorBucketId[]} buckets   Families the work reads as, best-first.
 * @property {Record<string, number>} strength  Per-listed-family share of the whole
 *   image (0-1), chroma-weighted. Comparable across works within one family;
 *   NOT comparable across families, which is what the prior-normalised score is for.
 */

/**
 * Reduce a pixel histogram to the colour families a viewer would say the
 * work "is". The whole point of the filter lives here.
 *
 *  1. Split pixels into chromatic (OKLCh chroma >= CHROMA_FLOOR) and
 *     achromatic. The chromatic *fraction* decides whether this is a
 *     colour work at all.
 *  2. Vote each chromatic pixel into its hue family, weighted by chroma.
 *  3. Divide each family's share by its corpus prior, and keep the
 *     families clearing both MIN_FAMILY_SHARE and MIN_FAMILY_SCORE, best
 *     score first, capped at MAX_FAMILIES.
 *  4. Append a white/grey/black band for works that are wholly or mostly
 *     achromatic, chosen by the mean lightness.
 *
 * `buckets[0]` is the work's primary colour, so callers wanting a single
 * value can take the head. `strength[id]` is the chroma-weighted share of
 * the *whole image* that family occupies (0-1) — the number to sort by
 * when someone has asked for "the reddest works", as opposed to the
 * prior-normalised score, which decides membership and cannot order
 * within a family at all.
 *
 * @param {Iterable<HistogramEntry>} entries
 * @returns {ColorProfile} `buckets` empty only when the histogram has no pixels.
 */
export function colorProfileFromHistogram(entries) {
  /** @type {Map<ColorBucketId, number>} */
  const familyVote = new Map();
  /** Achromatic pixels split by their own lightness band, so a neutral
   *  band can report a real amount rather than inheriting the whole
   *  achromatic remainder.
   *  @type {Map<ColorBucketId, number>} */
  const neutralPixels = new Map();
  let totalPixels = 0;
  let chromaticPixels = 0;
  let lightnessSum = 0;

  for (const entry of entries) {
    const count = entry.count;
    if (!(count > 0)) continue;
    const sample = rgbToOklch(entry.r, entry.g, entry.b);
    totalPixels += count;
    lightnessSum += sample.l * count;

    const family = familyForOklch(sample);
    if (!family) {
      const band = neutralForLightness(sample.l);
      neutralPixels.set(band, (neutralPixels.get(band) ?? 0) + count);
      continue;
    }
    chromaticPixels += count;
    const vote = count * Math.min(1, sample.c / CHROMA_FULL_WEIGHT);
    familyVote.set(family, (familyVote.get(family) ?? 0) + vote);
  }

  if (totalPixels === 0) return { buckets: [], strength: {} };

  const pixels = totalPixels;
  const achromaticFraction = (totalPixels - chromaticPixels) / totalPixels;
  /** Amount of one band actually present. Falls back to the achromatic
   *  remainder for the rare work whose mean lightness names a band no
   *  individual pixel landed in (a picture split between white and black
   *  averages to grey), and to 1 for one with no achromatic pixels at
   *  all, where the band is a description of the whole image.
   *  @param {ColorBucketId} band @returns {number} */
  const neutralStrength = (band) => {
    const own = (neutralPixels.get(band) ?? 0) / pixels;
    if (own > 0) return own;
    return achromaticFraction > 0 ? achromaticFraction : 1;
  };
  /** @param {ColorBucketId[]} picked @returns {Record<string, number>} */
  const strengthFor = (picked) => {
    /** @type {Record<string, number>} */
    const out = {};
    for (const id of picked) {
      const vote = familyVote.get(id);
      out[id] = vote === undefined ? neutralStrength(id) : vote / pixels;
    }
    return out;
  };

  const neutral = neutralForLightness(lightnessSum / totalPixels);
  const chromaticFraction = chromaticPixels / totalPixels;
  if (chromaticFraction < NEUTRAL_MAX_CHROMATIC_FRACTION || familyVote.size === 0) {
    return { buckets: [neutral], strength: strengthFor([neutral]) };
  }

  const totalVote = [...familyVote.values()].reduce((sum, vote) => sum + vote, 0);
  /** @type {Array<{ id: ColorBucketId, score: number, share: number }>} */
  const scored = [];
  for (const [id, vote] of familyVote) {
    const share = vote / totalVote;
    if (share < MIN_FAMILY_SHARE) continue;
    const score = share / Math.max(FAMILY_PRIOR[id] ?? MIN_PRIOR, MIN_PRIOR);
    if (score < MIN_FAMILY_SCORE) continue;
    scored.push({ id, score, share });
  }
  // Deterministic order: best score first, ties broken by ring position
  // so the same histogram always bakes the same array.
  scored.sort(
    (a, b) =>
      b.score - a.score || CHROMATIC_FAMILIES.indexOf(a.id) - CHROMATIC_FAMILIES.indexOf(b.id),
  );

  /** @type {ColorBucketId[]} */
  let picked = scored.slice(0, MAX_FAMILIES).map((s) => s.id);

  // Nothing cleared the bar but the work is still colourful — fall back
  // to its plurality family so a colour work never lands in a neutral
  // band by default.
  if (picked.length === 0) {
    let bestId = /** @type {ColorBucketId | null} */ (null);
    let bestVote = 0;
    for (const [id, vote] of familyVote) {
      if (vote > bestVote) {
        bestVote = vote;
        bestId = id;
      }
    }
    if (bestId && bestVote / totalVote >= MIN_FAMILY_SHARE) picked = [bestId];
  }

  if (chromaticFraction < MUTED_MAX_CHROMATIC_FRACTION) picked.push(neutral);
  const buckets = picked.length > 0 ? picked : [neutral];
  return { buckets, strength: strengthFor(buckets) };
}

/**
 * Membership only, for callers that don't need the amounts.
 *
 * @param {Iterable<HistogramEntry>} entries
 * @returns {ColorBucketId[]} Empty only when the histogram has no pixels.
 */
export function bucketsFromHistogram(entries) {
  return colorProfileFromHistogram(entries).buckets;
}
