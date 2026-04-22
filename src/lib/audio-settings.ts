"use client";

import { useCallback, useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Persistent audio preferences
// ─────────────────────────────────────────────────────────────────────────────
//
// Single source of truth for the 3D gallery's sound settings. Values live in
// localStorage so the next visit remembers whether the user wants sounds on
// and at what volumes. We expose a React hook (`useAudioSettings`) that any
// component can subscribe to — changes in one mounted copy propagate to others
// via an internal pub/sub, and cross-tab changes sync via the browser's
// `storage` event.

export type AudioSettings = {
  /** Master toggle. When off, both ambience and SFX are silent. */
  enabled: boolean;
  /** Background ambience-loop volume, 0..1. */
  ambienceVolume: number;
  /** Room-transition / click SFX volume, 0..1. */
  sfxVolume: number;
};

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enabled: true,
  // Ambience is meant to sit under everything else, not dominate.
  ambienceVolume: 0.35,
  sfxVolume: 0.6,
};

const STORAGE_KEY = "cob-audio-settings";

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function sanitize(raw: Partial<AudioSettings> | null | undefined): AudioSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_AUDIO_SETTINGS;
  return {
    enabled:
      typeof raw.enabled === "boolean"
        ? raw.enabled
        : DEFAULT_AUDIO_SETTINGS.enabled,
    ambienceVolume: clamp01(
      typeof raw.ambienceVolume === "number"
        ? raw.ambienceVolume
        : DEFAULT_AUDIO_SETTINGS.ambienceVolume,
    ),
    sfxVolume: clamp01(
      typeof raw.sfxVolume === "number"
        ? raw.sfxVolume
        : DEFAULT_AUDIO_SETTINGS.sfxVolume,
    ),
  };
}

export function loadAudioSettings(): AudioSettings {
  if (typeof window === "undefined") return DEFAULT_AUDIO_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AUDIO_SETTINGS;
    return sanitize(JSON.parse(raw) as Partial<AudioSettings>);
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

function saveAudioSettings(settings: AudioSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // quota / disabled storage — silently ignore, runtime state still works
  }
}

// ── In-process pub/sub ──────────────────────────────────────────────────────
// Two <AudioControls> mounted in the same tab should agree immediately when
// either is toggled — localStorage's `storage` event doesn't fire within the
// same document. A tiny internal subscriber list solves it.

const listeners = new Set<(s: AudioSettings) => void>();

function emit(settings: AudioSettings): void {
  for (const l of listeners) l(settings);
}

/**
 * Subscribe to every change this hook makes. Returns the current settings
 * (hydrated from localStorage on mount) and an `update` function that
 * patches + persists + broadcasts.
 */
export function useAudioSettings(): [
  AudioSettings,
  (patch: Partial<AudioSettings>) => void,
] {
  // Start with defaults (SSR-safe — no window access during render), then
  // hydrate from localStorage on the client mount.
  const [settings, setSettings] = useState<AudioSettings>(
    DEFAULT_AUDIO_SETTINGS,
  );

  useEffect(() => {
    setSettings(loadAudioSettings());

    const onChange = (next: AudioSettings) => setSettings(next);
    listeners.add(onChange);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setSettings(loadAudioSettings());
    };
    window.addEventListener("storage", onStorage);

    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((patch: Partial<AudioSettings>) => {
    setSettings((prev) => {
      const next = sanitize({ ...prev, ...patch });
      saveAudioSettings(next);
      emit(next);
      return next;
    });
  }, []);

  return [settings, update];
}
