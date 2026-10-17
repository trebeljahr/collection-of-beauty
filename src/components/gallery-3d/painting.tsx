"use client";

import { Text } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ArtworkListing } from "@/lib/data";
import type { Palette } from "@/lib/gallery-eras";
import {
  FINISHES,
  type FrameDesign,
  frameExtents,
  frameMoulding,
  frameScale,
  pickFrameDesign,
} from "@/lib/gallery-layout/frame-design";
import {
  PAINTING_WALL_OFFSET,
  PLAQUE_GAP,
  PLAQUE_HEIGHT,
  PLAQUE_WIDTH,
  plaqueBesideFrame,
} from "@/lib/gallery-layout/place-paintings";
import { layoutPanels, type PanelPlacement } from "@/lib/gallery-layout/polyptych";
import { baseVariantWidth } from "@/lib/gallery-layout/reveal-budget";
import { paletteOfRoom } from "@/lib/gallery-layout/room-era";
import type { Placement, RoomLayout } from "@/lib/gallery-layout/types";
import { CELL_SIZE } from "@/lib/gallery-layout/world-coords";
import { formatCm, trustworthyRealSize } from "@/lib/real-size";
import { textureVariantUrl } from "@/lib/utils";
import { ladderHeightPx } from "./camera-config";
import { UNREFLECTED_LAYER } from "./floor-mirror";
import { buildFrameGeometry } from "./frame-geometry";
import { FramePaint } from "./frame-paint";
import { PaintingLight } from "./painting-light";
import { buildLightRig, wallContextFor } from "./painting-light-rig";
import {
  derivePaintingLodTiers,
  type LodRequest,
  type LodSample,
  planPaintingLod,
  selectLodTier,
} from "./painting-lod";
import { createPaintingPreview } from "./painting-preview";
import { type PaintingEntry, registerPainting, unregisterPainting } from "./painting-registry";
import { frameMaterials, plaqueBaseMaterial, plaqueMountMaterial } from "./palette-materials";
import { buildPanelGeometry } from "./panel-geometry";
import { setWorkBounds } from "./room-culling";
import { inRoomLight } from "./room-light";
import {
  getHiRes,
  isPrefetched,
  type LoadOrigin,
  loadCached,
  peekCached,
  retainHiRes,
  roomLoadZone,
  tryLoadHiRes,
} from "./texture-cache";
import { poolGainScale } from "./wall-light";

/**
 * One painting on a wall. Renders a thin box behind the canvas so the
 * painting has some depth (the wall behind is roughly 0.05 m away),
 * with a textured plane on the front. Registers itself with the
 * global painting-registry so the Player's aim raycast can skip the
 * full scene traversal.
 *
 * A 480 px base fills the room quickly; proximity upgrades add detail.
 * An embedded blur preview covers the network wait on first visits.
 * The texture-cache handles LRU eviction + rAF-paced GPU uploads so a floor-wide burst of
 * loads doesn't hitch the frame.
 */
// Registration runs only at mount; the controller reuses these world axes.
const _registerScratchQuat = new THREE.Quaternion();
const LOD_HEIGHT_QUANTUM_PX = 256;

/** Memoised on its props: `RoomGeometry` re-renders every frame of its
 *  paintings reveal ramp (`setCount` from `useFrame`), and without this
 *  every already-mounted painting on the floor would re-run its plaque
 *  formatting on each of those frames. Both props are referentially
 *  stable per painting — `placement` comes from a room's fixed reveal
 *  order, and `onSettled` from the caller's per-key handler cache — so
 *  the default shallow comparison is enough. */
