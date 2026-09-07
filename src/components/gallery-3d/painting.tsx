"use client";

import { Text } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { ArtworkListing } from "@/lib/data";
import { PAINTING_WALL_OFFSET } from "@/lib/gallery-layout/place-paintings";
import type { Placement } from "@/lib/gallery-layout/types";
import { GALLERY_LOD_WIDTH, variantProxyUrl } from "@/lib/utils";
import { FOV_DEFAULT_DEG, ZOOM_PIXEL_HEADROOM } from "./camera-config";
import { type PaintingEntry, registerPainting, unregisterPainting } from "./painting-registry";
import {
  FRAME_VARIANTS,
  type FrameVariantId,
  plaqueBaseMaterial,
  plaqueMountMaterial,
} from "./palette-materials";
import {
  estimateTextureBytes,
  getHiRes,
  HIRES_ENTRY_BYTE_CAP,
  type LoadHiResOpts,
  loadCached,
  loadHiRes,
  peekCached,
} from "./texture-cache";

/**
 * One painting on a wall. Renders a thin box behind the canvas so the
 * painting has some depth (the wall behind is roughly 0.05 m away),
 * with a textured plane on the front. Registers itself with the
 * global painting-registry so the Player's aim raycast can skip the
 * full scene traversal.
 *
 * The base texture is sized to the work's display size (see
 * `pickBaseWidth`): 960 px for anything over ~1.1 m on its long edge,
 * 480 px for the small plates and prints below it. The texture-cache
 * handles LRU eviction + rAF-paced GPU uploads so a floor-wide burst of
 * loads doesn't hitch the frame.
 */
// Tiered proximity LOD. Each tier identifies a texture source and four
// distance bands. Distances are CLOSEST-POINT to the painting's
// rectangular surface (see LodController) — not to its centre. So
// "1 m" means "1 m from any point on the canvas", which is what the
// player actually intuits as "I'm right up against it".
//
//   prefetch ─ start the network fetch eagerly so the swap feels
//              instantaneous when the player crosses upgrade.
//   upgrade  ─ first time we display this tier (must be cached).
//   downgrade ─ hysteresis: keep displaying once selected until the
//              player retreats past this radius.
//   release  ─ abort any in-flight fetch past this distance.
//
// Tiers are listed highest → lowest. The base texture is always loaded
// by the parent <Painting>; the tiers below are upgrades on top of it.
//
// The tier list and its bands are DERIVED PER PAINTING at mount, from
// the work's display size and the actual backing-buffer height, rather
// than being a shared hard-coded table. See `deriveTiers` below for the
// arithmetic and the measurements that motivated it.
type LodTier = {
  prefetchSq: number;
  upgradeSq: number;
  downgradeSq: number;
  releaseSq: number;
  /** Pre-built variant width this tier loads — a FILENAME, not a
   *  resolution (see `effectiveWidth`). */
  width: number;
};

// Module-scope scratch reused by the registration effect to avoid
// allocating a fresh Quaternion per painting on mount. A floor swap
// can mount hundreds of paintings in one frame; reusing this drops one
// allocation per painting from a hot-ish path. The Vector3s for the
// entry's worldPos / worldRight / worldUp must stay per-painting (they
// live for the painting's whole lifetime in the registry).
const _registerScratchQuat = new THREE.Quaternion();

// Base-texture ladder. The base is what a painting shows from across
// the room, so it only has to out-resolve the pixels the work actually
// covers on screen — a 0.5 m botanical plate seen from 3 m never needs
// the same texture as a 2.5 m Rubens. Sizing the base by display size
// keeps a floor's resident textures a few hundred MB instead of a few
// GB (a 960 px RGBA + mipmaps is ~3.9 MB; the 480 px step is ~1 MB),
// which is what lets the LRU hold a whole room without thrashing.
const BASE_WIDTH_SMALL = 480;
const BASE_WIDTH_LARGE = 960;
/** Display long edge (metres) above which a work gets the 960 px base. */
const BASE_WIDTH_LARGE_EDGE_M = 1.1;

/** Pick the base variant width for a work, then snap it to a width the
 *  shrink pipeline actually produced for that artwork (`variantWidths`) —
 *  requesting a width that was never built 404s and leaves the painting
 *  on its brown swatch. */
function pickBaseWidth(artwork: ArtworkListing, displayEdgeM: number): number {
  const want = displayEdgeM > BASE_WIDTH_LARGE_EDGE_M ? BASE_WIDTH_LARGE : BASE_WIDTH_SMALL;
  const widths = artwork.variantWidths;
  if (!widths || widths.length === 0) return want;
  let best = widths[0];
  for (const w of widths) {
    if (w <= want && w > best) best = w;
  }
  return best;
}

// Candidate rungs, ASCENDING. This is the whole module-scope tier
// table now — which rungs a given painting actually gets, and at what
// distances they swap in, is derived per painting in `deriveTiers`.
//
// GALLERY_LOD_WIDTH (6144) is a conditional per-source rung: shrink
// only emits it for sources whose full-size encode is wider than
// 6144 px, so it is deliberately not a member of VARIANT_WIDTHS (a
// ladder rung is emitted for every work regardless of source size,
// which would make 6144 the max of every work's variantWidths and hand
// a DZI pyramid to ~3,600 works that have none — see variant-config.mjs).
// No work reports 6144 until `pnpm assets:shrink` runs again; the
// availability clamp in `deriveTiers` skips it for all 4,571 of them
// until then, which is what makes this shippable ahead of the re-shrink.
const LOD_LADDER = [960, 1920, 2560, 4096, GALLERY_LOD_WIDTH];

// Closest approach we design for, in metres, measured surface-to-eye.
//
// This is a POLICY number, not a measurement — do not "fix" it to the
// geometric floor. The true floor is ~0.27 m: PLAYER_RADIUS is 0.3
// (player.tsx) and keeps the collision capsule's *centre* that far from
// the wall plane, the collision controller tests walls and staircases
// only (frames and canvases are not colliders), and the canvas surface
// sits just 0.034 m proud of the wall (PAINTING_WALL_OFFSET 0.02 plus
// the plane's local z 0.014). Designing for 0.27 m would ask for 1.7×
// the pixels and put nearly every work back on the top rung, erasing
// the memory win for detail nobody can resolve while their nose is
// against the frame. 0.45 m says: we promise 1:1 with screen pixels at
// a natural viewing distance, and accept mild softness closer in.
const D_MIN = 0.45;

/** Backing-height quantum for the LOD derivation, in pixels. See
 *  `derivationHeightPx` in PaintingPlane for the accuracy trade. */
const LOD_HEIGHT_QUANTUM_PX = 256;

// The FOV the ladder is derived AGAINST: FOV_DEFAULT_DEG, always — never
// the camera's live `fov`.
//
// The camera's FOV is animated. player.tsx damps it from 75 to 35 on the
// F key so the player can read a painting from across the room, and
// `camera.fov` is mutated in place, which means an effect that samples it
// (a) has no dependency that fires when it changes and (b) captures
// whatever value happened to be live at mount. Deriving from it gave two
// distinct bugs at once: a ladder frozen at whatever the FOV was when
// that painting's base texture landed, and — since a floor's ~300 base
// textures arrive progressively — two identical works ending up with
// different ladders purely by arrival time. A player who pressed F
// mid-stream pinned every painting that finished loading in that window
// to a 2.43x pixel target for the rest of the session.
//
// So the ladder is a fixed, deterministic function of the work and the
// canvas, and the ZOOM is handled where it belongs: the LodController
// hands `lodUpdate` a second, FOV-normalised distance (`displaySq`, see
// camera-config.ts), so at fov 35 every band is reached at 2.43x its
// nominal radius and the picker climbs the ladder correspondingly
// earlier. Bands respond to zoom; rungs don't.

