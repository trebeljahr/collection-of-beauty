"use client";

import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Args = {
  title: string;
  artist?: string | null;
  year?: number | null;
  /** ms of hover before fade-in starts */
  delay?: number;
};

type Pos = { x: number; y: number; flipX: boolean; flipY: boolean };

const FADE_OUT_MS = 150;
const OFFSET = 14;
// Conservative width/height estimates so the flip kicks in before the
// real tooltip clips the viewport. The panel's actual max-width is
// 18rem (288px); height varies with content but stays under ~80px.
const EST_W = 288;
const EST_H = 80;

function clampPos(x: number, y: number): Pos {
  const flipX = x + OFFSET + EST_W > window.innerWidth - 4;
  const flipY = y + OFFSET + EST_H > window.innerHeight - 4;
  return { x, y, flipX, flipY };
}

export function useArtworkTooltip({ title, artist, year, delay = 450 }: Args) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const cursor = useRef<{ x: number; y: number } | null>(null);
  const visibleRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (showTimer.current) window.clearTimeout(showTimer.current);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  const onPointerEnter = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") return;
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      cursor.current = { x: e.clientX, y: e.clientY };
      if (showTimer.current) window.clearTimeout(showTimer.current);
      showTimer.current = window.setTimeout(() => {
        const c = cursor.current;
        if (!c) return;
        setPos(clampPos(c.x, c.y));
        visibleRef.current = true;
        setVisible(true);
      }, delay);
    },
    [delay],
  );

  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "touch") return;
    cursor.current = { x: e.clientX, y: e.clientY };
    // Once visible, follow the cursor. Before visible, the timer
    // picks up cursor.current when it fires.
    if (visibleRef.current) setPos(clampPos(e.clientX, e.clientY));
  }, []);

  const onPointerLeave = useCallback(() => {
    if (showTimer.current) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    cursor.current = null;
    visibleRef.current = false;
    setVisible(false);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setPos(null), FADE_OUT_MS + 60);
  }, []);

  const handlers = { onPointerEnter, onPointerMove, onPointerLeave };

  const portal =
    mounted && pos
      ? createPortal(
          <ArtworkTooltipPanel
            title={title}
            artist={artist}
            year={year}
            pos={pos}
            visible={visible}
          />,
          document.body,
        )
      : null;

  return { handlers, portal };
}

function ArtworkTooltipPanel({
  title,
  artist,
  year,
  pos,
  visible,
}: {
  title: string;
  artist?: string | null;
  year?: number | null;
  pos: Pos;
  visible: boolean;
}) {
  const offX = pos.flipX ? -OFFSET : OFFSET;
  const offY = pos.flipY ? -OFFSET : OFFSET;
  const tx = pos.flipX ? "-100%" : "0";
  const ty = pos.flipY ? "-100%" : "0";
  return (
    <div
      role="tooltip"
      style={{
        position: "fixed",
        left: pos.x + offX,
        top: pos.y + offY,
        transform: `translate(${tx}, ${ty})`,
        pointerEvents: "none",
        zIndex: 50,
      }}
      className={[
        "max-w-[18rem] rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs shadow-lg",
        "transition-opacity ease-out",
        visible ? "opacity-100 duration-200" : "opacity-0 duration-150",
      ].join(" ")}
    >
      <div className="line-clamp-2 font-medium leading-snug text-[var(--foreground)]">{title}</div>
      {(artist || year != null) && (
        <div className="mt-1 line-clamp-1 text-[var(--muted-foreground)]">
          {artist}
          {artist && year != null ? " · " : ""}
          {year != null ? year : ""}
        </div>
      )}
    </div>
  );
}
