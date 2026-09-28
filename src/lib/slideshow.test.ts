import { describe, expect, it } from "vitest";
import { getEra } from "@/lib/gallery-eras";
import { parseScopeParams, type Scope } from "@/lib/scope-href";
import {
  chooseSlideWidth,
  containedCssWidth,
  FADE_MS,
  fadeMs,
  failureBackoffMs,
  INITIAL_AVIF_SUPPORT,
  indicesToEnsure,
  initialPlayerState,
  intervalMs,
  isPlayableScope,
  MANUAL_FADE_MS,
  missingPageStarts,
  movedEnoughToWake,
  nextAvifSupport,
  PAN_MAX_SCALE,
  PAN_SHIFT_PCT,
  type PlayableScope,
  type PlayerEvent,
  type PlayerState,
  pageStartFor,
  panKeyframes,
  panPlan,
  parseStartParam,
  parseStoredInfo,
  parseStoredInterval,
  playerReducer,
  playHref,
  REDUCED_FADE_MS,
  resolveStartIndex,
  type SlideSource,
  type SlideViewport,
  scopePageQuery,
  slideshowHeading,
  swipeDirection,
  WAKE_MOVE_PX,
  wrapIndex,
} from "@/lib/slideshow";
import { FULL_SIZE_MIN_WIDTH, VARIANT_WIDTHS } from "@/lib/variant-config.mjs";

const LADDER = [256, 480, 640, 960, 1280, 1920, 2560, 4096];

function work(width: number | null, height: number | null, variantWidths = LADDER): SlideSource {
  return { width, height, variantWidths };
}

function vp(width: number, height: number, dpr = 1): SlideViewport {
  return { width, height, dpr };
}

describe("playHref", () => {
  it("builds the scope query", () => {
    expect(playHref({ kind: "gallery" })).toBe("/play?from=gallery");
    expect(
      playHref({ kind: "gallery", filter: { q: "dürer", era: "renaissance", sort: "year" } }),
    ).toBe("/play?from=gallery&q=d%C3%BCrer&era=renaissance&sort=year");
    expect(playHref({ kind: "era", id: "baroque" })).toBe("/play?from=era:baroque");
  });

  it("appends an encoded start id", () => {
    const href = playHref({ kind: "artist", slug: "claude-monet" }, "a b/c");
    expect(href.endsWith("&start=a%20b%2Fc")).toBe(true);
    expect(new URL(href, "http://x").searchParams.get("start")).toBe("a b/c");
  });

  it("round-trips through parseScopeParams", () => {
    const scopes: PlayableScope[] = [
      { kind: "gallery" },
      { kind: "gallery", filter: { q: "dürer", era: "renaissance", sort: "year" } },
      { kind: "artist", slug: "claude-monet" },
      { kind: "era", id: "baroque" },
      { kind: "color", id: "red" },
    ];
    for (const scope of scopes) {
      const params = new URL(playHref(scope, "x"), "http://x").searchParams;
      expect(parseScopeParams(params)).toEqual(scope);
    }
  });
});

describe("parseStartParam", () => {
  it("drops empty and oversized values", () => {
    expect(parseStartParam(null)).toBeNull();
    expect(parseStartParam(undefined)).toBeNull();
    expect(parseStartParam("")).toBeNull();
    expect(parseStartParam("  ")).toBeNull();
    expect(parseStartParam("x".repeat(201))).toBeNull();
  });

  it("takes the first array item, trimmed", () => {
    expect(parseStartParam(["x", "y"])).toBe("x");
    expect(parseStartParam(" x ")).toBe("x");
    expect(parseStartParam("x".repeat(200))).toBe("x".repeat(200));
  });
});

describe("isPlayableScope", () => {
  it("excludes only the timeline", () => {
    const playable: Scope[] = [
      { kind: "gallery" },
      { kind: "artist", slug: "a" },
      { kind: "era", id: "baroque" },
      { kind: "collection", id: "haeckel-kunstformen-der-natur" },
      { kind: "color", id: "red" },
    ];
    for (const scope of playable) expect(isPlayableScope(scope)).toBe(true);
    expect(isPlayableScope({ kind: "decade", start: 1880 })).toBe(false);
  });
});

