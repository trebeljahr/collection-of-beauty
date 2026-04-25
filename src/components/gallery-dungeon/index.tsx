"use client";

import { AudioControls } from "@/components/audio-controls";
import { useAudioSettings } from "@/lib/audio-settings";
import type { Artwork } from "@/lib/data";
import { layoutMuseum } from "@/lib/gallery-layout/layout-museum";
import type { FloorLayout } from "@/lib/gallery-layout/types";
import { Environment, PointerLockControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { HallwayRenderer } from "./hallway";
import { LodController } from "./lod-controller";
import { Minimap, type PlayerSample } from "./minimap";
import { Player } from "./player";
import { RoomGeometry } from "./room-geometry";
import { StaircaseRenderer } from "./staircase";
import { ZoomModal } from "./zoom-modal";

const AMBIENCE_SRC = "/audio/ambience-loop.mp3";
const ROOM_TRANSITION_SRC = "/audio/room-transition.mp3";

type Props = { artworks: Artwork[] };

/**
 * M3 prototype: all 7 floors stacked on Y, but only one is mounted +
 * walkable at a time. Keys 1..7 teleport the player between floors.
 * Staircases and cross-floor walking land in M4.
 */
export function GalleryDungeon({ artworks }: Props) {
  const layout = useMemo(() => layoutMuseum(artworks), [artworks]);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentFloorIdx, setCurrentFloorIdx] = useState(layout.entry.floorIndex);
  const [activeRoomIdx, setActiveRoomIdx] = useState<number>(-1);
  const [zoomed, setZoomed] = useState<Artwork | null>(null);

  // ── Audio ────────────────────────────────────────────────────────
  // Ambience: long looping <audio> streamed via HTMLAudioElement.
  // SFX: tiny preloaded Audio that fires on every floor change.
  // Both are gated on the user's Start-click (browsers block autoplay).
  // AudioControls writes to the same localStorage-backed hook, so we
  // only need the read half here.
  const [audio] = useAudioSettings();
  const ambienceRef = useRef<HTMLAudioElement | null>(null);
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (sfxRef.current) return;
    const a = new Audio(ROOM_TRANSITION_SRC);
    a.preload = "auto";
    sfxRef.current = a;
  }, []);

  const currentFloor = layout.floors[currentFloorIdx];
  const activeRoom = activeRoomIdx >= 0 ? currentFloor.rooms[activeRoomIdx] : undefined;

  // Spawn point driver. Default: entry on floor 0. Teleport keys
  // overwrite this to the anchor of the target floor. Stair-driven
  // floor changes set it to the *current* XZ so the player continues
  // walking where they were, with Y matched to the new floor.
  const spawnForFloor = useRef<[number, number, number]>(layout.entry.worldPosition);
  // Player preserves its last camera XZ (and yaw) so we can read it
  // when stairs trigger a floor swap and so the minimap can follow the
  // camera per-frame without round-tripping through React state.
  const lastCameraRef = useRef<PlayerSample | null>(null);

  const teleportToFloor = useCallback(
    (idx: number) => {
      const f = layout.floors[idx];
      const anchor = f.rooms.find((r) => r.isAnchor) ?? f.rooms[0];
      if (!anchor) return;
      spawnForFloor.current = [
        (anchor.worldRect.xMin + anchor.worldRect.xMax) / 2,
        anchor.worldRect.y,
        (anchor.worldRect.zMin + anchor.worldRect.zMax) / 2,
      ];
      setCurrentFloorIdx(idx);
      setActiveRoomIdx(-1);
    },
    [layout],
  );

  // Ambience follows user preferences + entry gate. play() may reject if
  // Chrome hasn't yet decided the gesture is "valid enough" — harmless,
  // the next state change (setting toggle, teleport, stair swap) retries
  // this effect and succeeds.
  useEffect(() => {
    const el = ambienceRef.current;
    if (!el) return;
    el.volume = audio.ambienceVolume;
    if (hasStarted && audio.enabled) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [audio.enabled, audio.ambienceVolume, hasStarted]);

  // One-shot SFX on floor change — gives a "room transition" feel as
  // the player walks up stairs or teleports.
  const playTransition = useCallback(() => {
    if (!audio.enabled) return;
    const a = sfxRef.current;
    if (!a) return;
    a.currentTime = 0;
    a.volume = audio.sfxVolume;
    void a.play().catch(() => {});
  }, [audio.enabled, audio.sfxVolume]);

  const handleStairFloorChange = useCallback(
    (newIdx: number) => {
      if (newIdx === currentFloorIdx) return;
      // Stair-driven swap: do NOT touch spawnForFloor — that would
      // trigger Player's spawn effect and teleport the camera. Just
      // change which floor's layout informs collision/rendering. The
      // staircase geometry is the same on both floors so the player
      // keeps riding it smoothly.
      setCurrentFloorIdx(newIdx);
      setActiveRoomIdx(-1);
      playTransition();
    },
    [currentFloorIdx, playTransition],
  );

  // Debug 1..7 teleport keys.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code.startsWith("Digit")) {
        const digit = Number.parseInt(e.code.slice(5), 10);
        const idx = digit - 1;
        if (Number.isInteger(idx) && idx >= 0 && idx < layout.floors.length) {
          teleportToFloor(idx);
          playTransition();
        }
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [layout, teleportToFloor, playTransition]);

  return (
    <div className="relative w-full h-screen bg-black">
      <Canvas
        camera={{ fov: 75, near: 0.1, far: 500 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          scene.fog = new THREE.Fog("#0a0805", 20, 80);
        }}
      >
        <color attach="background" args={["#0a0805"]} />
        <ambientLight intensity={0.35} />
        <hemisphereLight args={["#fff3d0", "#1a120b", 0.45]} position={[0, 20, 0]} />
        {/* Environment map for metallic surfaces (plaque chrome rims,
            painting frame highlights) — without something to reflect,
            metalness=1 materials render as flat dark grey. `apartment`
            is a small indoor HDRI; environmentIntensity keeps it dim
            so the gallery stays atmospheric. background:false leaves
            the existing fog/black backdrop alone. */}
        <Environment preset="apartment" background={false} environmentIntensity={0.4} />

        <FloorScene floor={currentFloor} activeRoomIdx={activeRoomIdx} />
        {/* Adjacent floors: mount their stairwell rooms only so the
            stair leading up/down has visual continuity into the next
            floor (no painted void overhead or underfoot). Cheap —
            stairwells hold no paintings. */}
        {currentFloorIdx > 0 && (
          <FloorScene
            floor={layout.floors[currentFloorIdx - 1]}
            activeRoomIdx={-1}
            showOnly="stairwell"
          />
        )}
        {currentFloorIdx < layout.floors.length - 1 && (
          <FloorScene
            floor={layout.floors[currentFloorIdx + 1]}
            activeRoomIdx={-1}
            showOnly="stairwell"
          />
        )}

        <LodController />

        <Player
          enabled={hasStarted && !zoomed}
          floor={currentFloor}
          spawnAt={spawnForFloor.current}
          onRoomChange={setActiveRoomIdx}
          onFloorChange={handleStairFloorChange}
          onPositionSample={(x, z, yaw) => {
            lastCameraRef.current = { x, z, yaw };
          }}
          onZoomRequest={setZoomed}
        />
        {hasStarted && !zoomed && <PointerLockControls />}
      </Canvas>

      {!hasStarted && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: pointer-lock entry requires a real mouse click; keyboard activation can't grant pointer-lock
        <div
          onClick={() => setHasStarted(true)}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-neutral-100 cursor-pointer"
        >
          <h1 className="text-3xl font-semibold mb-2">{currentFloor.era.title}</h1>
          <p className="text-neutral-400 text-sm mb-8 max-w-md text-center">
            {currentFloor.era.blurb}
          </p>
          <p className="text-neutral-500 text-xs">
            Click to enter · WASD / arrows to walk · Shift to run · Space to jump
          </p>
          <p className="text-neutral-600 text-xs mt-2">1–7 teleports between floors</p>
        </div>
      )}

      {hasStarted && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 text-neutral-100 px-4 py-2 rounded text-sm pointer-events-none">
          <div className="text-xs text-neutral-500 font-mono">
            FLOOR {currentFloorIdx} · {currentFloor.era.title}
          </div>
          {activeRoom && (
            <>
              <div className="font-semibold">{activeRoom.title}</div>
              <div className="text-xs text-neutral-400">{activeRoom.description}</div>
            </>
          )}
        </div>
      )}

      {hasStarted && !zoomed && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-neutral-300 px-3 py-1 rounded text-xs pointer-events-none">
          1 Gothic · 2 Renaissance · 3 Baroque · 4 Enlightenment · 5 Romantic · 6 Fin-de-siècle · 7
          Modern · click painting to zoom
        </div>
      )}

      {/* Crosshair — small dot in the centre of the screen so the
          player knows exactly where they're aiming. Always visible
          while walking; hidden during the start overlay and zoom
          modal so it doesn't compete with either. */}
      {hasStarted && !zoomed && (
        <div
          className="absolute inset-0 pointer-events-none flex items-center justify-center"
          aria-hidden
        >
          <div className="w-1.5 h-1.5 rounded-full bg-white/70 shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
        </div>
      )}

      {/* Audio controls — shown after the start gate (mount on the
          user's first click, which is also the autoplay gate). */}
      {hasStarted && !zoomed && <AudioControls className="top-4 right-4" />}

      {/* Minimap — bottom-right. Derived entirely from the current
          FloorLayout, so it updates automatically if the dungeon
          generator is retuned. */}
      {hasStarted && !zoomed && (
        <div className="absolute bottom-4 right-4 pointer-events-none">
          <Minimap floor={currentFloor} activeRoomIdx={activeRoomIdx} playerRef={lastCameraRef} />
        </div>
      )}

      {zoomed && <ZoomModal artwork={zoomed} onClose={() => setZoomed(null)} />}

      {/* Ambience player. Streams, loops, hidden from layout but kept
          in the DOM for the lifetime of the gallery so settings
          changes don't interrupt the loop. */}
      {/* biome-ignore lint/a11y/useMediaCaption: ambient music has no spoken content */}
      {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: hidden utility audio with no controls — focus path doesn't apply */}
      <audio
        ref={ambienceRef}
        src={AMBIENCE_SRC}
        loop
        preload="auto"
        aria-hidden="true"
        className="hidden"
      />
    </div>
  );
}

function FloorScene({
  floor,
  activeRoomIdx,
  showOnly,
}: {
  floor: FloorLayout;
  activeRoomIdx: number;
  /** "stairwell" keeps only the stairwell room and its stair geometry —
   *  used for adjacent floors so the stair has visual continuity
   *  without mounting every room + painting. */
  showOnly?: "stairwell";
}) {
  const rooms = showOnly === "stairwell" ? floor.rooms.filter((r) => r.isStairwell) : floor.rooms;
  const hallways = showOnly === "stairwell" ? [] : floor.hallways;
  // Stair geometry only mounts once per Staircase (from the lower
  // floor's stairsOut). Skipping stairsIn here avoids double-rendering
  // the same stair on the upper floor — the geometry is the same
  // object either way.
  const stairs = floor.stairsOut;
  return (
    <group>
      {rooms.map((room, i) => (
        <RoomGeometry key={room.id} room={room} isActive={i === activeRoomIdx} />
      ))}
      {hallways.map((hw) => (
        <HallwayRenderer key={hw.id} hallway={hw} floor={floor} />
      ))}
      {stairs.map((s) => (
        <StaircaseRenderer key={s.id} staircase={s} />
      ))}
    </group>
  );
}
