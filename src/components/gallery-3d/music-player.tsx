"use client";

import type { GalleryMusic } from "./use-gallery-music";

type Props = {
  music: GalleryMusic;
  /** The Sound switch: pause turns it off, play on, as in the settings. */
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  className?: string;
};

/**
 * The piece playing now, with back, play/pause and next. On desktop the
 * cursor is held by pointer lock while walking; Esc frees it, as for the
 * settings cog. The keyboard's media keys reach the same controls
 * through the Media Session (use-gallery-music.ts).
 */
export function MusicPlayer({ music, playing, onPlayingChange, className = "" }: Props) {
  const { track } = music;
  return (
    <div
      className={`pointer-events-auto absolute z-20 flex items-center gap-2 rounded-xl bg-black/55 py-1.5 pr-1.5 pl-3 text-white backdrop-blur ${className}`}
    >
      <div className="min-w-0 flex-1 text-xs leading-snug" aria-live="polite">
        {track ? (
          <>
            <div className="truncate font-serif text-sm text-white" title={track.work}>
              {track.work}
            </div>
            <div
              className="truncate text-white/60"
              title={`${track.composer} · ${track.performer}`}
            >
              {track.composer}
            </div>
          </>
        ) : (
          <div className="text-white/60">Music off</div>
        )}
      </div>
      <div className="flex flex-none items-center">
        <PlayerButton label="Previous piece" onClick={music.previous} disabled={!track}>
          <PreviousIcon />
        </PlayerButton>
        <PlayerButton
          label={playing ? "Pause music" : "Play music"}
          onClick={() => onPlayingChange(!playing)}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </PlayerButton>
        <PlayerButton label="Next piece" onClick={music.skip} disabled={!track}>
          <NextIcon />
        </PlayerButton>
      </div>
    </div>
  );
}

function PlayerButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // A mouse click leaves no focus behind: a focused button would
      // take the Space that jumps once the visitor walks on.
      onMouseDown={(e) => e.preventDefault()}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function PreviousIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="4" y="5" width="2.5" height="14" rx="1" />
      <path d="M20 5.5v13a1 1 0 0 1-1.5.86L8 13a1.15 1.15 0 0 1 0-2l10.5-6.36A1 1 0 0 1 20 5.5Z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="17.5" y="5" width="2.5" height="14" rx="1" />
      <path d="M4 5.5v13a1 1 0 0 0 1.5.86L16 13a1.15 1.15 0 0 0 0-2L5.5 4.64A1 1 0 0 0 4 5.5Z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4.5" width="4" height="15" rx="1" />
      <rect x="14" y="4.5" width="4" height="15" rx="1" />
    </svg>
  );
}
