"use client";

import { useCallback, useEffect, useMemo } from "react";
import type * as THREE from "three";
import { UNREFLECTED_LAYER } from "./floor-mirror";
import { darkWoodTrimMaterial } from "./palette-materials";
import { buildSkirtingGeometry } from "./skirting-geometry";

type Vec3 = [number, number, number];

/** A wall plane whose UVs are metres along the wall and up from the
 *  floor, so a tiling wall texture (wall-damask.ts) is the same size on
 *  every wall and runs unbroken across the strips either side of a door.
 *  `u0`/`v0` are the plane's lower left corner in that frame. A wall
 *  with a flat colour ignores the UVs. */
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
}: {
  position: Vec3;
  rotation: Vec3;
  width: number;
  height: number;
  material: THREE.Material;
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <MetrePlane width={width} height={height} u0={0} v0={0} />
        <primitive object={material} attach="material" />
      </mesh>
      <Skirting spans={[{ xMin: -width / 2, xMax: width / 2 }]} floorY={-height / 2} />
    </group>
  );
}

/** Skirting along a wall's clear spans, in the wall's local frame. */
function Skirting({
  spans,
  floorY,
}: {
  spans: ReadonlyArray<{ xMin: number; xMax: number }>;
  floorY: number;
}) {
  const key = spans.map((s) => `${s.xMin.toFixed(3)}:${s.xMax.toFixed(3)}`).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the content of `spans`, whose array identity changes every render.
  const geometry = useMemo(() => buildSkirtingGeometry(spans, floorY), [key, floorY]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return <mesh geometry={geometry} material={darkWoodTrimMaterial} layers={UNREFLECTED_LAYER} />;
}

type DoorOpening = {
  /** Center of the opening along the wall's local X axis, metres. */
  centerLocalX: number;
  width: number;
  height: number;
};

/**
 * Wall with N door openings cut out. Partitions the wall plane into
 * solid strips + lintels around the door centres. The same shared
 * material is used for every strip to avoid per-mesh material churn.
 */
export function WallWithDoors({
  position,
  rotation,
  width,
  height,
  material,
  doors,
}: {
  position: Vec3;
  rotation: Vec3;
  width: number;
  height: number;
  material: THREE.Material;
  doors: DoorOpening[];
}) {
  if (doors.length === 0) {
    return (
      <SolidWall
        position={position}
        rotation={rotation}
        width={width}
        height={height}
        material={material}
      />
    );
  }

  const sorted = [...doors].sort((a, b) => a.centerLocalX - b.centerLocalX);
  const halfW = width / 2;
  const halfH = height / 2;

  type Strip = { xMin: number; xMax: number };
  const strips: Strip[] = [];
  let prevEnd = -halfW;
  for (const d of sorted) {
    const doorLeft = d.centerLocalX - d.width / 2;
    const doorRight = d.centerLocalX + d.width / 2;
    if (doorLeft > prevEnd) strips.push({ xMin: prevEnd, xMax: doorLeft });
    prevEnd = Math.max(prevEnd, doorRight);
  }
  if (prevEnd < halfW) strips.push({ xMin: prevEnd, xMax: halfW });

  return (
    <group position={position} rotation={rotation}>
      {strips.map((s) => {
        const w = s.xMax - s.xMin;
        if (w <= 0.001) return null;
        const cx = (s.xMin + s.xMax) / 2;
        return (
          <mesh key={`strip-${s.xMin}-${s.xMax}`} position={[cx, 0, 0]}>
            <MetrePlane width={w} height={height} u0={s.xMin + halfW} v0={0} />
            <primitive object={material} attach="material" />
          </mesh>
        );
      })}
      {sorted.map((d) => {
        const lintelH = height - d.height;
        if (lintelH <= 0.001) return null;
        const cy = d.height + lintelH / 2 - halfH;
        return (
          <mesh
            key={`lintel-${d.centerLocalX}-${d.width}-${d.height}`}
            position={[d.centerLocalX, cy, 0]}
          >
            <MetrePlane
              width={d.width}
              height={lintelH}
              u0={d.centerLocalX - d.width / 2 + halfW}
              v0={d.height}
            />
            <primitive object={material} attach="material" />
          </mesh>
        );
      })}
      <Skirting spans={strips} floorY={-halfH} />
      {sorted.map((d) => (
        <DoorTrim
          key={`trim-${d.centerLocalX}-${d.width}-${d.height}`}
          centerLocalX={d.centerLocalX}
          width={d.width}
          height={d.height}
          wallHeight={height}
        />
      ))}
    </group>
  );
}

function DoorTrim({
  centerLocalX,
  width,
  height,
  wallHeight,
}: {
  centerLocalX: number;
  width: number;
  height: number;
  wallHeight: number;
}) {
  const trim = 0.06;
  const floorY = -wallHeight / 2;
  return (
    <group position={[centerLocalX, floorY, 0]}>
      <mesh position={[-width / 2 - trim / 2, height / 2, 0]} layers={UNREFLECTED_LAYER}>
        <boxGeometry args={[trim, height, 0.08]} />
        <primitive object={darkWoodTrimMaterial} attach="material" />
      </mesh>
      <mesh position={[width / 2 + trim / 2, height / 2, 0]} layers={UNREFLECTED_LAYER}>
        <boxGeometry args={[trim, height, 0.08]} />
        <primitive object={darkWoodTrimMaterial} attach="material" />
      </mesh>
      <mesh position={[0, height + trim / 2, 0]} layers={UNREFLECTED_LAYER}>
        <boxGeometry args={[width + trim * 2, trim, 0.08]} />
        <primitive object={darkWoodTrimMaterial} attach="material" />
      </mesh>
    </group>
  );
}
