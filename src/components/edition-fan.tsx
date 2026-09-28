"use client";

import { type CSSProperties, useEffect, useRef } from "react";
import { ResponsiveImage } from "@/components/responsive-image";
import { displayTitle } from "@/lib/artwork-format";
import type { ArtworkListing } from "@/lib/data";
import { clearance, coveringCards, type FanCard, fanStack } from "@/lib/fan-geometry";

type FanWork = Pick<
  ArtworkListing,
  | "id"
  | "title"
  | "englishTitle"
  | "artist"
  | "year"
  | "objectKey"
  | "variantWidths"
  | "width"
  | "height"
  | "dominantColor"
>;

// Card shape limits, width over height. Narrow on purpose: with the full
// range a 1.57 panorama covered half the hand and the fan read as a pile.
// Inside it a card keeps its work's proportions; beyond it the image
// crops to the centre, which still keeps Friedrich's monk (at ~30% of
// the width) and Fan Kuan's travellers in frame.
const ASPECT_MIN = 0.7;
const ASPECT_MAX = 1.1;

// How a card lying on the one being pulled is held up: it grows about its
// bottom edge and its shadow deepens, as if raised toward the viewer.
const LIFT_SCALE = 1.04;
const LIFT: Keyframe = {
  transform: `scale(${LIFT_SCALE})`,
  boxShadow: "0 3px 6px oklch(0.3 0.03 50 / 0.12), 0 24px 40px -14px oklch(0.3 0.03 50 / 0.45)",
};
/** Travel time for one card height. */
const MS_PER_HEIGHT = 340;
const MIN_MS = 200;
/** Room between the pulled card and the lifted cards at the turn. */
const CLEAR_MARGIN = 6;
const EASE_OUT = "cubic-bezier(0.45, 0, 0.55, 1)";
const EASE_BACK = "cubic-bezier(0.3, 0, 0.2, 1)";

function cardAspect(work: FanWork): number {
  if (!work.width || !work.height) return 3 / 4;
  return Math.min(ASPECT_MAX, Math.max(ASPECT_MIN, work.width / work.height));
}

function label(work: FanWork): string {
  const parts = [displayTitle(work)];
  if (work.artist) parts.push(`by ${work.artist}`);
  if (work.year) parts.push(`(${work.year})`);
  return parts.join(" ");
}

/**
 * The works of one edition fanned out like a hand of prints. Pointing at
 * a card pulls it to the top of the hand; pointing away puts it back.
 * On touch a tap pulls a card and a second tap, or a touch elsewhere,
 * puts it back.
 *
 * The resting hand and the pulled card's end state are CSS (see
 * `.edition-fan` in globals.css). The motion between them is scripted,
 * because a real card cannot pass through the cards lying on it: those
 * lift, the card slides out along its own axis until it clears them
 * (`clearance()`), changes places in the stack, and slides back in on
 * top. Putting it back runs the same path the other way.
 *
 * Hover is read from a second, invisible copy of the hand that does not
 * move. On the moving cards the pointer would drop off a card as it slid
 * out, which puts it back, and the hand would flicker.
 */
