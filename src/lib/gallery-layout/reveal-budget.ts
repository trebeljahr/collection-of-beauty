// Which rooms show their works in full, when the texture pool cannot
// hold every room in reach.
//
// A work in full takes a base texture (painting.tsx); a work out of
// reach is a stand-in and takes none. The base pool is a fixed size
// (`BASE_POOL_BYTE_BUDGET`), and it evicts whatever was used longest
// ago. The LOD tick touches every work in full, so once those need more
// than the pool holds, each texture that lands evicts one still on a
// wall: where a visit to the block plan starts, 411 works were in full
// and the pool held 193 textures (13 October 2026). three.js uploads an
// evicted texture again when it is next drawn, outside the pool's count.
//
// Distance alone cannot bound the set. A room comes into reach 14 m off
// and stays until 34 m (room-geometry.tsx), and from the middle of
// either plan every room of the floor is within 34 m: a floor that has
// been walked asks for 345 to 566 MiB. So the rooms in reach are ranked
// and take the pool in that order (`grantReveals`). The rest keep their
// stand-ins.
//
// No three.js here: the tests run it over both floor plans.

import type { ArtworkListing } from "@/lib/data";
import type { RoomLayout } from "./types";
import { FLOOR_SEPARATION } from "./world-coords";

/** Rough GPU cost of a decoded texture: RGBA8 plus a full mip chain
 *  (the 1/3 geometric series, so ×4/3). Good enough to keep a pool
 *  inside a memory budget; exact driver-side padding doesn't matter.
 *
 *  One formula for what a pool accounts (texture-cache.ts), for what a
 *  painting predicts before it asks for a rung (painting.tsx) and for
 *  what a room's works will take (`roomRevealBytes`): a prediction that
 *  drifted from the accounting would admit what the budget keeps out. */
export function estimateTextureBytes(w: number, h: number): number {
  if (!w || !h) return 0;
  return Math.round(w * h * 4 * 1.34);
}

/** What the base pool holds (texture-cache.ts). */
export const BASE_POOL_BYTE_BUDGET = 256 * 1024 * 1024;

/** What the works in full may take of it. The rest is for what is in
 *  the pool beside them: the 256 px previews of works whose base has not
 *  landed, and the textures of a room just given up, which are evicted
 *  first because nothing touches them. */
export const REVEAL_BYTE_BUDGET = Math.round(BASE_POOL_BYTE_BUDGET * 0.85);

type Sized = Pick<ArtworkListing, "variantWidths" | "width" | "height">;

/** The variant a work shows from across its room: 480 px. A modest base
 *  fills rooms quickly; the proximity ladder adds detail as the visitor
 *  walks up. */
export function baseVariantWidth(artwork: Pick<ArtworkListing, "variantWidths">): number {
  const widths = artwork.variantWidths;
  if (!widths?.length) return 480;
  return widths.filter((width) => width <= 480).at(-1) ?? widths[0];
}

/** Bytes of a work's base texture, from the catalogue's pixel size. A
 *  variant's name is a width it does not exceed: a source narrower than
 *  the rung is encoded at its own width. */
export function baseTextureBytes(artwork: Sized): number {
  const label = baseVariantWidth(artwork);
  const { width, height } = artwork;
  if (!width || !height) return estimateTextureBytes(label, label);
  const w = Math.min(label, width);
  return estimateTextureBytes(w, Math.round((w * height) / width));
}

/** Bytes of base texture a room's works take when all are in full. */
export function roomRevealBytes(room: Pick<RoomLayout, "placements">): number {
  let bytes = 0;
  for (const placement of room.placements) bytes += baseTextureBytes(placement.artwork);
  return bytes;
}

/** A mounted room, as the ranking needs it. Every mounted room has one,
 *  works or none: a stairwell hangs nothing and is still where the
 *  visitor stands. */
export type RevealClaim = {
  /** `roomRevealBytes`. */
  cost: number;
  /** Metres on the plan from the visitor to the room: 0 inside it. */
  distance: number;
  /** Metres between the visitor's feet and the room's floor. */
  rise: number;
  /** The rooms its doors lead to. */
  doors: readonly string[];
  /** Set on a stairwell or a hall: the storeys of one stand on one
   *  footprint and share the value (`shaftKey`). */
  shaft: string | null;
  /** It is in reach and may show its works in full. */
  asks: boolean;
  /** Its works are in full now. */
  holds: boolean;
};

/** Within this of a room's walls a visitor counts as standing in it,
 *  as room culling has it for a doorway (room-visibility.ts). */
export const DOORWAY_M = 0.75;
/** A room counts this much further off when no door of it leads to
 *  where the visitor stands: the reach of a room coming into range. So
 *  the rooms seen through the doors of the visitor's own room come
 *  before a room behind a wall, however near that wall is. */
export const DETOUR_M = 14;
/** A room in full counts this much nearer. Two rooms that vie for the
 *  last of the pool then change places 3 m either side of the point
 *  where they are equally far, and a visitor pacing there moves neither. */
export const HOLD_M = 3;
/** A visitor is on a room's storey up to this far over or under its
 *  floor. On a spiral that is both of its storeys through the middle
 *  half of the climb; a jump off a bench (1.3 m) is on one. */
const STOREY_REACH_M = FLOOR_SEPARATION * 0.75;

/**
 * The rooms that may show their works in full: those that ask, nearest
 * first, for as long as their works fit `budget`.
 *
 * Nearest is by `distance + rise`, with two corrections (`DETOUR_M`,
 * `HOLD_M`). A hall is one room through every storey: its storeys are
 * as near as the hall is on the plan, whatever their height, and a door
 * to one of them is a door to the hall. Its largest works hang on walls
 * that cross the storeys, and all of them together cost less than a
 * gallery (40 MiB for the court and a stair hall of the block plan).
 *
 * A room that does not fit is passed over and the next one tried: a
 * small room further off is better in full than not. The first room is
 * granted whatever it costs, since it is the one the visitor stands in.
 * Both plans' rooms are tested to fit the budget alone.
 */
export function grantReveals(
  claims: ReadonlyMap<string, RevealClaim>,
  budget: number = REVEAL_BYTE_BUDGET,
): Set<string> {
  const here = (id: string): boolean => {
    const claim = claims.get(id);
    return claim !== undefined && claim.distance <= DOORWAY_M && claim.rise < STOREY_REACH_M;
  };
  const atHand = (claim: RevealClaim): boolean =>
    claim.distance <= DOORWAY_M || claim.doors.some(here);
  const hallsAtHand = new Set<string>();
  for (const claim of claims.values()) {
    if (claim.shaft !== null && atHand(claim)) hallsAtHand.add(claim.shaft);
  }
  const ranked: Array<{ id: string; cost: number; score: number }> = [];
  for (const [id, claim] of claims) {
    if (!claim.asks) continue;
    const hall = claim.shaft !== null;
    const near = hall ? hallsAtHand.has(claim.shaft as string) : atHand(claim);
    ranked.push({
      id,
      cost: claim.cost,
      score:
        claim.distance +
        (hall ? 0 : claim.rise) +
        (near ? 0 : DETOUR_M) -
        (claim.holds ? HOLD_M : 0),
    });
  }
  ranked.sort((a, b) => a.score - b.score || (a.id < b.id ? -1 : 1));

  const granted = new Set<string>();
  let used = 0;
  for (const { id, cost } of ranked) {
    if (granted.size > 0 && used + cost > budget) continue;
    granted.add(id);
    used += cost;
  }
  return granted;
}
