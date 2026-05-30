"use client";

import { useFrame, useThree } from "@react-three/fiber";
import type { JoystickOnMove } from "joystick-controller";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { ArtworkListing } from "@/lib/data";
import type { FloorLayout, Staircase } from "@/lib/gallery-layout/types";
import { CELL_SIZE } from "@/lib/gallery-layout/world-coords";
import {
  createGalleryCollisionController,
  type GalleryCollisionController,
} from "./gallery-physics";
import { raycastNearestPainting } from "./painting-registry";
import {
  findStairAbove,
  findStairBelow,
  isInsideStair,
  spiralRawAngle,
  stairHeightAt,
} from "./staircase";

const EYE_HEIGHT = 1.75;
const DUCK_EYE_HEIGHT = 1.05;
const TIPTOE_EYE_HEIGHT = 2.15;
const FOV_DEFAULT = 75;
const FOV_ZOOMED = 35;
const WALK_SPEED = 5;
const RUN_SPEED = 10;
const JUMP_IMPULSE = 6;
const GRAVITY = 22;
// Keep the player this far back from a wall face. Cell-size is 2.5 m;
// 0.3 m leaves headroom for the wall plane + trim geometry.
const PLAYER_RADIUS = 0.3;
// Max distance (m) at which the crosshair swaps to the magnifying-glass
// "inspect" affordance. Click-to-zoom still works at any range; this is
// purely the visual hover threshold so the cursor only changes when the
// player is right up against the painting they're looking at.
const AIM_MAX_DIST = 2;
// Look joystick → angular velocity. The stick is binary above the
// deadzone (no faster-with-more-drag), so this is the actual turn
// rate while engaged — not a max. 1.2 rad/s ≈ 69°/sec feels
// deliberate without being sluggish; fine aim comes from short
// stick taps, not partial deflection.
const LOOK_SPEED = 1.2;
// Joystick max-range in pixels — must match `defaultParameters.maxRange`
// in `use-joystick.ts`. Used to normalise the library's raw x/y back
// into a [-1, 1] range so the deadzone fractions below are anchored
// to the right scale.
const JOYSTICK_MAX_RANGE = 60;
// Radial deadzone (fraction of full deflection) — inputs below this
// magnitude are treated as zero, anything past it engages at full
// rate. 0.15 of 60 px ≈ 9 px of physical throw before either stick
// fires, regardless of how big maxRange is set.
const LOOK_DEADZONE = 0.15;
const MOVE_DEADZONE = 0.15;
// Radius (m) at which the player counts as "approaching" a staircase.
// Past this distance the FloorPreloader has time to fetch + GPU-upload
// the destination floor's thumb textures at low priority before the
// player actually steps on the stair. Sized to outerRadius (5.4 m) +
// generous buffer so a brisk walk (~3 m/s) gives ~2 s of preload runway
// before the first stair tread.
const STAIR_PROXIMITY_RADIUS = 12;
const STAIR_PROXIMITY_RADIUS_SQ = STAIR_PROXIMITY_RADIUS * STAIR_PROXIMITY_RADIUS;
// Width of the "you're at a real floor" arc at each end of a spiral
// revolution. Stepping off the spiral (canStepTo's exit branch) is only
// allowed inside one of these arcs, AND the player's `floor.index` is
// promoted to the destination floor when they enter one — without that
// promotion an upper-landing exit would teleport them into the lower
// floor's grid frame and they'd fall through the upper floor's annular
// ring on the way down. Tied to ~28° of revolution = ~0.49 m of vertical
// slack at FLOOR_SEPARATION = 6.12 m.
const STAIR_LANDING_TOL = 0.5;
// Early-entry trigger when descending a spiral. Once the player has
// completed ⅓ of the descent (cumulativeAngle drops below 2π·⅔), we
// promote floor.index to the destination floor — well before the
// landing-tolerance arc above. The destination room's active-room
// state then updates while the player is still mid-descent, so the HUD
// reflects the room they're entering before they reach the bottom.
// Only the descent branch uses this; ascent stays on STAIR_LANDING_TOL
// per request.
const STAIR_DESCEND_EARLY_ENTRY = (Math.PI * 2 * 2) / 3;
const _lookEuler = new THREE.Euler(0, 0, 0, "YXZ");
// Module-scope scratches reused every frame in useFrame to avoid the
// Vector3/Quaternion churn that would otherwise allocate ~5 objects per
// frame at 60 fps. Single-threaded React/R3F means there's no risk of
// concurrent mutation, and there's only one Player instance per gallery.
const _forwardScratch = new THREE.Vector3();
const _rightScratch = new THREE.Vector3();
const _moveScratch = new THREE.Vector3();
const _UP_SCRATCH = new THREE.Vector3(0, 1, 0);
const PITCH_LIMIT = Math.PI / 2 - 0.05;

/**
 * First-person player with grid-based collision. The active floor's
 * `walkable` mask is consulted every frame: a proposed move is accepted
 * if the new cell is walkable, otherwise the player slides along
 * whichever axis individually lands on a walkable cell.
 */
