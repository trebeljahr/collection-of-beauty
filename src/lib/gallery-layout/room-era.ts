import { ERAS, type Era, getEra } from "@/lib/gallery-eras";
import type { FloorLayout, RoomLayout } from "./types";

/** The era whose palette and title a room takes. In the tower a floor
 *  is an era, so the floor's index names it; in the wings plan a floor
 *  holds four and each room carries its own. */
export function eraOfRoom(room: Pick<RoomLayout, "era" | "floorIndex">): Era {
  return room.era ? getEra(room.era) : ERAS[room.floorIndex];
}

/** The colours a room is drawn in: its era's, or those of the era it
 *  borrows them from (`RoomLayout.paletteEra`). */
export function paletteOfRoom(
  room: Pick<RoomLayout, "era" | "floorIndex" | "paletteEra">,
): Era["palette"] {
  return room.paletteEra ? getEra(room.paletteEra).palette : eraOfRoom(room).palette;
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
