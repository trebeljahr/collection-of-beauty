"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls, Text } from "@react-three/drei";
import * as THREE from "three";
import type { Artwork } from "@/lib/data";

type Props = { artworks: Artwork[] };

// -------------------------------------------------------------
// Player physics & room constants
// -------------------------------------------------------------

const EYE_HEIGHT = 1.7; // adult standing eye level
const WALK_SPEED = 5;
const RUN_SPEED = 10;
const JUMP_IMPULSE = 6;
const GRAVITY = 22;

// Every room in the corridor shares these. The walls are 22 m wide and
// 6.2 m tall; the floor at y=0. Individual rooms differ in depth, wall
// colour, lighting and what's on the walls.
const ROOM_WIDTH = 22;
const ROOM_HEIGHT = 6.2;
const WALL_X_BUF = 0.7; // player can't get closer than this to side walls

// Doors between rooms: 2.6 m wide × 3 m tall opening in the shared wall.
const DOOR_WIDTH = 2.6;
const DOOR_HEIGHT = 3.0;

// Paintings: raise caps so Birth of Venus (2.79 × 1.72 m) and similar
// grand works render at near-real scale. Anything bigger than this would
// need its own "grand works" room; flagged as out-of-cap but not common
// in the 12-artwork selection.
const MAX_PAINTING_W = 5.0;
const MAX_PAINTING_H = 4.5;

// Museum hang convention: centre line ~145 cm. Tall works ride up so
// their bottom doesn't clip into the floor (keep 30 cm baseboard clear).
const CANONICAL_Y_CENTER = 1.55;
const MIN_FLOOR_GAP = 0.3;

// -------------------------------------------------------------
// Rooms
// -------------------------------------------------------------

type RoomDef = {
  id: string;
  title: string;
  description: string;
  wallColor: string;
  floorColor: string;
  ceilingColor: string;
  lampTint: string; // warm/cool shift per room
  depth: number; // z-span
  artworkIds: string[];
};

// Hand-curated. Order matches the corridor — player starts in the first
// and walks forward through the doors to the others.
const ROOMS: RoomDef[] = [
  {
    id: "impressionism",
    title: "Impressionism & Post-Impressionism",
    description:
      "Light, air, and the moment — Monet and van Gogh, late 19th century.",
    wallColor: "#ece2c9",
    floorColor: "#3a2a1f",
    ceilingColor: "#f4ead2",
    lampTint: "#ffd9a5",
    depth: 18,
    artworkIds: [
      "collection-of-beauty-claude-monet-la-corniche-near-monaco-google-art-project",
      "collection-of-beauty-claude-monet-nympheas-1905",
      "collection-of-beauty-starry-night-over-the-rhone",
      "collection-of-beauty-vincent-van-gogh-1853-1890-cafeterras-bij-nacht-place-du-forum-kroller-muller-museum-otterlo-23-8-2",
    ],
  },
  {
    id: "storms-and-waves",
    title: "Storms & Waves",
    description:
      "Ukiyo-e meets Romanticism — Hokusai, Turner, Munch. Nature pushing back.",
    wallColor: "#d9d2c2",
    floorColor: "#2a2218",
    ceilingColor: "#ebe3cf",
    lampTint: "#ffe0b5",
    depth: 16,
    artworkIds: [
      "collection-of-beauty-tsunami-by-hokusai-19th-century",
      "collection-of-beauty-tenman-bridge-at-settsu-province-sesshu-tenmanbashi-from-the-series-remarkable-views-of-bridges-in-",
      "collection-of-beauty-the-rising-squall-hot-wells-from-st-vincent-s-rock-bristol",
      "collection-of-beauty-edvard-munch-1893-the-scream-oil-tempera-and-pastel-on-cardboard-91-x-73-cm-national-gallery-of-nor",
    ],
  },
  {
    id: "old-masters",
    title: "Old Masters",
    description:
      "Italian Renaissance meets the Dutch Golden Age. Botticelli's Venus at near-real scale.",
    wallColor: "#e8dcbd",
    floorColor: "#322015",
    ceilingColor: "#f3e9cf",
    lampTint: "#ffd09a",
    depth: 22,
    artworkIds: [
      "collection-of-beauty-sandro-botticelli-la-nascita-di-venere-google-art-project-edited",
      "collection-of-beauty-venus-and-mars-national-gallery",
      "collection-of-beauty-1665-girl-with-a-pearl-earring",
      "collection-of-beauty-johannes-jan-vermeer-christ-in-the-house-of-martha-and-mary-google-art-project",
    ],
  },
];

// Player starts inside Room 0, a little back from centre, looking toward
// the back wall.
function defaultStartZ(rooms: ReadonlyArray<Pick<RoomDef, "depth">>) {
  // Corridor runs from z = 0 (Room 0 back wall) down to z = -totalDepth.
  // Player inside Room 0, a bit offset from the back wall.
  return -rooms[0].depth * 0.35;
}

// -------------------------------------------------------------
// Layout
// -------------------------------------------------------------

type Placement = {
  artwork: Artwork;
  /** World position of the painting centre. */
  position: [number, number, number];
  /** World Y-rotation so the painting faces into the room. */
  rotation: [number, number, number];
};