describe("scopePageQuery", () => {
  it("maps every kind to the order its page renders with", () => {
    expect(scopePageQuery({ kind: "gallery" })).toEqual({
      q: undefined,
      era: undefined,
      sort: "shuffle",
    });
    expect(
      scopePageQuery({ kind: "gallery", filter: { q: "x", era: "baroque", sort: "artist" } }),
    ).toEqual({ q: "x", era: "baroque", sort: "artist" });
    expect(scopePageQuery({ kind: "artist", slug: "claude-monet" })).toEqual({
      artistSlug: "claude-monet",
      sort: "year",
    });
    expect(scopePageQuery({ kind: "era", id: "baroque" })).toEqual({
      era: "baroque",
      sort: "shuffle",
    });
    expect(scopePageQuery({ kind: "collection", id: "haeckel-kunstformen-der-natur" })).toEqual({
      collection: "haeckel-kunstformen-der-natur",
      sort: "plate",
    });
    expect(scopePageQuery({ kind: "color", id: "red" })).toEqual({ color: "red", sort: "color" });
  });

  it("never sets a seed, so the route's default seed applies", () => {
    expect(scopePageQuery({ kind: "gallery" })).not.toHaveProperty("seed");
  });
});

describe("slideshowHeading", () => {
  const baroque = getEra("baroque").title;

  it("reads the gallery filter back like the artwork page does", () => {
    expect(slideshowHeading({ kind: "gallery" }, "gallery")).toBe("All works");
    expect(slideshowHeading({ kind: "gallery", filter: { q: "dürer" } }, "gallery")).toBe(
      "Results for “dürer”",
    );
    expect(slideshowHeading({ kind: "gallery", filter: { era: "baroque" } }, "gallery")).toBe(
      `All works in ${baroque}`,
    );
    expect(
      slideshowHeading(
        { kind: "gallery", filter: { q: "x", era: "baroque", sort: "year" } },
        "gallery",
      ),
    ).toBe(`Results for “x” in ${baroque}, chronological`);
    expect(slideshowHeading({ kind: "gallery", filter: { sort: "artist" } }, "gallery")).toBe(
      "All works, sorted by artist",
    );
  });

  it("names the other kinds", () => {
    expect(slideshowHeading({ kind: "artist", slug: "claude-monet" }, "Claude Monet")).toBe(
      "Claude Monet",
    );
    expect(
      slideshowHeading({ kind: "collection", id: "haeckel-kunstformen-der-natur" }, "Kunstformen"),
    ).toBe("Kunstformen");
    expect(slideshowHeading({ kind: "era", id: "baroque" }, "ignored")).toBe(baroque);
    expect(slideshowHeading({ kind: "color", id: "red" }, "red")).toBe("Red works");
  });
});

describe("index math", () => {
  it("resolveStartIndex", () => {
    const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(resolveStartIndex(list, "c")).toBe(2);
    expect(resolveStartIndex(list, "zzz")).toBe(0);
    expect(resolveStartIndex(list, null)).toBe(0);
  });

  it("wrapIndex", () => {
    expect(wrapIndex(-1, 10)).toBe(9);
    expect(wrapIndex(10, 10)).toBe(0);
    expect(wrapIndex(23, 10)).toBe(3);
    expect(wrapIndex(5, 0)).toBe(0);
  });

  it("pageStartFor", () => {
    expect(pageStartFor(0)).toBe(0);
    expect(pageStartFor(39)).toBe(0);
    expect(pageStartFor(40)).toBe(40);
    expect(pageStartFor(85)).toBe(80);
  });

  it("indicesToEnsure", () => {
    expect(indicesToEnsure(5, 100)).toEqual([6, 7, 8, 4]);
    expect(indicesToEnsure(99, 100)).toEqual([0, 1, 2, 98]);
    expect(indicesToEnsure(0, 2)).toEqual([1]);
    expect(indicesToEnsure(0, 1)).toEqual([]);
  });

  it("missingPageStarts", () => {
    expect(missingPageStarts([38, 39, 40, 41, 79, 80], (i) => i < 40)).toEqual([40, 80]);
  });
});

