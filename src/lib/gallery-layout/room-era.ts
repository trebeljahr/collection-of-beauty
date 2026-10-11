import { ERAS, type Era, getEra } from "@/lib/gallery-eras";
import type { FloorLayout, RoomLayout } from "./types";

/** The era whose palette and title a room takes. In the tower a floor
 *  is an era, so the floor's index names it; in the wings plan a floor
 *  holds four and each room carries its own. */
export function eraOfRoom(room: Pick<RoomLayout, "era" | "floorIndex">): Era {
  return room.era ? getEra(room.era) : ERAS[room.floorIndex];
}

/** A floor's name: its own when it has one, else its era's. */
export function floorTitle(floor: Pick<FloorLayout, "title" | "era">): string {
  return floor.title ?? floor.era.title;
}