export const Painting = memo(function Painting({
  placement,
  room,
  revealed = true,
  onSettled,
}: {
  placement: Placement;
  /** The room the work hangs in: its walls, doors and floor bound the
   *  picture light's pool. */
  room: RoomLayout;
  /** False while the room is out of reach (room-geometry.tsx): the work
   *  is then its picture light and a stand-in, with no texture, frame
   *  geometry or plaque. The light is the same one in both states, so
   *  it neither goes out nor comes on as the visitor walks up. */
  revealed?: boolean;
  /** Fires once when the base 960 px texture has finished loading and
   *  also fires on final failure after retries. Used by Gallery3D to
   *  drive the start overlay without allowing one bad image to hang it. */
  onSettled?: (status: "loaded" | "failed") => void;
}) {
  const { artwork, position, rotation, widthM, heightM, frame } = placement;
  // A modest base fills rooms quickly. The proximity ladder adds detail
  // only as the player approaches, including 960 px for larger canvases.
  const baseWidth = baseVariantWidth(artwork);
  const url = textureVariantUrl(artwork.objectKey, baseWidth, "avif");
  // Its loads queue by the room it hangs in (texture-cache.ts).
  const loadOrigin = useMemo(
    (): LoadOrigin => ({ at: position, zone: roomLoadZone(room) }),
    [position, room],
  );

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
      // A polyptych's panels have their own sizes; its scan's shape,
      // the frames between the panels included, is not the work's.
      if (artwork.polyptych) return;
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
    [widthM, heightM, artwork.polyptych],
  );

  // The frame the hang chose, which the placement carries.
  const design = useMemo(() => frame ?? pickFrameDesign(artwork), [frame, artwork]);
  // Frame and plaque are lit as their room is (room-light.ts).
  const palette = paletteOfRoom(room);
  const dW = renderDims.widthM;
  const dH = renderDims.heightM;

  // The moulding's section. Its geometry is built with the frame
  // (`FrameMesh`), once the work is revealed.
  const moulding = useMemo(() => frameMoulding(design, dW, dH), [design, dW, dH]);
  // At its widest: a swept frame's corners stand out past its rails,
  // and a tabernacle frame reaches further up and down than to the
  // sides.
  const extents = useMemo(() => frameExtents(design, dW, dH), [design, dW, dH]);
  const frameReach = extents.side;
  const frameRise = Math.max(extents.top, extents.bottom);
  // A diptych or triptych photographed as one object hangs as its
  // panels, each in a frame of its own (polyptych.ts).
  const panels = useMemo(
    () => (artwork.polyptych ? layoutPanels(artwork.polyptych, dW) : null),
    [artwork.polyptych, dW],
  );

  // Picture light: one can per work, its pool clipped to this wall's
  // clear stretches, or to the divider the work hangs on, and faded out
  // on the floor toward the room's doorways. See painting-light-rig.ts.
  //
  // A giant in a hall has no light of its own. Its top is within a hand
  // of the gallery above, or it hangs on a wall with no ceiling for four
  // storeys, and a hall's washers light its walls (stairwell-light.tsx),
  // their cones set out about the work.
  const lit = !placement.giant;
  const wall = useMemo(() => {
    const cb = room.cellBounds;
    return wallContextFor(
      {
        xMin: cb.xMin * CELL_SIZE,
        xMax: (cb.xMax + 1) * CELL_SIZE,
        zMin: cb.zMin * CELL_SIZE,
        zMax: (cb.zMax + 1) * CELL_SIZE,
      },
      room.doors,
      room.worldRect.y,
      position,
      rotation[1],
      { dividers: room.dividers, on: placement.divider },
    );
  }, [room, position, rotation, placement.divider]);
  const ceilingY = wall.floorY + room.ceilingHeight;
  const rig = useMemo(
    () =>
      lit
        ? buildLightRig({
            frameHalfW: dW / 2 + frameReach,
            frameHalfH: dH / 2 + frameRise,
            canvasH: dH,
            floorY: wall.floorY,
            ceilingY,
            wallOffset: PAINTING_WALL_OFFSET,
            roomSpan: wall.roomSpan,
            wallSpans: wall.wallSpans,
            floorSpan: wall.floorSpan,
            roomDepth: wall.roomDepth,
            thresholds: wall.thresholds,
          })
        : null,
    [lit, dW, dH, frameReach, frameRise, wall, ceilingY],
  );
  // The plaque hangs at eye level over the room's floor, or level with
  // the top of a small work's frame (`wall.floorY` is in the work's own
  // frame).
  const plaque = useMemo(
    (): PlaqueOffset | null =>
      placement.plaque === null
        ? null
        : (placement.plaque ??
          plaqueBesideFrame(wall.floorY, dH / 2 + extents.top, -dH / 2 - extents.bottom)),
    [placement.plaque, wall.floorY, dH, extents],
  );
  const plaqueRect = useMemo(
    () => ({
      x: plaque?.dx ?? dW / 2 + frameReach + PLAQUE_GAP + PLAQUE_MOUNT_W / 2,
      y: !plaque ? 0 : "top" in plaque ? plaque.top - PLAQUE_HEIGHT / 2 : plaque.dy,
      halfW: PLAQUE_MOUNT_W / 2,
      halfH: (PLAQUE_FACE_H_BASE + PLAQUE_MOUNT_PAD) / 2,
      frontZ: -PAINTING_WALL_OFFSET + PLAQUE_WALL_CLEAR + PLAQUE_MOUNT_DEPTH + PLAQUE_FACE_DEPTH,
    }),
    [dW, frameReach, plaque],
  );

  // How far the work reaches, for room culling (room-culling.ts):
  // measured from what is mounted, after every render, so the frame,
  // the plaque, the cans and the pool on wall and floor are all inside
  // whatever they are refitted to.
  const groupRef = useRef<THREE.Group>(null);
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    setWorkBounds(group, _bounds.setFromObject(group).getBoundingSphere(new THREE.Sphere()));
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {revealed ? (
        <>
          {panels ? (
            panels.map((panel) => (
              <group key={`${panel.uv[0]}`} position={[panel.x, panel.y, 0]}>
                <FrameMesh
                  design={{ ...design, reach: panel.reach }}
                  moulding={frameMoulding({ ...design, reach: panel.reach }, panel.w, panel.h)}
                  widthM={panel.w}
                  heightM={panel.h}
                  palette={palette}
                />
              </group>
            ))
          ) : (
            <FrameMesh
              design={design}
              moulding={moulding}
              widthM={dW}
              heightM={dH}
              palette={palette}
            />
          )}
          <PaintingPlane
            url={url}
            baseWidth={baseWidth}
            origin={loadOrigin}
            thumbUrl={textureVariantUrl(artwork.objectKey, 256, "avif")}
            widthM={dW}
            heightM={dH}
            artwork={artwork}
            onSettled={onSettled}
            onTextureAspect={handleTextureAspect}
            panels={panels}
          />
          {plaque && (
            <Plaque
              artwork={artwork}
              palette={palette}
              frameEdgeX={dW / 2 + frameReach}
              offset={plaque}
            />
          )}
        </>
      ) : (
        <StandIn artwork={artwork} design={design} widthM={dW} heightM={dH} extents={extents} />
      )}
      {rig && (
        <PaintingLight
          rig={rig}
          wallZ={-PAINTING_WALL_OFFSET}
          floorY={wall.floorY}
          ceilingY={ceilingY}
          frameHalfW={dW / 2 + frameReach}
          // The pool is dark behind this rectangle, so it is no taller
          // than the frame: a tabernacle's entablature reaches further
          // up than its plinth does down.
          frameHalfH={dH / 2 + (extents.top + extents.bottom) / 2}
          frameCenterY={(extents.top - extents.bottom) / 2}
          frameFrontZ={moulding.frontZ - PAINTING_WALL_OFFSET}
          plaque={plaqueRect}
          fixtures
          wallGain={poolGainScale(palette.wallColor)}
        />
      )}
    </group>
  );
});

