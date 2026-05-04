"use client";

import { useFrame, useThree } from "@react-three/fiber";
import type { JoystickOnMove } from "joystick-controller";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Artwork } from "@/lib/data";
import type { FloorLayout, Staircase } from "@/lib/gallery-layout/types";
import {
  CELL_SIZE,
  SPIRAL_COLUMN_RADIUS,
  SPIRAL_FLOOR_CUTOUT_RADIUS,
} from "@/lib/gallery-layout/world-coords";
import { raycastNearestPainting } from "./painting-registry";
import { RAIL_BAR_HALF_WIDTH } from "./rail-constants";
import {
  findStairAbove,
  findStairBelow,
  isInsideStair,
  spiralGateHalfArc,
  spiralRawAngle,
  stairHeightAt,
} from "./staircase";
import { CUTOUT_RAIL_RADIUS } from "./stairwell-rail";

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
// Radial buffer inside the spiral annulus — keeps the player's bbox
// clear of the inner and outer railings while walking on the steps.
// The rails are at innerRadius + RAIL_BAR_HALF_WIDTH (centre) with the
// same radial half-width as the cross-section — i.e. the rail's near
// face sits 2 × RAIL_BAR_HALF_WIDTH inside the annulus on each side,
// with the rail's far face flush with the step edge. Adding
// PLAYER_RADIUS plus a 0.23 m elbow gives 0.63 m of total clearance —
// enough to keep the bbox out of either rail without shrinking the
// walking strip uncomfortably.
const SPIRAL_RAIL_CLEARANCE = 2 * RAIL_BAR_HALF_WIDTH + PLAYER_RADIUS + 0.23;
// Same idea on the OUTSIDE of the spiral — the cutout-edge railing
// (the floor-level circular rail around the stairwell hole on floors
// above the ground) sits at CUTOUT_RAIL_RADIUS with the same
// RAIL_BAR_HALF_WIDTH cross-section. Block any target whose centre
// would put the player's bbox into that rail tube. The cutout-edge
// rail has the same gate gap as the spiral's outer rail, so the
// constraint is dropped inside the gate arc to let the player walk
// through. 0.55 m of elbow past the rail's near face means the camera
// stays a comfortable shoulder's width from the brass tube when the
// player walks the stairwell room — no more nose-to-rail glitching on
// approach. Inner bound is constrained so it can never blot out the
// spiral walking annulus (see the off-spiral guard in canStepTo).
const CUTOUT_RAIL_INNER_BOUND = CUTOUT_RAIL_RADIUS - RAIL_BAR_HALF_WIDTH - PLAYER_RADIUS - 0.55;
const CUTOUT_RAIL_OUTER_BOUND = CUTOUT_RAIL_RADIUS + RAIL_BAR_HALF_WIDTH + PLAYER_RADIUS + 0.55;
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
// Width of the "you're at a real floor" arc at each end of a spiral
// revolution. Stepping off the spiral (canStepTo's exit branch) is only
// allowed inside one of these arcs, AND the player's `floor.index` is
// promoted to the destination floor when they enter one — without that
// promotion an upper-landing exit would teleport them into the lower
// floor's grid frame and they'd fall through the upper floor's annular
// ring on the way down. Tied to ~28° of revolution = ~0.49 m of vertical
// slack at FLOOR_SEPARATION = 6.12 m.
const STAIR_LANDING_TOL = 0.5;
const _lookEuler = new THREE.Euler(0, 0, 0, "YXZ");
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
  /** Called with an Artwork when the player clicks/aims at a painting,
   *  so the host can open an inspect/zoom overlay. */
  onZoomRequest?: (artwork: Artwork) => void;
  /** Fires when the painting under the crosshair changes (or null when
   *  none is in range). Throttled to ~10 Hz inside this component;
   *  consumers can use it to swap the crosshair to a magnifying-glass
   *  affordance and show a "Press E to inspect" hint. */
  onAimChange?: (artwork: Artwork | null) => void;
  /** Fires when the player steps on / off a spiral staircase. Lets the
   *  host preload the connected floor's full geometry while the player
   *  is on the stair, so the room they're descending into is already
   *  rendered when they get there — without it the next floor mounts
   *  only its stairwell when the player crosses the boundary, leaving
   *  black bands at the slab edge mid-descent. Stair id, not the whole
   *  Staircase object, so identity comparison is cheap. */
  onActiveStairChange?: (stairId: string | null) => void;
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
  const velocityY = useRef(0);
  const grounded = useRef(true);
  const lastRoomIdx = useRef<number>(-2);
  /** F toggles a narrowed-FOV "partial zoom" so the player can read
   *  details on a painting without opening the modal — useful for
   *  large works where the inspect overlay isn't worth invoking. */
  const zoomFov = useRef(false);
  /** Smoothed eye height — damps toward the target posture height each
   *  frame. C held → drifts down toward DUCK_EYE_HEIGHT; R held → drifts
   *  up toward TIPTOE_EYE_HEIGHT; release returns to EYE_HEIGHT. Starts
   *  at full standing height so spawn matches what the camera Y is set
   *  to in useEffect. */
  const eyeHeight = useRef(EYE_HEIGHT);
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
  const aimLast = useRef<Artwork | null>(null);
  const lastStairId = useRef<string | null>(null);
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

  useEffect(() => {
    camera.position.set(spawnAt[0], spawnAt[1] + EYE_HEIGHT, spawnAt[2]);
    // Face north (-Z) toward the stairwell room. Each floor's anchor
    // sits directly south of the central spiral, so on spawn the player
    // is looking straight at the stairs they can climb up to the next
    // era — sets the orientation for the rest of the visit.
    camera.lookAt(spawnAt[0], spawnAt[1] + EYE_HEIGHT, spawnAt[2] - 5);
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
      if (!enabled) return;
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
    };
    // Tap/click on the canvas raycasts the centred crosshair. On
    // desktop we still gate on pointerLockElement so the first click
    // after closing the zoom modal (which re-grabs pointer lock) does
    // not re-trigger a zoom. Touch devices have no pointer lock —
    // their joystick UI lives in DOM siblings that the pointerdown
    // doesn't reach, so any tap on the canvas is intentional.
    const canvas = gl.domElement;
    const pointer = (e: PointerEvent) => {
      if (!enabled) return;
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
  }, [enabled, camera, gl, onZoomRequest]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const dt = Math.min(delta, 0.1);

    // Smoothly damp eye height toward the held-key target. Hold C to
    // drift down toward DUCK, hold R to drift up toward TIPTOE; release
    // both and the camera rises back to EYE_HEIGHT. Lambda is low so the
    // transition feels deliberate (~700ms to reach full crouch/tiptoe)
    // rather than snapping. C wins over R if the player somehow holds
    // both — crouching is the safer default. Updates here so the
    // floor-clamp and stair-Y math below all use the same eyeHeight
    // value the camera will end up rendered at this frame.
    const targetEye = keys.current.KeyC
      ? DUCK_EYE_HEIGHT
      : keys.current.KeyR
        ? TIPTOE_EYE_HEIGHT
        : EYE_HEIGHT;
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

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0) forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() > 0) right.normalize();

    const move = new THREE.Vector3();
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
      // Cap magnitude to 1 — diagonal keyboard combined with a fully
      // deflected joystick must not double the speed.
      if (move.lengthSq() > 1) move.normalize();
      move.multiplyScalar(speed * dt);
      const curX = camera.position.x;
      const curZ = camera.position.z;
      const nx = curX + move.x;
      const nz = curZ + move.z;

      // Collision model:
      //  - The spiral annulus passes always when entering, so the
      //    player can step onto the on-ramp from any direction.
      //  - LEAVING the spiral is gated on cumulative ≈ 0 / 2π — the
      //    player has to be at a real floor's height to step off,
      //    otherwise canStepTo refuses (no more "beam up/down" when
      //    they wander out mid-flight).
      //  - Otherwise the grid mask + per-edge wall mask decides.
      const currentStairId = spiralState.current?.staircaseId ?? null;
      const currentCum = spiralState.current?.cumulativeAngle ?? 0;
      const playerHeadY = camera.position.y;
      if (canStepTo(floor, curX, curZ, nx, nz, currentStairId, currentCum, playerHeadY)) {
        camera.position.x = nx;
        camera.position.z = nz;
      } else if (canStepTo(floor, curX, curZ, nx, curZ, currentStairId, currentCum, playerHeadY)) {
        camera.position.x = nx;
      } else if (canStepTo(floor, curX, curZ, curX, nz, currentStairId, currentCum, playerHeadY)) {
        camera.position.z = nz;
      } else {
        // Capsule-style tangent slide for the circular obstacles
        // (spiral railings, well cutouts, central column). Axis-aligned
        // slide can't help there — moving in either X or Z keeps the
        // player inside the forbidden ring. Project the desired move
        // onto the tangent at the player's angular position around the
        // nearest blocking spiral, and step that way instead. Without
        // this, walking into the inner spiral railing or the cutout
        // edge feels like hitting fly paper.
        const slid = trySlideAroundCircles(
          floor,
          curX,
          curZ,
          nx,
          nz,
          currentStairId,
          currentCum,
          playerHeadY,
        );
        if (slid) {
          camera.position.x = slid.x;
          camera.position.z = slid.z;
        }
      }
    }

    // Vertical physics — on the spiral, derive Y from cumulative angle
    // (continuous across flight boundaries so the player walks one
    // long spiral from floor 0 to the top without per-storey jumps).
    // Off the spiral, normal gravity + floor-plane clamp.
    let activeStair = findStairAt(floor, camera.position.x, camera.position.z);
    // FRESH activation requires entering through the gate angularly —
    // the spiral has a single physical entry/exit at `entryAngle` (the
    // bottom step on the lower floor, the top step on the upper floor).
    // Without this gate, walking into the annulus at the side (easy on
    // the ground floor where the stairwell room has no cutout, so the
    // floor cells under the spiral are walkable) would snap the player
    // onto cumulative=0 — the bottom-step Y — at an angular position
    // where the visible tread is several steps higher up. The "walk
    // in, walk left, climb without ever being on the stairs" bug.
    // Once already on the spiral the gate check is skipped, so the
    // player walks the full revolution to climb.
    if (
      activeStair &&
      (!spiralState.current || spiralState.current.staircaseId !== activeStair.id)
    ) {
      const dx = camera.position.x - activeStair.centerX;
      const dz = camera.position.z - activeStair.centerZ;
      const theta = Math.atan2(dz, dx);
      const angDiff = Math.atan2(
        Math.sin(theta - activeStair.entryAngle),
        Math.cos(theta - activeStair.entryAngle),
      );
      if (Math.abs(angDiff) >= spiralGateHalfArc(activeStair.numSteps)) {
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
      if (onFloorChange) {
        if (
          st.cumulativeAngle >= Math.PI * 2 - STAIR_LANDING_TOL &&
          floor.index !== activeStair.upperFloor
        ) {
          onFloorChange(activeStair.upperFloor);
        } else if (
          st.cumulativeAngle <= STAIR_LANDING_TOL &&
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

/** Capsule-style slide around the spiral's circular obstacles. When the
 *  diagonal step AND both axis-aligned axis slides all fail, the
 *  blocking thing is usually a railing, the cutout edge, or the central
 *  column — none of which has a useful axis-aligned tangent. Project
 *  the desired move onto the tangent at the player's current angular
 *  position around each spiral and try the closest projection that's
 *  walkable. Returns the slid position, or null if no spiral is in
 *  range / no projection is valid. */
function trySlideAroundCircles(
  floor: FloorLayout,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  currentStairId: string | null,
  currentCum: number,
  playerHeadY: number,
): { x: number; z: number } | null {
  const moveX = toX - fromX;
  const moveZ = toZ - fromZ;
  if (moveX * moveX + moveZ * moveZ < 1e-6) return null;

  let bestX = fromX;
  let bestZ = fromZ;
  let bestDistSq = 0;

  for (const s of [...floor.stairsOut, ...floor.stairsIn]) {
    const dx = fromX - s.centerX;
    const dz = fromZ - s.centerZ;
    const r2 = dx * dx + dz * dz;
    // Only consider spirals whose blocking rings are remotely near
    // the player — a spiral on the far side of the floor has nothing
    // to do with the current move.
    const reach = Math.max(s.outerRadius, CUTOUT_RAIL_OUTER_BOUND) + 1;
    if (r2 > reach * reach) continue;

    // Tangent at the player's angular position around this spiral.
    const norm = Math.atan2(dz, dx);
    const tx = -Math.sin(norm);
    const tz = Math.cos(norm);

    const dot = moveX * tx + moveZ * tz;
    if (Math.abs(dot) < 1e-6) continue;
    const slideX = fromX + tx * dot;
    const slideZ = fromZ + tz * dot;
    if (!canStepTo(floor, fromX, fromZ, slideX, slideZ, currentStairId, currentCum, playerHeadY))
      continue;

    const dxSlide = slideX - fromX;
    const dzSlide = slideZ - fromZ;
    const distSq = dxSlide * dxSlide + dzSlide * dzSlide;
    if (distSq > bestDistSq) {
      bestDistSq = distSq;
      bestX = slideX;
      bestZ = slideZ;
    }
  }

  return bestDistSq > 0 ? { x: bestX, z: bestZ } : null;
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

/** Top-level predicate used by movement.
 *
 *  - Stepping ONTO the spiral always passes — the cumulative-angle
 *    init in useFrame snaps the player's Y to the right floor.
 *  - Stepping OFF the spiral (target outside the annulus while
 *    `currentStairId` is set) only passes if the player is at a real
 *    floor's height — i.e. cumulative is near 0 (lower floor) or near
 *    2π (upper floor). Mid-flight exit is blocked, which is what
 *    kills the old "beam up/down to the wrong floor" bug when the
 *    player wandered off mid-spiral.
 *  - Off the spiral, the grid mask + per-edge wall mask decide. */
function canStepTo(
  floor: FloorLayout,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  currentStairId: string | null,
  currentCum: number,
  /** World Y of the player's head (camera position). Used by the
   *  spiral-rail clearance to skip blocking when the helix at this
   *  angular position has risen above the player — they can walk
   *  under freely (especially important on the ground floor where
   *  the cutout-edge perimeter rail isn't there to fence the well). */
  playerHeadY: number,
): boolean {
  // Central column guard — the stone spine sits at every spiral's
  // centre (SPIRAL_COLUMN_RADIUS). Block targets whose centre lands
  // inside the column plus a player-radius buffer; on upper floors
  // this is mostly redundant with the open-well guard below, but on
  // the ground floor the well is walkable and the column is the
  // only thing in there.
  const columnBlockR = SPIRAL_COLUMN_RADIUS + PLAYER_RADIUS;
  for (const s of [...floor.stairsOut, ...floor.stairsIn]) {
    const dx = toX - s.centerX;
    const dz = toZ - s.centerZ;
    if (dx * dx + dz * dz < columnBlockR * columnBlockR) return false;
  }
  // Open-well guard. On every floor above the ground there's a
  // circular hole in the stairwell floor exposing the spiral going
  // down; the cells inside that hole are still flagged walkable in
  // the cell mask, so without an explicit check the player would
  // happily walk over the abyss. Block any target inside the
  // central well (radius < spiral inner radius) on those floors —
  // including when stepping off the spiral inward at a landing,
  // which would otherwise drop the player straight through the cutout.
  // Same pass also enforces the cutout-edge rail clearance: those
  // rails ring the cutout on every upper floor, with the same gate
  // gap as the spiral's outer rail, so we keep the player's bbox out
  // of the rail tube outside the gate window.
  if (floor.index > 0) {
    // Floor-level dead-end booleans. The gate gap in the cutout rail
    // is shared between two halves: the "up" half (CCW from entry,
    // angDiff > 0) is only meaningful when this floor has a stair
    // going further up; same for "down" with stairsIn. On the top
    // floor, stairsOut is empty so the up half is a dead end and the
    // gate must close it. On the ground floor, stairsIn is empty so
    // the down half is the dead end. Aggregating across all spirals on
    // the floor (all sharing the same central well) keeps this stable
    // when multiple stairs stack at the same XZ.
    const upHalfHasStair = floor.stairsOut.length > 0;
    const downHalfHasStair = floor.stairsIn.length > 0;
    for (const s of [...floor.stairsOut, ...floor.stairsIn]) {
      const dx = toX - s.centerX;
      const dz = toZ - s.centerZ;
      const r2 = dx * dx + dz * dz;
      if (r2 < s.innerRadius * s.innerRadius) return false;
      // Cutout-ring guard. The visible floor cutout extends beyond the
      // spiral's outer step edge to SPIRAL_FLOOR_CUTOUT_RADIUS — the
      // thin annulus between (outerRadius, cutoutRadius) is over the
      // open well even though the underlying grid cells are still
      // flagged walkable. Without this, a player exiting the spiral
      // through the gate window can briefly stand over the hole. Same
      // bug as the original "fall through the floor" report, repeated
      // for the gate-window case after the inner guard wasn't enough.
      if (
        r2 > s.outerRadius * s.outerRadius &&
        r2 < SPIRAL_FLOOR_CUTOUT_RADIUS * SPIRAL_FLOOR_CUTOUT_RADIUS
      ) {
        return false;
      }
      // Cutout-edge rail collision only applies off the spiral —
      // the spiral physics owns clearance from its own inner/outer
      // rails, and the cutout-rail elbow is intentionally large
      // enough that without this guard it could blot out part of
      // the spiral's walking annulus.
      if (
        r2 > s.outerRadius * s.outerRadius &&
        r2 < CUTOUT_RAIL_OUTER_BOUND * CUTOUT_RAIL_OUTER_BOUND &&
        r2 > CUTOUT_RAIL_INNER_BOUND * CUTOUT_RAIL_INNER_BOUND
      ) {
        const theta = Math.atan2(dz, dx);
        const gateHalfArc = spiralGateHalfArc(s.numSteps);
        const angDiff = Math.atan2(Math.sin(theta - s.entryAngle), Math.cos(theta - s.entryAngle));
        const inUpHalf = angDiff > 0;
        const halfHasStair = inUpHalf ? upHalfHasStair : downHalfHasStair;
        if (Math.abs(angDiff) >= gateHalfArc || !halfHasStair) return false;
      }
    }
  }
  const stair = findStairAt(floor, toX, toZ);
  if (stair) {
    // On the spiral the inner and outer railings ring the steps
    // close enough that the player's bbox would clip through them
    // at the annulus edges. Constrain the player's centre to a
    // narrower walking annulus that keeps their bbox a finger's
    // width clear of both rails. The OUTER rail has a gate gap
    // around the entry direction (so the player can step on/off
    // the spiral); inside the gap the outer constraint is dropped,
    // otherwise the player could enter the spiral but never leave.
    //
    // Y-aware bypass: the spiral helix rises one full storey per
    // revolution, so at angular positions far from the entry the
    // step (and the rails sitting 1.05 m above it) is metres above
    // the player's head — they can walk under freely. Only enforce
    // when the step at this angular position is at or below head.
    // Without this gate, walking around the back of the spiral on
    // the ground floor (where the cutout-edge perimeter rail isn't
    // there either, since there's no cutout) feels like hitting an
    // invisible wall — the collision is for an overhead rail nobody
    // would visually expect to block them.
    const dx = toX - stair.centerX;
    const dz = toZ - stair.centerZ;
    const r2 = dx * dx + dz * dz;
    const cumAngle = spiralRawAngle(stair, toX, toZ);
    const tGlobal = cumAngle / (Math.PI * 2);
    const stepY = stair.lowerY + tGlobal * (stair.upperY - stair.lowerY);
    const stepIsOverhead = stepY >= playerHeadY;
    const theta = Math.atan2(dz, dx);
    const gateHalfArc = spiralGateHalfArc(stair.numSteps);
    const angDiff = Math.atan2(
      Math.sin(theta - stair.entryAngle),
      Math.cos(theta - stair.entryAngle),
    );
    const inGate = Math.abs(angDiff) < gateHalfArc;
    if (!stepIsOverhead) {
      const minR = stair.innerRadius + SPIRAL_RAIL_CLEARANCE;
      if (r2 < minR * minR) return false;
      if (!inGate) {
        const maxR = stair.outerRadius - SPIRAL_RAIL_CLEARANCE;
        if (r2 > maxR * maxR) return false;
      }
    }
    return true;
  }
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