export function Player({
  enabled,
  floor,
  allStaircases,
  spawnAt,
  onRoomChange,
  onFloorChange,
  onPositionSample,
  onZoomRequest,
  onAimChange,
  onActiveStairChange,
  onNearbyStairChange,
  joystickMoveGetter,
  joystickLookGetter,
}: {
  enabled: boolean;
  floor: FloorLayout;
  /** Every staircase in the building. Needed so the spiral physics can
   *  transition the player from one storey's flight to the next when
   *  their cumulative angle crosses a revolution boundary. */
  allStaircases: readonly Staircase[];
  spawnAt: [number, number, number];
  onRoomChange?: (roomIndex: number) => void;
  /** Called when the player's Y crosses the midpoint between the
   *  current floor and an adjacent floor (via stairs). The callback
   *  is fired with the new floor index; the host should update state
   *  so this component re-mounts with the new `floor` prop. */
  onFloorChange?: (newFloorIndex: number) => void;
  /** Fires each frame with the player's XZ and map-space yaw (radians;
   *  0 = facing +x on the minimap, grows clockwise as the player turns
   *  right). Used by the host to remember position across floor-swap
   *  remounts and to drive the minimap compass arrow. */
  onPositionSample?: (x: number, z: number, yaw: number) => void;
  /** Called with an ArtworkListing when the player clicks/aims at a painting,
   *  so the host can open an inspect/zoom overlay. */
  onZoomRequest?: (artwork: ArtworkListing) => void;
  /** Fires when the painting under the crosshair changes (or null when
   *  none is in range). Throttled to ~10 Hz inside this component;
   *  consumers can use it to swap the crosshair to a magnifying-glass
   *  affordance and show a "Press E to inspect" hint. */
  onAimChange?: (artwork: ArtworkListing | null) => void;
  /** Fires when the player steps on / off a spiral staircase. Lets the
   *  host preload the connected floor's full geometry while the player
   *  is on the stair, so the room they're descending into is already
   *  rendered when they get there — without it the next floor mounts
   *  only its stairwell when the player crosses the boundary, leaving
   *  black bands at the slab edge mid-descent. Stair id, not the whole
   *  Staircase object, so identity comparison is cheap. */
  onActiveStairChange?: (stairId: string | null) => void;
  /** Edge-fired when the player crosses STAIR_PROXIMITY_RADIUS around
   *  any current-floor staircase. Lets the host kick off a low-priority
   *  texture preload for the connected floor's paintings before the
   *  player actually steps onto the stair — so the destination room
   *  doesn't open on a wall of brown placeholder swatches. Argument is
   *  the staircase id (or null when leaving every proximity zone);
   *  same-id frames are silent. */
  onNearbyStairChange?: (stairId: string | null) => void;
  /** Polled each frame for left-stick movement. We read raw x/y
   *  (integer pixels in ±JOYSTICK_MAX_RANGE) — leveledX/Y is too coarse
   *  (only 21 discrete steps) and reads as stair-stepping motion.
   *  Combined additively with WASD so a hybrid keyboard-+-touch session
   *  works without jankily fighting itself. Falsy → keyboard only. */
  joystickMoveGetter?: () => JoystickOnMove;
  /** Polled each frame for right-stick look. Same raw x/y read as the
   *  move stick. Drives yaw (X) and pitch (Y) at LOOK_SPEED radians per
   *  second after a quadratic response curve. */
  joystickLookGetter?: () => JoystickOnMove;
}) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  // Mirror of the `enabled` prop. Keyboard/pointer handlers read this
  // instead of the prop so the closure captured by the mount-time
  // useEffect stays in sync without re-binding listeners on every
  // toggle.
  const enabledRef = useRef(enabled);
  const velocityY = useRef(0);
  const grounded = useRef(true);
  const lastRoomIdx = useRef<number>(-2);
  /** F toggles a narrowed-FOV "partial zoom" so the player can read
   *  details on a painting without opening the modal — useful for
   *  large works where the inspect overlay isn't worth invoking. */
  const zoomFov = useRef(false);
  /** Smoothed eye height — damps toward the target posture height each
   *  frame. C held → drifts down toward DUCK_EYE_HEIGHT; R held → drifts
   *  up toward TIPTOE_EYE_HEIGHT; release latches at the held height
   *  (see latchedEyeHeight) instead of springing back to EYE_HEIGHT.
   *  Starts at full standing height so spawn matches what the camera Y
   *  is set to in useEffect. */
  const eyeHeight = useRef(EYE_HEIGHT);
  /** When the player releases C or R, we freeze the current eyeHeight
   *  here as the new "no-key-held" target — so a half-crouch held for
   *  a moment and released stays at that height instead of springing
   *  back. Cleared when the player actually starts moving (any movement
   *  key or joystick deflection past the deadzone), at which point the
   *  next frame's target reverts to EYE_HEIGHT. Pressing C/R again
   *  keeps working — the held key takes priority over the latch in the
   *  useFrame target calc. */
  const latchedEyeHeight = useRef<number | null>(null);
  // Click and aim raycasters share the same INSPECT_RANGE so the
  // crosshair affordance and the click-to-zoom action agree: if the
  // magnifying-glass cursor isn't showing, the click won't open
  // anything either. Two separate Raycaster instances avoid having
  // tryZoom re-set the throttled aim raycaster mid-frame.
  const raycaster = useRef(new THREE.Raycaster(undefined, undefined, 0.1, AIM_MAX_DIST));
  const aimRaycaster = useRef(new THREE.Raycaster(undefined, undefined, 0.1, AIM_MAX_DIST));
  const rayOrigin = useRef(new THREE.Vector3());
  const rayDir = useRef(new THREE.Vector3());
  const aimFrameCount = useRef(0);
  const aimLast = useRef<ArtworkListing | null>(null);
  const lastStairId = useRef<string | null>(null);
  // Edge-fire memo for onNearbyStairChange. Holds the id of the
  // staircase the player is currently within STAIR_PROXIMITY_RADIUS of
  // (nearest one if multiple overlap), or null. Compared against the
  // freshly-computed nearest stair each frame so the callback only
  // fires when crossing in or out, not every tick.
  const lastNearbyStairId = useRef<string | null>(null);
  /** Cumulative-angle state for the spiral. `cumulativeAngle ∈ [0, 2π]`
   *  describes how far around the current stair's revolution the
   *  player has walked; `lastRaw` is the previous frame's raw angle so
   *  per-frame deltas can be integrated even across the 2π wraparound.
   *  When cumulative crosses 2π or 0 we transition to the next/prev
   *  stair so the player can ride a continuous spiral across all
   *  storeys. Cleared when the player leaves the spiral annulus. */
  const spiralState = useRef<{
    staircaseId: string;
    cumulativeAngle: number;
    lastRaw: number;
  } | null>(null);
  // Once-per-session guard so a recurring throw inside the spiral
  // calc doesn't spam the console at 60 Hz.
  const spiralCalcWarned = useRef(false);
  const physicsRef = useRef<GalleryCollisionController | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    let cancelled = false;
    physicsRef.current?.dispose();
    physicsRef.current = null;

    createGalleryCollisionController(floor, allStaircases, PLAYER_RADIUS)
      .then((controller) => {
        if (cancelled) {
          controller.dispose();
          return;
        }
        physicsRef.current = controller;
      })
      .catch((err) => {
        console.warn("[player] Rapier collision setup failed", err);
      });

    return () => {
      cancelled = true;
      physicsRef.current?.dispose();
      physicsRef.current = null;
    };
  }, [floor, allStaircases]);

  // Latest `floor` mirrored into a ref so the spawn effect below can
  // pick the floor's central spiral as a lookAt target without taking
  // `floor` as an effect dep — that would re-fire the spawn teleport on
  // every stair-driven floor swap.
  const latestFloorRef = useRef(floor);
  latestFloorRef.current = floor;

  useEffect(() => {
    const eyeY = spawnAt[1] + EYE_HEIGHT;
    camera.position.set(spawnAt[0], eyeY, spawnAt[2]);
    // Face the central spiral so the navigation affordance is the first
    // thing the player sees on spawn / teleport. Anchor and stair centres
    // aren't always axis-aligned (anchor centre X drifts off the stair X
    // depending on era-specific room sizing), so a hardcoded -Z lookAt
    // isn't reliable. Use the actual stair centre on the current floor;
    // fall back to a north-facing default if a floor has no spiral.
    const f = latestFloorRef.current;
    const stair = f.stairsOut[0] ?? f.stairsIn[0] ?? null;
    if (stair) {
      camera.lookAt(stair.centerX, eyeY, stair.centerZ);
    } else {
      camera.lookAt(spawnAt[0], eyeY, spawnAt[2] - 5);
    }
  }, [camera, spawnAt]);

  useEffect(() => {
    const tryZoom = () => {
      if (!onZoomRequest) return;
      camera.getWorldPosition(rayOrigin.current);
      camera.getWorldDirection(rayDir.current);
      raycaster.current.set(rayOrigin.current, rayDir.current);
      // Painting-registry prefilter — bounds the raycast to the
      // ~handful of paintings in the player's forward cone instead of
      // traversing hundreds of wall/floor/step meshes on every click.
      const artwork = raycastNearestPainting(
        raycaster.current,
        rayOrigin.current,
        rayDir.current,
        AIM_MAX_DIST,
      );
      if (artwork) onZoomRequest(artwork);
    };
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (!enabledRef.current) return;
      if (e.code === "Space" && grounded.current) {
        velocityY.current = JUMP_IMPULSE;
        grounded.current = false;
        e.preventDefault();
      }
      if (e.code === "KeyE") tryZoom();
      if (e.code === "KeyF") {
        if (!e.repeat) zoomFov.current = !zoomFov.current;
        e.preventDefault();
      }
      if (e.code === "KeyC" || e.code === "KeyR") e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
      // C/R release latches the current eye height instead of letting
      // it spring back to EYE_HEIGHT. The latch sticks until movement
      // clears it (see useFrame below) or another posture key takes
      // precedence.
      if (e.code === "KeyC" || e.code === "KeyR") {
        latchedEyeHeight.current = eyeHeight.current;
      }
    };
    // Tap/click on the canvas raycasts the centred crosshair. On
    // desktop we still gate on pointerLockElement so the first click
    // after closing the zoom modal (which re-grabs pointer lock) does
    // not re-trigger a zoom. Touch devices have no pointer lock —
    // their joystick UI lives in DOM siblings that the pointerdown
    // doesn't reach, so any tap on the canvas is intentional.
    const canvas = gl.domElement;
    const pointer = (e: PointerEvent) => {
      if (!enabledRef.current) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.pointerType === "mouse" && !document.pointerLockElement) return;
      tryZoom();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    canvas.addEventListener("pointerdown", pointer);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      canvas.removeEventListener("pointerdown", pointer);
    };
  }, [camera, gl, onZoomRequest]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const dt = Math.min(delta, 0.1);

    // Smoothly damp eye height toward the held-key target. Hold C to
    // drift down toward DUCK, hold R to drift up toward TIPTOE; release
    // and the height latches (see latchedEyeHeight) until the player
    // moves. Lambda is low so the transition feels deliberate (~700ms
    // to reach full crouch/tiptoe) rather than snapping. C wins over
    // R if the player somehow holds both — crouching is the safer
    // default. Updates here so the floor-clamp and stair-Y math below
    // all use the same eyeHeight value the camera will end up rendered
    // at this frame.
    const targetEye = keys.current.KeyC
      ? DUCK_EYE_HEIGHT
      : keys.current.KeyR
        ? TIPTOE_EYE_HEIGHT
        : (latchedEyeHeight.current ?? EYE_HEIGHT);
    eyeHeight.current = THREE.MathUtils.damp(eyeHeight.current, targetEye, 3, dt);

    // FOV zoom toggle. Damp toward the target FOV so the transition
    // feels mechanical rather than instantaneous. Three's PerspectiveCamera
    // exposes both .fov and .updateProjectionMatrix.
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const cam = camera as THREE.PerspectiveCamera;
      const targetFov = zoomFov.current ? FOV_ZOOMED : FOV_DEFAULT;
      const nextFov = THREE.MathUtils.damp(cam.fov, targetFov, 12, dt);
      if (Math.abs(nextFov - cam.fov) > 0.01) {
        cam.fov = nextFov;
        cam.updateProjectionMatrix();
      }
    }

    // Look stick → constant-rate yaw/pitch. We extract the camera's
    // current Euler each frame so PointerLockControls (desktop) and
    // the joystick (mobile) coexist without fighting over a stored
    // look state. Binary above the deadzone: any drag past LOOK_DEADZONE
    // turns at LOOK_SPEED in the stick's direction, so dragging further
    // doesn't accelerate the rotation — fine aim is a short tap, full
    // turn is a sustained hold. Direction is still continuous (any
    // angle around the stick), only magnitude is gated.
    if (joystickLookGetter) {
      const look = joystickLookGetter();
      const lx = look.x / JOYSTICK_MAX_RANGE;
      const ly = look.y / JOYSTICK_MAX_RANGE;
      const lmag = Math.hypot(lx, ly);
      if (lmag > LOOK_DEADZONE) {
        const nx = lx / lmag;
        const ny = ly / lmag;
        _lookEuler.setFromQuaternion(camera.quaternion, "YXZ");
        _lookEuler.y -= nx * LOOK_SPEED * dt;
        _lookEuler.x += ny * LOOK_SPEED * dt;
        if (_lookEuler.x > PITCH_LIMIT) _lookEuler.x = PITCH_LIMIT;
        if (_lookEuler.x < -PITCH_LIMIT) _lookEuler.x = -PITCH_LIMIT;
        _lookEuler.z = 0;
        camera.quaternion.setFromEuler(_lookEuler);
      }
    }

    const running = keys.current.ShiftLeft || keys.current.ShiftRight || false;
    const speed = running ? RUN_SPEED : WALK_SPEED;

    // Reuse module-scope vectors to avoid per-frame GC pressure.
    const forward = _forwardScratch;
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0) forward.normalize();
    const right = _rightScratch.crossVectors(forward, _UP_SCRATCH);
    if (right.lengthSq() > 0) right.normalize();

    const move = _moveScratch.set(0, 0, 0);
    if (keys.current.KeyW || keys.current.ArrowUp) move.add(forward);
    if (keys.current.KeyS || keys.current.ArrowDown) move.sub(forward);
    if (keys.current.KeyD || keys.current.ArrowRight) move.add(right);
    if (keys.current.KeyA || keys.current.ArrowLeft) move.sub(right);

    // Movement stick → contributes to the same `move` vector.
    // Proportional speed: deflection magnitude past MOVE_DEADZONE remaps
    // linearly to a [0, 1] speed scale, so a light drag inches the
    // player forward (great for fine alignment near a painting) and
    // full deflection walks at WALK_SPEED. Look stick stays binary —
    // fine aim there comes from short taps, not partial throw, so the
    // two sticks read differently on purpose. Additive with WASD so an
    // iPad with a Bluetooth keyboard still works either way.
    if (joystickMoveGetter) {
      const m = joystickMoveGetter();
      const mx = m.x / JOYSTICK_MAX_RANGE;
      const my = m.y / JOYSTICK_MAX_RANGE;
      const mmag = Math.hypot(mx, my);
      if (mmag > MOVE_DEADZONE) {
        const fx = my / mmag;
        const sx = mx / mmag;
        // Remap [MOVE_DEADZONE, 1] → [0, 1]; clamp so a fully deflected
        // diagonal (raw mmag up to √2) saturates at full speed instead
        // of overshooting it.
        const t = Math.min(1, (mmag - MOVE_DEADZONE) / (1 - MOVE_DEADZONE));
        move.addScaledVector(forward, fx * t);
        move.addScaledVector(right, sx * t);
      }
    }

    if (move.lengthSq() > 0) {
      // Walking cancels FOV zoom. The zoomed FOV is meant for standing
      // and reading a painting from across the room — once the player
      // starts moving, the narrow field is more disorienting than
      // useful, so drop back to FOV_DEFAULT and let the FOV-damp loop
      // above ease the camera back out over the next ~150 ms.
      zoomFov.current = false;
      // Movement also releases any latched crouch/tiptoe height — the
      // next frame's target falls back to EYE_HEIGHT so the player
      // stands up as they start walking.
      latchedEyeHeight.current = null;
      // Cap magnitude to 1 — diagonal keyboard combined with a fully
      // deflected joystick must not double the speed.
      if (move.lengthSq() > 1) move.normalize();
      move.multiplyScalar(speed * dt);
      const curX = camera.position.x;
      const curZ = camera.position.z;
      const currentStairId = spiralState.current?.staircaseId ?? null;
      const currentCum = spiralState.current?.cumulativeAngle ?? 0;
      const physics = physicsRef.current;
      const feetY = camera.position.y - eyeHeight.current;
      if (physics) {
        const allowed = physics.move(
          { x: curX, y: feetY, z: curZ },
          { x: move.x, y: 0, z: move.z },
        );
        const nx = curX + allowed.x;
        const nz = curZ + allowed.z;
        if (canAcceptPhysicsMove(floor, curX, curZ, nx, nz, currentStairId, currentCum)) {
          camera.position.x = nx;
          camera.position.z = nz;
        }
      } else {
        const nx = curX + move.x;
        const nz = curZ + move.z;
        if (canAcceptPhysicsMove(floor, curX, curZ, nx, nz, currentStairId, currentCum)) {
          camera.position.x = nx;
          camera.position.z = nz;
        } else if (canAcceptPhysicsMove(floor, curX, curZ, nx, curZ, currentStairId, currentCum)) {
          camera.position.x = nx;
        } else if (canAcceptPhysicsMove(floor, curX, curZ, curX, nz, currentStairId, currentCum)) {
          camera.position.z = nz;
        }
      }
    }

    // Vertical physics — on the spiral, derive Y from cumulative angle
    // (continuous across flight boundaries so the player walks one
    // long spiral from floor 0 to the top without per-storey jumps).
    // Off the spiral, normal gravity + floor-plane clamp.
    try {
      let activeStair = findStairAt(floor, camera.position.x, camera.position.z);
      // Fresh activation is height-based now. The physical rail/gate
      // colliders decide whether the player can enter the annulus; the
      // stair state only starts when the visible tread at this angle is
      // actually at the player's feet. That prevents side-entry snaps
      // without another hand-sized angular entrance constant.
      if (
        activeStair &&
        (!spiralState.current || spiralState.current.staircaseId !== activeStair.id)
      ) {
        const feetY = camera.position.y - eyeHeight.current;
        const raw = spiralRawAngle(activeStair, camera.position.x, camera.position.z);
        if (!isAtStairSurface(floor.index, activeStair, raw, feetY)) {
          activeStair = null;
        }
      }
      // Prefer the stair the player is already tracked on, even when
      // both stairsIn and stairsOut overlap the same annulus on this
      // floor — the existing state's stair is the one we want.
      if (spiralState.current) {
        const tracked = allStaircases.find((s) => s.id === spiralState.current!.staircaseId);
        if (tracked && isInsideStair(tracked, camera.position.x, camera.position.z)) {
          activeStair = tracked;
        }
      }

      // Notify host on edge-changes only — same-stair frames are silent
      // so onActiveStairChange isn't a per-frame storm. Edge-fires when
      // entering a stair, leaving one, or stepping from one stair onto
      // another (stair-to-stair transition during continuous descent).
      const newStairId = activeStair?.id ?? null;
      if (newStairId !== lastStairId.current) {
        lastStairId.current = newStairId;
        onActiveStairChange?.(newStairId);
      }

      if (activeStair) {
        const raw = spiralRawAngle(activeStair, camera.position.x, camera.position.z);
        let st = spiralState.current;
        if (!st || st.staircaseId !== activeStair.id) {
          // Stepping onto the spiral fresh. If we're entering at the
          // floor that is this stair's lowerFloor, start at cumulative=0
          // (bottom). If we're entering at upperFloor, start at 2π (top).
          const initial = floor.index === activeStair.upperFloor ? Math.PI * 2 : 0;
          st = { staircaseId: activeStair.id, cumulativeAngle: initial, lastRaw: raw };
          spiralState.current = st;
        } else {
          let d = raw - st.lastRaw;
          if (d > Math.PI) d -= Math.PI * 2;
          if (d < -Math.PI) d += Math.PI * 2;
          st.cumulativeAngle += d;
          st.lastRaw = raw;
        }

        // Stair-to-stair transitions. Walking past the top of this
        // revolution rolls cumulative back to 0 on the next stair up
        // and fires onFloorChange(upperFloor); walking past the bottom
        // rolls it forward to 2π on the stair below and fires
        // onFloorChange(lowerFloor). When there's no next/prev stair
        // (top of building or ground floor) we clamp AND emit a
        // matching floor change so the player's `floor` prop is always
        // the one whose Y matches their feet by the time they exit.
        while (st.cumulativeAngle >= Math.PI * 2) {
          const next = findStairAbove(activeStair, allStaircases);
          if (!next) {
            st.cumulativeAngle = Math.PI * 2;
            if (onFloorChange && floor.index !== activeStair.upperFloor) {
              onFloorChange(activeStair.upperFloor);
            }
            break;
          }
          st.staircaseId = next.id;
          st.cumulativeAngle -= Math.PI * 2;
          activeStair = next;
          if (onFloorChange && floor.index !== next.lowerFloor) {
            onFloorChange(next.lowerFloor);
          }
        }
        while (st.cumulativeAngle <= 0) {
          if (st.cumulativeAngle === 0) {
            if (onFloorChange && floor.index !== activeStair.lowerFloor) {
              onFloorChange(activeStair.lowerFloor);
            }
            break;
          }
          const prev = findStairBelow(activeStair, allStaircases);
          if (!prev) {
            st.cumulativeAngle = 0;
            if (onFloorChange && floor.index !== activeStair.lowerFloor) {
              onFloorChange(activeStair.lowerFloor);
            }
            break;
          }
          st.staircaseId = prev.id;
          st.cumulativeAngle += Math.PI * 2;
          activeStair = prev;
          if (onFloorChange && floor.index !== prev.upperFloor) {
            onFloorChange(prev.upperFloor);
          }
        }

        // Promote floor.index as soon as the player enters a landing arc
        // — the same arc canStepTo permits exit in. Without this, an
        // exit at the upper landing (cumulative ≈ 2π−ε) would still be
        // checked against the LOWER floor's grid; the player would step
        // onto a "walkable" stairwell cell at the lower floor while
        // their visual Y is already through the cutout, then gravity
        // would yank them down through the upper floor's annular ring.
        // handleStairFloorChange short-circuits same-floor calls so
        // firing this every frame in the arc is cheap.
        // The descent branch uses STAIR_DESCEND_EARLY_ENTRY (⅔·2π) so
        // the destination floor activates a third of the way down,
        // making arrival feel like entering a live room. Ascent keeps
        // the tight landing tolerance — there's no equivalent ask for
        // it, and "wake the upstairs early" interacts oddly with the
        // canStepTo gate that the comment above is about.
        if (onFloorChange) {
          if (
            st.cumulativeAngle >= Math.PI * 2 - STAIR_LANDING_TOL &&
            floor.index !== activeStair.upperFloor
          ) {
            onFloorChange(activeStair.upperFloor);
          } else if (
            st.cumulativeAngle <= STAIR_DESCEND_EARLY_ENTRY &&
            floor.index !== activeStair.lowerFloor
          ) {
            onFloorChange(activeStair.lowerFloor);
          }
        }

        const targetY = stairHeightAt(activeStair, st.cumulativeAngle) + eyeHeight.current;
        camera.position.y = THREE.MathUtils.damp(camera.position.y, targetY, 20, dt);
        velocityY.current = 0;
        grounded.current = true;
      } else {
        spiralState.current = null;
        velocityY.current -= GRAVITY * dt;
        camera.position.y += velocityY.current * dt;
        const floorHeight = floor.y + eyeHeight.current;
        if (camera.position.y <= floorHeight) {
          camera.position.y = floorHeight;
          velocityY.current = 0;
          grounded.current = true;
        } else {
          grounded.current = false;
        }
      }
    } catch (err) {
      // Malformed staircase/floor layout shouldn't kill the render
      // loop — log once per session, reset spiral state so the next
      // frame retries from scratch, and let the rest of useFrame
      // (aim, room change, position sample) keep running.
      if (!spiralCalcWarned.current) {
        spiralCalcWarned.current = true;
        console.warn("[player] spiral calc failed", err);
      }
      spiralState.current = null;
    }

    // Staircase-proximity edge detector. Walks current-floor stairs
    // and picks the nearest one whose XZ centre is within
    // STAIR_PROXIMITY_RADIUS. Edge-fires on entering/leaving any zone,
    // or when crossing from one stair's zone into another's. Same-id
    // frames are silent so the host's preload kickoff effect only runs
    // once per approach. Cheap: a floor has at most a handful of
    // stairs, and the per-stair check is two subtractions + a squared
    // length.
    if (onNearbyStairChange) {
      let nearestId: string | null = null;
      let nearestDistSq = STAIR_PROXIMITY_RADIUS_SQ;
      const cx = camera.position.x;
      const cz = camera.position.z;
      for (const s of floor.stairsOut) {
        const dx = cx - s.centerX;
        const dz = cz - s.centerZ;
        const d2 = dx * dx + dz * dz;
        if (d2 < nearestDistSq) {
          nearestDistSq = d2;
          nearestId = s.id;
        }
      }
      for (const s of floor.stairsIn) {
        const dx = cx - s.centerX;
        const dz = cz - s.centerZ;
        const d2 = dx * dx + dz * dz;
        if (d2 < nearestDistSq) {
          nearestDistSq = d2;
          nearestId = s.id;
        }
      }
      if (nearestId !== lastNearbyStairId.current) {
        lastNearbyStairId.current = nearestId;
        onNearbyStairChange(nearestId);
      }
    }

    if (onPositionSample) {
      // Map-space yaw: atan2(fz, fx) where (fx, fz) is the horizontal
      // forward vector. On the minimap +x is right, +z is down, so this
      // angle tells the arrow which way to point directly.
      const yaw = Math.atan2(forward.z, forward.x);
      onPositionSample(camera.position.x, camera.position.z, yaw);
    }

    // Throttled aim raycast for the inspect-cursor affordance. ~10 Hz
    // (every 6 frames at 60 fps) is indistinguishable from real-time and
    // keeps the per-frame work tiny — painting-registry already
    // distance/forward-dot prefilters, so the actual ray test runs
    // against the handful of paintings plausibly in the player's path.
    if (onAimChange) {
      aimFrameCount.current = (aimFrameCount.current + 1) % 6;
      if (aimFrameCount.current === 0) {
        camera.getWorldPosition(rayOrigin.current);
        camera.getWorldDirection(rayDir.current);
        aimRaycaster.current.set(rayOrigin.current, rayDir.current);
        const aimed = raycastNearestPainting(
          aimRaycaster.current,
          rayOrigin.current,
          rayDir.current,
          AIM_MAX_DIST,
        );
        if (aimed !== aimLast.current) {
          aimLast.current = aimed;
          onAimChange(aimed);
        }
      }
    }

    // Active-room detection — emit a callback when the owner cell changes.
    if (onRoomChange) {
      const cx = Math.floor(camera.position.x / CELL_SIZE);
      const cz = Math.floor(camera.position.z / CELL_SIZE);
      if (cx >= 0 && cx < floor.gridSize.x && cz >= 0 && cz < floor.gridSize.z) {
        const owner = floor.cellOwner[cz * floor.gridSize.x + cx];
        if (owner !== lastRoomIdx.current) {
          lastRoomIdx.current = owner;
          onRoomChange(owner);
        }
      }
    }
  });

  return null;
}