const _bounds = new THREE.Box3();

/** A work's moulded frame, rebuilt only when the canvas is refitted to
 *  its texture's aspect. See frame-geometry.ts.
 *
 *  Out of the floor's mirror: a moulding is at most 19 cm wide, about
 *  the mirror's blur radius, and holds most of a work's triangles. The
 *  canvas and its pool carry the reflection. */
function FrameMesh({
  design,
  moulding,
  widthM,
  heightM,
  palette,
}: {
  design: FrameDesign;
  moulding: ReturnType<typeof frameMoulding>;
  widthM: number;
  heightM: number;
  palette: Palette;
}) {
  const geometry = useMemo(
    () =>
      buildFrameGeometry(moulding.profile, widthM, heightM, PAINTING_WALL_OFFSET, {
        slots: design.slots,
        swell: moulding.swell,
        blocks: moulding.blocks,
        rails: moulding.rails,
      }),
    [moulding, design, widthM, heightM],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <>
      <mesh
        geometry={geometry}
        material={frameMaterials(design, palette)}
        layers={UNREFLECTED_LAYER}
      />
      {design.painted && (
        <FramePaint
          painted={design.painted}
          widthM={widthM}
          heightM={heightM}
          scale={frameScale(design, widthM, heightM)}
          palette={palette}
        />
      )}
    </>
  );
}