// Hysteresis and lead, as ratios of a tier's upgrade radius. Read off
// the old hand-written table so behaviour stays in family: it ran
// downgrade/upgrade at 1.43 / 1.40 / 1.25 and release/upgrade at
// 2.38 / 2.75 / 2.25 across its three band groups.
const DOWNGRADE_RATIO = 1.4;
const RELEASE_RATIO = 2.4;
// The prefetch lead is ADDITIVE, not a ratio: it has to cover metres
// the player walks, not a fraction of a radius. 1.0 m = 0.6 m of tick
// quantisation (3 m/s against the LOD controller's ~5 Hz, so the fetch
// can only start on a tick and the player may already be 0.6 m inside
// the radius when it does) plus ~0.4 m of fetch, decode and upload. The
// old table was thinner than this — its top tier's lead was
// 1.5 − 1.05 = 0.45 m, less than a single tick of walking.
const PREFETCH_LEAD_M = 1.0;
// Release must stay comfortably OUTSIDE prefetch, or a player parked
// between the two boundaries starts a fetch on one tick and aborts it
// on the next, forever. `RELEASE_RATIO × upgrade` alone doesn't
// guarantee that once the lead is additive (a 0.5 m upgrade radius
// gives prefetch 1.5 m against release 1.2 m), so the release radius is
// floored at this multiple of prefetch. The old table ran
// release/prefetch at 1.67–2.2.
const RELEASE_PREFETCH_MARGIN = 1.6;

// Screen pixels per world metre at D_MIN, for a perspective camera:
//
//     pxPerM = backingHeightPx / (2 · d · tan(fov/2))
//
// `gl.domElement.height` is BACKING pixels, so the dpr clamp ([1,2] in
// index.tsx) is already folded in. The figure is isotropic — horizontal
// px/m is W/(2·d·tan(hfov/2)) with tan(hfov/2) = aspect·tan(vfov/2) and
// W = aspect·H, which reduces to the same expression — so one scalar
// serves both axes and the width axis alone is the binding constraint
// (shrink resizes variants by WIDTH, so an aspect-preserving variant
// satisfies height automatically).
//
// Memoised on height: a floor swap mounts several hundred paintings in
// one frame and they all share one canvas, so this does one Math.tan per
// resize rather than one per painting.
const TAN_HALF_REFERENCE_FOV = Math.tan(((FOV_DEFAULT_DEG / 2) * Math.PI) / 180);
let _pxPerMHeight = -1;
let _pxPerMValue = 0;
function pxPerMetreAtDMin(backingHeightPx: number): number {
  // Height can legitimately be 0 for a frame during a canvas remount
  // (see the WebGL context-loss recovery in index.tsx). Fall back to a
  // plausible viewport rather than deriving a zero-pixel target.
  const h = backingHeightPx > 0 ? backingHeightPx : 1080;
  if (h !== _pxPerMHeight) {
    _pxPerMHeight = h;
    _pxPerMValue = h / (2 * D_MIN * TAN_HALF_REFERENCE_FOV);
  }
  return _pxPerMValue;
}

// Scratch reused across `deriveTiers` calls — same discipline as
// _registerScratchQuat above. deriveTiers runs synchronously start to
// finish, so a shared buffer is safe even when a floor swap calls it
// hundreds of times in one frame.
const _tierLabels: number[] = [];
const _tierEffs: number[] = [];
const NO_TIERS: LodTier[] = [];

/** A `variantWidths` entry is a FILENAME, not a resolution.
 *  `shrink-sources.mjs` resizes with `targetW = Math.min(rung, sourceWidth)`
 *  and `withoutEnlargement`, so an 1,807 px scan still gets a file called
 *  `4096.avif` holding 1,807 px. 3,597 of the 4,571 catalogued works list
 *  4096 while their source is narrower than that, and 2,524 works carry
 *  two or more rungs that decode to identical pixels (4,625 redundant
 *  rungs corpus-wide) — which the old table happily fetched as separate
 *  cache entries. Every size decision below therefore runs on the
 *  EFFECTIVE width, and the dedupe drops those duplicate fetches. */
function effectiveWidth(label: number, sourceWidth: number): number {
  return sourceWidth > 0 ? Math.min(label, sourceWidth) : label;
}

/**
 * Derive this painting's LOD rungs and their distance bands.
 *
 * WHY per painting. The old table pinned every work to a fixed 4096 px
 * top tier upgrading at a fixed 1.05 m, which was wrong in both
 * directions at once. Corpus long edges (metres) run p10 0.36, p50 0.77,
 * p90 1.84, p99 4.25, and at an 1800 px backing height:
 *
 *     d = 1.05 m → 1117 px/m:   2% of works need >4096, 89% need ≤1920
 *     d = 0.40 m → 2932 px/m:  15% need >4096, 45% need ≤1920
 *   (4K, 2160 px)
 *     d = 1.05 m → 1340 px/m:   3% need >4096, 85% need ≤1920
 *     d = 0.40 m → 3519 px/m:  21% need >4096, 41% need ≤1920
 *
 * So a 0.77 m plate was ~3× oversampled even nose-against-canvas (a
 * 4096 tier is ~64 MB of RGBA + mipmaps), while the ~15–21% of works
 * over ~1.4 m that the player can actually walk up to were under-
 * provisioned. Measured over the real catalogue at 1800 px backing, the
 * derivation below drops the mean top-rung decode from 44.3 MiB to
 * 19.8 MiB (rung histogram 960:1177, 1920:1973, 2560:869, 4096:477) and
 * to 26.0 MiB at 2160 px — which is what pays for the big canvases
 * reaching further up the ladder at roughly constant pool pressure.
 *
 * THE TARGET. `wantPx = renderWidthM × pxPerM(D_MIN)`. Width, not long
 * edge: variants are resized by width, and px/m is isotropic, so the
 * width axis is the only binding constraint — using the long edge
 * over-provisions every portrait work by its aspect ratio (30.5 MiB vs
 * 19.9 MiB mean, measured).
 *
 * THREE CLAMPS, applied in this order:
 *   1. `gl.capabilities.maxTextureSize` — a rung the GPU cannot upload.
 *   2. the widths the artwork actually has (`variantWidths`) —
 *      requesting one that was never built 404s.
 *   3. HIRES_ENTRY_BYTE_CAP — a third of the hi-res pool. This is the
 *      lesson the removed 8192 px tier paid for: a single entry larger
 *      than the pool evicts everything on insert and is evicted straight
 *      back out by the next load, and because `lodUpdate` re-requests
 *      any tier that isn't resident, that becomes a permanent 5 Hz
 *      treadmill of decodes and uploads. That is the walking stutter.
 *      It has teeth before 6144 exists: 462 works' current top rung
 *      decodes above the cap (tall portraits — a 2:3 work at 4096 is
 *      4096 × 6144 = 128.6 MiB), 22 of them already past the pool's
 *      dev-warning line. Those works now stop a rung lower.
 * Then the top rung is the smallest survivor that meets `wantPx` (or
 * the largest survivor, if none does) and everything above it is
 * dropped, so the array handed to `lodUpdate` is already trimmed.
 *
 * THE BANDS (item 5). A rung of effective width Wpx reaches 1:1 with
 * screen pixels at `d = renderWidthM·H / (2·Wpx·tan(fov/2))`, which
 * factors to `D_MIN · wantPx / Wpx` — one divide per rung. Crucially a
 * rung's upgrade radius is the 1:1 distance of the rung BELOW it, not
 * its own: the top rung is chosen so that its own 1:1 distance IS
 * D_MIN, so using it would only ever upgrade nose-against-canvas —
 * strictly worse than the 1.05 m it replaces. Reading it off the rung
 * below says the right thing instead: swap up exactly where the rung
 * you are showing stops being adequate.
 *
 * Worked example, a 1.5 m-wide 4:3 work at 1800 backing px: upgrade to
 * 1920 at 1.83 m (was 2.00), to 2560 at 0.92 m (was 1.05), to 4096 at
 * 0.69 m (was 1.05). The median 0.77 m work tops out at 2560 rather
 * than 4096 and upgrades at 1.88 / 0.94 / 0.47 m.
 *
 * Monotonicity is free: effective widths strictly increase up the
 * ladder after the dedupe and the 1:1 distance goes as 1/Wpx, so every
 * band widens as the rungs get coarser. No sort, no invertible ladder.
 *
 * ZOOM. All of the above is derived at FOV_DEFAULT_DEG. The F-key zoom
 * is not a fourth clamp and does not add a rung; it arrives as a scaled
 * distance (`displaySq`), so at fov 35 each of these bands is reached at
 * 2.4337x its nominal radius and the picker simply climbs the ladder
 * sooner. Provisioning the LADDER for the zoomed case instead would
 * multiply every target by 2.4337 and put most of the corpus straight
 * back on the 4096 rung — the exact over-provisioning this function
 * exists to undo — to serve a mode that only works standing still.
 */
