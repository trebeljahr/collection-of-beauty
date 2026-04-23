"use client";

import * as THREE from "three";

type Vec3 = [number, number, number];

/** Flat wall plane — two-sided so the player can't see through it from
 *  either direction. */
export function SolidWall({
  position,
  rotation,
  width,
  height,
  color,
}: {
  position: Vec3;
  rotation: Vec3;
  width: number;
  height: number;
  color: string;
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial
        color={color}
        roughness={0.92}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

type DoorOpening = {
  /** Center of the opening along the wall's local X axis, metres.
   *  0 = wall midpoint; negative = left, positive = right when looking
   *  at the wall from its "outside" face. */
  centerLocalX: number;
  width: number;
  height: number;
};

/**
 * Wall with N door openings cut out. We model the wall as:
 *   - vertical "pier" strips between doors + two end pieces
 *   - horizontal lintel strips above each door opening (from door top
 *     to wall top)
 * Each strip is a planeGeometry with the same material. Doors are
 * assumed to sit on the floor (bottom aligned) which is true for the
 * gallery.
 */
export function WallWithDoors({
  position,
  rotation,
  width,
  height,
  color,
  doors,
}: {
  position: Vec3;
  rotation: Vec3;
  width: number;
  height: number;
  color: string;
  doors: DoorOpening[];
}) {
  if (doors.length === 0) {
    return (
      <SolidWall
        position={position}
        rotation={rotation}
        width={width}
        height={height}
        color={color}
      />
    );
  }

  // Sort doors along the wall so strip calculation is well-defined.
  const sorted = [...doors].sort((a, b) => a.centerLocalX - b.centerLocalX);
  const halfW = width / 2;
  const halfH = height / 2;

  // Build strip intervals: between end-left and first door, between
  // each pair of doors, and between last door and end-right.
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
      {/* Vertical pier strips — full wall height between door cuts. */}
      {strips.map((s, i) => {
        const w = s.xMax - s.xMin;
        if (w <= 0.001) return null;
        const cx = (s.xMin + s.xMax) / 2;
        return (
          <mesh key={`s${i}`} position={[cx, 0, 0]}>
            <planeGeometry args={[w, height]} />
            <meshStandardMaterial
              color={color}
              roughness={0.92}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
      {/* Lintel above each door opening. */}
      {sorted.map((d, i) => {
        const lintelH = height - d.height;
        if (lintelH <= 0.001) return null;
        const cy = d.height + lintelH / 2 - halfH;
        return (
          <mesh key={`l${i}`} position={[d.centerLocalX, cy, 0]}>
            <planeGeometry args={[d.width, lintelH]} />
            <meshStandardMaterial
              color={color}
              roughness={0.92}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
      {/* Dark doorframe trim around each opening — purely decorative. */}
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
  const color = "#2a1d14";
  // Door is bottom-aligned to floor (which is at localY = -wallHeight/2).
  const floorY = -wallHeight / 2;
  return (
    <group position={[centerLocalX, floorY, 0]}>
      <mesh position={[-width / 2 - trim / 2, height / 2, 0]}>
        <boxGeometry args={[trim, height, 0.08]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[width / 2 + trim / 2, height / 2, 0]}>
        <boxGeometry args={[trim, height, 0.08]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[0, height + trim / 2, 0]}>
        <boxGeometry args={[width + trim * 2, trim, 0.08]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} />
      </mesh>
    </group>
  );
}