type RoomLayout = {
  def: RoomDef;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  /** Z of the room's back wall (furthest from entrance). More negative. */
  backZ: number;
  /** Z of the room's front wall (closest to entrance). Less negative. */
  frontZ: number;
  /** Z of the room's geometric centre. */
  centerZ: number;
  placements: Placement[];
};

function layoutCorridor(
  artworkById: Map<string, Artwork>,
): RoomLayout[] {
  const layouts: RoomLayout[] = [];
  let frontZ = 0; // first room's front wall at the origin

  ROOMS.forEach((def, i) => {
    const backZ = frontZ - def.depth;
    const centerZ = (frontZ + backZ) / 2;
    const isFirst = i === 0;
    const isLast = i === ROOMS.length - 1;

    // Pick the 4 canonical slots per room. The first room's front wall
    // has a door (to the entrance) — wait, no, Room 0 is the entrance,
    // so its FRONT wall (z = frontZ = 0 for Room 0) is solid. Subsequent
    // rooms' front wall has a door (shared with previous room). The
    // BACK wall has a door iff there's a next room.
    const frontHasDoor = !isFirst;
    const backHasDoor = !isLast;

    const slots: Array<{
      pos: [number, number, number];
      rot: [number, number, number];
    }> = [];

    // Back wall: centre z = backZ + 0.06. Painting faces +z.
    // If no door in back wall: 2 paintings centred on either side of middle.
    // If door in back wall: paintings flank the door.
    const backX = [-4.2, 4.2];
    if (!backHasDoor) {
      // Solid back wall — spread out wider.
      for (const x of [-6.2, 6.2]) {
        slots.push({ pos: [x, 0, backZ + 0.06], rot: [0, 0, 0] });
      }
    } else {
      for (const x of backX) {
        slots.push({ pos: [x, 0, backZ + 0.06], rot: [0, 0, 0] });
      }
    }

    // West wall: x = -ROOM_WIDTH/2 + 0.06, rotated +90° so it faces +x.
    // Front wall at some z, back wall at backZ.
    const sideZ = centerZ;
    const westX = -ROOM_WIDTH / 2 + 0.06;
    const eastX = ROOM_WIDTH / 2 - 0.06;
    slots.push({ pos: [westX, 0, sideZ], rot: [0, Math.PI / 2, 0] });
    slots.push({ pos: [eastX, 0, sideZ], rot: [0, -Math.PI / 2, 0] });

    // Match artworks to slots. If we have fewer artworks than slots, fill
    // in order; if more, truncate (shouldn't happen with curated list).
    const placements: Placement[] = [];
    def.artworkIds.slice(0, slots.length).forEach((id, idx) => {
      const artwork = artworkById.get(id);
      if (!artwork) return;
      const slot = slots[idx];
      placements.push({
        artwork,
        position: slot.pos,
        rotation: slot.rot,
      });
    });

    layouts.push({
      def,
      index: i,
      isFirst,
      isLast,
      frontZ,
      backZ,
      centerZ,
      placements,
    });

    frontZ = backZ; // next room starts at this room's back wall
  });

  return layouts;
}

// -------------------------------------------------------------
// Texture loading
// -------------------------------------------------------------

const VARIANT_TEX_WIDTH = 1280;
const MAX_TEX_WIDTH = 1400;

function variantAssetPath(
  objectKey: string,
  width: number,
  format: "avif" | "webp",
): string {
  const lastSlash = objectKey.lastIndexOf("/");
  const dir = objectKey.slice(0, lastSlash);
  const filename = objectKey.slice(lastSlash + 1);
  const basename = filename.replace(/\.[^.]+$/, "");
  const segments = [...dir.split("/"), basename, `${width}.${format}`];
  return segments.map(encodeURIComponent).join("/");
}

function variantAssetsRawUrl(
  objectKey: string,
  width: number,
  format: "avif" | "webp",
): string {
  return `/assets-raw/${variantAssetPath(objectKey, width, format)}`;
}

function rawOriginalUrl(objectKey: string): string {
  const encoded = objectKey.split("/").map(encodeURIComponent).join("/");
  return `/assets-raw/${encoded}`;
}

const textureCache = new Map<string, THREE.Texture>();
const textureInFlight = new Map<string, Promise<THREE.Texture>>();

async function loadTexture(artwork: Artwork): Promise<THREE.Texture> {
  const cacheKey = artwork.objectKey;
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;
  const pending = textureInFlight.get(cacheKey);
  if (pending) return pending;

  const promise = (async () => {
    const attempts: Array<[string, boolean]> = [
      [variantAssetsRawUrl(cacheKey, VARIANT_TEX_WIDTH, "avif"), false],
      [rawOriginalUrl(cacheKey), true],
    ];
    let lastErr: unknown = null;
    for (const [url, downsample] of attempts) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
        const blob = await res.blob();
        const bitmapOpts: ImageBitmapOptions = {
          imageOrientation: "flipY",
          ...(downsample
            ? { resizeWidth: MAX_TEX_WIDTH, resizeQuality: "high" }
            : {}),
        };
        const bitmap = await createImageBitmap(blob, bitmapOpts);
        const texture = new THREE.Texture(
          bitmap as unknown as HTMLImageElement,
        );
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.minFilter = THREE.LinearMipMapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.flipY = false;
        texture.needsUpdate = true;
        textureCache.set(cacheKey, texture);
        return texture;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr ?? new Error("texture load failed");
  })();
  textureInFlight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    textureInFlight.delete(cacheKey);
  }
}