// ── Stand-in ──────────────────────────────────────────────────────────
// What a work shows while its room is out of reach: the band of its
// frame in the colour of its finish, and its canvas as the 16 px preview
// decoded from its ThumbHash. No download, no moulding, no plaque, two
// draw calls. With the picture light, which stays on, a room seen
// through a portal from across the building is hung and lit, and the
// works sharpen as the visitor walks up where they used to appear.

/** How much of its finish's colour a frame shows from across a room,
 *  in linear light. The fill puts a surface near 0.43 of its albedo
 *  (wall-light.ts) and the picture light lifts a moulding's top faces. */
const STAND_IN_FRAME_SHADE = 0.5;

const standInFrameMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  toneMapped: false,
});

/** Local z of the picture's face: `CANVAS_FACE_Z` less the wall offset. */
const PICTURE_Z = 0.014;

/** The band between the canvas and the frame's outer edge, as four
 *  quads round the canvas and in its plane (`PICTURE_Z`): nothing
 *  overlaps, so nothing z-fights at any distance. */
function buildStandInBand(
  widthM: number,
  heightM: number,
  extents: { side: number; top: number; bottom: number },
  color: THREE.Color,
): THREE.BufferGeometry {
  const x0 = -widthM / 2;
  const x1 = widthM / 2;
  const y0 = -heightM / 2;
  const y1 = heightM / 2;
  const X0 = x0 - extents.side;
  const X1 = x1 + extents.side;
  const Y0 = y0 - extents.bottom;
  const Y1 = y1 + extents.top;
  // Left and right uprights at full height, top and bottom rails between.
  const rects = [
    [X0, Y0, x0, Y1],
    [x1, Y0, X1, Y1],
    [x0, y1, x1, Y1],
    [x0, Y0, x1, y0],
  ];
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  for (const [ax, ay, bx, by] of rects) {
    const base = positions.length / 3;
    positions.push(ax, ay, PICTURE_Z, bx, ay, PICTURE_Z, bx, by, PICTURE_Z, ax, by, PICTURE_Z);
    for (let i = 0; i < 4; i++) colors.push(color.r, color.g, color.b);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  return geometry;
}

function StandIn({
  artwork,
  design,
  widthM,
  heightM,
  extents,
}: {
  artwork: ArtworkListing;
  design: FrameDesign;
  widthM: number;
  heightM: number;
  extents: { side: number; top: number; bottom: number };
}) {
  const finish = design.slots[0]?.finish;
  const band = useMemo(() => {
    const color = new THREE.Color(finish ? FINISHES[finish].color : "#2a1d14");
    return buildStandInBand(widthM, heightM, extents, color.multiplyScalar(STAND_IN_FRAME_SHADE));
  }, [widthM, heightM, extents, finish]);
  useEffect(() => () => band.dispose(), [band]);

  // The canvas as `PaintingPlane` first paints it, so the hand-over is
  // one blurred picture giving way to a sharper one. Set on the material
  // directly, as there: see the note in `PaintingPlane`.
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  useLayoutEffect(() => {
    const material = matRef.current;
    if (!material) return;
    const preview = createPaintingPreview(artwork.thumbHash);
    material.map = preview;
    if (preview) material.color.setHex(0xffffff);
    else material.color.set(artwork.dominantColor ?? "#3a2e20");
    material.needsUpdate = true;
    return () => {
      material.map = null;
      preview?.dispose();
    };
  }, [artwork.thumbHash, artwork.dominantColor]);

  return (
    <>
      <mesh geometry={band} material={standInFrameMaterial} layers={UNREFLECTED_LAYER} />
      <mesh position={[0, 0, PICTURE_Z]}>
        <planeGeometry args={[widthM, heightM]} />
        <meshBasicMaterial ref={matRef} toneMapped={false} />
      </mesh>
    </>
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

// ── Plaque ────────────────────────────────────────────────────────────
// A small museum-style label to the right of each painting, its centre
// at eye level (PLAQUE_EYE) over the floor, or its top level with a
// small work's frame (plaqueBesideFrame). Two-layer construction: a brass mount plate fixed
// flush to the wall, with a slightly inset cream face card on top
// carrying title / artist / year / dimensions in three sized lines.

// The plaque's WIDTH and its gap from the frame come from
// place-paintings.ts (PLAQUE_WIDTH, PLAQUE_GAP), which budgets wall by
// them: change them there. HEIGHT is adaptive: long titles bump the plaque taller
// so the title block doesn't crash through the byline (e.g. Hokusai
// "Tenman Bridge at Settsu Province (Sesshū Tenmanbashi), from the
// series Remarkable Views of Bridges in Various Provinces (Shokoku
// meikyō kiran)" — 144 chars overflows the standard plaque).
const PLAQUE_FACE_DEPTH = 0.004;
// Brushed-steel mount sits a hair larger than the face, framing it
// like a polished metal rim. Bigger reveal here makes the shimmer
// from the mount more visible at typical viewing distances.
const PLAQUE_MOUNT_REVEAL = 0.014;
const PLAQUE_MOUNT_PAD = PLAQUE_MOUNT_REVEAL * 2;
const PLAQUE_FACE_H_BASE = PLAQUE_HEIGHT - PLAQUE_MOUNT_PAD;
const PLAQUE_MOUNT_W = PLAQUE_WIDTH;
const PLAQUE_FACE_W = PLAQUE_MOUNT_W - PLAQUE_MOUNT_PAD;
const PLAQUE_MOUNT_DEPTH = 0.008;
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

type PlaqueOffset = ({ dy: number } | { top: number }) & { dx?: number };

function Plaque({
  artwork,
  palette,
  frameEdgeX,
  offset,
}: {
  artwork: ArtworkListing;
  /** The room's palette: mount and card are lit as the room is. */
  palette: Palette;
  /** Local x of the frame's outer right edge: the plaque hangs
   *  PLAQUE_GAP beyond it. */
  frameEdgeX: number;
  /** From the canvas centre to the plaque's centre (`dy`) or its top
   *  edge (`top`), up, and `dx` to the right (unset: beside the frame). */
  offset: PlaqueOffset;
}) {
  // All three strings and the pre-render estimates derive from the
  // artwork alone, so they are memoised on it: `formatTitle` /
  // `formatByline` are regex-heavy, and a Plaque re-renders on every
  // troika sync and — via the room's reveal ramp, which calls setCount
  // from useFrame — on every frame of that ramp.
  //
  // Pre-render estimates are used for the first paint before troika
  // syncs and reports actual block bounds. The estimates use a word-
  // aware wrap so a single oversized word doesn't get overcounted, and
  // a conservative chars/line so the plaque starts a touch tall (and
  // shrinks to fit), never short (which would overlap text).
  const { title, byline, dims, estTitleH, estBylineH } = useMemo(() => {
    const t = formatTitle(
      artwork.englishTitle?.trim() || artwork.title,
      artwork.artist ?? undefined,
    );
    const b = formatByline(artwork);
    // The same audited size the artwork page draws to scale; a rejected
    // one leaves the plaque without a size line.
    const size = trustworthyRealSize(artwork);
    return {
      title: t,
      byline: b,
      dims: size ? formatCm(size) : "",
      estTitleH:
        estimateWrappedLines(t, PLAQUE_TITLE_CHARS_PER_LINE) * PLAQUE_TITLE_FONT * PLAQUE_TITLE_LH,
      estBylineH:
        estimateWrappedLines(b, PLAQUE_BYLINE_CHARS_PER_LINE) *
        PLAQUE_BYLINE_FONT *
        PLAQUE_BYLINE_LH,
    };
  }, [artwork]);

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
  const localX = offset.dx ?? frameEdgeX + PLAQUE_GAP + PLAQUE_MOUNT_W / 2;
  // A plaque hung by its top grows downward with a long title.
  const localY = "top" in offset ? offset.top - PLAQUE_MOUNT_H / 2 : offset.dy;
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
      <mesh position={[0, 0, mountCenterZ]} layers={UNREFLECTED_LAYER}>
        <boxGeometry args={[PLAQUE_MOUNT_W, PLAQUE_MOUNT_H, PLAQUE_MOUNT_DEPTH]} />
        <primitive object={inRoomLight(plaqueMountMaterial, palette)} attach="material" />
      </mesh>
      {/* Cream face card on top of the mount */}
      <mesh position={[0, 0, faceCenterZ]} layers={UNREFLECTED_LAYER}>
        <boxGeometry args={[PLAQUE_FACE_W, PLAQUE_FACE_H, PLAQUE_FACE_DEPTH]} />
        <primitive object={inRoomLight(plaqueBaseMaterial, palette)} attach="material" />
      </mesh>
      {/* Title — bold and largest. */}
      <Text
        position={[0, titleTopY, textZ]}
        layers={UNREFLECTED_LAYER}
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
        layers={UNREFLECTED_LAYER}
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
          layers={UNREFLECTED_LAYER}
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
  panels,
}: {
  /** 480 px AVIF (see baseVariantWidth) — the base "good enough"
   *  texture; once it lands the painting reads as fully loaded. */
  url: string;
  /** Width of that base variant. LOD tiers at or below it are skipped —
   *  upgrading to a texture the painting already shows is pure waste. */
  baseWidth: number;
  /** Where this painting hangs: its position and its room. Handed to
   *  every load it starts so the shared network / GPU-upload queues can
   *  serve the room nearest the player first — otherwise a floor loads
   *  in mount order and the room you're standing in waits behind rooms
   *  you can't see. */
  origin: LoadOrigin;
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
  /** A polyptych's panels: the plane is then one quad per panel, each
   *  showing its part of the one texture. */
  panels?: PanelPlacement[] | null;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const panelGeometry = useMemo(() => (panels ? buildPanelGeometry(panels) : null), [panels]);
  useEffect(() => () => panelGeometry?.dispose(), [panelGeometry]);
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
      Math.max(
        1,
        Math.round(
          ladderHeightPx(s.size.height * s.viewport.dpr, s.size.width / s.size.height) /
            LOD_HEIGHT_QUANTUM_PX,
        ),
      ) * LOD_HEIGHT_QUANTUM_PX,
  );

  // Track the base texture. The LOD effect uses this as the
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
  const displayedLeaseRef = useRef<(() => void) | undefined>(undefined);

  // Sync the material's initial map + color BEFORE the first paint so
  // preview is present on first visits too. Runs after the mesh and
  // material refs land, and when the artwork changes. We do NOT bind `map` or `color` as JSX
  // props on <meshBasicMaterial> below, because R3F re-applies prop
  // values on every reconciliation — that would silently overwrite
  // both this initial install AND the .then mutations from the load
  // effect (you'd see paintings stuck at the brown swatch even after
  // the texture loaded).
  // biome-ignore lint/correctness/useExhaustiveDependencies: callbacks should not reset the displayed texture.
  useLayoutEffect(() => {
    const material = matRef.current;
    if (!material) return;
    const cachedBase = peekCached(url);
    const cachedThumb = cachedBase ? null : peekCached(thumbUrl);
    const preview = cachedBase || cachedThumb ? null : createPaintingPreview(artwork.thumbHash);
    const initial = cachedBase ?? cachedThumb ?? preview;
    baseTextureRef.current = cachedBase ?? null;
    setBaseLoaded(Boolean(cachedBase));
    displayedWidthRef.current = 0;
    material.map = initial;
    if (initial) {
      material.color.setHex(0xffffff);
      if (cachedBase) {
        onSettled?.("loaded");
        const img = cachedBase.image as { width?: number; height?: number } | undefined;
        if (img?.width && img?.height) {
          onTextureAspect?.(img.width / img.height);
        }
      }
    } else {
      material.color.set(artwork.dominantColor ?? "#3a2e20");
    }
    material.needsUpdate = true;
    return () => {
      preview?.dispose();
      displayedLeaseRef.current?.();
      displayedLeaseRef.current = undefined;
    };
  }, [url, thumbUrl, artwork.thumbHash, artwork.dominantColor]);

  // Both network tiers run alongside the local blur preview. The queue
  // gives 256 px previews priority; the 480 px base replaces them when
  // ready. A late thumbnail must never overwrite a sharper texture.
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

    // A base already downloaded ahead (texture-cache.ts, "Network
    // prefetch") is as near as the preview would be: skip the preview.
    if (!baseInstalled && !isPrefetched(url)) {
      loadCached(thumbUrl, gl, origin, "preview")
        .then((tex) => {
          if (cancelled || baseInstalled) return;
          // Install the placeholder. The base will overwrite this when
          // it lands. The thumb stays in the LRU afterwards, but it is
          // first in line to go: the LOD tick MRU-touches the base URL
          // (`peekCached(url)` below) and never the thumb, so once
          // installed it only ages. It is not cheap in the pool's terms
          // either — `textureBytes` charges 256 × 256 × 4 × 1.34, i.e.
          // ~340 KB decoded + mipmaps, an order above the AVIF's wire
          // size. So the return visit is instant only while the base
          // pool hasn't turned over since.
          material.map = tex;
          material.color.setHex(0xffffff);
          material.needsUpdate = true;
        })
        .catch(() => {
          // 256 might 404 for a sub-256 px source — silent fallback to
          // the embedded blur preview until the base lands.
        });
    }

    loadCached(url, gl, origin, "base")
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
      baseUrl: url,
    };
    entryRef.current = entry;
    registerPainting(entry);
    return () => {
      unregisterPainting(entry);
      entryRef.current = null;
    };
  }, [artwork, url]);

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

    const tiers = derivePaintingLodTiers(
      artwork,
      baseWidth,
      renderWidthM,
      texAspect,
      derivationHeightPx,
      gl.capabilities.maxTextureSize,
    );
    const tierUrls = tiers.map((t) => textureVariantUrl(artwork.objectKey, t.width, "avif"));
    let pending: { tier: number; controller: AbortController } | null = null;
    let hiddenSince: number | null = null;
    let disposed = false;
    let displayedTier = tiers.findIndex((tier) => tier.width === displayedWidthRef.current);

    const install = (index: number) => {
      const texture = index === -1 ? baseTexture : getHiRes(tierUrls[index]);
      if (!texture) return;
      const release = index === -1 ? undefined : retainHiRes(tierUrls[index]);
      material.map = texture;
      material.needsUpdate = true;
      displayedLeaseRef.current?.();
      displayedLeaseRef.current = release;
      displayedTier = index;
      displayedWidthRef.current = index === -1 ? 0 : tiers[index].width;
    };
    // Reclaim a retained rung after resize, or use the sharpest resident
    // survivor of the new ladder. Never keep a disposed map on the mesh.
    if (
      displayedWidthRef.current !== 0 &&
      (displayedTier === -1 || !getHiRes(tierUrls[displayedTier]))
    ) {
      displayedTier = tiers.findIndex((_, i) => getHiRes(tierUrls[i]) !== undefined);
    }
    install(displayedTier);

    const cancelPending = () => {
      pending?.controller.abort();
      pending = null;
    };

    const lodUpdate = (sample: LodSample): LodRequest | null => {
      peekCached(url);
      if (!sample.visible) {
        hiddenSince ??= sample.time;
        // A small grace avoids churn at screen edges during head turns.
        if (sample.time - hiddenSince > 0.4) {
          cancelPending();
          if (displayedTier !== -1) install(-1);
        }
        return null;
      }
      hiddenSince = null;
      let plan = planPaintingLod(tiers, sample, displayedTier);
      const required = selectLodTier(tiers, sample.displaySq, displayedTier);
      // Satisfy a missing visible rung before spending a speculative slot
      // on a sharper future rung of the same painting.
      if (plan?.speculative && required !== -1 && !getHiRes(tierUrls[required])) {
        plan = {
          target: required,
          speculative: false,
          priority: plan.priority,
        };
      }
      const wanted = plan?.target ?? -1;
      if (
        pending &&
        (wanted === -1 ||
          (sample.displaySq > tiers[pending.tier].releaseSq &&
            sample.predictedSq > tiers[pending.tier].releaseSq))
      )
        cancelPending();

      // Keep the best resident fallback until a selected upgrade is ready.
      // Actual-demand downgrades retain hysteresis; no base flash while loading.
      const current = selectLodTier(tiers, sample.displaySq, displayedTier);
      if (current === -1 && wanted === -1) {
        if (displayedTier !== -1) install(-1);
      } else if (current !== -1 && displayedTier !== wanted) {
        const fallback = tiers.findIndex((_, i) => i >= current && getHiRes(tierUrls[i]));
        if (fallback !== -1 && fallback !== displayedTier) install(fallback);
      }
      if (!plan) return null;
      const target = plan.target;
      return {
        bytes: tiers[target].bytes,
        requiredBytes:
          required === -1
            ? 0
            : Math.max(
                tiers[required].bytes,
                displayedTier === -1 ? 0 : tiers[displayedTier].bytes,
              ),
        speculative: plan.speculative,
        priority: plan.priority,
        release: () => {
          cancelPending();
          if (displayedTier !== -1) install(-1);
        },
        cancel: () => {
          if (pending?.tier === target && plan.speculative) cancelPending();
          if (displayedTier === target && plan.speculative) {
            const fallback =
              current === -1
                ? -1
                : tiers.findIndex((_, i) => i >= current && getHiRes(tierUrls[i]));
            install(fallback);
          }
        },
        accept: () => {
          if (getHiRes(tierUrls[target])) {
            if (target !== displayedTier) install(target);
            return;
          }
          // One useful tier at a time, rather than every intervening rung.
          if (pending) return;
          const controller = new AbortController();
          const promise = tryLoadHiRes(tierUrls[target], gl, controller.signal, {
            origin,
            estimatedBytes: tiers[target].bytes,
            speculative: plan.speculative,
          });
          if (!promise) return;
          pending = { tier: target, controller };
          promise
            .catch(() => {})
            .finally(() => {
              if (!disposed && pending?.controller === controller) pending = null;
            });
        },
      };
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
      disposed = true;
      cancelPending();
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
    <mesh
      ref={meshRef}
      position={[0, 0, PICTURE_Z]}
      userData={{ artwork }}
      geometry={panelGeometry ?? undefined}
    >
      {!panelGeometry && <planeGeometry args={[widthM, heightM]} />}
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