describe("containedCssWidth", () => {
  it("fits the work inside the stage", () => {
    expect(containedCssWidth(work(4000, 3000), vp(1920, 1080))).toBe(1440);
    expect(containedCssWidth(work(6000, 3000), vp(1920, 1080))).toBe(1920);
  });

  it("uses a 0.8 aspect when dimensions are missing", () => {
    expect(containedCssWidth(work(null, null), vp(1920, 1000))).toBe(800);
  });
});

describe("chooseSlideWidth", () => {
  const pan = { slow: false, headroom: PAN_MAX_SCALE };
  const still = { slow: false, headroom: 1 };

  it.each([
    ["TV, landscape", work(4000, 3000), vp(1920, 1080), pan, 1920],
    ["TV, portrait", work(3000, 4000), vp(1920, 1080), pan, 960],
    ["TV, 2:1", work(6000, 3000), vp(1920, 1080), pan, 2560],
    ["laptop @2, landscape", work(4000, 3000), vp(1440, 900, 2), pan, 2560],
    ["laptop @2, portrait", work(3000, 4000), vp(1440, 900, 2), pan, 1920],
    ["iPhone @3 capped to 2", work(3000, 4000), vp(390, 844, 3), pan, 960],
    ["iPhone landscape", work(4000, 3000), vp(844, 390, 3), pan, 1280],
    ["TV, slow", work(4000, 3000), vp(1920, 1080), { slow: true, headroom: PAN_MAX_SCALE }, 1280],
    ["TV, low-res holds 900 px", work(900, 1200), vp(1920, 1080), still, 960],
    ["TV, smallest rung >= source", work(500, 700), vp(1920, 1080), still, 640],
    [
      "4K TV never takes the 6144 rung",
      work(12000, 6000, [...LADDER, 6144, 12000]),
      vp(3840, 2160),
      pan,
      4096,
    ],
    ["portrait monitor, 4096 over the pixel cap", work(5000, 10000), vp(2160, 3840, 2), pan, 2560],
  ] as const)("%s", (_name, src, viewport, opts, expected) => {
    expect(chooseSlideWidth(src, viewport, opts)).toBe(expected);
  });

  it("returns null without a ladder", () => {
    expect(chooseSlideWidth(work(4000, 3000, null as never), vp(1920, 1080), pan)).toBeNull();
    expect(chooseSlideWidth(work(4000, 3000, []), vp(1920, 1080), pan)).toBeNull();
    expect(chooseSlideWidth(work(12000, 6000, [6144, 12000]), vp(1920, 1080), pan)).toBeNull();
  });

  it("never exceeds 1280 on a slow connection when a smaller rung exists", () => {
    for (const viewport of [vp(3840, 2160, 2), vp(1920, 1080), vp(390, 844, 3)]) {
      const w = chooseSlideWidth(work(8000, 6000), viewport, { slow: true, headroom: 1.12 });
      expect(w).not.toBeNull();
      expect(w as number).toBeLessThanOrEqual(1280);
    }
  });

  it("only ever picks a ladder rung at or below the full-size threshold", () => {
    const widths = [...LADDER, 6144, 9000, 16384];
    const viewports = [vp(390, 844, 3), vp(1440, 900, 2), vp(3840, 2160, 2), vp(7680, 4320, 1)];
    const sizes: [number, number][] = [
      [16000, 4000],
      [4000, 16000],
      [9000, 9000],
      [1200, 900],
      [300, 300],
    ];
    for (const viewport of viewports) {
      for (const [w, h] of sizes) {
        for (const opts of [pan, still, { slow: true, headroom: 1 }]) {
          const r = chooseSlideWidth(work(w, h, widths), viewport, opts);
          expect(VARIANT_WIDTHS).toContain(r);
          expect(r as number).toBeLessThanOrEqual(FULL_SIZE_MIN_WIDTH);
        }
      }
    }
  });
});