export function EditionFan({ works }: { works: FanWork[] }) {
  const fanRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fan = fanRef.current;
    if (!fan) return;
    return animateFan(fan);
  }, []);

  if (works.length === 0) return null;
  const middle = (works.length - 1) / 2;
  const stack = fanStack(works.length);
  const place = (work: FanWork, i: number) =>
    ({
      "--fan-i": i,
      "--fan-offset": i - middle,
      "--fan-z": stack[i],
      "--fan-aspect": cardAspect(work),
    }) as CSSProperties;

  return (
    <div
      ref={fanRef}
      className="edition-fan"
      style={{ "--fan-top": works.length + 1 } as CSSProperties}
    >
      <ul className="edition-fan-hand" aria-label="Works in this issue">
        {works.map((work, i) => (
          <li key={work.id} className="edition-fan-slot" style={place(work, i)}>
            <span className="edition-fan-card">
              <span className="relative block h-full w-full overflow-hidden">
                <ResponsiveImage
                  objectKey={work.objectKey}
                  alt={label(work)}
                  sizes="(min-width: 768px) 280px, 180px"
                  variantWidths={work.variantWidths}
                  dominantColor={work.dominantColor}
                  fill
                />
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="edition-fan-hits" aria-hidden="true">
        {works.map((work, i) => (
          <span key={work.id} className="edition-fan-hit" style={place(work, i)} />
        ))}
      </div>
    </div>
  );
}

/** Wires the pull-and-put-back motion onto a rendered fan. Returns cleanup. */
function animateFan(fan: HTMLElement): () => void {
  const slots = [...fan.querySelectorAll<HTMLElement>(".edition-fan-slot")];
  const faces = slots.map((slot) => slot.firstElementChild as HTMLElement);
  const hits = [...fan.querySelectorAll<HTMLElement>(".edition-fan-hit")];
  const n = slots.length;
  const stack = fanStack(n);
  const topZ = n + 1;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const moves: (Animation | null)[] = new Array(n).fill(null);
  // When a card being put back will be under its covering cards again.
  // A card pulled before then would change places with it mid-air.
  const tucksAt: number[] = new Array(n).fill(0);
  let wanted: number | null = null;
  let active: number | null = null;
  let pendingPull = 0;

  function geometry(): FanCard[] {
    const step =
      (Number.parseFloat(getComputedStyle(fan).getPropertyValue("--fan-step")) * Math.PI) / 180;
    const middle = (n - 1) / 2;
    return slots.map((slot, i) => {
      const originY = Number.parseFloat(getComputedStyle(slot).transformOrigin.split(" ")[1]);
      return {
        angle: (i - middle) * step,
        width: slot.offsetWidth,
        height: slot.offsetHeight,
        inset: originY - slot.offsetHeight,
      };
    });
  }

  /** The card's turn, how far it sits out along its axis, and its layer. */
  function pose(i: number) {
    const style = getComputedStyle(slots[i]);
    const m = new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform);
    const angle = Math.atan2(m.b, m.a);
    return {
      angle,
      slide: m.e * Math.sin(angle) - m.f * Math.cos(angle),
      z: Number.parseInt(style.zIndex, 10) || 0,
    };
  }

  function move(i: number, toTop: boolean) {
    const from = pose(i);
    moves[i]?.cancel();
    moves[i] = null;
    tucksAt[i] = 0;
    slots[i].toggleAttribute("data-top", toTop);
    if (reducedMotion.matches) return;
    const to = pose(i).slide;
    const z = toTop ? topZ : stack[i];

    const cards = geometry();
    const covering = coveringCards(cards, stack, i);
    const height = cards[i].height;
    const at = (slide: number, layer: number): Keyframe => ({
      transform: `rotate(${from.angle}rad) translateY(${-slide}px)`,
      zIndex: layer,
    });

    // Already on the right layer, or nothing to pass: straight there.
    if (covering.length === 0 || from.z === z) {
      const duration = Math.max(MIN_MS, (Math.abs(to - from.slide) / height) * MS_PER_HEIGHT);
      moves[i] = slots[i].animate([at(from.slide, z), at(to, z)], { duration, easing: EASE_BACK });
      return;
    }

    const out = Math.max(clearance(cards, i, covering, LIFT_SCALE) + CLEAR_MARGIN, from.slide, to);
    const rise = out - from.slide;
    const fall = out - to;
    const duration = Math.max(MIN_MS, ((rise + fall) / height) * MS_PER_HEIGHT);
    const turn = rise / (rise + fall);
    // Two keyframes at the turn: the layer changes in one step, at the
    // moment the card is clear of everything it passes.
    moves[i] = slots[i].animate(
      [
        { ...at(from.slide, from.z), easing: EASE_OUT },
        { ...at(out, from.z), offset: turn },
        { ...at(out, z), offset: turn, easing: EASE_BACK },
        at(to, z),
      ],
      { duration },
    );

    // The covering cards rise off the card before it moves and settle
    // once it is past them. The first and last keyframes are left
    // implicit, so they take the resting look from the CSS.
    if (toTop) {
      for (const c of covering) {
        faces[c].animate(
          [
            { ...LIFT, offset: turn * 0.3 },
            { ...LIFT, offset: turn },
          ],
          { duration },
        );
      }
    } else {
      const settle = 140;
      const total = duration + settle;
      for (const c of covering) {
        faces[c].animate(
          [
            { ...LIFT, offset: (turn * duration) / total },
            { ...LIFT, offset: duration / total },
          ],
          { duration: total },
        );
      }
      tucksAt[i] = performance.now() + turn * duration;
    }
  }

  const dealing = () =>
    slots.some((slot) =>
      slot.getAnimations().some((a) => a instanceof CSSAnimation && a.playState === "running"),
    );

  function sync() {
    if (wanted === active || dealing()) return;
    window.clearTimeout(pendingPull);
    const previous = active;
    const next = wanted;
    active = next;
    if (previous !== null) move(previous, false);
    if (next === null) return;
    const wait = Math.max(0, ...tucksAt.map((t, i) => (i === next ? 0 : t - performance.now())));
    if (wait === 0) move(next, true);
    else pendingPull = window.setTimeout(() => active === next && move(next, true), wait);
  }

  function want(i: number | null) {
    wanted = i;
    hits.forEach((hit, j) => {
      hit.toggleAttribute("data-top", j === i);
    });
    sync();
  }

  const listeners: [EventTarget, string, (e: Event) => void][] = [];
  const on = (target: EventTarget, type: string, fn: (e: PointerEvent) => void) => {
    const listener = fn as (e: Event) => void;
    target.addEventListener(type, listener);
    listeners.push([target, type, listener]);
  };

  let lastPointer = "";
  hits.forEach((hit, i) => {
    on(hit, "pointerenter", (e) => {
      if (e.pointerType !== "touch") want(i);
    });
    on(hit, "pointerleave", (e) => {
      if (e.pointerType !== "touch" && wanted === i) want(null);
    });
    // Click, not pointerdown: a scroll that starts on a card is no tap.
    on(hit, "click", () => {
      if (lastPointer === "touch") want(wanted === i ? null : i);
    });
  });
  on(document, "pointerdown", (e) => {
    lastPointer = e.pointerType;
    if (e.pointerType === "touch" && !hits.includes(e.target as HTMLElement)) want(null);
  });
  // A card pointed at during the deal is pulled once the deal ends.
  on(fan, "animationend", sync);

  return () => {
    for (const [target, type, listener] of listeners) {
      target.removeEventListener(type, listener);
    }
    window.clearTimeout(pendingPull);
    for (const animation of moves) animation?.cancel();
  };
}
