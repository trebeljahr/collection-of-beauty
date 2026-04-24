"use client";

import type { FloorLayout } from "@/lib/gallery-layout/types";
import { CELL_SIZE } from "@/lib/gallery-layout/world-coords";
import { type RefObject, useEffect, useRef } from "react";

export type PlayerSample = { x: number; z: number; yaw: number };

type Props = {
  floor: FloorLayout;
  activeRoomIdx: number;
  /** Ref fed by Player.onPositionSample. `null` until the first frame. */
  playerRef: RefObject<PlayerSample | null>;
  /** CSS pixel size of the minimap square. */
  size?: number;
  className?: string;
};

const PAD = 6;

/**
 * Overlay minimap driven entirely by the current FloorLayout — walkable
 * cells, rooms, hallways and staircase footprints are read from the same
 * data the 3D scene uses, so the map stays correct automatically when
 * the dungeon generator shifts the layout. Only the player arrow is
 * redrawn per frame; the floor plan is cached to an offscreen canvas.
 */
export function Minimap({ floor, activeRoomIdx, playerRef, size = 200, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);

  // Re-bake the static floor plan whenever floor or active room changes.
  useEffect(() => {
    const off = document.createElement("canvas");
    const dpr = window.devicePixelRatio || 1;
    off.width = size * dpr;
    off.height = size * dpr;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const { x: gx, z: gz } = floor.gridSize;
    const scale = Math.min((size - PAD * 2) / gx, (size - PAD * 2) / gz);
    const drawW = gx * scale;
    const drawH = gz * scale;
    const ox = (size - drawW) / 2;
    const oy = (size - drawH) / 2;

    // Panel background.
    ctx.fillStyle = "rgba(10, 8, 5, 0.78)";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(255, 240, 210, 0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

    // Walkable cells — rooms get a warmer fill than hallways, the active
    // room glows.
    for (let z = 0; z < gz; z++) {
      for (let x = 0; x < gx; x++) {
        const idx = z * gx + x;
        if (!floor.walkable[idx]) continue;
        const owner = floor.cellOwner[idx];
        if (owner === activeRoomIdx && owner >= 0) {
          ctx.fillStyle = "#d19a3d";
        } else if (owner >= 0) {
          ctx.fillStyle = "#5a4c35";
        } else {
          ctx.fillStyle = "#3a362d";
        }
        ctx.fillRect(ox + x * scale, oy + z * scale, scale + 0.5, scale + 0.5);
      }
    }

    // Staircase footprint — annulus around the spiral column, drawn only
    // for flights leaving this floor so two adjacent floors don't both
    // render the same tower.
    for (const s of floor.stairsOut) {
      const cx = ox + (s.centerX / CELL_SIZE) * scale;
      const cy = oy + (s.centerZ / CELL_SIZE) * scale;
      const rOuter = (s.outerRadius / CELL_SIZE) * scale;
      const rInner = (s.innerRadius / CELL_SIZE) * scale;
      ctx.strokeStyle = "#c9a45a";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
      ctx.fillStyle = "#2a241c";
      ctx.fill();
      ctx.stroke();
    }

    // Floor label in the corner.
    ctx.fillStyle = "rgba(255, 240, 210, 0.7)";
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textBaseline = "top";
    ctx.fillText(`F${floor.index} · ${floor.era.title}`, 6, 5);

    staticRef.current = off;
  }, [floor, activeRoomIdx, size]);

  // Live loop — composites the cached floor plan with the player arrow.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
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

      const p = playerRef.current;
      if (p) {
        const { x: gx, z: gz } = floor.gridSize;
        const scale = Math.min((size - PAD * 2) / gx, (size - PAD * 2) / gz);
        const ox = (size - gx * scale) / 2;
        const oy = (size - gz * scale) / 2;
        const px = ox + (p.x / CELL_SIZE) * scale;
        const py = oy + (p.z / CELL_SIZE) * scale;

        // Clamp inside the panel so the arrow stays visible if the
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
  }, [floor, playerRef, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={className}
      aria-hidden
    />
  );
}