// -------------------------------------------------------------
// Painting
// -------------------------------------------------------------

function computePaintingSize(
  artwork: Artwork,
  texture: THREE.Texture | null,
): { w: number; h: number } {
  if (artwork.realDimensions) {
    let w = artwork.realDimensions.widthCm / 100;
    let h = artwork.realDimensions.heightCm / 100;
    if (w > MAX_PAINTING_W || h > MAX_PAINTING_H) {
      const scale = Math.min(MAX_PAINTING_W / w, MAX_PAINTING_H / h);
      w *= scale;
      h *= scale;
    }
    return { w, h };
  }
  const img = texture?.image as
    | { width?: number; height?: number }
    | undefined;
  const aspect = img?.width && img?.height ? img.width / img.height : 1;
  let w = 2.8;
  let h = w / aspect;
  if (h > 2.4) {
    h = 2.4;
    w = h * aspect;
  }
  return { w, h };
}

function computePaintingYCenter(h: number): number {
  // Canonical centre at 1.55 m. If the painting is tall enough that it'd
  // clip into the floor, push it up so the bottom clears 30 cm.
  return Math.max(CANONICAL_Y_CENTER, MIN_FLOOR_GAP + h / 2);
}

function Painting({
  placement,
  onClick,
}: {
  placement: Placement;
  onClick: (artwork: Artwork) => void;
}) {
  const { artwork, position, rotation } = placement;
  const [texture, setTexture] = useState<THREE.Texture | null>(() =>
    textureCache.get(artwork.objectKey) ?? null,
  );

  useEffect(() => {
    if (texture) return;
    let cancelled = false;
    loadTexture(artwork)
      .then((tex) => {
        if (!cancelled) setTexture(tex);
      })
      .catch((err) => {
        console.error(
          "gallery-3d texture load failed:",
          artwork.objectKey,
          err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [artwork, texture]);

  const { w, h } = computePaintingSize(artwork, texture);
  const yCenter = computePaintingYCenter(h);

  const frameT = 0.05;
  const frameDepth = 0.08;

  // Slot `position` carries the wall's anchor (y set to 0). The group
  // sits at (x, yCenter, z) so the painting centres vertically where
  // the computed yCenter says.
  const groupPosition: [number, number, number] = [
    position[0],
    yCenter,
    position[2],
  ];

  return (
    <group position={groupPosition} rotation={rotation}>
      {/* Frame */}
      <mesh position={[0, 0, -frameDepth / 2]}>
        <boxGeometry args={[w + frameT * 2, h + frameT * 2, frameDepth]} />
        <meshStandardMaterial
          color="#241810"
          roughness={0.55}
          metalness={0.1}
        />
      </mesh>
      {/* Mat */}
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[w + frameT * 0.9, h + frameT * 0.9]} />
        <meshStandardMaterial color="#e9dfcb" roughness={0.95} />
      </mesh>
      {/* Canvas */}
      {texture && (
        <mesh
          position={[0, 0, 0.006]}
          userData={{ artwork }}
          onClick={(e) => {
            e.stopPropagation();
            onClick(artwork);
          }}
        >
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial
            map={texture}
            roughness={0.85}
            metalness={0}
            emissive="#2a1e10"
            emissiveIntensity={0.08}
            emissiveMap={texture}
          />
        </mesh>
      )}
      {/* Physical plaque mounted on wall under the painting */}
      <Plaque artwork={artwork} paintingHeight={h} paintingWidth={w} />
      {/* Warm accent spot pointed at the painting */}
      <pointLight
        position={[0, 0.6, 1.3]}
        intensity={3.5}
        distance={4.5}
        decay={2}
        color="#ffd9a8"
      />
    </group>
  );
}

// -------------------------------------------------------------
// Plaque — a physical card on the wall, not floating text
// -------------------------------------------------------------

function Plaque({
  artwork,
  paintingHeight,
  paintingWidth,
}: {
  artwork: Artwork;
  paintingHeight: number;
  paintingWidth: number;
}) {
  const plaqueW = Math.min(0.32, Math.max(0.2, paintingWidth * 0.45));
  const plaqueH = 0.16;
  const plaqueDepth = 0.012;

  // Sit the plaque below the painting, with a small gap, but not more
  // than 22 cm below the bottom edge (otherwise it ends up below the
  // baseboard for large works).
  const verticalGap = Math.min(0.18, 0.08 + paintingHeight * 0.05);
  const plaqueY = -paintingHeight / 2 - verticalGap - plaqueH / 2;
  // Sit flush with the wall: local z just in front of the wall.
  const plaqueZ = 0.01;

  const year = artwork.year ? `, ${artwork.year}` : "";
  const artistLine = `${artwork.artist ?? "Unknown"}${year}`;
  const dims = artwork.realDimensions
    ? `${formatCm(artwork.realDimensions.widthCm)} × ${formatCm(
        artwork.realDimensions.heightCm,
      )} cm`
    : null;

  const titleMax = 56;
  const title =
    artwork.title.length > titleMax
      ? artwork.title.slice(0, titleMax - 1) + "…"
      : artwork.title;

  return (
    <group position={[0, plaqueY, plaqueZ]}>
      {/* Card body — slight emissive so text stays legible in shadow. */}
      <mesh>
        <boxGeometry args={[plaqueW, plaqueH, plaqueDepth]} />
        <meshStandardMaterial
          color="#f4ecd8"
          emissive="#2a1e10"
          emissiveIntensity={0.04}
          roughness={0.7}
          metalness={0}
        />
      </mesh>
      {/* Thin bevel strip along the top for a bit of visual weight */}
      <mesh position={[0, plaqueH / 2 - 0.008, plaqueDepth / 2 + 0.0001]}>
        <boxGeometry args={[plaqueW - 0.01, 0.004, 0.001]} />
        <meshStandardMaterial color="#241810" roughness={0.4} />
      </mesh>
      {/* Title */}
      <Text
        position={[0, plaqueH / 2 - 0.03, plaqueDepth / 2 + 0.002]}
        fontSize={0.018}
        color="#241810"
        anchorX="center"
        anchorY="top"
        maxWidth={plaqueW - 0.02}
        textAlign="center"
      >
        {title}
      </Text>
      {/* Artist & year */}
      <Text
        position={[0, plaqueH / 2 - 0.06, plaqueDepth / 2 + 0.002]}
        fontSize={0.014}
        color="#4a3420"
        anchorX="center"
        anchorY="top"
        maxWidth={plaqueW - 0.02}
        textAlign="center"
      >
        {artistLine}
      </Text>
      {/* Dimensions */}
      {dims && (
        <Text
          position={[0, -plaqueH / 2 + 0.022, plaqueDepth / 2 + 0.002]}
          fontSize={0.011}
          color="#6b5538"
          anchorX="center"
          anchorY="bottom"
          maxWidth={plaqueW - 0.02}
          textAlign="center"
        >
          {dims}
        </Text>
      )}
    </group>
  );
}

function formatCm(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// -------------------------------------------------------------
// Walls
// -------------------------------------------------------------

// A solid wall — just a flat plane.
function SolidWall({
  position,
  rotation,
  width,
  height,
  color,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
  color: string;
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial color={color} roughness={0.92} side={THREE.DoubleSide} />
    </mesh>
  );
}

// A wall with a centred door opening — rendered as three plane segments
// (left of door, right of door, over-door lintel). `rotation` is the
// same as a solid wall's rotation.
function WallWithDoor({
  position,
  rotation,
  width,
  height,
  color,
  doorWidth,
  doorHeight,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
  color: string;
  doorWidth: number;
  doorHeight: number;
}) {
  const sideWidth = (width - doorWidth) / 2;
  // Segment positions (in local X-Y of the wall plane).
  const leftX = -doorWidth / 2 - sideWidth / 2;
  const rightX = doorWidth / 2 + sideWidth / 2;
  const lintelY = doorHeight + (height - doorHeight) / 2 - height / 2;
  const lintelH = height - doorHeight;

  // The "position" passed in represents the wall's centre at (x=0 in
  // local coords, y=height/2, z=wallZ). We stack children inside a group
  // so we can position them in local wall-coordinates.
  return (
    <group position={position} rotation={rotation}>
      {/* Left panel */}
      <mesh position={[leftX, 0, 0]}>
        <planeGeometry args={[sideWidth, height]} />
        <meshStandardMaterial color={color} roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
      {/* Right panel */}
      <mesh position={[rightX, 0, 0]}>
        <planeGeometry args={[sideWidth, height]} />
        <meshStandardMaterial color={color} roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
      {/* Over-door lintel */}
      <mesh position={[0, lintelY, 0]}>
        <planeGeometry args={[doorWidth, lintelH]} />
        <meshStandardMaterial color={color} roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
      {/* Door trim — a thin frame around the opening for a bit of
          architectural detail. */}
      <DoorTrim doorWidth={doorWidth} doorHeight={doorHeight} />
    </group>
  );
}

function DoorTrim({
  doorWidth,
  doorHeight,
}: {
  doorWidth: number;
  doorHeight: number;
}) {
  const trim = 0.06;
  const color = "#2a1d14";
  // Two vertical jambs + one top trim; all extruded slightly forward on
  // both sides of the wall so it reads from either room.
  return (
    <group position={[0, -ROOM_HEIGHT / 2, 0]}>
      {/* Left jamb */}
      <mesh position={[-doorWidth / 2 - trim / 2, doorHeight / 2, 0]}>
        <boxGeometry args={[trim, doorHeight, 0.06]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} />
      </mesh>
      {/* Right jamb */}
      <mesh position={[doorWidth / 2 + trim / 2, doorHeight / 2, 0]}>
        <boxGeometry args={[trim, doorHeight, 0.06]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} />
      </mesh>
      {/* Lintel trim */}
      <mesh position={[0, doorHeight + trim / 2, 0]}>
        <boxGeometry args={[doorWidth + trim * 2, trim, 0.06]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} />
      </mesh>
    </group>
  );
}

// Room sign — mounted on the lintel above the door, visible from both
// sides. Reads the next room's title and description.
function RoomSign({
  position,
  rotation,
  title,
  description,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  title: string;
  description: string;
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Plate */}
      <mesh>
        <boxGeometry args={[3.4, 0.6, 0.04]} />
        <meshStandardMaterial
          color="#f2e9d0"
          emissive="#2a1e10"
          emissiveIntensity={0.06}
          roughness={0.7}
        />
      </mesh>
      {/* Title */}
      <Text
        position={[0, 0.12, 0.025]}
        fontSize={0.12}
        color="#241810"
        anchorX="center"
        anchorY="middle"
        maxWidth={3.2}
        textAlign="center"
      >
        {title}
      </Text>
      {/* Subtitle */}
      <Text
        position={[0, -0.12, 0.025]}
        fontSize={0.06}
        color="#55402a"
        anchorX="center"
        anchorY="middle"
        maxWidth={3.2}
        textAlign="center"
      >
        {description}
      </Text>
    </group>
  );
}

// -------------------------------------------------------------
// Ceiling lamps (same as before)
// -------------------------------------------------------------

function CeilingLamp({
  position,
  tint,
}: {
  position: [number, number, number];
  tint: string;
}) {
  return (
    <group position={position}>
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.26, 0.3, 0.06, 24]} />
        <meshStandardMaterial
          color="#2a1d14"
          emissive={tint}
          emissiveIntensity={1.6}
          roughness={0.5}
        />
      </mesh>
      <pointLight
        position={[0, -0.15, 0]}
        intensity={7}
        distance={13}
        decay={2.2}
        color={tint}
      />
    </group>
  );
}

// -------------------------------------------------------------
// Room geometry — walls (with or without doors), floor, ceiling, bench
// -------------------------------------------------------------

function RoomGeometry({ layout }: { layout: RoomLayout }) {
  const { def, isFirst, isLast, backZ, frontZ, centerZ } = layout;
  const d = def.depth;
  const frontHasDoor = !isFirst;
  const backHasDoor = !isLast;

  return (
    <group>
      {/* Floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, centerZ]}
      >
        <planeGeometry args={[ROOM_WIDTH, d]} />
        <meshStandardMaterial
          color={def.floorColor}
          roughness={0.88}
          metalness={0.05}
        />
      </mesh>
      {/* Ceiling */}
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, ROOM_HEIGHT, centerZ]}
      >
        <planeGeometry args={[ROOM_WIDTH, d]} />
        <meshStandardMaterial color={def.ceilingColor} roughness={0.96} />
      </mesh>
      {/* Back wall (higher z is "back" because player moves -z into the
          corridor; actually back-from-entrance is lower z). The back
          wall of each room is at z = backZ, player-facing. */}
      {backHasDoor ? (
        <WallWithDoor
          position={[0, ROOM_HEIGHT / 2, backZ]}
          rotation={[0, 0, 0]}
          width={ROOM_WIDTH}
          height={ROOM_HEIGHT}
          color={def.wallColor}
          doorWidth={DOOR_WIDTH}
          doorHeight={DOOR_HEIGHT}
        />
      ) : (
        <SolidWall
          position={[0, ROOM_HEIGHT / 2, backZ]}
          rotation={[0, 0, 0]}
          width={ROOM_WIDTH}
          height={ROOM_HEIGHT}
          color={def.wallColor}
        />
      )}
      {/* Front wall — only render from this room if it has a door or if
          it's the outer wall (isFirst). Otherwise it'd double with the
          previous room's back wall. */}
      {isFirst ? (
        <SolidWall
          position={[0, ROOM_HEIGHT / 2, frontZ]}
          rotation={[0, Math.PI, 0]}
          width={ROOM_WIDTH}
          height={ROOM_HEIGHT}
          color={def.wallColor}
        />
      ) : null}
      {/* East + west walls span the room's depth. */}
      <SolidWall
        position={[ROOM_WIDTH / 2, ROOM_HEIGHT / 2, centerZ]}
        rotation={[0, -Math.PI / 2, 0]}
        width={d}
        height={ROOM_HEIGHT}
        color={def.wallColor}
      />
      <SolidWall
        position={[-ROOM_WIDTH / 2, ROOM_HEIGHT / 2, centerZ]}
        rotation={[0, Math.PI / 2, 0]}
        width={d}
        height={ROOM_HEIGHT}
        color={def.wallColor}
      />
      {/* Bench in the middle of the room */}
      <mesh position={[0, 0.3, centerZ]}>
        <boxGeometry args={[3, 0.6, 0.9]} />
        <meshStandardMaterial color="#2a1d14" roughness={0.65} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.66, centerZ]}>
        <boxGeometry args={[3.1, 0.05, 1]} />
        <meshStandardMaterial color="#5a3d28" roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Ceiling lamps — four distributed across the ceiling. */}
      {[
        [-6, ROOM_HEIGHT - 0.04, centerZ - d / 4],
        [6, ROOM_HEIGHT - 0.04, centerZ - d / 4],
        [-6, ROOM_HEIGHT - 0.04, centerZ + d / 4],
        [6, ROOM_HEIGHT - 0.04, centerZ + d / 4],
      ].map((p, i) => (
        <CeilingLamp
          key={i}
          position={p as [number, number, number]}
          tint={def.lampTint}
        />
      ))}

      {/* Sign above back door (if there's a next room) — points into
          THIS room (toward +z) so you see it as you approach. */}
      {backHasDoor && (
        <RoomSign
          position={[0, DOOR_HEIGHT + 0.6, backZ + 0.06]}
          rotation={[0, 0, 0]}
          title={ROOMS[layout.index + 1].title}
          description={ROOMS[layout.index + 1].description}
        />
      )}
      {/* Sign above front door (the same shared door, seen from the
          other side). Rendered only by the room whose FRONT side has a
          door — that's every room except the first. Faces -z. */}
      {frontHasDoor && (
        <RoomSign
          position={[0, DOOR_HEIGHT + 0.6, frontZ - 0.06]}
          rotation={[0, Math.PI, 0]}
          title={`Return: ${ROOMS[layout.index - 1].title}`}
          description="You are leaving this room."
        />
      )}
    </group>
  );
}

