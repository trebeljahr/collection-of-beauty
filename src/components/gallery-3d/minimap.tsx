"use client";

import { type RefObject, useEffect, useRef } from "react";
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

    const { x: gx, z: gz } = floor.gridSize;
    const scale = Math.min((size - PAD * 2) / gx, (size - PAD * 2) / gz);
    const drawW = gx * scale;
    const drawH = gz * scale;
    const ox = (size - drawW) / 2;
    const oy = (size - drawH) / 2;

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

    // Per-room minimap fills, brightened from the 3D floor tint so the
    // hue still reads against the dark panel background. The active
    // room overrides this with a saturated gold so the player can
    // locate themselves at a glance.
    const roomFills = floor.rooms.map((r) => boostForMap(r.floorColor));

    // Walkable cells — corridors stay muted; rooms take their hashed
    // accent.
    for (let z = 0; z < gz; z++) {
      for (let x = 0; x < gx; x++) {
        const idx = z * gx + x;
        if (!floor.walkable[idx]) continue;
        const owner = floor.cellOwner[idx];
        if (owner === activeRoomIdx && owner >= 0) {
          ctx.fillStyle = "#d19a3d";
        } else if (owner >= 0) {
          ctx.fillStyle = roomFills[owner] ?? "#5a4c35";
        } else {
          ctx.fillStyle = "#3a362d";
        }
        ctx.fillRect(ox + x * scale, oy + z * scale, scale + 0.5, scale + 0.5);
      }
    }

    // Room walls — thin outline around each room's cell bounds. The
    // active room gets a brighter, thicker stroke so it pops out of
    // the surrounding block.
    for (const [i, room] of floor.rooms.entries()) {
      const rx = ox + room.cellBounds.xMin * scale;
      const ry = oy + room.cellBounds.zMin * scale;
      const rw = (room.cellBounds.xMax - room.cellBounds.xMin + 1) * scale;
      const rh = (room.cellBounds.zMax - room.cellBounds.zMin + 1) * scale;
      const isActive = i === activeRoomIdx;
      ctx.strokeStyle = isActive ? "#fff1c8" : "rgba(255, 240, 210, 0.45)";
      ctx.lineWidth = isActive ? 1.6 : 0.8;
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

    // Per-room glyph — title truncated to fit the room footprint, with
    // anchor / stairwell rooms overridden to a clearer icon. Dropped
    // entirely when even one character won't fit.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [i, room] of floor.rooms.entries()) {
      const rx = ox + room.cellBounds.xMin * scale;
      const ry = oy + room.cellBounds.zMin * scale;
      const rw = (room.cellBounds.xMax - room.cellBounds.xMin + 1) * scale;
      const rh = (room.cellBounds.zMax - room.cellBounds.zMin + 1) * scale;
      const isActive = i === activeRoomIdx;
      const cx = rx + rw / 2;
      const cy = ry + rh / 2;
      const icon = room.isStairwell ? "↑" : room.isAnchor ? "⌂" : null;
      ctx.font = icon
        ? "bold 13px ui-sans-serif, system-ui, sans-serif"
        : "11px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = isActive ? "#1a120b" : "rgba(255, 240, 210, 0.78)";
      const text = icon ?? truncateToFit(ctx, room.title, rw - 4);
      if (text) ctx.fillText(text, cx, cy);
    }

    // Header strip — floor + era so the player always knows what
    // they're looking at, even when no room is active.
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255, 240, 210, 0.72)";
    ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(`Floor ${floor.index + 1} · ${floor.era.title}`, 6, 5);

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
        const { x: gx, z: gz } = floor.gridSize;
        const scale = Math.min((size - PAD * 2) / gx, (size - PAD * 2) / gz);
        const ox = (size - gx * scale) / 2;
        const oy = (size - gz * scale) / 2;
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
  ctx.fillText(truncateToFit(ctx, room.title, innerW), innerX, yTop + 6);

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

/** Convert an authored 3D-floor hex (intentionally dark, ~L 18-25) into
 *  a brighter minimap-fill colour. Same hue, saturation lifted, lightness
 *  pinned around 0.42 so all rooms stay legible against the dark panel
 *  while keeping the era's identity. Returns a CSS hsl() string. */
function boostForMap(hex: string): string {
  const c = hex.startsWith("#") ? hex.slice(1) : hex;
  if (c.length !== 6) return hex;
  const r = Number.parseInt(c.slice(0, 2), 16) / 255;
  const g = Number.parseInt(c.slice(2, 4), 16) / 255;
  const b = Number.parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const sBoosted = Math.min(1, Math.max(s, 0.35) * 1.6);
  return `hsl(${h.toFixed(0)}, ${(sBoosted * 100).toFixed(0)}%, 42%)`;
}