function deriveTiers(
  artwork: ArtworkListing,
  baseWidth: number,
  renderWidthM: number,
  texAspect: number,
  backingHeightPx: number,
  maxTextureSize: number,
): LodTier[] {
  const widths = artwork.variantWidths;
  if (!widths || widths.length === 0) return NO_TIERS;

  const sourceWidth = artwork.width ?? 0;
  const pxPerM = pxPerMetreAtDMin(backingHeightPx);
  const wantPx = renderWidthM * pxPerM;
  const baseEff = effectiveWidth(baseWidth, sourceWidth);
  // Nothing above the base could ever be displayed: even the F-key zoom,
  // which is worth 2.4337x the pixels, asks for less than the base
  // already carries. Without this a work with a generous base on a small
  // window still gets a rung whose upgrade radius sits inside D_MIN —
  // prefetched on every pass, displayable never. It fires only on small
  // viewports (0 placements at 1800 backing px, 283 at 1024 keep exactly
  // one rung as zoom headroom and 0 are dropped as unreachable), which is
  // precisely the case where the pool can least afford dead entries.
  if (baseEff >= wantPx * ZOOM_PIXEL_HEADROOM) return NO_TIERS;

  const labels = _tierLabels;
  const effs = _tierEffs;
  labels.length = 0;
  effs.length = 0;

  let prevEff = baseEff;
  for (let i = 0; i < LOD_LADDER.length; i++) {
    const label = LOD_LADDER[i];
    const effW = effectiveWidth(label, sourceWidth);
    const effH = Math.max(1, Math.round(effW / texAspect));
    // Clamp 1 — GPU limit. `break`, not `continue`: effective widths are
    // non-decreasing up the ladder, so nothing above this fits either.
    if (effW > maxTextureSize || effH > maxTextureSize) break;
    // Clamp 2 — the artwork's own manifest. Linear scan of ≤9 numbers,
    // which beats allocating a Set per painting on a floor swap.
    if (!widths.includes(label)) continue;
    // Clamp 3 — decoded bytes. Same monotonicity argument for `break`.
    if (estimateTextureBytes(effW, effH) > HIRES_ENTRY_BYTE_CAP) break;
    // Nothing to gain: this rung decodes to pixels the rung below (or
    // the base texture) already shows.
    if (effW <= prevEff) continue;
    labels.push(label);
    effs.push(effW);
    prevEff = effW;
    // First rung that meets the target is the top of this painting's
    // ladder — anything sharper cannot be resolved at D_MIN.
    //
    // The push happens BEFORE this test on purpose. When the base texture
    // already meets `wantPx` the loop still emits one rung above it, and
    // that rung is the zoom headroom: its upgrade radius lands inside
    // D_MIN, so it is unreachable by walking, but `displaySq` shrinks by
    // 0.411 while F is held and brings it into range at 2.43x that radius.
    // The guard above is what keeps this from emitting a rung that stays
    // unreachable even then.
    if (effW >= wantPx) break;
  }

  const n = labels.length;
  if (n === 0) return NO_TIERS;

  // `oneToOne / Wpx` is the distance at which a rung of effective width
  // Wpx hits 1:1; the numerator is a per-painting constant.
  const oneToOne = D_MIN * wantPx;
  // Emitted highest → lowest, which is the order the picker walks.
  const tiers: LodTier[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const below = i === 0 ? baseEff : effs[i - 1];
    const upgrade = oneToOne / below;
    const prefetch = upgrade + PREFETCH_LEAD_M;
    const downgrade = upgrade * DOWNGRADE_RATIO;
    const release = Math.max(upgrade * RELEASE_RATIO, prefetch * RELEASE_PREFETCH_MARGIN);
    tiers[n - 1 - i] = {
      width: labels[i],
      prefetchSq: prefetch * prefetch,
      upgradeSq: upgrade * upgrade,
      downgradeSq: downgrade * downgrade,
      releaseSq: release * release,
    };
  }
  return tiers;
}

// There used to be an "original" tier above 4096 that decoded the
// per-source full-size AVIF (capped at 8192 px) so the walkable scene
// reached true source detail at 1 m. It cost far more than it bought,
// and the byte clamp in `deriveTiers` exists to stop it recurring:
//
//   • Size. Of the 967 works whose source is bigger than 4096 px, the
//     median decodes to 237 MB of RGBA + mipmaps at the 8192 cap, up to
//     338 MB — and 576 of them are individually larger than the whole
//     hi-res pool budget. One painting could evict the entire pool and
//     still leave it over budget, so the next hi-res load evicted the
//     original straight back out. `lodUpdate` re-requests any tier that
//     isn't resident, so at 5 Hz that became a permanent treadmill of
//     quarter-gigabyte decodes and uploads while merely standing near a
//     big canvas. That is the walking stutter.
//   • Detail. The tier upgraded at 1.05 m, where a 1.5 m-tall canvas
//     fills the 75° vertical FOV — ~1600 device px on a retina laptop,
//     ~2160 on a 4K panel. The 4096 px variant is already 3072 px tall
//     on a 4:3 work. 8192 was 3× oversampled and unresolvable.
//
// Pixel-peeping still works: the zoom modal streams the DZI tile
// pyramid (see zoom-modal.tsx) and only uses the cached scene texture as
// an instant placeholder under the cross-fade.
//
// 6144 is the rung that replaces it, and it is affordable where 8192 was
// not for two reasons. It decodes to 144.7 MiB at 4:3 against 8192's
// 237 MB median, and — unlike the old tier, which every big work took
// unconditionally at 1.05 m — it is now gated by all three clamps
// above, so a work only reaches for it when it genuinely resolves
// >4096 px at D_MIN and the entry still fits the per-entry byte cap.
// At the current 320 MB pool that cap admits 6144 only on wide canvases
// (aspect ≥ 1.81); see HIRES_ENTRY_BYTE_CAP in texture-cache.ts.

export function Painting({
  placement,
  onSettled,
}: {
  placement: Placement;
  /** Fires once when the base 960 px texture has finished loading and
   *  also fires on final failure after retries. Used by Gallery3D to
   *  drive the start overlay without allowing one bad image to hang it. */
  onSettled?: (status: "loaded" | "failed") => void;
}) {
  const { artwork, position, rotation, widthM, heightM } = placement;
  const baseWidth = pickBaseWidth(artwork, Math.max(widthM, heightM));
  const url = variantProxyUrl(artwork.objectKey, baseWidth, "avif");

  // Aspect-corrected plane size. The slot's widthM/heightM are derived
  // from realDimensions (or pixel aspect, or a default) — but those can
  // disagree with the texture's actual aspect, in which case the
  // texture would be stretched onto a mismatched plane and the painting
  // would visibly distort. Once the texture loads we re-fit the plane
  // to the texture's true aspect within the slot bounds. The frame and
  // plaque resize alongside it so the whole assembly stays aspect-true.
  const [renderDims, setRenderDims] = useState({ widthM, heightM });
  // Reset when the placement changes (room/floor swap).
  useEffect(() => {
    setRenderDims({ widthM, heightM });
  }, [widthM, heightM]);

  const handleTextureAspect = useCallback(
    (texAspect: number) => {
      if (!Number.isFinite(texAspect) || texAspect <= 0) return;
      const fitted = fitToAspect(texAspect, widthM, heightM);
      setRenderDims((prev) => {
        if (
          Math.abs(prev.widthM - fitted.widthM) < 0.001 &&
          Math.abs(prev.heightM - fitted.heightM) < 0.001
        ) {
          return prev;
        }
        return fitted;
      });
    },
    [widthM, heightM],
  );

  const variant = FRAME_VARIANTS[pickFrameVariant(artwork)];
  const frameDepth = variant.depth;
  const frameInset = variant.inset;

  // Liner is a flat rim sitting on top of the frame's front face,
  // sandwiched between the frame face (at z = frameDepth/2) and the
  // canvas plane (at z = 0.014). Keep ≥1.5 mm on both sides to stay well
  // out of depth-buffer noise. Liner is canvas-sized + 2 × width in XY
  // so it's strictly inside the frame outer rectangle (no XY clipping)
  // and the canvas plane occludes its centre, leaving a visible rim.
  const linerDepth = 0.001;
  const linerClearance = 0.0015;
  const linerZ = frameDepth / 2 + linerClearance + linerDepth / 2;

  const dW = renderDims.widthM;
  const dH = renderDims.heightM;

  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={[dW + frameInset * 2, dH + frameInset * 2, frameDepth]} />
        <primitive object={variant.material} attach="material" />
      </mesh>
      {variant.liner && (
        <mesh position={[0, 0, linerZ]}>
          <boxGeometry
            args={[dW + variant.liner.width * 2, dH + variant.liner.width * 2, linerDepth]}
          />
          <primitive object={variant.liner.material} attach="material" />
        </mesh>
      )}
      <PaintingPlane
        url={url}
        baseWidth={baseWidth}
        origin={position}
        thumbUrl={variantProxyUrl(artwork.objectKey, 256, "avif")}
        widthM={dW}
        heightM={dH}
        artwork={artwork}
        onSettled={onSettled}
        onTextureAspect={handleTextureAspect}
      />
      <Plaque artwork={artwork} widthM={dW} />
    </group>
  );
}

