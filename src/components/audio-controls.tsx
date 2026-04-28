"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioSettings } from "@/lib/audio-settings";

// ─────────────────────────────────────────────────────────────────────────────
// Floating audio settings pill — sits in the corner of the 3D gallery.
// Click the speaker icon to toggle master mute; click the ⚙ to open a
// popover with the two volume sliders.
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  /** Extra classes for positioning from the parent (e.g. "top-4 right-4"). */
  className?: string;
};

export function AudioControls({ className }: Props) {
  const [settings, update] = useAudioSettings();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the popover when the user clicks/taps outside of it.
  // `pointerdown` is the unified mouse + touch event — `mousedown` is
  // synthesised ~300 ms after a touch on iOS, so the popover would
  // linger on tap-outside under that listener.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const toggleMute = useCallback(() => {
    update({ enabled: !settings.enabled });
  }, [settings.enabled, update]);

  return (
    <div ref={rootRef} className={`pointer-events-auto absolute ${className ?? ""}`}>
      <div className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-white/85 backdrop-blur">
        <IconButton
          onClick={toggleMute}
          title={settings.enabled ? "Mute sounds" : "Unmute sounds"}
          aria-label={settings.enabled ? "Mute sounds" : "Unmute sounds"}
        >
          {settings.enabled ? <SpeakerIcon /> : <SpeakerMutedIcon />}
        </IconButton>
        <IconButton
          onClick={() => setOpen((v) => !v)}
          title="Sound settings"
          aria-label="Sound settings"
          aria-expanded={open}
          pressed={open}
        >
          <GearIcon />
        </IconButton>
      </div>

      {open && (
        <dialog
          open
          className="absolute right-0 top-[calc(100%+6px)] m-0 w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-white/10 bg-black/80 p-3 text-xs text-white/85 shadow-xl backdrop-blur"
          aria-label="Sound settings"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-white/50">Sound</span>
            <button
              type="button"
              onClick={toggleMute}
              className="rounded-md border border-white/15 px-2 py-0.5 text-[11px] font-medium transition hover:bg-white/10"
            >
              {settings.enabled ? "On" : "Off"}
            </button>
          </div>

          <VolumeRow
            label="Ambience"
            value={settings.ambienceVolume}
            disabled={!settings.enabled}
            onChange={(v) => update({ ambienceVolume: v })}
          />
          <VolumeRow
            label="Room transitions"
            value={settings.sfxVolume}
            disabled={!settings.enabled}
            onChange={(v) => update({ sfxVolume: v })}
          />
        </dialog>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────────────────

function IconButton({
  children,
  onClick,
  title,
  pressed,
  ...aria
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  pressed?: boolean;
  "aria-label"?: string;
  "aria-expanded"?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      {...aria}
      className={`flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-white/15 ${
        pressed ? "bg-white/15" : ""
      }`}
    >
      {children}
    </button>
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
    <label className={`mb-2 block last:mb-0 ${disabled ? "opacity-50" : ""}`}>
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

// ─────────────────────────────────────────────────────────────────────────────
// Inline SVG icons — avoids pulling lucide-react's older-than-expected 1.8.0
// ─────────────────────────────────────────────────────────────────────────────

function SpeakerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function SpeakerMutedIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
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
