"use client";

import { PointerLockControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useSetIs3DActive } from "@/components/gallery-3d-state";
import { useJoystick } from "@/hooks/use-joystick";
import { useNeedsRotate, useTouchDevice } from "@/hooks/use-touch-device";
import { useAudioSettings } from "@/lib/audio-settings";
import type { Artwork } from "@/lib/data";
import { layoutMuseum } from "@/lib/gallery-layout/layout-museum";
import type { FloorLayout, Staircase } from "@/lib/gallery-layout/types";

import { HallwayRenderer } from "./hallway";
import { LandscapePrompt } from "./landscape-prompt";
import { LodController } from "./lod-controller";
import { Minimap, type PlayerSample } from "./minimap";
import { Player } from "./player";
import { RoomEnvironment } from "./room-env-map";
import { RoomGeometry } from "./room-geometry";
import { Gallery3DSettings } from "./settings-modal";
import { StaircaseRenderer } from "./staircase";
import { StairwellAccents } from "./stairwell-rail";
import { ZoomModal } from "./zoom-modal";

const AMBIENCE_SRC = "/audio/ambience-loop.mp3";
const ROOM_TRANSITION_SRC = "/audio/room-transition.mp3";

type Props = { artworks: Artwork[] };

/**
 * Multi-floor 3D museum. All era floors are stacked on Y; only the
 * floor the player is currently on (and its immediate stairwell
 * neighbours) is mounted at any time. Keys 1..N teleport between
 * floors; the spiral staircase at the centre of every floor handles
 * organic floor-to-floor walking.
 */