/** Return any staircase whose annulus contains (worldX, worldZ).
 *  When both stairsIn (descent) and stairsOut (ascent) overlap the
 *  same annulus, prefer the one whose upper/lower end matches this
 *  floor — i.e. on floor i pick stair S_i (ascending) by default; the
 *  spiral physics will transition to S_{i-1} via the stair-to-stair
 *  rollover when the player walks descending past cumulative=0. */
function findStairAt(floor: FloorLayout, worldX: number, worldZ: number): Staircase | null {
  for (const s of floor.stairsOut) {
    if (isInsideStair(s, worldX, worldZ)) return s;
  }
  for (const s of floor.stairsIn) {
    if (isInsideStair(s, worldX, worldZ)) return s;
  }
  return null;
}

function isAtStairSurface(
  floorIndex: number,
  stair: Staircase,
  rawAngle: number,
  feetY: number,
): boolean {
  const stepRise = (stair.upperY - stair.lowerY) / stair.numSteps;
  const stepAngle = (Math.PI * 2) / stair.numSteps;
  const tolerance = stepRise * 1.75;
  const surfaceY =
    floorIndex === stair.upperFloor && rawAngle < stepAngle * 1.5
      ? stair.upperY
      : stairHeightAt(stair, rawAngle);
  return Math.abs(surfaceY - feetY) <= tolerance;
}