/** Refit a plane size to match a texture aspect while staying inside
 *  the slot's max bounds. Width-first: if width-fit overshoots height,
 *  fall back to height-fit. The returned dimensions are <= the input
 *  bounds in both axes — never grows beyond the slot. */
function fitToAspect(
  texAspect: number,
  maxWidthM: number,
  maxHeightM: number,
): { widthM: number; heightM: number } {
  let w = maxWidthM;
  let h = maxWidthM / texAspect;
  if (h > maxHeightM) {
    h = maxHeightM;
    w = maxHeightM * texAspect;
  }
  return { widthM: w, heightM: h };
}

// Pick a frame variant that complements the painting's era. Each rule
// below is a substring match against the artwork's `movement` field —
// some entries in the dataset are slashed combos like "Realism /
// Impressionism", so the first match wins. Anything unmatched (and the
// non-trivial number of artworks with `movement: null`) falls through to
// a stable hash on the artwork id, which keeps a consistent look per
// painting across reloads while still spreading variety across the
// gallery.
function pickFrameVariant(artwork: ArtworkListing): FrameVariantId {
  const m = artwork.movement;
  if (m) {
    if (m.includes("Ukiyo-e")) return "redLacquer";
    if (
      m.includes("Renaissance") ||
      m.includes("Baroque") ||
      m.includes("Mannerism") ||
      m.includes("Academicism") ||
      m.includes("Neoclassicism")
    )
      return "gilded";
    if (
      m.includes("Impressionism") ||
      m.includes("Pre-Raphaelite") ||
      m.includes("Art Nouveau") ||
      m.includes("Neo-Impressionism")
    )
      return "paleAsh";
    if (
      m.includes("Modernism") ||
      m.includes("Fauvism") ||
      m.includes("Post-Impressionism") ||
      m.includes("Symbolism") ||
      m.includes("Expressionism")
    )
      return "ebony";
    if (
      m.includes("Dutch Golden Age") ||
      m.includes("Realism") ||
      m.includes("Romanticism") ||
      m.includes("Tonalism") ||
      m.includes("Regionalism")
    )
      return "walnut";
  }
  // Stable hash → deterministic per id, distributed across all five.
  const order: FrameVariantId[] = ["walnut", "ebony", "paleAsh", "gilded", "redLacquer"];
  let h = 0;
  for (let i = 0; i < artwork.id.length; i++) h = (h * 31 + artwork.id.charCodeAt(i)) | 0;
  return order[Math.abs(h) % order.length];
}

// ── Plaque ────────────────────────────────────────────────────────────
// A small museum-style label to the right of each painting at canvas
// centre height. Two-layer construction: a brass mount plate fixed
// flush to the wall, with a slightly inset cream face card on top
// carrying title / artist / year / dimensions in three sized lines.

// Cream face WIDTH is constant — placement code (place-paintings.ts)
// caps painting widths against PLAQUE_FOOTPRINT, which is built from
// this width plus PLAQUE_GAP. Don't change W without re-running
// placement. HEIGHT is adaptive: long titles bump the plaque taller
// so the title block doesn't crash through the byline (e.g. Hokusai
// "Tenman Bridge at Settsu Province (Sesshū Tenmanbashi), from the
// series Remarkable Views of Bridges in Various Provinces (Shokoku
// meikyō kiran)" — 144 chars overflows the standard plaque).
const PLAQUE_FACE_W = 0.28;
const PLAQUE_FACE_H_BASE = 0.18;
const PLAQUE_FACE_DEPTH = 0.004;
// Brushed-steel mount sits a hair larger than the face, framing it
// like a polished metal rim. Bigger reveal here makes the shimmer
// from the mount more visible at typical viewing distances.
const PLAQUE_MOUNT_REVEAL = 0.014;
const PLAQUE_MOUNT_PAD = PLAQUE_MOUNT_REVEAL * 2;
const PLAQUE_MOUNT_W = PLAQUE_FACE_W + PLAQUE_MOUNT_PAD;
const PLAQUE_MOUNT_DEPTH = 0.008;
const PLAQUE_GAP = 0.06;
// `placement.position` is offset PAINTING_WALL_OFFSET (= 0.02 m) into
// the room from the wall plane, so localZ = -PAINTING_WALL_OFFSET
// lands the plaque back exactly on the wall surface. Imported so the
// two ends of this contract can never drift apart silently.
// Small clearance so the plaque mount's back doesn't sit coplanar with
// the wall — coplanar geometry z-fights from any camera and shows
// through DoubleSide walls as wedge-shaped artefacts. 5 mm is enough
// for far-room viewing without making the plaque look detached.
const PLAQUE_WALL_CLEAR = 0.005;

const PLAQUE_TITLE_FONT = 0.022;
const PLAQUE_TITLE_LH = 1.15;
const PLAQUE_BYLINE_FONT = 0.018;
const PLAQUE_BYLINE_LH = 1.2;
const PLAQUE_DIMS_FONT = 0.014;
const PLAQUE_DIMS_LH = 1.15;
const PLAQUE_TEXT_PAD = 0.012;
const PLAQUE_LINE_GAP = 0.006;
/** Initial chars/line guess for the title font + plaque width — only
 *  used for the first frame before troika reports its actual rendered
 *  bounds via onSync. The bold title font averages ≈ 0.6 × fontSize
 *  per glyph; with title font 0.022 m and useful width 0.258 m that
 *  lands near ≈ 19 chars/line for ASCII and fewer with caps/diacritics.
 *  Pick conservative so the initial render usually OVERshoots, then
 *  we shrink to the measured size — better than the reverse, which
 *  flashes overlapping text. */
const PLAQUE_TITLE_CHARS_PER_LINE = 18;
const PLAQUE_BYLINE_CHARS_PER_LINE = 24;

const PLAQUE_TEXT_MAX_WIDTH = PLAQUE_FACE_W - 0.022;

/** Pull the rendered block height (in world meters) from a troika
 *  TextMesh's textRenderInfo. blockBounds is `[minX, minY, maxX, maxY]`
 *  and includes the line-height padding, so it equals the height the
 *  layout actually consumed. Returns null if sync hasn't completed yet. */
function readTroikaBlockHeight(mesh: unknown): number | null {
  const info = (mesh as { textRenderInfo?: { blockBounds?: ArrayLike<number> } } | null)
    ?.textRenderInfo;
  const bb = info?.blockBounds;
  if (!bb || bb.length < 4) return null;
  return Math.abs(bb[3] - bb[1]);
}

