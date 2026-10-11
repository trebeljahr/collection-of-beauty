// The gallery bench, built in code: three leather pads on a wooden
// frame with four tapered legs and an H stretcher. 2.0 × 0.6 m and
// 0.45 m to the top of the seat, the size of the backless benches that
// stand in the middle of picture galleries.
//
// One bench is modelled once in its own frame (long side along x,
// centred, standing on y = 0). A room's benches are then merged into
// one geometry per material, so they cost a fixed number of draw calls
// however many there are.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BENCH_DEPTH, BENCH_HEIGHT, BENCH_LENGTH } from "@/lib/gallery-layout/fittings";
import type { Bench } from "@/lib/gallery-layout/types";

const PAD_HEIGHT = 0.1;
const PAD_COUNT = 3;
/** Seam between two pads. */
const PAD_GAP = 0.008;
const PAD_RADIUS = 0.028;
/** Steps round a pad's edge. Every bench on the storey is drawn twice,
 *  once for the floor's reflection, and at three steps the pads were
 *  most of that pass's triangles. */
const PAD_SEGMENTS = 2;
/** Board the pads sit on. */
const DECK_HEIGHT = 0.025;
const DECK_INSET = 0.02;
const RAIL_HEIGHT = 0.07;
const RAIL_THICKNESS = 0.028;
/** Leg centres, in from the seat's edge. */
const LEG_INSET_X = 0.08;
const LEG_INSET_Z = 0.065;
const LEG_TOP = 0.055;
const LEG_FOOT = 0.036;
const STRETCHER_Y = 0.11;
const STRETCHER_HEIGHT = 0.03;
const STRETCHER_THICKNESS = 0.024;
/** How far the contact shadow spreads past the seat. */
const SHADOW_SPREAD = 0.28;

/** Every part non-indexed, so parts from different three.js builders
 *  merge. Box faces keep their flat normals. */
function part(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return g.index ? g.toNonIndexed() : g;
}

/** Darkest a face turned to the floor gets, as a share of its colour. */
const SHADE_FLOOR = 0.5;

/**
 * Bake a top-down shade into vertex colours: full colour on a face
 * turned to the ceiling, falling to SHADE_FLOOR on one turned to the
 * floor. The rooms are lit by an even environment and nothing in them
 * casts a shadow, so without this a pad's rounded edge and a leg's four
 * sides come out one flat tone.
 */
function shade(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const normal = g.getAttribute("normal");
  const colors = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i++) {
    const k = SHADE_FLOOR + (1 - SHADE_FLOOR) * (0.5 + 0.5 * normal.getY(i));
    colors.fill(k, i * 3, i * 3 + 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return part(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
}

/** One bench in its own frame, as the two geometries its materials
 *  need: the leather seat and the wooden frame. Both carry a baked
 *  shade in their vertex colours. */
export function buildBenchParts(): { seat: THREE.BufferGeometry; frame: THREE.BufferGeometry } {
  const deckTop = BENCH_HEIGHT - PAD_HEIGHT;
  const railTop = deckTop - DECK_HEIGHT;

  const padLength = (BENCH_LENGTH - (PAD_COUNT - 1) * PAD_GAP) / PAD_COUNT;
  const pads: THREE.BufferGeometry[] = [];
  for (let i = 0; i < PAD_COUNT; i++) {
    const x = -BENCH_LENGTH / 2 + padLength / 2 + i * (padLength + PAD_GAP);
    pads.push(
      part(
        new RoundedBoxGeometry(
          padLength,
          PAD_HEIGHT,
          BENCH_DEPTH,
          PAD_SEGMENTS,
          PAD_RADIUS,
        ).translate(x, deckTop + PAD_HEIGHT / 2, 0),
      ),
    );
  }

  const legX = BENCH_LENGTH / 2 - LEG_INSET_X;
  const legZ = BENCH_DEPTH / 2 - LEG_INSET_Z;
  const wood: THREE.BufferGeometry[] = [
    box(
      BENCH_LENGTH - 2 * DECK_INSET,
      DECK_HEIGHT,
      BENCH_DEPTH - 2 * DECK_INSET,
      0,
      deckTop - DECK_HEIGHT / 2,
      0,
    ),
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // A four-sided cylinder turned 45° is a square leg; the two radii
      // taper it toward the foot.
      const leg = new THREE.CylinderGeometry(
        LEG_TOP / Math.SQRT2,
        LEG_FOOT / Math.SQRT2,
        railTop,
        4,
        1,
      )
        .rotateY(Math.PI / 4)
        .translate(sx * legX, railTop / 2, sz * legZ)
        .toNonIndexed();
      // Flat sides: the cylinder's own normals round the corners off.
      leg.computeVertexNormals();
      wood.push(leg);
    }
    // End rail and end stretcher between the two legs of this end.
    wood.push(
      box(RAIL_THICKNESS, RAIL_HEIGHT, 2 * legZ, sx * legX, railTop - RAIL_HEIGHT / 2, 0),
      box(STRETCHER_THICKNESS, STRETCHER_HEIGHT, 2 * legZ, sx * legX, STRETCHER_Y, 0),
    );
  }
  for (const sz of [-1, 1]) {
    wood.push(box(2 * legX, RAIL_HEIGHT, RAIL_THICKNESS, 0, railTop - RAIL_HEIGHT / 2, sz * legZ));
  }
  wood.push(box(2 * legX, STRETCHER_HEIGHT, STRETCHER_THICKNESS, 0, STRETCHER_Y, 0));

  const seat = shade(mergeGeometries(pads, false));
  const frame = shade(mergeGeometries(wood, false));
  for (const g of [...pads, ...wood]) g.dispose();
  return { seat, frame };
}

/**
 * A room's benches as three geometries in world coordinates: seats,
 * frames and the contact shadows under them. Null when there are none.
 */
export function buildBenchesGeometry(
  benches: readonly Bench[],
  floorY: number,
): {
  seat: THREE.BufferGeometry;
  frame: THREE.BufferGeometry;
  shadow: THREE.BufferGeometry;
} | null {
  if (benches.length === 0) return null;
  const one = buildBenchParts();
  const seats: THREE.BufferGeometry[] = [];
  const frames: THREE.BufferGeometry[] = [];
  const shadows: THREE.BufferGeometry[] = [];
  for (const b of benches) {
    const yaw = b.along === "x" ? 0 : Math.PI / 2;
    seats.push(one.seat.clone().rotateY(yaw).translate(b.x, floorY, b.z));
    frames.push(one.frame.clone().rotateY(yaw).translate(b.x, floorY, b.z));
    shadows.push(
      new THREE.PlaneGeometry(BENCH_LENGTH + 2 * SHADOW_SPREAD, BENCH_DEPTH + 2 * SHADOW_SPREAD)
        .rotateX(-Math.PI / 2)
        .rotateY(yaw)
        .translate(b.x, floorY, b.z),
    );
  }
  const merged = {
    seat: mergeGeometries(seats, false),
    frame: mergeGeometries(frames, false),
    shadow: mergeGeometries(shadows, false),
  };
  for (const g of [one.seat, one.frame, ...seats, ...frames, ...shadows]) g.dispose();
  return merged;
}

/** Share of the shadow quad's half length and half depth, from its
 *  edge inward, over which the shadow fades in: the spread, so the
 *  shadow is full under the seat. For the texture that draws it. */
export const SHADOW_FADE_U = SHADOW_SPREAD / (BENCH_LENGTH / 2 + SHADOW_SPREAD);
export const SHADOW_FADE_V = SHADOW_SPREAD / (BENCH_DEPTH / 2 + SHADOW_SPREAD);
