"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAudioSettings } from "@/lib/audio-settings";

type Props = {
  /** Element to enter into browser fullscreen — pass the gallery host
   *  so the page chrome doesn't get captured along with the museum. */
  fullscreenTarget: React.RefObject<HTMLElement | null>;
  /** Driven by the parent so the player can pause input while the
   *  modal is up; it also drops pointer-lock to free the cursor. */
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Consolidated 3D-experience settings: sound (mute + ambience + room
 * transitions), display (browser fullscreen toggle, kept synced with
 * the actual fullscreenchange state), and an exit link back to the
 * home gallery. Replaces the side-by-side AudioControls and
 * FullscreenButton pills.
 *
 * Renders as a fullscreen overlay anchored to the gallery host
 * (`absolute inset-0`), so it covers whatever fullscreen context the
 * canvas is in — browser fullscreen on the host or just the regular
 * page viewport. The cog trigger sits at the top-right corner of the
 * gallery (the slot the audio pill used to occupy).
 */
export function Gallery3DSettings({ fullscreenTarget, isOpen, onOpenChange }: Props) {
  const [audio, updateAudio] = useAudioSettings();
  const [fs, setFs] = useState(false);

  // Mirror the browser's actual fullscreen state so the toggle stays
  // accurate when the user exits with Escape (or any other route).
  useEffect(() => {
    const sync = () => setFs(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // ESC closes the modal. Other dismiss paths (X, backdrop click, link
  // tap) are wired below.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onOpenChange]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      const target = fullscreenTarget.current ?? document.documentElement;
      target.requestFullscreen?.().catch(() => {});
    }
  }, [fullscreenTarget]);

  const toggleMute = useCallback(() => {
    updateAudio({ enabled: !audio.enabled });
  }, [audio.enabled, updateAudio]);

  return (
    <>
      {/* Cog trigger pill — same visual language as other 3D HUD
          elements (rounded-full, semi-transparent black, blurred). */}
      <div className="pointer-events-auto absolute top-4 right-4">
        <div className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-white/85 backdrop-blur">
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            title="Settings"
            aria-label="Settings"
            aria-expanded={isOpen}
            aria-controls="gallery-3d-settings"
            className="flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-white/15"
          >
            <GearIcon />
          </button>
        </div>
      </div>

      {isOpen && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss is a courtesy mouse shortcut; keyboard already maps Esc to close.
        // biome-ignore lint/a11y/noStaticElementInteractions: full-screen click target gating the overlay
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) onOpenChange(false);
          }}
          className="absolute inset-0 z-30 flex flex-col bg-black/85 text-white backdrop-blur-md animate-nav-fade-in"
        >
          <div className="mx-auto flex w-full max-w-md items-center justify-between px-5 py-4">
            <h2 id="gallery-3d-settings" className="font-serif text-base tracking-wide">
              Settings
            </h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close settings"
              className="-mr-2 inline-flex size-11 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white"
            >
              <CloseIcon />
            </button>
          </div>

          {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — keyboard ESC is handled at the parent. */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation only — purely visual container */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pb-8"
          >
            <Section label="Sound">
              <div className="flex items-center justify-between">
                <span className="text-sm">Sound</span>
                <button
                  type="button"
                  onClick={toggleMute}
                  className="rounded-md border border-white/20 px-3 py-1 text-xs font-medium transition hover:bg-white/10"
                  aria-pressed={audio.enabled}
                >
                  {audio.enabled ? "On" : "Off"}
                </button>
              </div>
              <VolumeRow
                label="Ambience"
                value={audio.ambienceVolume}
                disabled={!audio.enabled}
                onChange={(v) => updateAudio({ ambienceVolume: v })}
              />
              <VolumeRow
                label="Room transitions"
                value={audio.sfxVolume}
                disabled={!audio.enabled}
                onChange={(v) => updateAudio({ sfxVolume: v })}
              />
            </Section>

            <Section label="Display">
              <div className="flex items-center justify-between">
                <span className="text-sm">Fullscreen</span>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-pressed={fs}
                  className="rounded-md border border-white/20 px-3 py-1 text-xs font-medium transition hover:bg-white/10"
                >
                  {fs ? "Exit" : "Enter"}
                </button>
              </div>
            </Section>

            <Link
              href="/"
              className="group mt-2 flex items-center justify-between rounded-lg border border-white/20 px-4 py-3 text-sm transition hover:bg-white/10"
            >
              <span className="font-serif text-base">Exit to gallery</span>
              <span
                aria-hidden="true"
                className="font-serif text-base text-white/60 transition group-hover:translate-x-1 group-hover:text-white"
              >
                →
              </span>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/15 bg-white/5 p-4">
      <h3 className="mb-3 text-[10px] uppercase tracking-wider text-white/50">{label}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function VolumeRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className={`block text-xs ${disabled ? "opacity-50" : ""}`}>
      <div className="mb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="tabular-nums text-white/55">{Math.round(value * 100)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
        className="h-1 w-full accent-white disabled:cursor-not-allowed"
      />
    </label>
  );
}

function GearIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