function Plaque({ artwork, widthM }: { artwork: ArtworkListing; widthM: number }) {
  const title = formatTitle(
    artwork.englishTitle?.trim() || artwork.title,
    artwork.artist ?? undefined,
  );
  const byline = formatByline(artwork);
  const dims = artwork.realDimensions
    ? `${artwork.realDimensions.widthCm.toFixed(0)} × ${artwork.realDimensions.heightCm.toFixed(0)} cm`
    : "";

  // Pre-render estimates — used for the first paint before troika
  // syncs and reports actual block bounds. The estimates use a word-
  // aware wrap so a single oversized word doesn't get overcounted, and
  // a conservative chars/line so the plaque starts a touch tall (and
  // shrinks to fit), never short (which would overlap text).
  const estTitleLines = estimateWrappedLines(title, PLAQUE_TITLE_CHARS_PER_LINE);
  const estBylineLines = estimateWrappedLines(byline, PLAQUE_BYLINE_CHARS_PER_LINE);
  const estTitleH = estTitleLines * PLAQUE_TITLE_FONT * PLAQUE_TITLE_LH;
  const estBylineH = estBylineLines * PLAQUE_BYLINE_FONT * PLAQUE_BYLINE_LH;

  // Measured block heights from troika onSync. Initialised to null so
  // the first render uses the estimates above; on the next frame the
  // measured values take over.
  const [titleH, setTitleH] = useState<number | null>(null);
  const [bylineH, setBylineH] = useState<number | null>(null);

  const handleTitleSync = useCallback((mesh: unknown) => {
    const h = readTroikaBlockHeight(mesh);
    if (h === null) return;
    setTitleH((prev) => (prev !== null && Math.abs(prev - h) < 0.0001 ? prev : h));
  }, []);
  const handleBylineSync = useCallback((mesh: unknown) => {
    const h = readTroikaBlockHeight(mesh);
    if (h === null) return;
    setBylineH((prev) => (prev !== null && Math.abs(prev - h) < 0.0001 ? prev : h));
  }, []);

  const titleBlockH = titleH ?? estTitleH;
  const bylineBlockH = bylineH ?? estBylineH;
  const dimsBlockH = dims ? PLAQUE_DIMS_FONT * PLAQUE_DIMS_LH : 0;
  const dimsGap = dims ? PLAQUE_LINE_GAP : 0;
  const stackedH =
    PLAQUE_TEXT_PAD * 2 + titleBlockH + PLAQUE_LINE_GAP + bylineBlockH + dimsGap + dimsBlockH;
  const PLAQUE_FACE_H = Math.max(PLAQUE_FACE_H_BASE, stackedH);
  const PLAQUE_MOUNT_H = PLAQUE_FACE_H + PLAQUE_MOUNT_PAD;

  // Plaque always hangs on the painting's right (local +X). Slot sizing
  // in place-paintings.ts guarantees painting + plaque clear the wall
  // margin even at right-corner cells, so no flip is needed.
  const localX = widthM / 2 + PLAQUE_GAP + PLAQUE_MOUNT_W / 2;
  const localY = 0;
  // Mount sits a few mm off the wall so it doesn't z-fight with it; face
  // is parked just in front of the mount; text floats a hair above the
  // face for the same reason.
  const mountCenterZ = -PAINTING_WALL_OFFSET + PLAQUE_WALL_CLEAR + PLAQUE_MOUNT_DEPTH / 2;
  const faceCenterZ = mountCenterZ + PLAQUE_MOUNT_DEPTH / 2 + PLAQUE_FACE_DEPTH / 2;
  const textZ = faceCenterZ + PLAQUE_FACE_DEPTH / 2 + 0.001;

  // Top-aligned text stack — title hugs the top edge, byline sits one
  // gap below the title block, dims one gap below the byline. Anchor
  // top so positions describe each block's UPPER edge regardless of
  // line count.
  const topY = PLAQUE_FACE_H / 2 - PLAQUE_TEXT_PAD;
  const titleTopY = topY;
  const bylineTopY = titleTopY - titleBlockH - PLAQUE_LINE_GAP;
  const dimsTopY = bylineTopY - bylineBlockH - PLAQUE_LINE_GAP;

  return (
    <group position={[localX, localY, 0]}>
      {/* Brass mount plate */}
      <mesh position={[0, 0, mountCenterZ]}>
        <boxGeometry args={[PLAQUE_MOUNT_W, PLAQUE_MOUNT_H, PLAQUE_MOUNT_DEPTH]} />
        <primitive object={plaqueMountMaterial} attach="material" />
      </mesh>
      {/* Cream face card on top of the mount */}
      <mesh position={[0, 0, faceCenterZ]}>
        <boxGeometry args={[PLAQUE_FACE_W, PLAQUE_FACE_H, PLAQUE_FACE_DEPTH]} />
        <primitive object={plaqueBaseMaterial} attach="material" />
      </mesh>
      {/* Title — bold and largest. */}
      <Text
        position={[0, titleTopY, textZ]}
        fontSize={PLAQUE_TITLE_FONT}
        lineHeight={PLAQUE_TITLE_LH}
        color="#0d0a08"
        fontWeight={700}
        anchorX="center"
        anchorY="top"
        maxWidth={PLAQUE_TEXT_MAX_WIDTH}
        textAlign="center"
        onSync={handleTitleSync}
      >
        {title}
      </Text>
      {/* Artist · year */}
      <Text
        position={[0, bylineTopY, textZ]}
        fontSize={PLAQUE_BYLINE_FONT}
        lineHeight={PLAQUE_BYLINE_LH}
        color="#1c1410"
        anchorX="center"
        anchorY="top"
        maxWidth={PLAQUE_TEXT_MAX_WIDTH}
        textAlign="center"
        onSync={handleBylineSync}
      >
        {byline}
      </Text>
      {/* Dimensions — smaller, slightly lighter. Never wraps (X × Y cm
          fits comfortably) so we don't need to measure it. */}
      {dims && (
        <Text
          position={[0, dimsTopY, textZ]}
          fontSize={PLAQUE_DIMS_FONT}
          lineHeight={PLAQUE_DIMS_LH}
          color="#3a2c22"
          anchorX="center"
          anchorY="top"
          maxWidth={PLAQUE_TEXT_MAX_WIDTH}
          textAlign="center"
        >
          {dims}
        </Text>
      )}
    </group>
  );
}

/** Word-aware wrap line counter — walks the words and pushes to a new
 *  line whenever the next word would exceed `maxChars`. Better than
 *  `ceil(len/maxChars)` because text wraps at word boundaries; a
 *  single oversized word past the boundary forces a fresh line even
 *  if the running total is well under `maxChars`. */
function estimateWrappedLines(text: string, maxChars: number): number {
  const trimmed = text.trim();
  if (!trimmed) return 1;
  const words = trimmed.split(/\s+/);
  let lines = 1;
  let lineLen = 0;
  for (const word of words) {
    if (lineLen === 0) {
      lineLen = word.length;
    } else if (lineLen + 1 + word.length <= maxChars) {
      lineLen += 1 + word.length;
    } else {
      lines++;
      lineLen = word.length;
    }
  }
  return Math.max(1, lines);
}

/** Normalise an artwork title for plaque display. Strips a handful
 *  of common upstream-import patterns that bloat the title without
 *  adding information at gallery-viewing scale:
 *
 *   - Wikimedia label noise: `label QS:Len,"Foo"` → `Foo`.
 *   - Stray `" Alternative title:` Wikidata segments — keep just the
 *     first quoted variant.
 *   - "from the series ..." Hokusai-style suffixes plus their
 *     parenthetical Japanese transliterations: the series name is
 *     redundant in a gallery setting and pushes single titles past
 *     150 chars.
 *   - Dataset breadcrumbs: " - Google Art Project", " - Google
 *     Cultural Institute", trailing ".jpg" filename remnants.
 *   - Audubon plate-list titles ("434 I. Little Tyrant Fly-catcher
 *     - 2. Small-headed Fly-catcher - …") collapsed to "Plate 434:
 *     Little Tyrant Fly-catcher (and N more)". */
/** Specific titles that aren't fixed by any pattern rule — typos,
 *  museum-tagged suffixes, "by Artist (year, museum)" trailers
 *  baked into the title field. Keys are NFC-normalised so they match
 *  regardless of whether the source data stores e.g. "Sesshū" as a
 *  precomposed glyph or "u + combining macron". */
const TITLE_REWRITES = new Map<string, string>(
  [
    [
      "Tenman Bridge at Settsu Province (Sesshū Tenmanbashi), from the series Remarkable Views of Bridges in Various Provinces (Shokoku meikyō kiran)",
      "Tenman Bridge at Settsu Province (Sesshū Tenmanbashi)",
    ],
    [
      "Wang Meng Dwelling in the Qingbian Mountains. ink on paper. 1366. 141x42",
      "Dwelling in the Qingbian Mountains",
    ],
    [
      "At first glance he looks very fiarce, but he s really a nice person",
      "At first glance he looks fierce, but he's really a nice person",
    ],
    [
      "Moreno Garden Bordighera 1884 - The Norton Museum Miami Florida",
      "Moreno Garden, Bordighera",
    ],
    [
      "Mt. Heng, after Juran (active ca. 960–965), from the Mustard Seed Garden Manual of Painting MET DP",
      "Mt. Heng, after Juran, from the Mustard Seed Garden Manual of Painting",
    ],
    [
      "Alexandra and Elena Pavlovna of Russia by E.Vigee-Lebrun (1796, Hermitage)",
      "Alexandra and Elena Pavlovna of Russia",
    ],
    [
      "An Experiment on a Bird in an Air Pump by Joseph Wright 'of Derby",
      "An Experiment on a Bird in an Air Pump",
    ],
    [
      "Famous Views of the 60 Provinces - #23. Yoro Waterfall in Mino Province",
      "Yoro Waterfall in Mino Province",
    ],
    [
      "36 Views of Mt. Fuji - #11. Wild Goose Hill and the Tone River",
      "Wild Goose Hill and the Tone River",
    ],
    [
      "A Frank Encampment in the Desert of Mount Sinai. 1842 - The Convent of St. Catherine in the Distance",
      "A Frank Encampment in the Desert of Mount Sinai",
    ],
  ].map(([k, v]) => [k.normalize("NFC"), v]),
);