// -------------------------------------------------------------
// Player
// -------------------------------------------------------------

type CorridorBounds = {
  zMin: number;
  zMax: number;
  doorZs: number[]; // shared-wall z positions
  benchCenters: Array<{ x: number; z: number }>;
};

function Player({
  enabled,
  onZoomRequest,
  corridor,
  startZ,
}: {
  enabled: boolean;
  onZoomRequest: (artwork: Artwork) => void;
  corridor: CorridorBounds;
  startZ: number;
}) {
  const { camera, scene } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const velocityY = useRef(0);
  const grounded = useRef(true);
  const raycaster = useRef(new THREE.Raycaster(undefined, undefined, 0.1, 10));
  const rayOrigin = useRef(new THREE.Vector3());
  const rayDirection = useRef(new THREE.Vector3());

  useEffect(() => {
    camera.position.set(0, EYE_HEIGHT, startZ);
    camera.lookAt(0, EYE_HEIGHT, startZ - 5);
  }, [camera, startZ]);

  useEffect(() => {
    const tryZoom = () => {
      camera.getWorldPosition(rayOrigin.current);
      camera.getWorldDirection(rayDirection.current);
      raycaster.current.set(rayOrigin.current, rayDirection.current);
      const hits = raycaster.current.intersectObjects(scene.children, true);
      for (const hit of hits) {
        const artwork = hit.object.userData?.artwork as Artwork | undefined;
        if (artwork) {
          onZoomRequest(artwork);
          return;
        }
      }
    };

    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (!enabled) return;
      if (e.code === "Space" && grounded.current) {
        velocityY.current = JUMP_IMPULSE;
        grounded.current = false;
        e.preventDefault();
      }
      if (e.code === "KeyE" || e.code === "KeyF") tryZoom();
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    // Click while locked = inspect what you're looking at.
    const mouse = (e: MouseEvent) => {
      if (!enabled) return;
      // button 0 = primary. Clicks during pointer-lock still fire.
      if (e.button === 0) tryZoom();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousedown", mouse);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousedown", mouse);
    };
  }, [enabled, camera, scene, onZoomRequest]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const dt = Math.min(delta, 0.1);
    const running =
      keys.current["ShiftLeft"] || keys.current["ShiftRight"] || false;
    const speed = running ? RUN_SPEED : WALK_SPEED;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0) forward.normalize();
    const right = new THREE.Vector3().crossVectors(
      forward,
      new THREE.Vector3(0, 1, 0),
    );
    if (right.lengthSq() > 0) right.normalize();

    const move = new THREE.Vector3();
    if (keys.current["KeyW"] || keys.current["ArrowUp"]) move.add(forward);
    if (keys.current["KeyS"] || keys.current["ArrowDown"]) move.sub(forward);
    if (keys.current["KeyD"] || keys.current["ArrowRight"]) move.add(right);
    if (keys.current["KeyA"] || keys.current["ArrowLeft"]) move.sub(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      camera.position.add(move);
    }

    // X bound — same for every room.
    camera.position.x = THREE.MathUtils.clamp(
      camera.position.x,
      -ROOM_WIDTH / 2 + WALL_X_BUF,
      ROOM_WIDTH / 2 - WALL_X_BUF,
    );
    // Z corridor bound (corridor outermost walls).
    camera.position.z = THREE.MathUtils.clamp(
      camera.position.z,
      corridor.zMin,
      corridor.zMax,
    );

    // Door walls — block crossings that don't thread the opening.
    const DOOR_HALF_W = DOOR_WIDTH / 2 - 0.1;
    const WALL_THICK = 0.35;
    for (const wallZ of corridor.doorZs) {
      const dist = camera.position.z - wallZ;
      if (Math.abs(dist) < WALL_THICK) {
        const throughDoor =
          Math.abs(camera.position.x) < DOOR_HALF_W &&
          camera.position.y < DOOR_HEIGHT - 0.1;
        if (!throughDoor) {
          camera.position.z = wallZ + Math.sign(dist || 1) * WALL_THICK;
        }
      }
    }

    // Bench colliders — one per room, centred on room centre.
    const BENCH_HEIGHT = 0.66;
    const BENCH_HALF = { x: 1.5, z: 0.45 };
    const benchBlocking =
      camera.position.y < EYE_HEIGHT + BENCH_HEIGHT - 0.1;
    for (const center of corridor.benchCenters) {
      if (
        benchBlocking &&
        Math.abs(camera.position.x - center.x) < BENCH_HALF.x + 0.4 &&
        Math.abs(camera.position.z - center.z) < BENCH_HALF.z + 0.4
      ) {
        const dx = camera.position.x - center.x;
        const dz = camera.position.z - center.z;
        if (Math.abs(dx) > Math.abs(dz)) {
          camera.position.x =
            center.x + Math.sign(dx || 1) * (BENCH_HALF.x + 0.4);
        } else {
          camera.position.z =
            center.z + Math.sign(dz || 1) * (BENCH_HALF.z + 0.4);
        }
      }
    }

    // Vertical integration (jump / gravity).
    velocityY.current -= GRAVITY * dt;
    camera.position.y += velocityY.current * dt;
    if (camera.position.y <= EYE_HEIGHT) {
      camera.position.y = EYE_HEIGHT;
      velocityY.current = 0;
      grounded.current = true;
    } else {
      grounded.current = false;
    }
  });

  return null;
}

