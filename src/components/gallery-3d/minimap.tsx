"use client";

import { type RefObject, useEffect, useRef } from "react";
import { benchRect, dividerRect, type Rect } from "@/lib/gallery-layout/fittings";
import { floorTitle, paletteOfRoom } from "@/lib/gallery-layout/room-era";
import type { FloorLayout, RoomLayout } from "@/lib/gallery-layout/types";
import { CELL_SIZE } from "@/lib/gallery-layout/world-coords";

export type PlayerSample = { x: number; z: number; yaw: number };

type Props = {
  floor: FloorLayout;
  activeRoomIdx: number;
  /** Ref fed by Player.onPositionSample. `null` until the first frame. */
  playerRef: RefObject<PlayerSample | null>;
  /** CSS pixel side of the map area (the footer adds extra height). */
  size?: number;
  className?: string;
  /** When false, suppress the player-arrow draw — used by the
   *  expanded big-map view when the user is previewing a floor that
   *  isn't the one they're physically standing on. Default: true. */
  showPlayer?: boolean;
};

const PAD = 6;
const FOOTER_H = 60;

/** Cell-grid → canvas-pixel mapping for a map of side `size`. Exported
 *  so callers can lay DOM hit targets over the baked canvas (the big
 *  map's clickable rooms) using exactly the geometry the plan was drawn
 *  with — the alternative, hit-testing inside the canvas, would need a
 *  parallel copy of this maths and give up focus/keyboard for free. */
export function mapGeometry(floor: FloorLayout, size: number) {
  const { x: gx, z: gz } = floor.gridSize;
  const scale = Math.min((size - PAD * 2) / gx, (size - PAD * 2) / gz);
  return { gx, gz, scale, ox: (size - gx * scale) / 2, oy: (size - gz * scale) / 2 };
}

/** Pixel rect of a room's cell bounds within a map of side `size`. */
export function roomRect(floor: FloorLayout, room: RoomLayout, size: number) {
  const { scale, ox, oy } = mapGeometry(floor, size);
  return {
    left: ox + room.cellBounds.xMin * scale,
    top: oy + room.cellBounds.zMin * scale,
    width: (room.cellBounds.xMax - room.cellBounds.xMin + 1) * scale,
    height: (room.cellBounds.zMax - room.cellBounds.zMin + 1) * scale,
  };
}

/**
 * Overlay minimap driven entirely by the current FloorLayout — walkable
 * cells, room outlines, door positions and staircase footprints are
 * read from the same data the 3D scene uses, so the map stays correct
 * automatically when the museum layout is regenerated. The static
 * plan is baked to an offscreen canvas; only the player arrow is
 * redrawn each frame.
 */