export function Gallery3D({ artworks }: Props) {
  const layout = useMemo(() => layoutMuseum(artworks), [artworks]);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentFloorIdx, setCurrentFloorIdx] = useState(layout.entry.floorIndex);
  const [activeRoomIdx, setActiveRoomIdx] = useState<number>(-1);
  const [zoomed, setZoomed] = useState<Artwork | null>(null);
  const [aiming, setAiming] = useState<Artwork | null>(null);
  // ID of the spiral the player is currently riding (or null if they're
  // not on a stair). Used to upgrade the *connected* adjacent floor
  // from stairwell-only to full geometry while the player is on the
  // stair, so the room they're descending into is already mounted by
  // the time they arrive — without it the rooms surrounding the next
  // floor's stairwell mount lazily at the floor-swap boundary, leaving
  // a black band visible through the spiral cutout mid-descent.
  const [activeStairId, setActiveStairId] = useState<string | null>(null);
  // Big-map overlay state. Press M to toggle. While open, player input
  // is paused and the user can cycle through floor plans with the
  // arrow keys / PgUp / PgDn, then commit a teleport with Enter or
  // dismiss with M / Esc. `viewedMapFloorIdx` mirrors `currentFloorIdx`
  // until the map opens; the user's cycling drives it from then on.
  const [mapOpen, setMapOpen] = useState(false);
  // Settings modal — pauses player input + drops pointer-lock so the
  // user can interact with sliders / buttons / the home link.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewedMapFloorIdx, setViewedMapFloorIdx] = useState(layout.entry.floorIndex);
  // Big-map size — sized once on open, doesn't track viewport resize
  // (rare during a play session). Capped so it doesn't dominate the
  // screen on huge monitors.
  const [bigMapSize, setBigMapSize] = useState(600);
  // True between a webglcontextlost event firing and the remount that
  // replaces the lost canvas. Drives an overlay so the player sees
  // "Restoring 3D scene…" instead of a frozen black canvas during the
  // brief gap between loss and the new canvas mounting.
  const [contextLost, setContextLost] = useState(false);
  // Bumped to force-remount the <Canvas> after a context loss. We don't
  // try to recover in place via webglcontextrestored — Three.js's
  // WebGLProperties WeakMap keeps stale GL handles from before the loss
  // (its initGLContext only re-creates manager objects, not the
  // properties cache), so the next render spams "object does not belong
  // to this context" warnings and paintings draw black. Remounting tears
  // down R3F entirely so the new renderer starts with empty caches; the
  // module-scope texture LRU survives so painting bitmaps don't refetch.
  const [canvasKey, setCanvasKey] = useState(0);
  // Timer handle for the scheduled remount. Cleared on unmount so a
  // route change away from the gallery can't fire stale setState calls.
  const remountTimerRef = useRef<number | null>(null);

  // Entry room — used as the basis for the start-overlay loading bar.
  // We wait for this room's paintings to decode before the player can
  // click "Enter", so they don't walk in to a wall of brown swatches.
  const entryFloor = layout.floors[layout.entry.floorIndex];
  const entryRoom = entryFloor.rooms.find((r) => r.isAnchor) ?? entryFloor.rooms[0];
  const entryRoomTotal = entryRoom?.placements.length ?? 0;
  const [entryRoomLoaded, setEntryRoomLoaded] = useState(0);
  const handleEntryPaintingLoaded = useCallback(() => {
    setEntryRoomLoaded((n) => n + 1);
  }, []);

  // Wrapper around the canvas + HUD overlays. Used as the fullscreen
  // target so the SiteNav above it stays in the page flow rather than
  // being captured into fullscreen along with the museum. Hoisted
  // above the joystick block so `useJoystick` can reparent its DOM
  // into the fullscreen subtree (otherwise the joysticks vanish the
  // moment the user enters the gallery — see the comment below).
  const galleryHostRef = useRef<HTMLDivElement | null>(null);

  // Mobile UX: replace pointer-lock + WASD with two on-screen
  // joysticks (movement on the left, look on the right) and gate
  // entry on landscape orientation. The rotate prompt follows the
  // raptor-runner pattern; the joysticks come from the same
  // `joystick-controller` package as my ricos.site demo.
  //
  // The joysticks are reparented into `galleryHostRef` so they stay
  // visible after the Enter click triggers `requestFullscreen()` —
  // joystick-controller appends to `document.body` by default, but
  // fullscreen only paints the fullscreen subtree, so any DOM outside
  // it disappears the moment the user enters the gallery.
  const isTouch = useTouchDevice() === true;
  const needsRotate = useNeedsRotate();
  const joysticksActive =
    isTouch && hasStarted && !zoomed && !mapOpen && !settingsOpen && !needsRotate;
  const moveJoystick = useJoystick({
    enabled: joysticksActive,
    params: { x: "12%", y: "18%" },
    parentRef: galleryHostRef,
  });
  const lookJoystick = useJoystick({
    enabled: joysticksActive,
    params: { x: "88%", y: "18%" },
    parentRef: galleryHostRef,
  });

  // Mirror `hasStarted` into the global Gallery3D context so the
  // SiteNav can hide itself and the body can lock vertical scroll
  // while the player is inside the museum. Reset on unmount so a
  // back-button exit (or any other route change) restores both.
  const setIs3DActive = useSetIs3DActive();
  useEffect(() => {
    setIs3DActive(hasStarted);
    return () => setIs3DActive(false);
  }, [hasStarted, setIs3DActive]);

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
  // Floor index at the *other* end of the active stair — i.e. the one
  // we're heading TO. Falsy when not on a stair, in which case the
  // adjacent-floor blocks below fall back to stairwell-only.
  const stairOtherFloorIdx = useMemo(() => {
    if (activeStairId == null) return null;
    const stair = layout.allStaircases.find((s) => s.id === activeStairId);
    if (!stair) return null;
    return stair.lowerFloor === currentFloorIdx ? stair.upperFloor : stair.lowerFloor;
  }, [activeStairId, currentFloorIdx, layout.allStaircases]);

  // Floor index TWO levels away from the player in the direction of the
  // active stair — i.e. one floor BEYOND the destination. While the
  // player rides a spiral, looking down (or up) through the well shows
  // the destination floor's stairwell cutout, and through THAT cutout
  // the next flight should be visible. Without preloading this floor,
  // its stair geometry isn't mounted and the cutout reads as a black
  // void where the next flight ought to be. We mount it in a new
  // "stairs"-only mode (no rooms, no hallways, no accents) per the
  // user's request: "load the stairs for the room below but nothing
  // else." Falsy when not on a stair or when the beyond floor is
  // outside the building.
  const stairBeyondFloorIdx = useMemo(() => {
    if (stairOtherFloorIdx == null) return null;
    const dir = stairOtherFloorIdx - currentFloorIdx;
    const beyond = stairOtherFloorIdx + dir;
    if (beyond < 0 || beyond >= layout.floors.length) return null;
    return beyond;
  }, [stairOtherFloorIdx, currentFloorIdx, layout.floors.length]);

  // Spawn point driver. Default: entry on floor 0. Teleport keys
  // overwrite this to the anchor of the target floor. Stair-driven
  // floor changes set it to the *current* XZ so the player continues
  // walking where they were, with Y matched to the new floor.
  const spawnForFloor = useRef<[number, number, number]>(layout.entry.worldPosition);
  // Player preserves its last camera XZ (and yaw) so we can read it
  // when stairs trigger a floor swap and so the minimap can follow the
  // camera per-frame without round-tripping through React state.
  const lastCameraRef = useRef<PlayerSample | null>(null);
  // Captured in Canvas.onCreated so the Enter click can engage pointer
  // lock synchronously inside its own user gesture. drei's selector now
  // scopes auto-lock to .gallery-canvas-host, which the start overlay
  // (a DOM sibling) doesn't sit inside — so without this manual lock
  // the player would enter the gallery un-locked, and their first
  // painting click would just be the relock click rather than a zoom.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  // Debug 1..N teleport keys (one per floor).
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

  // M opens / closes the big map. Inside the big map, ↑/↓ + PgUp/PgDn
  // cycle through floor plans without teleporting; Enter commits the
  // jump to whichever floor is currently being previewed; Esc / M
  // close. Pointer-lock is dropped on open so the user can interact
  // with whatever overlay UI we add later (clickable floor list, etc.)
  // without fighting a captured cursor.
  useEffect(() => {
    if (!hasStarted || zoomed || settingsOpen) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === "KeyM") {
        e.preventDefault();
        if (!mapOpen) {
          setViewedMapFloorIdx(currentFloorIdx);
          const s = Math.max(300, Math.min(window.innerHeight - 180, window.innerWidth - 160, 760));
          setBigMapSize(s);
          setMapOpen(true);
          if (!isTouch && document.pointerLockElement) document.exitPointerLock();
        } else {
          setMapOpen(false);
        }
        return;
      }
      if (!mapOpen) return;
      if (e.code === "Escape") {
        e.preventDefault();
        setMapOpen(false);
      } else if (e.code === "ArrowUp" || e.code === "PageUp") {
        e.preventDefault();
        setViewedMapFloorIdx((i) => Math.min(layout.floors.length - 1, i + 1));
      } else if (e.code === "ArrowDown" || e.code === "PageDown") {
        e.preventDefault();
        setViewedMapFloorIdx((i) => Math.max(0, i - 1));
      } else if (e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        if (viewedMapFloorIdx !== currentFloorIdx) {
          teleportToFloor(viewedMapFloorIdx);
          playTransition();
        }
        setMapOpen(false);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [
    hasStarted,
    zoomed,
    settingsOpen,
    mapOpen,
    currentFloorIdx,
    viewedMapFloorIdx,
    isTouch,
    layout.floors.length,
    teleportToFloor,
    playTransition,
  ]);

  // Pointer-lock release when the zoom modal opens. Unmounting drei's
  // PointerLockControls only removes its event listeners — it does NOT
  // call document.exitPointerLock(), so the cursor stays hidden and
  // captured underneath the modal. Without this the user can see the
  // overlay but can't move the mouse to dismiss it; Escape works only
  // because the browser auto-unlocks on Esc. Pressing E (or clicking)
  // to open never exited the lock, hence the "E doesn't release"
  // report. Touch devices have no pointer lock so the call is a no-op.
  useEffect(() => {
    if (zoomed && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [zoomed]);

  // Same release for the settings modal: without dropping the lock the
  // cursor stays captured under the overlay and the user can't reach
  // the sliders or close button.
  useEffect(() => {
    if (settingsOpen && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [settingsOpen]);

  // Clear any pending context-loss remount timer if the gallery itself
  // unmounts (route change away from the museum). Without this, a remount
  // bump could fire after the component is gone and warn about a setState
  // on an unmounted tree.
  useEffect(() => {
    return () => {
      if (remountTimerRef.current != null) clearTimeout(remountTimerRef.current);
    };
  }, []);

  return (
    <div ref={galleryHostRef} className="relative w-full h-screen bg-black">
      <Canvas
        // Bumped after a webglcontextlost event so the entire R3F tree
        // unmounts and rebuilds with a fresh WebGLRenderer — see the
        // onCreated handler below for why in-place restore doesn't work.
        key={canvasKey}
        className="gallery-canvas-host"
        camera={{ fov: 75, near: 0.1, far: 500 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          scene.fog = new THREE.Fog("#0a0805", 20, 80);
          canvasRef.current = gl.domElement;

          // WebGL context-loss recovery. The GPU can yank the context for
          // any of: tab backgrounded, driver hiccup, OS-level memory
          // pressure, GPU process restart, and (very common in dev) HMR
          // bundling memory churn. preventDefault() on `webglcontextlost`
          // signals we want it back, but the in-place restore path is
          // unreliable: even when `webglcontextrestored` fires, Three.js's
          // WebGLProperties WeakMap still holds stale GL handles from
          // before the loss, so the next render spams "object does not
          // belong to this context" and paintings draw black. Instead we
          // tear down the whole Canvas and let R3F build a fresh one — a
          // ~300ms blink behind the "Restoring 3D scene…" overlay. Player
          // XZ is preserved through `spawnForFloor`; the module-scope
          // texture LRU outlives the remount so painting bitmaps don't
          // refetch from the network.
          gl.domElement.addEventListener(
            "webglcontextlost",
            (e) => {
              e.preventDefault();
              setContextLost(true);
              if (remountTimerRef.current != null) clearTimeout(remountTimerRef.current);
              remountTimerRef.current = window.setTimeout(() => {
                remountTimerRef.current = null;
                if (lastCameraRef.current) {
                  spawnForFloor.current = [
                    lastCameraRef.current.x,
                    spawnForFloor.current[1],
                    lastCameraRef.current.z,
                  ];
                }
                setContextLost(false);
                setCanvasKey((k) => k + 1);
              }, 300);
            },
            false,
          );
        }}
      >
        <color attach="background" args={["#0a0805"]} />
        {/* Global fill for non-active rooms. Tuning is a balance between
            three failure modes:
              - too dim (was 0.35 + 0.45): non-active rooms unreadable
                from the doorway.
              - too flat (was 0.85 + 1.1): per-room lamps got washed out
                and the gallery lost depth.
              - too directional (high hemi, dark groundColor): the ground
                floor (floor 0) reads darker than upper floors because
                most of what's visible from there is undersides — the
                stair going up and the underside of floor 1's annular
                stairwell slab — and undersides receive the hemi's
                groundColor only. Upper floors don't have this problem
                because the cutout gives them bright top-face surfaces
                visible through the well as well.
            Today's mix biases toward ambient (uniform from every
            direction) and warms + dims the hemi so undersides on floor
            0 are not pitch black. The hemi position is purely cosmetic;
            HemisphereLight ignores it for shading and shines from
            world-up regardless. */}
        <ambientLight intensity={0.3} />
        <hemisphereLight args={["#fff3d0", "#2a1f15", 0.23]} position={[0, 20, 0]} />
        {/* Procedural environment map painted from the active era's
            palette (ceiling/wall/floor colours). Replaces a `sunset`
            HDRI preset that gave metallic surfaces something to reflect
            but tinted walls and ceilings with light that read as
            "outside the building" — the museum is a closed interior, so
            the env map should reflect the room itself. See
            room-env-map.tsx for the canvas → PMREM pipeline. */}
        <RoomEnvironment palette={currentFloor.era.palette} />

        <FloorScene
          floor={currentFloor}
          allStaircases={layout.allStaircases}
          activeRoomIdx={activeRoomIdx}
          // Only the entry floor wires the load-tally callback; once the
          // player has started, further floors don't need it.
          entryRoomId={
            !hasStarted && currentFloorIdx === layout.entry.floorIndex ? entryRoom?.id : undefined
          }
          onEntryPaintingLoaded={handleEntryPaintingLoaded}
        />
        {/* Adjacent floors: mount their stairwell rooms only so the
            stair leading up/down has visual continuity into the next
            floor (no painted void overhead or underfoot). Cheap —
            stairwells hold no paintings.

            Exception: while the player is on a spiral, upgrade the
            *connected* floor (the one we're descending or ascending
            into) to full geometry so its rooms are mounted before we
            arrive. Without this, the rest of the next floor's rooms
            mount lazily at the floor-swap boundary and a black band
            shows through the stairwell cutout mid-descent. The OTHER
            adjacent floor (above when descending, below when ascending)
            stays stairwell-only so we don't preload geometry the
            player isn't heading toward. */}
        {currentFloorIdx > 0 && (
          <FloorScene
            floor={layout.floors[currentFloorIdx - 1]}
            allStaircases={layout.allStaircases}
            activeRoomIdx={-1}
            showOnly={stairOtherFloorIdx === currentFloorIdx - 1 ? undefined : "stairwell"}
          />
        )}
        {currentFloorIdx < layout.floors.length - 1 && (
          <FloorScene
            floor={layout.floors[currentFloorIdx + 1]}
            allStaircases={layout.allStaircases}
            activeRoomIdx={-1}
            showOnly={stairOtherFloorIdx === currentFloorIdx + 1 ? undefined : "stairwell"}
          />
        )}
        {/* Beyond-floor stair-only mount. When the player enters a
            spiral, the floor TWO levels away (one beyond the
            destination) gets just its stair geometry rendered so the
            next flight is visible through the destination's spiral
            cutout. Without it, looking down through F-1's well from
            F shows a black void where F-2's stair should be. */}
        {stairBeyondFloorIdx != null && (
          <FloorScene
            floor={layout.floors[stairBeyondFloorIdx]}
            allStaircases={layout.allStaircases}
            activeRoomIdx={-1}
            showOnly="stairs"
          />
        )}

        <LodController />

        <Player
          enabled={hasStarted && !zoomed && !mapOpen && !settingsOpen}
          floor={currentFloor}
          allStaircases={layout.allStaircases}
          spawnAt={spawnForFloor.current}
          onRoomChange={setActiveRoomIdx}
          onFloorChange={handleStairFloorChange}
          onPositionSample={(x, z, yaw) => {
            lastCameraRef.current = { x, z, yaw };
          }}
          onZoomRequest={setZoomed}
          onAimChange={setAiming}
          onActiveStairChange={setActiveStairId}
          joystickMoveGetter={isTouch ? moveJoystick.getData : undefined}
          joystickLookGetter={isTouch ? lookJoystick.getData : undefined}
        />
        {/* Pointer-lock is desktop-only — on touch the joysticks own
            move/look, and mobile browsers don't support it anyway.
            selector scopes drei's auto-lock click listener to the
            canvas wrapper; otherwise it binds to document.body and
            any click (audio gear, HUD) yanks the cursor into lock.
            domElement pins the lock to the inner <canvas>. Without it
            drei's controls.lock() calls requestPointerLock on R3F's
            event-source <div> (the same element .gallery-canvas-host
            lives on), so the first painting click TRANSFERS the lock
            from the canvas (where the Enter handler engaged it) to
            that outer div. After the transfer, pointer events dispatch
            with target=outerDiv and bubble UP — they no longer pass
            through the canvas, so Player's pointerdown listener
            silently stops firing and click-to-zoom dies even though
            E (a window keydown) keeps working. */}
        {hasStarted && !zoomed && !mapOpen && !settingsOpen && !isTouch && (
          <PointerLockControls
            selector=".gallery-canvas-host"
            domElement={canvasRef.current ?? undefined}
          />
        )}
        {/* Selective bloom on the lamp bulbs. The bulb material's
            emissiveIntensity > 1 pushes its colour above the
            luminanceThreshold so only the bulbs (and any equally bright
            highlights) bloom — paintings, walls, and floors stay
            unaffected. mipmapBlur gives a softer, less ringy halo than
            the default Gaussian. Bloom registers regardless of `lit`
            because the LampFixture's bulb material drops its emissive
            to zero when off, so unlit fixtures simply don't pass the
            threshold. */}
        <EffectComposer>
          <Bloom intensity={0.35} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur />
        </EffectComposer>
      </Canvas>
      {!hasStarted && (
        <StartOverlay
          title={currentFloor.era.title}
          blurb={currentFloor.era.blurb}
          loaded={Math.min(entryRoomLoaded, entryRoomTotal)}
          total={entryRoomTotal}
          onStart={() => {
            // Engage pointer lock inside the Enter click's user gesture so
            // the very first painting click opens the inspect overlay
            // instead of being consumed by drei's selector relock.
            // Touch devices have no pointer lock — joysticks own look.
            if (!isTouch) canvasRef.current?.requestPointerLock?.();
            // Take the gallery container fullscreen in the same gesture
            // so the museum visit isn't framed by the site nav + browser
            // chrome. Fullscreening just the gallery host (not <html>)
            // keeps the nav out — the user gets canvas-only. Promise
            // rejects if the browser denies (Safari on iOS, embedded
            // view) — silent catch keeps Enter working.
            if (typeof document !== "undefined" && !document.fullscreenElement) {
              galleryHostRef.current?.requestFullscreen?.().catch(() => {});
            }
            setHasStarted(true);
          }}
          isTouch={isTouch}
        />
      )}
      {/* Rotate-to-landscape guard — full-screen overlay shown to
          mobile users in portrait. Sits above every other layer so
          start screen, joysticks, and minimap are all hidden until
          they rotate. */}
      {needsRotate && <LandscapePrompt />}
      {/* WebGL context-loss curtain. Shown between webglcontextlost and
          webglcontextrestored — usually a few hundred ms. Above every
          other overlay so the user isn't staring at a frozen canvas
          while Three rebuilds its GPU state on the next frame. The
          shared loading-bar animation matches the route loading state
          so the visual language stays consistent across "scene not
          ready yet" moments. */}
      {contextLost && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-[min(360px,88vw)] rounded-xl border border-white/15 bg-black/70 p-5 text-center text-white shadow-2xl">
            <h2 className="font-serif text-lg tracking-wide">Restoring 3D scene</h2>
            <p className="mt-2 text-xs leading-relaxed text-white/70">
              The browser dropped the graphics context. Reconnecting…
            </p>
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/4 rounded-full bg-white/70 animate-loading-bar" />
            </div>
          </div>
        </div>
      )}
      {hasStarted && !mapOpen && (
        <div
          className={`absolute bg-black/60 text-neutral-100 px-4 py-2 rounded text-sm pointer-events-none ${
            isTouch ? "top-4 left-1/2 -translate-x-1/2" : "bottom-4 left-4"
          }`}
        >
          <div className="text-xs text-neutral-500">
            Floor {currentFloorIdx} · {currentFloor.era.title}
          </div>
          {activeRoom && (
            <>
              <div className="font-semibold">{activeRoom.title}</div>
              <div className="text-xs text-neutral-400">{activeRoom.description}</div>
            </>
          )}
        </div>
      )}
      {hasStarted &&
        !zoomed &&
        !mapOpen &&
        (aiming ? (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-white/25 bg-black/70 px-4 py-1.5 text-sm text-white shadow-lg pointer-events-none backdrop-blur-sm">
            {isTouch ? (
              <>Tap to inspect painting</>
            ) : (
              <>
                Press{" "}
                <kbd className="rounded border border-white/40 px-1.5 font-mono text-xs">E</kbd> or
                click to inspect painting
              </>
            )}
          </div>
        ) : (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/55 text-neutral-200 px-3 py-1 rounded text-xs pointer-events-none backdrop-blur-sm">
            {isTouch ? (
              <>Left stick walks · right stick looks</>
            ) : (
              <>
                <kbd className="rounded border border-white/30 px-1 font-mono">M</kbd> map ·{" "}
                <kbd className="rounded border border-white/30 px-1 font-mono">F</kbd> zoom ·{" "}
                <kbd className="rounded border border-white/30 px-1 font-mono">C</kbd> duck ·{" "}
                <kbd className="rounded border border-white/30 px-1 font-mono">R</kbd> tiptoe ·{" "}
                <kbd className="rounded border border-white/30 px-1 font-mono">E</kbd> inspect
              </>
            )}
          </div>
        ))}
      {/* Crosshair — small dot in the centre of the screen so the
          player knows exactly where they're aiming. Swaps to a
          magnifying-glass icon when the aim raycast lands on a
          painting (and the player is within ~4.5 m of it), telegraphing
          the inspect/zoom affordance. Always visible while walking;
          hidden during the start overlay and zoom modal so it doesn't
          compete with either. */}
      {hasStarted && !zoomed && !mapOpen && <Crosshair inspecting={aiming !== null} />}
      {/* Settings cog — single trigger at top-4 right-4 that opens a
          fullscreen settings modal (sound + fullscreen toggle + exit
          link). Mount-gated on `hasStarted` so the cog only appears
          after the user clicks Enter; hidden under zoom/map overlays
          so it doesn't fight for the corner. */}
      {hasStarted && !zoomed && !mapOpen && (
        <Gallery3DSettings
          fullscreenTarget={galleryHostRef}
          isOpen={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      )}
      {/* Minimap. Bottom-right on desktop; top-left on mobile so the
          look joystick (bottom-right) and audio controls (top-right)
          don't collide with it. Smaller size on mobile to leave room
          for the centred floor banner on narrow viewports. */}
      {hasStarted && !zoomed && !mapOpen && (
        <div
          className={`absolute pointer-events-none ${
            isTouch ? "top-4 left-4" : "bottom-4 right-4"
          }`}
        >
          <Minimap
            floor={currentFloor}
            activeRoomIdx={activeRoomIdx}
            playerRef={lastCameraRef}
            size={isTouch ? 140 : 220}
          />
        </div>
      )}
      {/* Big-map overlay (toggled with M). Shows the full floor plan
          for whichever floor the user is previewing — defaults to the
          one they're physically on. ↑ / ↓ + PgUp / PgDn cycle
          floors; Enter teleports there; M / Esc dismisses. The dim
          backdrop closes it on click so users who can't recall the
          shortcut have a way out. */}
      {hasStarted && !zoomed && mapOpen && (
        <BigMapOverlay
          floor={layout.floors[viewedMapFloorIdx]}
          activeRoomIdx={viewedMapFloorIdx === currentFloorIdx ? activeRoomIdx : -1}
          playerRef={lastCameraRef}
          showPlayer={viewedMapFloorIdx === currentFloorIdx}
          floorCount={layout.floors.length}
          floorTitles={layout.floors.map((f) => f.era.title)}
          viewedFloorIdx={viewedMapFloorIdx}
          currentFloorIdx={currentFloorIdx}
          size={bigMapSize}
          onSelect={(idx) => setViewedMapFloorIdx(idx)}
          onClose={() => setMapOpen(false)}
          onJump={(idx) => {
            if (idx !== currentFloorIdx) {
              teleportToFloor(idx);
              playTransition();
            }
            setMapOpen(false);
          }}
          isTouch={isTouch}
        />
      )}
      {zoomed && (
        <ZoomModal
          artwork={zoomed}
          onClose={(shouldRelock) => {
            setZoomed(null);
            // Re-engage pointer lock immediately on E or click — still
            // inside a user gesture, so requestPointerLock works.
            // Esc passes shouldRelock=false: Chrome blacklists pointer
            // lock for ~1 s after the user pressed Esc, so attempting
            // to relock there is silently denied. Touch devices have
            // no pointer lock at all.
            if (shouldRelock && !isTouch) {
              canvasRef.current?.requestPointerLock?.();
            }
          }}
        />
      )}
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
  allStaircases,
  activeRoomIdx,
  showOnly,
  entryRoomId,
  onEntryPaintingLoaded,
}: {
  floor: FloorLayout;
  /** Every staircase in the building. Threaded into StaircaseRenderer
   *  so it can suppress inner-rail finials at intermediate floor
   *  boundaries (only the absolute top/bottom of the helix should
   *  show a newel cap). */
  allStaircases: readonly Staircase[];
  activeRoomIdx: number;
  /** "stairwell" keeps the stairwell room + its stair geometry +
   *  cutout-edge railings — used for adjacent floors so the stair has
   *  visual continuity without mounting every room + painting.
   *  "stairs" keeps ONLY the stair geometry — used for the floor TWO
   *  levels away from the player while they ride a spiral, so the
   *  next flight is visible through the destination floor's well
   *  cutout without paying for a full stairwell mount. */
  showOnly?: "stairwell" | "stairs";
  /** Room whose paintings should report load progress. Undefined →
   *  no room reports (e.g. once the player has entered). */
  entryRoomId?: string;
  onEntryPaintingLoaded?: () => void;
}) {
  const rooms =
    showOnly === "stairs"
      ? []
      : showOnly === "stairwell"
        ? floor.rooms.filter((r) => r.isStairwell)
        : floor.rooms;
  const hallways = showOnly ? [] : floor.hallways;
  // Stair geometry only mounts once per Staircase (from the lower
  // floor's stairsOut). Skipping stairsIn here avoids double-rendering
  // the same stair on the upper floor — the geometry is the same
  // object either way.
  const stairs = floor.stairsOut;
  return (
    <group>
      {rooms.map((room, i) => (
        <RoomGeometry
          key={room.id}
          room={room}
          isActive={i === activeRoomIdx}
          onPaintingLoaded={room.id === entryRoomId ? onEntryPaintingLoaded : undefined}
        />
      ))}
      {hallways.map((hw) => (
        <HallwayRenderer key={hw.id} hallway={hw} floor={floor} />
      ))}
      {stairs.map((s) => (
        <StaircaseRenderer key={s.id} staircase={s} allStaircases={allStaircases} />
      ))}
      {/* Cutout-edge railing + entry gate posts + signage. Rendered
          for the active floor and showOnly="stairwell" adjacent floors
          so the player sees the full vertical stack of railings as
          they travel up. Skipped in showOnly="stairs" mode (beyond
          floor) per the user's "stairs but nothing else" intent. */}
      {showOnly !== "stairs" && <StairwellAccents floor={floor} />}
    </group>
  );
}

/**
 * Centre-screen aim reticle. Default state is a tiny dot so the player
 * knows where they're looking; when the aim raycast hits a painting
 * within range, swap to a magnifying-glass icon so the inspect/zoom
 * affordance is immediately legible. Ported from the pre-museum
 * gallery's Crosshair — the multi-floor cutover dropped it, leaving
 * only the dot.
 */
function Crosshair({ inspecting }: { inspecting: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      {inspecting ? (
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
          aria-hidden="true"
        >
          <title>Inspect painting</title>
          <circle
            cx="10"
            cy="10"
            r="6.5"
            fill="rgba(0,0,0,0.25)"
            stroke="white"
            strokeWidth="1.8"
          />
          <line
            x1="14.5"
            y1="14.5"
            x2="20.5"
            y2="20.5"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <div className="h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_2px_rgba(0,0,0,0.8)]" />
      )}
    </div>
  );
}

/**
 * Start-of-gallery overlay. Card-style modal with the era title, the
 * controls hint, and a progress bar reporting how many of the entry
 * room's paintings have decoded their textures. The Enter button is
 * disabled until the entry room is fully loaded so the player doesn't
 * walk into a wall of brown swatches. Ported from the old corridor
 * gallery's StartOverlay — same UX, scoped to the new entry room.
 */
function StartOverlay({
  onStart,
  loaded,
  total,
  title,
  blurb,
  isTouch = false,
}: {
  onStart: () => void;
  loaded: number;
  total: number;
  title: string;
  blurb: string;
  /** When true, the controls hint reads as joystick / tap instructions
   *  instead of WASD + mouse. Driven by `useTouchDevice()` upstream. */
  isTouch?: boolean;
}) {
  const ready = total === 0 || loaded >= total;
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 100;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: pointer-lock entry requires a real mouse click; keyboard activation can't grant pointer-lock
    // biome-ignore lint/a11y/noStaticElementInteractions: same reason — full-screen click target gates pointer-lock entry
    <div
      onClick={ready ? onStart : undefined}
      className={`absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm ${
        ready ? "cursor-pointer" : "cursor-default"
      }`}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation only — purely visual container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[min(480px,92vw)] rounded-xl border border-white/15 bg-black/60 p-6 text-center text-white shadow-2xl"
      >
        <h2 className="font-serif text-2xl tracking-wide">Enter the museum</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/80">
          You'll start on <span className="font-medium text-white">{title}</span>.
          <span className="mt-1 block text-white/60">{blurb}</span>
        </p>
        <p className="mt-4 text-xs leading-relaxed text-white/65">
          {isTouch ? (
            <>
              Left stick walks · right stick looks · tap a painting to inspect · stairs change
              floors
            </>
          ) : (
            <>
              <kbd className="rounded border border-white/30 px-1.5">W</kbd>{" "}
              <kbd className="rounded border border-white/30 px-1.5">A</kbd>{" "}
              <kbd className="rounded border border-white/30 px-1.5">S</kbd>{" "}
              <kbd className="rounded border border-white/30 px-1.5">D</kbd> to walk · mouse to look
              · <kbd className="rounded border border-white/30 px-1.5">Shift</kbd> to run ·{" "}
              <kbd className="rounded border border-white/30 px-1.5">Space</kbd> to jump · click a
              painting to zoom · <kbd className="rounded border border-white/30 px-1.5">M</kbd> for
              the full map (with teleport shortcuts)
            </>
          )}
        </p>

        <div className="mt-5 space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-white/70 transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-xs text-white/55">
            {ready ? "First room ready" : `Loading first room… ${loaded}/${total}`}
          </div>
        </div>

        <button
          type="button"
          onClick={onStart}
          disabled={!ready}
          className="mt-5 rounded-md bg-white px-5 py-2 text-sm font-medium text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/60"
        >
          {ready ? "Enter" : "Preparing…"}
        </button>
      </div>
    </div>
  );
}

/**
 * Full-screen big-map overlay. Renders the floor plan of whichever
 * floor is currently being previewed (the *viewed* floor — not
 * necessarily the one the player is standing on), with a vertical
 * floor-stack picker on the side and a hint footer. The keyboard
 * shortcuts driving navigation live up in Gallery3D so they keep
 * working even if focus isn't on this overlay; this component fires
 * `onSelect` / `onJump` / `onClose` for click-driven equivalents.
 */
function BigMapOverlay({
  floor,
  activeRoomIdx,
  playerRef,
  showPlayer,
  floorCount,
  floorTitles,
  viewedFloorIdx,
  currentFloorIdx,
  size,
  onSelect,
  onJump,
  onClose,
  isTouch,
}: {
  floor: FloorLayout;
  activeRoomIdx: number;
  playerRef: React.RefObject<PlayerSample | null>;
  showPlayer: boolean;
  floorCount: number;
  floorTitles: string[];
  viewedFloorIdx: number;
  currentFloorIdx: number;
  size: number;
  onSelect: (idx: number) => void;
  onJump: (idx: number) => void;
  onClose: () => void;
  isTouch: boolean;
}) {
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss is a courtesy mouse shortcut; keyboard already maps Esc / M to close at the parent.
    // biome-ignore lint/a11y/noStaticElementInteractions: full-screen click target gating the overlay
    <div
      onClick={onClose}
      className="absolute inset-0 z-30 flex items-center justify-center gap-6 bg-black/85 backdrop-blur-md p-6"
    >
      {/* Floor-stack picker — newest on top so it visually mirrors
          the building's vertical stack. Click any row to preview that
          floor; double-click (or Enter / button to the right) jumps. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — keyboard nav is handled at the parent. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation only — purely visual container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col-reverse gap-1 rounded-lg border border-white/15 bg-black/60 p-3 text-sm text-white/90 shadow-xl max-h-[80vh] overflow-y-auto"
      >
        <div className="text-[10px] uppercase tracking-wider text-white/45 mb-1 px-2">Floors</div>
        {Array.from({ length: floorCount }, (_, i) => {
          const isViewed = i === viewedFloorIdx;
          const isCurrent = i === currentFloorIdx;
          return (
            <button
              type="button"
              key={i}
              onClick={() => onSelect(i)}
              onDoubleClick={() => onJump(i)}
              className={`flex items-center gap-2 rounded px-2 py-1 text-left transition ${
                isViewed
                  ? "bg-white/15 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span
                className={`inline-block min-w-[3.5rem] text-right text-xs ${
                  isCurrent ? "text-amber-300" : "text-white/55"
                }`}
              >
                Floor {i}
              </span>
              <span className="flex-1 truncate text-sm">{floorTitles[i]}</span>
              {isCurrent && (
                <span
                  aria-label="You are here"
                  className="text-[10px] uppercase tracking-wider text-amber-300"
                >
                  here
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Map + footer hint. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — keyboard nav is handled at the parent. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation only — purely visual container */}
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-3">
        <Minimap
          floor={floor}
          activeRoomIdx={activeRoomIdx}
          playerRef={playerRef}
          showPlayer={showPlayer}
          size={size}
        />
        <div className="flex flex-col items-center gap-2 text-xs text-white/75">
          {isTouch ? (
            <span>Tap a floor on the left · double-tap to jump · tap outside to close</span>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <kbd className="rounded border border-white/30 px-1.5 font-mono">↑</kbd>
                <kbd className="rounded border border-white/30 px-1.5 font-mono">↓</kbd>
                <span>cycle floors</span>
                <span className="text-white/35">·</span>
                <kbd className="rounded border border-white/30 px-1.5 font-mono">Enter</kbd>
                <span>jump</span>
                <span className="text-white/35">·</span>
                <kbd className="rounded border border-white/30 px-1.5 font-mono">M</kbd>
                <span>/</span>
                <kbd className="rounded border border-white/30 px-1.5 font-mono">Esc</kbd>
                <span>close</span>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 text-white/55">
                <span>Quick teleport:</span>
                {Array.from({ length: floorCount }, (_, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <kbd className="rounded border border-white/25 px-1.5 font-mono">{i + 1}</kbd>
                    <span className="truncate max-w-[7rem]">{floorTitles[i]}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
