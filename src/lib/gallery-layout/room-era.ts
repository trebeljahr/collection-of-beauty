import { ERAS, type Era, getEra, getPalette } from "@/lib/gallery-eras";
import type { FloorLayout, RoomLayout } from "./types";

/** The era whose palette and title a room takes: its own, or the era
 *  its floor's index names. */
export function eraOfRoom(room: Pick<RoomLayout, "era" | "floorIndex">): Era {
  return room.era ? getEra(room.era) : ERAS[room.floorIndex];
}

/** The colours a room is drawn in: its era's, or those it is given
 *  (`RoomLayout.paletteId`). */
export function paletteOfRoom(
  room: Pick<RoomLayout, "era" | "floorIndex" | "paletteId">,
): Era["palette"] {
  return room.paletteId ? getPalette(room.paletteId) : eraOfRoom(room).palette;
}

/** A floor's line on the entry card: its own when it has one, else its
 *  era's. */
export function floorBlurb(floor: Pick<FloorLayout, "blurb" | "era">): string {
  return floor.blurb ?? floor.era.blurb;
}

/** A floor's name: its own when it has one, else its era's. */
export function floorTitle(floor: Pick<FloorLayout, "title" | "era">): string {
  return floor.title ?? floor.era.title;
}