/** True if the grid cell at (worldX, worldZ) is walkable for a player of
 *  PLAYER_RADIUS — i.e. none of the four corners of the player's bbox
 *  lie in a non-walkable cell. Keeps the player's silhouette out of
 *  wall planes. */
function isWalkable(floor: FloorLayout, worldX: number, worldZ: number): boolean {
  const r = PLAYER_RADIUS;
  const corners: Array<[number, number]> = [
    [worldX - r, worldZ - r],
    [worldX + r, worldZ - r],
    [worldX - r, worldZ + r],
    [worldX + r, worldZ + r],
  ];
  for (const [x, z] of corners) {
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    if (cx < 0 || cx >= floor.gridSize.x) return false;
    if (cz < 0 || cz >= floor.gridSize.z) return false;
    if (floor.walkable[cz * floor.gridSize.x + cx] !== 1) return false;
  }
  return true;
}

/** Sanity gate after Rapier computes slide movement.
 *
 *  Real colliders own walls, rails, posts, signs, columns, and top
 *  landing edges. This predicate only preserves layout invariants that
 *  are not yet represented as full walkable-surface physics: grid
 *  membership for normal floors and the "don't step off a spiral
 *  mid-flight through a rail gap" rule. */
function canAcceptPhysicsMove(
  floor: FloorLayout,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  currentStairId: string | null,
  currentCum: number,
): boolean {
  const stair = findStairAt(floor, toX, toZ);
  if (stair) return true;
  if (currentStairId !== null) {
    // Trying to leave the spiral. Allow only when the player's
    // cumulative is in a "landing" arc near 0 or 2π — the heights
    // where stepping off lands them flush with a real floor.
    const onLowerLanding = currentCum <= STAIR_LANDING_TOL;
    const onUpperLanding = currentCum >= Math.PI * 2 - STAIR_LANDING_TOL;
    if (!onLowerLanding && !onUpperLanding) return false;
  }
  if (!isWalkable(floor, toX, toZ)) return false;
  if (!canCrossEdges(floor, fromX, fromZ, toX, toZ)) return false;
  return true;
}