describe("panPlan", () => {
  it("is static under reduced motion", () => {
    expect(panPlan(work(4000, 3000), 0, true)).toBeNull();
  });

  it("is static for works /surprise would not show full bleed", () => {
    expect(panPlan(work(1200, 900), 0, false)).toBeNull();
    expect(panPlan(work(10000, 2000), 0, false)).toBeNull();
    expect(panPlan(work(null, null), 0, false)).toBeNull();
  });

  it("drifts along the long axis", () => {
    expect(panPlan(work(3000, 4000), 0, false)?.axis).toBe("y");
    expect(panPlan(work(4000, 3000), 0, false)?.axis).toBe("x");
    expect(panPlan(work(3000, 3000), 0, false)?.axis).toBe("x");
  });

  it("alternates zoom in and out, flipping drift every two works", () => {
    const p0 = panPlan(work(4000, 3000), 0, false);
    const p1 = panPlan(work(4000, 3000), 1, false);
    const p2 = panPlan(work(4000, 3000), 2, false);
    expect(p0?.from).toEqual({ scale: 1, shift: 0 });
    expect(p0?.to.scale).toBe(PAN_MAX_SCALE);
    expect(p1?.to).toEqual({ scale: 1, shift: 0 });
    expect(Math.sign(p2?.to.shift ?? 0)).toBe(-Math.sign(p0?.to.shift ?? 0));
    expect(Math.sign(p0?.to.shift ?? 0)).not.toBe(0);
  });

  it("never uncovers the stage edge", () => {
    for (let i = 0; i < 8; i++) {
      const plan = panPlan(work(4000, 3000), i, false);
      expect(plan).not.toBeNull();
      for (const frame of [plan?.from, plan?.to]) {
        if (!frame) throw new Error("missing frame");
        expect(Math.abs(frame.shift)).toBeLessThanOrEqual(((frame.scale - 1) / 2) * 100 + 1e-9);
      }
    }
    expect(PAN_SHIFT_PCT).toBeLessThanOrEqual(((PAN_MAX_SCALE - 1) / 2) * 100);
  });

  it("crops at most 15% per axis", () => {
    expect(1 - 1 / PAN_MAX_SCALE).toBeLessThanOrEqual(0.15);
  });
});

describe("panKeyframes", () => {
  it("writes the drift on the plan's axis", () => {
    expect(
      panKeyframes({ axis: "x", from: { scale: 1, shift: 0 }, to: { scale: 1.12, shift: -5 } }),
    ).toEqual([
      { transform: "translate3d(0%, 0%, 0) scale(1)" },
      { transform: "translate3d(-5%, 0%, 0) scale(1.12)" },
    ]);
    expect(
      panKeyframes({ axis: "y", from: { scale: 1.12, shift: 5 }, to: { scale: 1, shift: 0 } }),
    ).toEqual([
      { transform: "translate3d(0%, 5%, 0) scale(1.12)" },
      { transform: "translate3d(0%, 0%, 0) scale(1)" },
    ]);
  });

  it("never prints a negative zero", () => {
    const plan = panPlan(work(4000, 3000), 3, false);
    if (!plan) throw new Error("expected a plan");
    for (const k of panKeyframes(plan)) expect(String(k.transform)).not.toContain("-0%");
  });
});