/** Abbreviations whose trailing period is part of the word — never
 *  strip when the title ends with one. */
const TRAILING_ABBREV_RX =
  /\b(Mr|Mrs|Ms|Dr|St|Sr|Jr|Inc|Co|Ltd|fl|ca|cm|in|d\. ?J|d\. ?Ä|etc|vs|Ave|Blvd|i\.e|e\.g)\.$/i;

function formatTitle(rawTitle: string, artist?: string): string {
  let t = rawTitle.trim();

  const rewrite = TITLE_REWRITES.get(t.normalize("NFC"));
  if (rewrite) return rewrite;

  const labelMatch = t.match(/label QS:L\w+,"([^"]+)"/);
  if (labelMatch) t = labelMatch[1];
  const labelCut = t.indexOf(" label QS:");
  if (labelCut > 0) t = t.slice(0, labelCut).trim();

  const altIdx = t.indexOf(`" Alternative title:`);
  if (altIdx > 0) {
    t = t.slice(0, altIdx).trim();
    if (t.startsWith(`"`)) t = t.slice(1).trim();
  }
  const altIdx2 = t.indexOf("Alternative title");
  if (altIdx2 > 0)
    t = t
      .slice(0, altIdx2)
      .replace(/[":\s]+$/, "")
      .trim();

  const seriesIdx = t.indexOf(", from the series ");
  if (seriesIdx > 0) t = t.slice(0, seriesIdx).trim();

  t = t.replace(/\s+-\s+Google Art Project$/i, "");
  t = t.replace(/\s+-\s+Google Cultural Institute$/i, "");
  t = t.replace(/\s+C2RMF(\s+retouched)?\s*$/i, "");
  t = t.replace(/\.jpe?g$/i, "");
  t = t.replace(/^\d+px-/, "");

  // "Artist - Title" prefix — if the title leads with the artist's
  // name (or just their last token) followed by a separator, drop it
  // (the byline already shows the artist). Tries the full name first,
  // then falls back to the last whitespace-separated token so dataset
  // shorthand like "Turner - The Eruption…" (artist field "J. M. W.
  // Turner") is also caught.
  if (artist) {
    const a = artist.trim();
    if (a.length > 1) {
      const fullPrefix = `${a} - `;
      if (t.toLowerCase().startsWith(fullPrefix.toLowerCase())) {
        t = t.slice(fullPrefix.length).trim();
      } else {
        const tokens = a.split(/\s+/);
        const last = tokens[tokens.length - 1];
        if (last && last.length > 2) {
          const lastPrefix = `${last} - `;
          if (t.toLowerCase().startsWith(lastPrefix.toLowerCase())) {
            t = t.slice(lastPrefix.length).trim();
          }
        }
      }
    }
  }

  const audubonMatch = t.match(/^(\d{2,4})\s+I\.\s+(.+)$/);
  if (audubonMatch) {
    const plateNum = audubonMatch[1];
    const rest = audubonMatch[2];
    const items = rest.split(/\s*-\s*\d+\.\s*/);
    const first = items[0]?.trim();
    const more = items.length - 1;
    if (first) {
      t = more > 0 ? `Plate ${plateNum}: ${first} (+${more} more)` : `Plate ${plateNum}: ${first}`;
    }
  }

  t = t
    .replace(/_/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Trailing period — many descriptive titles end in `.` because the
  // source treated them as sentences; museum convention is to omit
  // it. Skip well-known abbreviations so "Holbein d. J." and "St."
  // aren't truncated.
  if (t.endsWith(".") && !t.endsWith("..") && !TRAILING_ABBREV_RX.test(t)) {
    t = t.slice(0, -1).trim();
  }

  return t;
}

/** Format the artist+year line for the plaque. Strips filename junk
 *  ("Foo_bar.jpg : Artist Name") and dedupes repeated attributions
 *  from comma/slash-separated artist fields. */
function formatByline(artwork: ArtworkListing): string {
  let artist = artwork.artist?.trim() ?? "Unknown";
  if (artist.includes(".jpg") || artist.includes(".jpeg")) {
    const colonParts = artist.split(/\s*:\s*/);
    const named = colonParts.filter((p) => !/\.jpe?g/i.test(p) && p.trim().length > 0);
    if (named.length > 0) {
      const seen = new Set<string>();
      artist = named
        .filter((p) => {
          const key = p.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .join(" / ");
    }
  }
  artist = artist
    .replace(/derivative work[^,]*$/i, "")
    .trim()
    .replace(/[,/]\s*$/, "");

  const slashParts = artist.split(/\s*\/\s*/);
  if (slashParts.length > 2) {
    artist = `${slashParts[0]} et al.`;
  }

  const year = artwork.year ? String(artwork.year) : "";
  return year ? `${artist}, ${year}` : artist;
}

function PaintingPlane({
  url,
  baseWidth,
  origin,
  thumbUrl,
  widthM,
  heightM,
  artwork,
  onSettled,
  onTextureAspect,
}: {
  /** 480 or 960 px AVIF (see pickBaseWidth) — the base "good enough"
   *  texture; once it lands the painting reads as fully loaded. */
  url: string;
  /** Width of that base variant. LOD tiers at or below it are skipped —
   *  upgrading to a texture the painting already shows is pure waste. */
  baseWidth: number;
  /** World position of this painting. Handed to every load it starts so
   *  the shared network / GPU-upload queues can serve the paintings
   *  nearest the player first — otherwise a floor loads in mount order
   *  and the room you're standing in waits behind rooms you can't see. */
  origin: readonly [number, number, number];
  /** 256 px AVIF — tiny placeholder, typically lands within ~100 ms.
   *  Stretched onto the painting plane it reads as a soft blur of the
   *  real artwork, replacing the old solid-brown swatch flash. */
  thumbUrl: string;
  widthM: number;
  heightM: number;
  artwork: Placement["artwork"];
  onSettled?: (status: "loaded" | "failed") => void;
  /** Reports the loaded texture's true pixel aspect (w/h). Parent uses
   *  this to refit the plane + frame to the texture's real shape, so a
   *  bad realDimensions value can't visibly distort the painting. */
  onTextureAspect?: (aspect: number) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const entryRef = useRef<PaintingEntry | null>(null);
  const { gl } = useThree();
  // Backing-buffer height, quantised — and the quantised value is what
  // the ladder is DERIVED from, not just what re-triggers the
  // derivation. The two have to be the same number. Deriving from the
  // raw `gl.domElement.height` while keying the effect on a bucket meant
  // the ladder was sized for whatever height was live the last time the
  // bucket happened to change, so two identical works mid-drag-resize
  // could end up with different ladders — the same arrival-time
  // nondeterminism the reference FOV above exists to remove.
  //
  // Honest tolerance, because an earlier version of this comment claimed
  // more than it delivered: rung selection is a hard `effW >= wantPx`
  // threshold, not a ratio, so a quantisation error near a boundary DOES
  // flip the chosen rung. At ±128 px against ~1800 (≈7%), 231 of the
  // 2,801 real placements pick a different top rung between the two
  // extremes of one bucket. The effect is bounded — the neighbouring
  // rung is by construction the next one up or down the same ladder, a
  // median 1.33x in effective pixels — and it buys a drag-resize that
  // re-derives a handful of times instead of once per animation frame
  // across every mounted painting. That is the trade; it is not a
  // guarantee that the rung never changes.
  const derivationHeightPx = useThree(
    (s) =>
      Math.max(1, Math.round((s.size.height * s.viewport.dpr) / LOD_HEIGHT_QUANTUM_PX)) *
      LOD_HEIGHT_QUANTUM_PX,
  );

  // Track the base 960 px texture. The LOD effect uses this as the
  // "demote target" when the player retreats past every higher tier.
  // Held in a ref (not state) so swapping it doesn't re-run the LOD
  // registration effect — that would abort in-flight prefetches and
  // reset displayedTier mid-walk.
  const baseTextureRef = useRef<THREE.Texture | null>(null);
  const [baseLoaded, setBaseLoaded] = useState(false);
  // Which rung is currently on the material, held as the rung's variant
  // WIDTH (0 = the base texture) rather than an index into `tiers`.
  // Survives a re-run of the LOD effect — which now happens on resize —
  // so re-deriving the ladder doesn't drop every painting back to its
  // base texture for a tick. A width also stays meaningful when the
  // re-derived ladder has a different length, which an index would not.
  const displayedWidthRef = useRef(0);

  // Sync the material's initial map + color BEFORE the first paint so
  // the swatch never flashes on a return visit. Runs once after the
  // mesh + material refs land. We do NOT bind `map` or `color` as JSX
  // props on <meshBasicMaterial> below, because R3F re-applies prop
  // values on every reconciliation — that would silently overwrite
  // both this initial install AND the .then mutations from the load
  // effect (you'd see paintings stuck at the brown swatch even after
  // the texture loaded).
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot mount setup; the load effect below handles updates after.
  useLayoutEffect(() => {
    const material = matRef.current;
    if (!material) return;
    const cachedBase = peekCached(url);
    const cachedThumb = cachedBase ? null : peekCached(thumbUrl);
    const initial = cachedBase ?? cachedThumb;
    if (initial) {
      material.map = initial;
      material.color.setHex(0xffffff);
      if (cachedBase) {
        baseTextureRef.current = cachedBase;
        setBaseLoaded(true);
        onSettled?.("loaded");
        const img = cachedBase.image as { width?: number; height?: number } | undefined;
        if (img?.width && img?.height) {
          onTextureAspect?.(img.width / img.height);
        }
      }
    } else {
      material.color.setHex(0x3a2e20);
    }
    material.needsUpdate = true;
  }, []);

  // Progressive loader: kick off both the 256 placeholder and the 960
  // base in parallel. Whichever lands first paints. If 256 wins (the
  // common case — it's 10× smaller), the 960 then upgrades on top of
  // it; if 960 wins (return-visit cache hit, or fast network), the
  // thumb is silently discarded and we never bother painting it.
  //
  // Same warning as the layout effect above: we mutate material.map
  // and material.color directly here, not via JSX props.
  // biome-ignore lint/correctness/useExhaustiveDependencies: onSettled / onTextureAspect identity is unstable; we want one-shot fire on base load.
  useEffect(() => {
    const material = matRef.current;
    if (!material) return;
    let cancelled = false;
    let baseInstalled = baseTextureRef.current !== null;
    // A new base URL means a different artwork (hallway paintings are
    // keyed by slot, so the component instance can be reused across a
    // floor swap). Whatever rung was displayed belonged to the previous
    // work, so forget it — otherwise the LOD effect could re-adopt an
    // index that now names a different image.
    displayedWidthRef.current = 0;

    if (!baseInstalled) {
      loadCached(thumbUrl, gl, origin)
        .then((tex) => {
          if (cancelled || baseInstalled) return;
          // Install the placeholder. The 960 will overwrite this when
          // it lands; the texture itself stays in the LRU (cheap, ~tens
          // of KB) so a return visit is instant.
          material.map = tex;
          material.color.setHex(0xffffff);
          material.needsUpdate = true;
        })
        .catch(() => {
          // 256 might 404 for a sub-256 px source — silent fallback to
          // the brown swatch until the base lands.
        });
    }

    loadCached(url, gl, origin)
      .then((tex) => {
        if (cancelled) return;
        baseInstalled = true;
        baseTextureRef.current = tex;
        material.map = tex;
        material.color.setHex(0xffffff);
        material.needsUpdate = true;
        setBaseLoaded(true);
        onSettled?.("loaded");
        const img = tex.image as { width?: number; height?: number } | undefined;
        if (img?.width && img?.height) {
          onTextureAspect?.(img.width / img.height);
        }
      })
      .catch((err) => {
        console.warn(`[painting] failed to load ${url}: ${formatLoadError(err)}`);
        onSettled?.("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [url, thumbUrl, origin, gl]);

  // Early registration so the painting raycasts as a target the
  // moment its mesh exists, even before any texture has loaded. The
  // LOD effect below attaches lodUpdate once the base texture lands;
  // until then this entry just contributes a clickable plane.
  //
  // CRITICAL: this effect is declared BEFORE the LOD effect so React
  // runs it first on mount. If the order were swapped, a cache-hit
  // mount (where baseLoaded starts true) would have the LOD effect
  // run first and find entryRef.current === null, so lodUpdate would
  // never get attached and the painting would be stuck at 960 px for
  // the rest of the session — even when the player walks right up to
  // it. Don't reorder.
  // biome-ignore lint/correctness/useExhaustiveDependencies: widthM/heightM are intentionally omitted — see lodUpdate effect for the same reason. The follow-up effect below keeps the entry's halfW/halfH in sync.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.getWorldQuaternion(_registerScratchQuat);
    const worldRight = new THREE.Vector3(1, 0, 0).applyQuaternion(_registerScratchQuat);
    const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(_registerScratchQuat);
    const entry: PaintingEntry = {
      mesh,
      worldPos: mesh.getWorldPosition(new THREE.Vector3()),
      worldRight,
      worldUp,
      halfW: widthM / 2,
      halfH: heightM / 2,
      artwork,
    };
    entryRef.current = entry;
    registerPainting(entry);
    return () => {
      unregisterPainting(entry);
      entryRef.current = null;
    };
  }, [artwork]);

  // Proximity LOD upgrades. Gated on `baseLoaded` so we don't try to
  // swap to a hi-res tier before the base is even up — until then
  // there's nothing to demote back to. Also the point where this
  // painting's tier ladder and distance bands are derived: it already
  // holds the base texture (so the true pixel aspect is known) and
  // `gl` (so the backing height and the GPU's texture limit are), and it
  // runs once per mount rather than per frame. Always runs AFTER the
  // early-registration effect above (declaration order); see the warning
  // there.
  // biome-ignore lint/correctness/useExhaustiveDependencies: widthM/heightM are intentionally omitted — re-registering allocates AbortControllers and aborts in-flight prefetches, which we don't want to redo every time the parent refits the plane to the texture's true aspect. The derivation below re-applies that refit itself from the base texture's pixels, so it does not need the props to have settled. The follow-up effect mutates entry.halfW/halfH instead.
  useEffect(() => {
    if (!baseLoaded) return;
    const mesh = meshRef.current;
    const material = matRef.current;
    const baseTexture = baseTextureRef.current;
    if (!mesh || !material || !baseTexture) return;

    // The plane's true rendered width. The parent refits widthM/heightM
    // to the texture's real pixel aspect once the base load reports it,
    // and this effect deliberately omits those from its deps — so the
    // prop may still be the pre-refit slot width. Re-deriving the fit
    // here from the base texture's own pixels (idempotent: refitting
    // already-fitted dims returns them unchanged) keeps the LOD target
    // off React's render ordering. Same width-first rule as fitToAspect.
    const img = baseTexture.image as { width?: number; height?: number } | undefined;
    const texAspect = img?.width && img?.height ? img.width / img.height : widthM / heightM;
    const renderWidthM = widthM / heightM > texAspect ? heightM * texAspect : widthM;

    const tiers = deriveTiers(
      artwork,
      baseWidth,
      renderWidthM,
      texAspect,
      derivationHeightPx,
      gl.capabilities.maxTextureSize,
    );
    const tierUrls = tiers.map((t) => variantProxyUrl(artwork.objectKey, t.width, "avif"));
    const tierLoadOpts: LoadHiResOpts[] = tiers.map(() => ({ origin }));
    const pending: (AbortController | null)[] = tiers.map(() => null);

    // -1 = the base texture; otherwise an index into `tiers`. Recovered
    // from the ref so a re-derivation (resize) keeps showing whatever is
    // already up.
    //
    // When the rung it named is gone from the new ladder — which happens
    // whenever the window SHRINKS past a quantum, for 13–26% of works
    // depending on the step — the old code reset the material to the base
    // texture on the spot and only recovered on the next 5 Hz tick. That
    // is a visible pop from 2560 px down to a 480 px base for up to
    // 200 ms, on the painting the player is standing in front of, every
    // time they drag a window smaller. Instead, fall back to the sharpest
    // rung of the NEW ladder that is already resident: the ladder shrank
    // by dropping its top, so the rung below it is normally still warm
    // (`lowestUsefulTier` keeps displayed+1 touched) and the step down is
    // one rung rather than all of them. `getHiRes` MRU-touches, so what
    // we adopt is pinned rather than a candidate for the eviction we'd
    // otherwise be racing. Base texture only if nothing survives.
    //
    // Note we do NOT keep displaying the vanished rung: nothing would
    // touch it in the LRU any more, so it could be disposed out from
    // under the material — the "painting renders as nothing" ghost the
    // `peekCached` call below exists to prevent.
    let displayedTier = -1;
    if (displayedWidthRef.current !== 0) {
      displayedTier = tiers.findIndex((t) => t.width === displayedWidthRef.current);
      if (displayedTier === -1) {
        for (let i = 0; i < tiers.length; i++) {
          if (getHiRes(tierUrls[i]) !== undefined) {
            displayedTier = i;
            break;
          }
        }
        material.map =
          displayedTier === -1 ? baseTexture : (getHiRes(tierUrls[displayedTier]) ?? baseTexture);
        material.needsUpdate = true;
        displayedWidthRef.current = displayedTier === -1 ? 0 : tiers[displayedTier].width;
      }
    }

    const lodUpdate = (distSq: number, displaySq: number) => {
      // Touch the base 960 px texture in the LRU on every tick so it
      // can't be evicted while this painting is mounted. The texture
      // cache disposes evicted entries (frees the GPU upload), and a
      // painting still holding a now-disposed texture renders as
      // nothing — that was the "images don't show up after going back
      // down a floor" symptom: a fresh floor's load burst pushed the
      // previous floor's textures past the LRU's 96-entry capacity,
      // disposed them, and on revisit the painting tried to render a
      // ghost. The old useCachedTexture path got this for free because
      // it called cache.get() (an MRU-touch) on every render; the
      // progressive loader peeks once on mount and otherwise wouldn't
      // touch the cache at all.
      peekCached(url);

      // Prefetch each tier as the player enters its radius. `distSq`
      // here, in real metres — not the FOV-normalised `displaySq`. A
      // prefetch radius is a bet about how far the player might WALK
      // before the bytes land, and walking cancels the FOV zoom outright
      // (player.tsx), so a stationary zoomed player must not pull the
      // room's top rungs into the pool at 2.43x their radius. What zoom
      // does change is which of the already-fetched rungs displays, and
      // that is the picker's business below. getHiRes
      // (used as our "is it cached?" check) touches MRU as a side effect,
      // so prefetched tiers stay alive in the LRU as long as we're still
      // in their prefetch radius — they only become eviction candidates
      // once the player walks past the release boundary.
      // Stop one rung below the tier we're already showing. Lower
      // indices are sharper, so anything further down is a stepping
      // stone we've climbed past — re-fetching it only adds eviction
      // pressure to the hi-res pool, and because `lodUpdate` re-requests
      // whatever isn't resident, the LRU freeing one would put it
      // straight back in the queue on the next tick.
      //
      // The one rung of slack is the retreat path: `getHiRes` here also
      // MRU-touches, so the tier we'd demote to on walking away stays
      // warm instead of aging out and popping back to the base texture
      // for a tick.
      const lowestUsefulTier =
        displayedTier === -1 ? tiers.length - 1 : Math.min(displayedTier + 1, tiers.length - 1);
      for (let i = 0; i <= lowestUsefulTier; i++) {
        const tier = tiers[i];
        if (distSq < tier.prefetchSq && !pending[i] && getHiRes(tierUrls[i]) === undefined) {
          const ctl = new AbortController();
          pending[i] = ctl;
          loadHiRes(tierUrls[i], gl, ctl.signal, tierLoadOpts[i])
            .catch(() => {})
            .finally(() => {
              if (pending[i] === ctl) pending[i] = null;
            });
        }
      }

      // Pick the highest tier we should display: walk highest → lowest,
      // upgrade if we're inside upgradeSq, or hold our current tier if
      // we're still inside its downgradeSq (hysteresis). First match
      // wins. `displaySq`, not `distSq` — see the prefetch loop above.
      //
      // The hold test is strictly weaker than the acquire test and
      // downgrade > upgrade for every tier, so at any fixed distance the
      // picker has a fixed point — a player standing near a boundary
      // cannot flip between two textures. That anti-oscillation property
      // is structural, which is why the derived bands keep the ratios
      // rather than deriving downgrade independently: any scheme where
      // downgrade could land below upgrade oscillates at the LOD tick
      // rate.
      //
      // The absolute margin the ratio buys is 0.4 × the tier's upgrade
      // radius. Measured over the 2,801 real placements, the tightest
      // rung in the corpus has an upgrade radius of 0.38 m at an 1800 px
      // backing height (0.45 m at 2160, 0.22 m on a small 1024 px
      // window), so the smallest gap anywhere is ~0.15 m — ~0.09 m at
      // 1024. Still two orders of magnitude above the sub-centimetre
      // head-bob and strafe jitter it defends against, but roughly half
      // what an earlier version of this comment claimed: anyone trimming
      // DOWNGRADE_RATIO toward 1.0 has less headroom than that number
      // suggested.
      let targetTier = -1;
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const want =
          (displayedTier === i && displaySq < tier.downgradeSq) || displaySq < tier.upgradeSq;
        if (!want) continue;
        const tex = getHiRes(tierUrls[i]); // touches MRU → pins it
        if (tex) {
          targetTier = i;
          break;
        }
      }

      if (targetTier !== displayedTier) {
        material.map =
          targetTier === -1 ? baseTexture : (getHiRes(tierUrls[targetTier]) ?? baseTexture);
        material.needsUpdate = true;
        displayedTier = targetTier;
        displayedWidthRef.current = targetTier === -1 ? 0 : tiers[targetTier].width;
      }

      // Past the release radius for a given tier — abort any pending
      // fetch. The texture (if any was placed in the LRU before we
      // got here) is left to age out naturally.
      for (let i = 0; i < tiers.length; i++) {
        if (distSq > tiers[i].releaseSq) {
          const ctl = pending[i];
          if (ctl) {
            ctl.abort();
            pending[i] = null;
          }
        }
      }
    };

    const entry = entryRef.current;
    if (entry) {
      // Painting was already registered (raycast-only) by the early
      // mount effect below. Upgrade it in place so we don't churn the
      // registry, and so we don't lose the entry mid-frame for a tick.
      entry.lodUpdate = lodUpdate;
    }
    return () => {
      // Abort any prefetches; leave the entry in the registry — the
      // early-mount effect owns its lifecycle. Strip lodUpdate so a
      // stale closure can't fire after baseLoaded flips back.
      for (const ctl of pending) ctl?.abort();
      const e = entryRef.current;
      if (e) e.lodUpdate = undefined;
    };
  }, [baseLoaded, artwork, baseWidth, origin, gl, derivationHeightPx]);

  // The parent re-fits widthM/heightM to the texture's true aspect once
  // the 960 px load reports it. Keep the registered entry's half-extents
  // in sync without re-running the heavy registration effects.
  useEffect(() => {
    const entry = entryRef.current;
    if (!entry) return;
    entry.halfW = widthM / 2;
    entry.halfH = heightM / 2;
  }, [widthM, heightM]);

  return (
    <mesh ref={meshRef} position={[0, 0, 0.014]} userData={{ artwork }}>
      <planeGeometry args={[widthM, heightM]} />
      {/* No `map` or `color` props — both are mutated directly on the
          material via the layout effect (initial state) and load effect
          (progressive install + LOD upgrades). Binding them as JSX
          props would let R3F's reconciler re-apply them on every
          re-render, silently overwriting the install (paintings would
          stay stuck on the brown swatch even after the texture
          loaded). `toneMapped` is the only stable prop. */}
      <meshBasicMaterial ref={matRef} toneMapped={false} />
    </mesh>
  );
}

function formatLoadError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
