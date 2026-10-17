"use client";

import { type Ref, useCallback, useEffect, useMemo } from "react";
import type * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DOOR_TRIM, PORTAL_TRIM } from "@/lib/gallery-layout/world-coords";
import { UNREFLECTED_LAYER } from "./floor-mirror";
import { darkWoodTrimMaterial } from "./palette-materials";
import { buildCorniceGeometry, buildSkirtingGeometry } from "./skirting-geometry";
import { buildDoorTrimGeometry, buildWallFaceGeometry, wallStrips } from "./wall-geometry";

type Vec3 = [number, number, number];

/** A wall plane whose UVs are metres along the wall and up from the
 *  floor, so a tiling wall texture would be the same size on every wall
 *  and run unbroken across the strips either side of a door. `u0`/`v0`
 *  are the plane's lower left corner in that frame. No wall carries a
 *  texture today, and a flat colour ignores the UVs. */
function MetrePlane({
  width,
  height,
  u0,
  v0,
}: {
  width: number;
  height: number;
  u0: number;
  v0: number;
}) {
  const ref = useCallback(
    (g: THREE.PlaneGeometry | null) => {
      if (!g) return;
      const pos = g.attributes.position;
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, u0 + pos.getX(i) + width / 2, v0 + pos.getY(i) + height / 2);
      }
      uv.needsUpdate = true;
    },
    [width, height, u0, v0],
  );
  return <planeGeometry ref={ref} args={[width, height]} />;
}

/** Flat wall plane — two-sided so the player can't see through it from
 *  either direction. Accepts a shared `THREE.Material` so callers can
 *  reuse one material across every wall of the same palette. */
export function SolidWall({
  position,
  rotation,
  width,
  height,
  material,
  trim = darkWoodTrimMaterial,
  groupRef,
  skirting,
  ownFace,
  cornice,
  corniceClip,
}: {
  position: Vec3;
  rotation: Vec3;
  width: number;
  height: number;
  material: THREE.Material;
  /** Wood of the skirting. A room passes its own, lit as the room is
   *  (room-light.ts). */
  trim?: THREE.Material;
  groupRef?: Ref<THREE.Group>;
  skirting?: SkirtingClip;
  ownFace?: boolean;
  cornice?: number;
  corniceClip?: SkirtingClip;
}) {
  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      <mesh>
        <MetrePlane width={width} height={height} u0={0} v0={0} />
        <primitive object={material} attach="material" />
      </mesh>
      <Skirting
        spans={clipSpans([{ xMin: -width / 2, xMax: width / 2 }], skirting)}
        floorY={-height / 2}
        oneSided={ownFace}
        cornice={
          cornice === undefined
            ? undefined
            : { spans: corniceSpans(width, corniceClip), y: cornice - height / 2 }
        }
        material={trim}
      />
    </group>
  );
}

/** The stretches of a wall that have floor at their foot, in the
 *  wall's local x: skirting is drawn there only. `null` is none of it,
 *  unset all of it. A stair hall's sheer wall has no floor on the
 *  storeys over its lowest, and the walls that meet it none for the
 *  strip's depth; a loggia's end wall has none where its landings meet
 *  it. */
export type SkirtingClip = ReadonlyArray<{ xMin: number; xMax: number }> | null | undefined;

function clipSpans(
  spans: ReadonlyArray<{ xMin: number; xMax: number }>,
  clip: SkirtingClip,
): Array<{ xMin: number; xMax: number }> {
  if (clip === null) return [];
  if (clip === undefined) return [...spans];
  return spans
    .flatMap((s) =>
      clip.map((c) => ({ xMin: Math.max(s.xMin, c.xMin), xMax: Math.min(s.xMax, c.xMax) })),
    )
    .filter((s) => s.xMax - s.xMin > 0.001);
}

/** A cornice runs the wall's whole width, less where the ceiling
 *  stops short of it: no door reaches the ceiling. */
function corniceSpans(width: number, clip: SkirtingClip) {
  return clipSpans([{ xMin: -width / 2, xMax: width / 2 }], clip);
}

/** Skirting along a wall's clear spans, and the cornice along its
 *  head where it meets the ceiling, in the wall's local frame. One mesh
 *  for both. */