describe("timing", () => {
  it("fadeMs", () => {
    expect(fadeMs("auto", false)).toBe(FADE_MS);
    expect(fadeMs("manual", false)).toBe(MANUAL_FADE_MS);
    expect(fadeMs("auto", true)).toBe(REDUCED_FADE_MS);
    expect(fadeMs("manual", true)).toBe(MANUAL_FADE_MS);
    expect([FADE_MS, MANUAL_FADE_MS, REDUCED_FADE_MS]).toEqual([1500, 400, 600]);
  });

  it("intervalMs", () => {
    expect(intervalMs(null, false)).toBe(12000);
    expect(intervalMs(null, true)).toBe(20000);
    expect(intervalMs(8, true)).toBe(8000);
  });

  it("parseStoredInterval", () => {
    expect(parseStoredInterval("12")).toBe(12);
    expect(parseStoredInterval("7")).toBeNull();
    expect(parseStoredInterval("abc")).toBeNull();
    expect(parseStoredInterval("12.5")).toBeNull();
    expect(parseStoredInterval(null)).toBeNull();
  });

  it("parseStoredInfo", () => {
    expect(parseStoredInfo("on")).toBe(true);
    expect(parseStoredInfo("off")).toBe(false);
    expect(parseStoredInfo("true")).toBeNull();
    expect(parseStoredInfo("")).toBeNull();
    expect(parseStoredInfo(null)).toBeNull();
  });

  it("movedEnoughToWake", () => {
    const rest = { x: 100, y: 100 };
    expect(movedEnoughToWake(rest, rest)).toBe(false);
    expect(movedEnoughToWake(rest, { x: 104, y: 104 })).toBe(false);
    expect(movedEnoughToWake(rest, { x: 100 + WAKE_MOVE_PX, y: 100 })).toBe(true);
    expect(movedEnoughToWake(rest, { x: 90, y: 110 })).toBe(true);
  });
});

describe("swipeDirection", () => {
  it("reads far, mostly sideways swipes", () => {
    expect(swipeDirection(-80, 10)).toBe("next");
    expect(swipeDirection(80, 10)).toBe("prev");
    expect(swipeDirection(40, 0)).toBeNull();
    expect(swipeDirection(-80, 70)).toBeNull();
  });
});