// -------------------------------------------------------------
// Overlays
// -------------------------------------------------------------

function StartOverlay({
  onStart,
  loadedCount,
  total,
}: {
  onStart: () => void;
  loadedCount: number;
  total: number;
}) {
  const ready = loadedCount >= total;
  const pct = total > 0 ? Math.round((loadedCount / total) * 100) : 0;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/65 backdrop-blur-sm">
      <div className="w-[min(460px,92vw)] rounded-xl border border-white/15 bg-black/60 p-6 text-center text-white shadow-2xl">
        <h2 className="font-serif text-2xl tracking-wide">Enter the gallery</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/75">
          Click{" "}
          <kbd className="rounded border border-white/30 px-1.5">Enter</kbd> to
          lock the cursor. Move with{" "}
          <kbd className="rounded border border-white/30 px-1.5">W</kbd>{" "}
          <kbd className="rounded border border-white/30 px-1.5">A</kbd>{" "}
          <kbd className="rounded border border-white/30 px-1.5">S</kbd>{" "}
          <kbd className="rounded border border-white/30 px-1.5">D</kbd>,
          look with the mouse, hold{" "}
          <kbd className="rounded border border-white/30 px-1.5">Shift</kbd>{" "}
          to run,{" "}
          <kbd className="rounded border border-white/30 px-1.5">Space</kbd>{" "}
          to jump. Click a painting — or look at it and press{" "}
          <kbd className="rounded border border-white/30 px-1.5">E</kbd>{" "}
          — to inspect. Walk through the doorways to reach the next room.
        </p>

        <div className="mt-5 space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-white/70 transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-xs text-white/55">
            {ready
              ? "Paintings loaded"
              : `Loading paintings… ${loadedCount}/${total}`}
          </div>
        </div>

        <button
          type="button"
          onClick={onStart}
          disabled={!ready}
          className="mt-5 rounded-md bg-white px-5 py-2 text-sm font-medium text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/60"
        >
          {ready ? "Enter" : "Preparing…"}
        </button>

        <div className="mt-4 text-xs text-white/45">
          <Link href="/" className="underline hover:text-white/80">
            Back to the 2D gallery
          </Link>
        </div>
      </div>
    </div>
  );
}