function Skirting({
  spans,
  floorY,
  oneSided,
  cornice,
  material,
}: {
  spans: ReadonlyArray<{ xMin: number; xMax: number }>;
  floorY: number;
  oneSided?: boolean;
  /** Where the cornice runs, and the ceiling's local height. */
  cornice?: { spans: ReadonlyArray<{ xMin: number; xMax: number }>; y: number };
  material: THREE.Material;
}) {
  const key = spans.map((s) => `${s.xMin.toFixed(3)}:${s.xMax.toFixed(3)}`).join(",");
  const corniceKey = cornice?.spans
    .map((s) => `${s.xMin.toFixed(3)}:${s.xMax.toFixed(3)}`)
    .join(",");
  const corniceY = cornice?.y;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` and `corniceKey` are the content of `spans` and `cornice.spans`, whose array identities change every render.
  const geometry = useMemo(() => {
    const board = buildSkirtingGeometry(spans, floorY, oneSided);
    const head = cornice ? buildCorniceGeometry(cornice.spans, cornice.y) : null;
    if (!board || !head) return board ?? head;
    const merged = mergeGeometries([board, head], false);
    board.dispose();
    head.dispose();
    return merged;
  }, [key, floorY, oneSided, corniceKey, corniceY]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} layers={UNREFLECTED_LAYER} />;
}

type DoorOpening = {
  /** Center of the opening along the wall's local X axis, metres. */
  centerLocalX: number;
  width: number;
  height: number;
  /** A wide opening on a main axis: cased like a wall, not a door. */
  portal?: boolean;
};

/**
 * Wall with N door openings cut out. Partitions the wall plane into
 * solid strips + lintels around the door centres, submitted together
 * as one mesh with the wall's shared material.
 */
export function WallWithDoors({
  position,
  rotation,
  width,
  height,
  material,
  trim = darkWoodTrimMaterial,
  doors,
  groupRef,
  skirting,
  ownFace,
  cornice,
  corniceClip,
}: {
  position: Vec3;
  rotation: Vec3;
  width: number;
  height: number;
  material: THREE.Material;
  /** Wood of the skirting. A room passes its own, lit as the room is
   *  (room-light.ts). */
  trim?: THREE.Material;
  doors: DoorOpening[];
  /** The group holding the whole wall: strips, lintels, skirting and
   *  door trim. Room culling shows and hides a wall by it. */
  groupRef?: Ref<THREE.Group>;
  skirting?: SkirtingClip;
  /** The room draws this wall for itself, its neighbour its own: the
   *  skirting stands on this face only. */
  ownFace?: boolean;
  /** Height of the room's ceiling over its floor: a cornice runs along
   *  the wall there, on this face. Unset for a wall with no ceiling at
   *  room height. */
  cornice?: number;
  /** Where along the wall the ceiling meets it: a hall's ceiling is
   *  cut where its stair's opening touches the wall. */
  corniceClip?: SkirtingClip;
}) {
  const openingsKey = doors
    .map((door) => `${door.centerLocalX}:${door.width}:${door.height}:${door.portal ? 1 : 0}`)
    .join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `openingsKey` contains every door primitive; room reveal renders recreate the doors array.
  const sorted = useMemo(
    () => [...doors].sort((a, b) => a.centerLocalX - b.centerLocalX),
    [openingsKey],
  );
  const strips = useMemo(() => wallStrips(width, sorted), [width, sorted]);
  const face = useMemo(
    () => (sorted.length ? buildWallFaceGeometry(width, height, sorted) : null),
    [width, height, sorted],
  );
  useEffect(() => () => face?.dispose(), [face]);

  if (doors.length === 0) {
    return (
      <SolidWall
        position={position}
        rotation={rotation}
        width={width}
        height={height}
        material={material}
        trim={trim}
        groupRef={groupRef}
        skirting={skirting}
        ownFace={ownFace}
        cornice={cornice}
        corniceClip={corniceClip}
      />
    );
  }

  const halfH = height / 2;

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {face && <mesh geometry={face} material={material} />}
      <Skirting
        spans={clipSpans(strips, skirting)}
        floorY={-halfH}
        oneSided={ownFace}
        cornice={
          cornice === undefined
            ? undefined
            : { spans: corniceSpans(width, corniceClip), y: cornice - halfH }
        }
        material={trim}
      />
      {sorted.map((d) => (
        <DoorTrim
          key={`trim-${d.centerLocalX}-${d.width}-${d.height}`}
          centerLocalX={d.centerLocalX}
          width={d.width}
          height={d.height}
          wallHeight={height}
          portal={d.portal}
        />
      ))}
    </group>
  );
}

/** Casing of a portal: wider than a door's trim, and deep enough to
 *  give the paper-thin wall a reveal, so a 3.5 m opening reads as cut
 *  through masonry.
 *
 *  A door's trim is always the one shared material, never a room's own
 *  (room-light.ts). Where two rooms each draw the wall between them,
 *  both put a casing on the same spot and its faces lie in one plane.
 *  In one material that shows nothing. Lit as two rooms, the jambs
 *  flickered in stripes of the two. */
const PORTAL_TRIM_DEPTH = 0.32;

function DoorTrim({
  centerLocalX,
  width,
  height,
  wallHeight,
  portal,
}: {
  centerLocalX: number;
  width: number;
  height: number;
  wallHeight: number;
  portal?: boolean;
}) {
  const trim = portal ? PORTAL_TRIM : DOOR_TRIM;
  const depth = portal ? PORTAL_TRIM_DEPTH : 0.08;
  const geometry = useMemo(
    () => buildDoorTrimGeometry(width, height, trim, depth),
    [width, height, trim, depth],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  // A door's trim is too slight to show in the floor. A portal's casing
  // is not: it stays in the floor's reflection.
  const layer = portal ? 0 : UNREFLECTED_LAYER;
  const floorY = -wallHeight / 2;
  return (
    <group position={[centerLocalX, floorY, 0]}>
      <mesh geometry={geometry} material={darkWoodTrimMaterial} layers={layer} />
    </group>
  );
}
