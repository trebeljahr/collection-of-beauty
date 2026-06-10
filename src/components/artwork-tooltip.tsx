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

type Pos = { x: number; y: number; placement: "below" | "above" };

const FADE_OUT_MS = 150;

export function useArtworkTooltip({ title, artist, year, delay = 450 }: Args) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (showTimer.current) window.clearTimeout(showTimer.current);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  const computePos = useCallback((el: HTMLElement): Pos => {
    const r = el.getBoundingClientRect();
    const placement: "below" | "above" =
      r.bottom + 96 > window.innerHeight && r.top > 96 ? "above" : "below";
    // Center the tooltip on the tile but keep its full width inside the
    // viewport. The panel is `max-w-[18rem]` (≈288px) and centered via
    // `translate(-50%, 0)`, so we clamp the centre to half-width + 8px.
    const HALF = 152;
    const x = Math.max(HALF, Math.min(window.innerWidth - HALF, r.left + r.width / 2));
    return {
      x,
      y: placement === "below" ? r.bottom + 8 : r.top - 8,
      placement,
    };
  }, []);

  const onPointerEnter = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") return;
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      const el = e.currentTarget;
      if (showTimer.current) window.clearTimeout(showTimer.current);
      showTimer.current = window.setTimeout(() => {
        setPos(computePos(el));
        setVisible(true);
      }, delay);
    },
    [computePos, delay],
  );

  const onPointerLeave = useCallback(() => {
    if (showTimer.current) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    setVisible(false);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setPos(null), FADE_OUT_MS + 60);
  }, []);

  const handlers = { onPointerEnter, onPointerLeave };

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
  const translateY = pos.placement === "below" ? "0" : "-100%";
  return (
    <div
      role="tooltip"
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        transform: `translate(-50%, ${translateY})`,
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
