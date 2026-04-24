"use client";

import type * as THREE from "three";
import { darkWoodTrimMaterial } from "./palette-materials";

type Vec3 = [number, number, number];

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
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
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
      {strips.map((s, i) => {
        const w = s.xMax - s.xMin;
        if (w <= 0.001) return null;
        const cx = (s.xMin + s.xMax) / 2;
        return (
          <mesh key={`s${i}`} position={[cx, 0, 0]}>
            <planeGeometry args={[w, height]} />
            <primitive object={material} attach="material" />
          </mesh>
        );
      })}
      {sorted.map((d, i) => {
        const lintelH = height - d.height;
        if (lintelH <= 0.001) return null;
        const cy = d.height + lintelH / 2 - halfH;
        return (
          <mesh key={`l${i}`} position={[d.centerLocalX, cy, 0]}>
            <planeGeometry args={[d.width, lintelH]} />
            <primitive object={material} attach="material" />
          </mesh>
        );
      })}
      {sorted.map((d, i) => (
        <DoorTrim
          key={`t${i}`}
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
      <mesh position={[-width / 2 - trim / 2, height / 2, 0]}>
        <boxGeometry args={[trim, height, 0.08]} />
        <primitive object={darkWoodTrimMaterial} attach="material" />
      </mesh>
      <mesh position={[width / 2 + trim / 2, height / 2, 0]}>
        <boxGeometry args={[trim, height, 0.08]} />
        <primitive object={darkWoodTrimMaterial} attach="material" />
      </mesh>
      <mesh position={[0, height + trim / 2, 0]}>
        <boxGeometry args={[width + trim * 2, trim, 0.08]} />
        <primitive object={darkWoodTrimMaterial} attach="material" />
      </mesh>
    </group>
  );
}
