"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GALLERY_MUSIC, type MusicTrack, musicObjectKey } from "@/lib/gallery-music";
import { nextFromBag } from "@/lib/shuffle-bag";
import { assetUrl } from "@/lib/utils";

// The museum's background music: one <audio> element, a piece at a
// time, in the order a shuffle bag gives (src/lib/shuffle-bag.ts). The
// rest of the round is kept in localStorage, so a visitor who leaves
// after three pieces hears the other ten before any of the three again.
//
// Nothing downloads before the visitor enters the museum: the first
// piece is picked when `playing` first turns true, which is after the
// Enter click, so play() runs with the click's user activation.
//
// Back goes through the pieces heard this visit (`history`), and Next
// after Back replays them before it draws from the bag again, so the
// round in localStorage only moves on for pieces not heard yet.

const BAG_KEY = "cob-music-bag";
/** Silence between two pieces. */
const GAP_MS = 2500;
/** How long the volume takes to rise when the music starts or resumes. */
const FADE_IN_MS = 1500;
/** Back past this many seconds into a piece starts it again. */
const RESTART_AFTER_S = 3;
/** Pieces Back can return to. */
const HISTORY_LIMIT = 50;

const IDS = GALLERY_MUSIC.map((t) => t.id);
const BY_ID = new Map(GALLERY_MUSIC.map((t) => [t.id, t]));

type StoredBag = { remaining: string[]; last: string | null };

function loadBag(): StoredBag {
  try {
    const raw = JSON.parse(window.localStorage.getItem(BAG_KEY) ?? "null") as Partial<StoredBag>;
    return {
      remaining: Array.isArray(raw?.remaining)
        ? raw.remaining.filter((id): id is string => typeof id === "string")
        : [],
      last: typeof raw?.last === "string" ? raw.last : null,
    };
  } catch {
    return { remaining: [], last: null };
  }
}

function saveBag(bag: StoredBag): void {
  try {
    window.localStorage.setItem(BAG_KEY, JSON.stringify(bag));
  } catch {
    // Private mode or storage off: the round then lasts as long as the page.
  }
}

export type GalleryMusic = {
  /** The piece loaded now, null before the first. */
  track: MusicTrack | null;
  /** Go to the next piece of the round. */
  skip: () => void;
  /** Start the piece again, or go back to the one before it when it
   *  has only just begun. */
  previous: () => void;
};

export function useGalleryMusic({
  playing,
  volume,
  onPlayingChange,
}: {
  /** Entered, sound on. */
  playing: boolean;
  /** 0..1 */
  volume: number;
  /** A play or pause from outside the page: a lock screen or a
   *  keyboard's media key. */
  onPlayingChange?: (playing: boolean) => void;
}): GalleryMusic {
  const [track, setTrack] = useState<MusicTrack | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bagRef = useRef<StoredBag | null>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const gapTimer = useRef<number | null>(null);
  const fadeTimer = useRef<number | null>(null);
  // Ids heard this visit, and the place in them of the piece loaded now.
  const history = useRef<string[]>([]);
  const historyAt = useRef(-1);
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;
  // Errors in a row. A missing file (an encode not yet synced) moves on
  // to the next piece; once every piece has failed, the player stops
  // instead of cycling through 404s.
  const failures = useRef(0);

  const stopFade = useCallback(() => {
    if (fadeTimer.current !== null) window.clearInterval(fadeTimer.current);
    fadeTimer.current = null;
  }, []);

  const start = useCallback(() => {
    const el = audioRef.current;
    if (!el?.src || !playingRef.current) return;
    stopFade();
    el.volume = 0;
    void el.play().then(
      () => {
        const began = performance.now();
        fadeTimer.current = window.setInterval(() => {
          const t = Math.min(1, (performance.now() - began) / FADE_IN_MS);
          el.volume = volumeRef.current * t;
          if (t >= 1) stopFade();
        }, 50);
      },
      // Autoplay refused (no user activation yet): the next change of
      // `playing` or a skip tries again.
      () => {},
    );
  }, [stopFade]);

  const clearGap = useCallback(() => {
    if (gapTimer.current !== null) window.clearTimeout(gapTimer.current);
    gapTimer.current = null;
  }, []);

  const load = useCallback(
    (next: MusicTrack) => {
      const el = audioRef.current;
      if (!el) return;
      el.src = assetUrl(musicObjectKey(next));
      setTrack(next);
      start();
    },
    [start],
  );

  const advance = useCallback(() => {
    if (!audioRef.current) return;
    clearGap();
    // After Back, Next walks forward through what was heard.
    const replay = BY_ID.get(history.current[historyAt.current + 1] ?? "");
    if (replay) {
      historyAt.current++;
      load(replay);
      return;
    }
    const bag = bagRef.current ?? loadBag();
    const step = nextFromBag(IDS, bag.remaining, bag.last);
    const next = step.next ? BY_ID.get(step.next) : undefined;
    if (!next) return;
    bagRef.current = { remaining: step.remaining, last: next.id };
    saveBag(bagRef.current);
    history.current.push(next.id);
    if (history.current.length > HISTORY_LIMIT) history.current.shift();
    historyAt.current = history.current.length - 1;
    load(next);
  }, [clearGap, load]);

  const previous = useCallback(() => {
    const el = audioRef.current;
    if (!el?.src) return;
    clearGap();
    const before = BY_ID.get(history.current[historyAt.current - 1] ?? "");
    if (before && el.currentTime <= RESTART_AFTER_S) {
      historyAt.current--;
      load(before);
      return;
    }
    el.currentTime = 0;
    if (el.paused) start();
  }, [clearGap, load, start]);

  // One element for the life of the museum.
  useEffect(() => {
    const el = new Audio();
    el.preload = "auto";
    audioRef.current = el;
    const onEnded = () => {
      failures.current = 0;
      gapTimer.current = window.setTimeout(advance, GAP_MS);
    };
    const onPlaying = () => {
      failures.current = 0;
    };
    const onError = () => {
      failures.current++;
      if (failures.current < IDS.length) gapTimer.current = window.setTimeout(advance, 1000);
    };
    el.addEventListener("ended", onEnded);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("error", onError);
      if (gapTimer.current !== null) window.clearTimeout(gapTimer.current);
      if (fadeTimer.current !== null) window.clearInterval(fadeTimer.current);
      el.pause();
      el.removeAttribute("src");
      el.load();
      audioRef.current = null;
    };
  }, [advance]);

  // Start, pause and resume with the museum and the Sound switch.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      if (!el.src) advance();
      else if (el.paused && gapTimer.current === null) start();
    } else {
      stopFade();
      el.pause();
    }
  }, [playing, advance, start, stopFade]);

  // The slider takes effect at once, and ends a fade in progress.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    stopFade();
    el.volume = volume;
  }, [volume, stopFade]);

  // The phone's lock screen and a keyboard's media keys show the piece
  // and drive it. Play and pause go through the Sound switch, so the
  // HUD and the settings agree with what is heard.
  useEffect(() => {
    if (!track || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({
      title: track.work,
      artist: `${track.composer} · ${track.performer}`,
      album: "Collection of Beauty — the Museum",
    });
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["nexttrack", advance],
      ["previoustrack", previous],
      ["play", () => onPlayingChangeRef.current?.(true)],
      ["pause", () => onPlayingChangeRef.current?.(false)],
    ];
    for (const [action, handler] of handlers) session.setActionHandler(action, handler);
    return () => {
      for (const [action] of handlers) session.setActionHandler(action, null);
    };
  }, [track, advance, previous]);

  return { track, skip: advance, previous };
}