export function Minimap({
  floor,
  activeRoomIdx,
  playerRef,
  size = 220,
  className,
  showPlayer = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const totalH = size + FOOTER_H;

  // Re-bake the static floor plan whenever floor or active room changes.
  useEffect(() => {
    const off = document.createElement("canvas");
    const dpr = window.devicePixelRatio || 1;
    off.width = size * dpr;
    off.height = totalH * dpr;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const { gx, gz, scale, ox, oy } = mapGeometry(floor, size);

    // Panel background + outer frame.
    ctx.fillStyle = "rgba(10, 8, 5, 0.82)";
    ctx.fillRect(0, 0, size, totalH);
    ctx.strokeStyle = "rgba(255, 240, 210, 0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, totalH - 1);
    // Divider above the footer.
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.lineTo(size, size);
    ctx.stroke();

    // Each room in the colour of its walls, so the map reads as the
    // building does: crimson where the walls are crimson. The room the
    // visitor stands in keeps its colour and gets a rim (below).
    const roomFills = floor.rooms.map(mapFillOf);
    const roomInks = roomFills.map(inkOn);

    // Walkable cells — corridors stay muted.
    for (let z = 0; z < gz; z++) {
      for (let x = 0; x < gx; x++) {
        const idx = z * gx + x;
        if (!floor.walkable[idx]) continue;
        const owner = floor.cellOwner[idx];
        if (owner >= 0) {
          ctx.fillStyle = roomFills[owner] ?? "#5a4c35";
        } else {
          ctx.fillStyle = "#3a362d";
        }
        ctx.fillRect(ox + x * scale, oy + z * scale, scale + 0.5, scale + 0.5);
      }
    }

    // Room walls — thin dark outline around each room's cell bounds,
    // which separates two rooms of one colour as a wall does.
    ctx.strokeStyle = "rgba(10, 8, 5, 0.9)";
    ctx.lineWidth = 1;
    for (const room of floor.rooms) {
      const rx = ox + room.cellBounds.xMin * scale;
      const ry = oy + room.cellBounds.zMin * scale;
      const rw = (room.cellBounds.xMax - room.cellBounds.xMin + 1) * scale;
      const rh = (room.cellBounds.zMax - room.cellBounds.zMin + 1) * scale;
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
    }

    // Doors — drawn after walls so they punch through the outline as
    // a brighter notch. Each door records its world XZ centre, the
    // wall it sits on and its width; that maps cleanly to a short
    // segment in cell-grid space.
    ctx.lineCap = "round";
    for (const room of floor.rooms) {
      for (const door of room.doors) {
        const dxp = ox + (door.worldX / CELL_SIZE) * scale;
        const dyp = oy + (door.worldZ / CELL_SIZE) * scale;
        const half = (door.width / 2 / CELL_SIZE) * scale;
        const horizontal = door.side === "north" || door.side === "south";
        ctx.strokeStyle = "#ffd98a";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(dxp - half, dyp);
          ctx.lineTo(dxp + half, dyp);
        } else {
          ctx.moveTo(dxp, dyp - half);
          ctx.lineTo(dxp, dyp + half);
        }
        ctx.stroke();
      }
    }
    ctx.lineCap = "butt";

    // Dividers and benches, to scale. A divider is a wall: drawn at its
    // real 0.4 m in the ink that reads on the room's colour. A bench is
    // furniture and stays faint.
    for (const [i, room] of floor.rooms.entries()) {
      const ink = roomInks[i];
      const toMap = (r: Rect) =>
        [
          ox + (r.xMin / CELL_SIZE) * scale,
          oy + (r.zMin / CELL_SIZE) * scale,
          Math.max(1, ((r.xMax - r.xMin) / CELL_SIZE) * scale),
          Math.max(1, ((r.zMax - r.zMin) / CELL_SIZE) * scale),
        ] as const;
      ctx.fillStyle = ink.strong;
      for (const divider of room.dividers) ctx.fillRect(...toMap(dividerRect(divider)));
      ctx.fillStyle = ink.faint;
      for (const bench of room.benches) ctx.fillRect(...toMap(benchRect(bench)));
    }

    // The room the visitor is in: a rim inside its walls, so its own
    // colour still shows.
    const active = floor.rooms[activeRoomIdx];
    if (active) {
      const rx = ox + active.cellBounds.xMin * scale;
      const ry = oy + active.cellBounds.zMin * scale;
      const rw = (active.cellBounds.xMax - active.cellBounds.xMin + 1) * scale;
      const rh = (active.cellBounds.zMax - active.cellBounds.zMin + 1) * scale;
      const rim = Math.max(2, Math.min(4, scale * 0.35));
      ctx.lineJoin = "miter";
      ctx.strokeStyle = "rgba(10, 8, 5, 0.85)";
      ctx.lineWidth = rim + 2;
      ctx.strokeRect(rx + (rim + 2) / 2, ry + (rim + 2) / 2, rw - rim - 2, rh - rim - 2);
      ctx.strokeStyle = "#f2b84b";
      ctx.lineWidth = rim;
      ctx.strokeRect(rx + rim / 2 + 1, ry + rim / 2 + 1, rw - rim - 2, rh - rim - 2);
    }

    // Spiral staircase footprint — annulus (treads) around an open
    // central well. Drawn only for flights leaving this floor so two
    // adjacent floors don't both render the same shaft.
    for (const s of floor.stairsOut) {
      const cx = ox + (s.centerX / CELL_SIZE) * scale;
      const cy = oy + (s.centerZ / CELL_SIZE) * scale;
      const rOuter = (s.outerRadius / CELL_SIZE) * scale;
      const rInner = (s.innerRadius / CELL_SIZE) * scale;
      // Annulus fill (the treads).
      ctx.fillStyle = "#2a241c";
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
      ctx.arc(cx, cy, rInner, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
      // Outer + inner outlines.
      ctx.strokeStyle = "#c9a45a";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(201, 164, 90, 0.5)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
      ctx.stroke();
      // Up-arrow tick at the entry angle (atan2(dz, dx) = entryAngle).
      const arrowR = (rOuter + rInner) / 2;
      const ax = cx + arrowR * Math.cos(s.entryAngle);
      const ay = cy + arrowR * Math.sin(s.entryAngle);
      ctx.fillStyle = "#fff1c8";
      ctx.font = "bold 10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("↑", ax, ay);
    }

    // Per-room glyph — the room's number, or the stair arrow. Rooms are
    // numbered rather than named because an era's rooms nearly all
    // carry the same movement, so every cell used to truncate to the
    // same unreadable stub ("Natural history il…" eight times over).
    // The number keys the legend beside the big map and the footer
    // below, both of which have the space to spell the title out.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [i, room] of floor.rooms.entries()) {
      const rx = ox + room.cellBounds.xMin * scale;
      const ry = oy + room.cellBounds.zMin * scale;
      const rw = (room.cellBounds.xMax - room.cellBounds.xMin + 1) * scale;
      const rh = (room.cellBounds.zMax - room.cellBounds.zMin + 1) * scale;
      const cx = rx + rw / 2;
      const cy = ry + rh / 2;
      // A grand stair hall says what it is on this floor: the stair
      // leaves it, arrives on it, or only its open well passes through.
      const stairGlyph = { up: "↑", down: "↓", both: "↕", void: "○" }[room.stairGlyph ?? "up"];
      const glyph = room.isStairwell ? stairGlyph : room.roomNumber ? String(room.roomNumber) : "";
      if (!glyph) continue;
      // Scale the numeral with the map so it stays readable on the
      // 220 px minimap and doesn't look lost on the 600 px big map.
      const px = Math.max(10, Math.min(20, Math.round(scale * 1.5)));
      ctx.font = `${room.isStairwell ? "bold " : "600 "}${px}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle = roomInks[i].strong;
      ctx.fillText(glyph, cx, cy);
    }

    // Header strip — floor + era so the player always knows what
    // they're looking at, even when no room is active.
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255, 240, 210, 0.72)";
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(`Floor ${floor.index + 1} · ${floorTitle(floor)}`, 6, 5);

    // Footer — active room title + description, or a hint when the
    // player isn't standing in any one room.
    drawFooter(ctx, size, FOOTER_H, size, floor.rooms[activeRoomIdx]);

    staticRef.current = off;
  }, [floor, activeRoomIdx, size, totalH]);

  // Live loop — composites the cached floor plan with the player arrow.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = totalH * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      const off = staticRef.current;
      if (off) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(off, 0, 0);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const p = showPlayer ? playerRef.current : null;
      if (p) {
        const { scale, ox, oy } = mapGeometry(floor, size);
        const px = ox + (p.x / CELL_SIZE) * scale;
        const py = oy + (p.z / CELL_SIZE) * scale;

        // Clamp inside the map area so the arrow stays visible if the
        // player ever ends up just outside the grid.
        const cx = Math.max(PAD, Math.min(size - PAD, px));
        const cy = Math.max(PAD, Math.min(size - PAD, py));

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(p.yaw);
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(-4, 4);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-4, -4);
        ctx.closePath();
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "rgba(0,0,0,0.9)";
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [floor, playerRef, size, totalH, showPlayer]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={totalH}
      style={{ width: size, height: totalH }}
      className={className}
      aria-hidden
    />
  );
}

/** Trim `text` (with a trailing ellipsis when needed) so it fits within
 *  `maxWidth` at the canvas's currently configured font. Returns an
 *  empty string when nothing useful fits. */
function truncateToFit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  for (let n = text.length - 1; n > 0; n--) {
    const t = `${text.slice(0, n).trimEnd()}…`;
    if (ctx.measureText(t).width <= maxWidth) return t;
  }
  return "";
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  width: number,
  _height: number,
  yTop: number,
  room: RoomLayout | undefined,
) {
  const innerX = 8;
  const innerW = width - innerX * 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  if (!room) {
    ctx.fillStyle = "rgba(255, 240, 210, 0.45)";
    ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("— in corridor —", innerX, yTop + 8);
    return;
  }
  ctx.fillStyle = "#fff1c8";
  ctx.font = "bold 14px ui-sans-serif, system-ui, sans-serif";
  const heading = room.roomNumber ? `${room.roomNumber} · ${room.title}` : room.title;
  ctx.fillText(truncateToFit(ctx, heading, innerW), innerX, yTop + 6);

  ctx.fillStyle = "rgba(255, 240, 210, 0.65)";
  ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
  // Two short lines of description; word-wrap inside innerW.
  const lines = wrapLines(ctx, room.description, innerW, 2);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], innerX, yTop + 24 + i * 14);
  }
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = w;
    if (lines.length === maxLines - 1) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  // If we ran out of room while words remained, ellipsize the last line.
  const used = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (used < words.length && lines.length > 0) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = truncateToFit(ctx, `${last}…`, maxWidth) || last;
  }
  return lines;
}

/** A room's colour on the map: the colour of its walls. */
export function mapFillOf(room: Pick<RoomLayout, "era" | "floorIndex" | "paletteEra">): string {
  return paletteOfRoom(room).wallColor;
}

/** Ink that reads on `hex`: dark on a pale wall, light on a deep one.
 *  Split at a relative luminance of 0.3, where cream (#efeadd, 0.82)
 *  and stone (#e0dcd0) take dark ink and ochre (#c2a15e, 0.37) does
 *  too, while crimson, midnight blue and charcoal take light ink. */
export function inkOn(hex: string): { strong: string; faint: string } {
  const c = hex.startsWith("#") ? hex.slice(1) : hex;
  const lin = (i: number) => {
    const v = Number.parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = c.length === 6 ? 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4) : 0;
  return lum > 0.3
    ? { strong: "rgba(26, 18, 11, 0.85)", faint: "rgba(26, 18, 11, 0.3)" }
    : { strong: "rgba(255, 244, 222, 0.9)", faint: "rgba(255, 244, 222, 0.28)" };
}