/** Walk every cell-boundary edge the player's bbox sweeps through and
 *  reject if any of them is wall-blocked. Splits the move into single
 *  cell-boundary crossings so a fast diagonal step can't slip through
 *  a corner.
 *
 *  Also rejects destinations whose bbox already STRADDLES a blocked
 *  edge — without this, a player standing inside a doorway (bbox
 *  spans the door's two cells, edge between them is the door = open)
 *  could slide sideways one cell and end up straddling the adjacent
 *  solid wall: no cell-x changes, the move is "free", but the bbox
 *  is now half inside the wall. The straddle check is the post-step
 *  invariant that makes such positions unreachable in the first place. */
function canCrossEdges(
  floor: FloorLayout,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): boolean {
  const r = PLAYER_RADIUS;
  // Check both leading edges of the player's bbox along each axis: a
  // step from (fromX, fromZ) to (toX, toZ) crosses an EW edge iff
  // some corner's cell-x changes; same for NS.
  const fromCellsX = [Math.floor((fromX - r) / CELL_SIZE), Math.floor((fromX + r) / CELL_SIZE)];
  const toCellsX = [Math.floor((toX - r) / CELL_SIZE), Math.floor((toX + r) / CELL_SIZE)];
  const fromCellsZ = [Math.floor((fromZ - r) / CELL_SIZE), Math.floor((fromZ + r) / CELL_SIZE)];
  const toCellsZ = [Math.floor((toZ - r) / CELL_SIZE), Math.floor((toZ + r) / CELL_SIZE)];

  // Destination straddle check — if the bbox at (toX, toZ) spans two
  // adjacent cells, the edge between them must not be blocked.
  if (toCellsX[0] !== toCellsX[1]) {
    const xx = toCellsX[0];
    if (xx >= 0 && xx < floor.gridSize.x - 1) {
      for (const cz of [toCellsZ[0], toCellsZ[1]]) {
        if (cz < 0 || cz >= floor.gridSize.z) continue;
        if (floor.blockedEdgesEW[cz * (floor.gridSize.x - 1) + xx]) return false;
      }
    }
  }
  if (toCellsZ[0] !== toCellsZ[1]) {
    const zz = toCellsZ[0];
    if (zz >= 0 && zz < floor.gridSize.z - 1) {
      for (const cx of [toCellsX[0], toCellsX[1]]) {
        if (cx < 0 || cx >= floor.gridSize.x) continue;
        if (floor.blockedEdgesNS[zz * floor.gridSize.x + cx]) return false;
      }
    }
  }

  // EW edge crossings — for each (front, back) corner pair, if the
  // x-cell changes, the player crosses an EW edge between min and max.
  for (let i = 0; i < 2; i++) {
    const fcx = fromCellsX[i];
    const tcx = toCellsX[i];
    if (fcx === tcx) continue;
    // Z-cells the player straddles after the move (use its bbox).
    for (const cz of [toCellsZ[0], toCellsZ[1]]) {
      if (cz < 0 || cz >= floor.gridSize.z) continue;
      const lo = Math.min(fcx, tcx);
      const hi = Math.max(fcx, tcx);
      for (let xx = lo; xx < hi; xx++) {
        if (xx < 0 || xx >= floor.gridSize.x - 1) continue;
        if (floor.blockedEdgesEW[cz * (floor.gridSize.x - 1) + xx]) return false;
      }
    }
  }
  // NS edge crossings.
  for (let i = 0; i < 2; i++) {
    const fcz = fromCellsZ[i];
    const tcz = toCellsZ[i];
    if (fcz === tcz) continue;
    for (const cx of [toCellsX[0], toCellsX[1]]) {
      if (cx < 0 || cx >= floor.gridSize.x) continue;
      const lo = Math.min(fcz, tcz);
      const hi = Math.max(fcz, tcz);
      for (let zz = lo; zz < hi; zz++) {
        if (zz < 0 || zz >= floor.gridSize.z - 1) continue;
        if (floor.blockedEdgesNS[zz * floor.gridSize.x + cx]) return false;
      }
    }
  }
  return true;
}