function Crosshair() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div className="h-1.5 w-1.5 rounded-full bg-white/70 ring-1 ring-black/40" />
    </div>
  );
}

function HintBar() {
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-4 py-1.5 text-xs text-white/80 backdrop-blur">
      WASD · mouse · Shift to run · Space to jump · Click or E to inspect · Esc
      to release
    </div>
  );
}

// -------------------------------------------------------------
// Zoom modal — with wheel zoom + drag pan + reset
// -------------------------------------------------------------

function ZoomModal({
  artwork,
  onClose,
}: {
  artwork: Artwork;
  onClose: () => void;
}) {
  const [src, setSrc] = useState(
    variantAssetsRawUrl(artwork.objectKey, 2560, "avif"),
  );
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{
    x: number;
    y: number;
    tx: number;
    ty: number;
  } | null>(null);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.code === "Escape" || e.code === "KeyE" || e.code === "KeyF") {
        onClose();
      }
      if (e.code === "Digit0" || e.code === "Numpad0") {
        setScale(1);
        setTx(0);
        setTy(0);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      // Pinch or scroll: adjust scale. Negative deltaY = scroll up =
      // zoom in. Keep the point under the cursor stationary by
      // adjusting the translate accordingly.
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;

      const factor = Math.exp(-e.deltaY * 0.0018);
      const newScale = Math.max(1, Math.min(10, scale * factor));
      // Point (px, py) in image space before:
      //   ix = (cx - tx) / scale
      // After zoom, to keep (ix, iy) under cursor:
      //   cx = ix * newScale + tx'
      //   tx' = cx - ix * newScale = cx - (cx - tx) * (newScale / scale)
      const actualFactor = newScale / scale;
      const newTx = cx - (cx - tx) * actualFactor;
      const newTy = cy - (cy - ty) * actualFactor;

      setScale(newScale);
      if (newScale === 1) {
        setTx(0);
        setTy(0);
      } else {
        setTx(newTx);
        setTy(newTy);
      }
    },
    [scale, tx, ty],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
    },
    [tx, ty],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      setTx(dragRef.current.tx + dx);
      setTy(dragRef.current.ty + dy);
    },
    [],
  );

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const year = artwork.year ? `, ${artwork.year}` : "";
  const byline = `${artwork.artist ?? "Unknown"}${year}`;
  const dims = artwork.realDimensions
    ? `${formatCm(artwork.realDimensions.widthCm)} × ${formatCm(
        artwork.realDimensions.heightCm,
      )} cm`
    : null;

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-stretch bg-black/95 text-white"
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div
        className="relative flex-1 overflow-hidden"
        onClick={(e) => {
          // Click outside the image area closes the modal. The image
          // itself stops propagation.
          if (e.target === e.currentTarget) onClose();
        }}
        onWheel={onWheel}
        style={{ cursor: scale > 1 ? (dragRef.current ? "grabbing" : "grab") : "default" }}
      >
        <img
          src={src}
          alt={artwork.title}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={onMouseDown}
          onError={() => setSrc(rawOriginalUrl(artwork.objectKey))}
          className="absolute left-1/2 top-1/2 max-h-[90vh] max-w-[94vw] select-none object-contain shadow-2xl"
          style={{
            transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(${scale})`,
            transformOrigin: "center center",
            transition: dragRef.current ? "none" : "transform 80ms ease-out",
          }}
        />
      </div>
      <div
        className="flex flex-wrap items-end justify-between gap-4 border-t border-white/10 bg-black/80 px-6 py-3 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="font-serif text-lg leading-tight">{artwork.title}</div>
          <div className="mt-0.5 text-white/60">{byline}</div>
          {dims && (
            <div className="mt-0.5 text-xs text-white/45">{dims}</div>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className="tabular-nums">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={reset}
            disabled={scale === 1 && tx === 0 && ty === 0}
            className="rounded-md border border-white/20 bg-white/5 px-3 py-1 font-medium transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-white px-3 py-1 font-medium text-black transition hover:bg-white/85"
          >
            Close
          </button>
        </div>
      </div>
      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs text-white/75 backdrop-blur">
        Scroll to zoom · drag to pan ·{" "}
        <kbd className="rounded border border-white/30 px-1">0</kbd> resets ·{" "}
        <kbd className="rounded border border-white/30 px-1">Esc</kbd> closes
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Main
// -------------------------------------------------------------

type PointerLockControlsHandle = {
  lock: () => void;
  unlock: () => void;
};

export function Gallery3D({ artworks }: Props) {
  const artworkById = useMemo(
    () => new Map(artworks.map((a) => [a.id, a])),
    [artworks],
  );
  const layouts = useMemo(() => layoutCorridor(artworkById), [artworkById]);
  const allPlacements = useMemo(
    () => layouts.flatMap((l) => l.placements),
    [layouts],
  );
  const startZ = useMemo(() => defaultStartZ(ROOMS), []);

  const corridorBounds: CorridorBounds = useMemo(() => {
    const zMax = (layouts[0]?.frontZ ?? 0) - 0.6;
    const zMin = (layouts[layouts.length - 1]?.backZ ?? 0) + 0.6;
    const doorZs = layouts.slice(0, -1).map((l) => l.backZ);
    const benchCenters = layouts.map((l) => ({ x: 0, z: l.centerZ }));
    return { zMin, zMax, doorZs, benchCenters };
  }, [layouts]);

  const [locked, setLocked] = useState(false);
  const [zoomed, setZoomed] = useState<Artwork | null>(null);
  const [loadedCount, setLoadedCount] = useState(() =>
    allPlacements.filter((p) => textureCache.has(p.artwork.objectKey))
      .length,
  );
  const controlsRef = useRef<PointerLockControlsHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    for (const p of allPlacements) {
      if (textureCache.has(p.artwork.objectKey)) continue;
      loadTexture(p.artwork)
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setLoadedCount((c) => c + 1);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [allPlacements]);

  const start = () => {
    controlsRef.current?.lock?.();
  };

  const handleZoomRequest = (artwork: Artwork) => {
    setZoomed(artwork);
    controlsRef.current?.unlock?.();
  };

  return (
    <div className="fixed left-0 right-0 bottom-0 top-[57px] bg-[#0a0604]">
      <Canvas
        dpr={[1, 1.75]}
        camera={{
          fov: 70,
          near: 0.1,
          far: 140,
          position: [0, EYE_HEIGHT, startZ],
        }}
        gl={{ antialias: true, toneMappingExposure: 1.15 }}
      >
        <color attach="background" args={["#0a0604"]} />
        <fog attach="fog" args={["#0a0604", 18, 64]} />

        <ambientLight intensity={0.38} color="#fff1dd" />
        <hemisphereLight
          intensity={0.32}
          color={"#fff1dd" as unknown as THREE.ColorRepresentation}
          groundColor={"#2a1d14" as unknown as THREE.ColorRepresentation}
        />

        {layouts.map((layout) => (
          <RoomGeometry key={layout.def.id} layout={layout} />
        ))}

        {allPlacements.map((p) => (
          <Painting
            key={p.artwork.id}
            placement={p}
            onClick={handleZoomRequest}
          />
        ))}

        <Player
          enabled={locked}
          onZoomRequest={handleZoomRequest}
          corridor={corridorBounds}
          startZ={startZ}
        />
        <PointerLockControls
          ref={controlsRef as unknown as React.Ref<never>}
          onLock={() => setLocked(true)}
          onUnlock={() => setLocked(false)}
        />
      </Canvas>
      {!locked && !zoomed && (
        <StartOverlay
          onStart={start}
          loadedCount={loadedCount}
          total={allPlacements.length}
        />
      )}
      {locked && (
        <>
          <Crosshair />
          <HintBar />
        </>
      )}
      {zoomed && (
        <ZoomModal artwork={zoomed} onClose={() => setZoomed(null)} />
      )}
    </div>
  );
}