describe("playerReducer", () => {
  function run(state: PlayerState, ...events: PlayerEvent[]): PlayerState {
    return events.reduce(playerReducer, state);
  }

  /** A player already showing `shown` of `total`, with `shown + 1`
   *  pending and not yet decoded. */
  function showing(shown: number, total = 100): PlayerState {
    return run(initialPlayerState(total, shown), { type: "ready", index: shown });
  }

  it("commits the first slide as soon as it is ready", () => {
    const s = run(initialPlayerState(100, 5), { type: "ready", index: 5 });
    expect(s.shown).toBe(5);
    expect(s.target).toBe(6);
    expect(s.commits).toBe(1);
    expect(s.committedIntent).toBe("auto");
  });

  it("waits for the interval when the next work is ready first", () => {
    const ready = run(showing(5), { type: "ready", index: 6 });
    expect(ready.shown).toBe(5);
    expect(ready.targetReady).toBe(true);
    const due = run(ready, { type: "due" });
    expect(due.shown).toBe(6);
    expect(due.commits).toBe(2);
  });

  it("holds the current work when the interval elapses first", () => {
    const due = run(showing(5), { type: "due" });
    expect(due.shown).toBe(5);
    expect(due.due).toBe(true);
    const ready = run(due, { type: "ready", index: 6 });
    expect(ready.shown).toBe(6);
    expect(ready.due).toBe(false);
  });

  it("does not auto-advance while paused", () => {
    const paused = run(showing(5), { type: "pause" }, { type: "due" }, { type: "ready", index: 6 });
    expect(paused.shown).toBe(5);
    expect(run(paused, { type: "play" }).shown).toBe(6);
    expect(run(paused, { type: "toggle" }).shown).toBe(6);
  });

  it("commits a manual step at once when the next work is decoded", () => {
    const s = run(showing(5), { type: "ready", index: 6 }, { type: "step", delta: 1 });
    expect(s.shown).toBe(6);
    expect(s.committedIntent).toBe("manual");
    expect(s.intent).toBe("auto");
  });

  it("retargets a manual step and commits on ready, even while paused", () => {
    const stepped = run(showing(5), { type: "pause" }, { type: "step", delta: -1 });
    expect(stepped.target).toBe(4);
    expect(stepped.shown).toBe(5);
    const ready = run(stepped, { type: "ready", index: 4 });
    expect(ready.shown).toBe(4);
    expect(ready.committedIntent).toBe("manual");
    expect(ready.target).toBe(5);
  });

  it("adds up rapid presses", () => {
    const s = run(showing(5), { type: "step", delta: 1 }, { type: "step", delta: 1 });
    expect(s.target).toBe(7);
    expect(s.shown).toBe(5);
  });

  it("wraps at both ends", () => {
    expect(run(showing(0, 10), { type: "step", delta: -1 }).target).toBe(9);
    const last = showing(9, 10);
    expect(last.target).toBe(0);
  });

  it("ignores stale ready and failed events", () => {
    const s = showing(5);
    expect(run(s, { type: "ready", index: 9 })).toBe(s);
    expect(run(s, { type: "failed", index: 9 })).toBe(s);
  });

  it("skips a broken work in the direction of travel", () => {
    expect(run(showing(5), { type: "failed", index: 6 }).target).toBe(7);
    const back = run(showing(6), { type: "step", delta: -1 }, { type: "failed", index: 5 });
    expect(back.target).toBe(4);
  });

  it("stalls after three failures in a row, and recovers", () => {
    const stalled = run(
      showing(5),
      { type: "failed", index: 6 },
      { type: "failed", index: 7 },
      { type: "failed", index: 8 },
    );
    expect(stalled.stalled).toBe(true);
    expect(run(stalled, { type: "retry" })).toMatchObject({ stalled: false, failures: 0 });
    expect(run(stalled, { type: "step", delta: 1 })).toMatchObject({ stalled: false, failures: 0 });
  });

  it("stalls a single-work scope on its first failure", () => {
    const s = run(initialPlayerState(1, 0), { type: "failed", index: 0 });
    expect(s.stalled).toBe(true);
  });

  it("re-wraps when the catalogue total changes", () => {
    const s = run(showing(60), { type: "total", total: 50 });
    expect(s.shown).toBe(10);
    expect(s.target).toBe(11);
    expect(s.total).toBe(50);
  });

  it("invalidate re-prepares the waiting work", () => {
    const s = run(showing(5), { type: "ready", index: 6 }, { type: "invalidate" });
    expect(s.targetReady).toBe(false);
    expect(s.shown).toBe(5);
  });

  it("invalidate restarts a prepare still in flight", () => {
    const before = showing(5);
    const after = run(before, { type: "invalidate" });
    expect(after.targetReady).toBe(false);
    expect(after.target).toBe(before.target);
    expect(after.epoch).toBe(before.epoch + 1);
  });

  it("retries the same work when its listing failed to load", () => {
    const s = run(showing(5), { type: "failed", index: 6, retrySame: true });
    expect(s.target).toBe(6);
    expect(s.failures).toBe(1);
    const stalled = run(
      s,
      { type: "failed", index: 6, retrySame: true },
      { type: "failed", index: 6, retrySame: true },
    );
    expect(stalled.stalled).toBe(true);
  });
});

describe("failureBackoffMs", () => {
  it("waits longer after each failure in a row", () => {
    expect(failureBackoffMs(0)).toBe(0);
    expect(failureBackoffMs(1)).toBeGreaterThan(0);
    expect(failureBackoffMs(2)).toBeGreaterThan(failureBackoffMs(1));
    expect(failureBackoffMs(99)).toBe(failureBackoffMs(2));
  });
});

describe("nextAvifSupport", () => {
  it("settles on the first AVIF that decodes", () => {
    const s = nextAvifSupport(INITIAL_AVIF_SUPPORT, "ok");
    expect(s.supported).toBe(true);
    expect(nextAvifSupport(s, "miss")).toBe(s);
  });

  it("gives up on AVIF only after repeated misses", () => {
    const one = nextAvifSupport(INITIAL_AVIF_SUPPORT, "miss");
    expect(one.supported).toBeNull();
    const two = nextAvifSupport(one, "miss");
    expect(two.supported).toBe(false);
    expect(nextAvifSupport(two, "ok")).toBe(two);
  });

  it("a success after one miss keeps AVIF", () => {
    const s = nextAvifSupport(nextAvifSupport(INITIAL_AVIF_SUPPORT, "miss"), "ok");
    expect(s.supported).toBe(true);
  });
});
