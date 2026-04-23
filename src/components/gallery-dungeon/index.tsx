"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import type { Artwork } from "@/lib/data";
import { layoutDungeon } from "@/lib/gallery-layout/layout-dungeon";
import type { FloorLayout } from "@/lib/gallery-layout/types";

import { RoomGeometry } from "./room-geometry";
import { HallwayRenderer } from "./hallway";
import { Player } from "./player";
import { StaircaseRenderer } from "./staircase";

type Props = { artworks: Artwork[] };

/**
 * M3 prototype: all 7 floors stacked on Y, but only one is mounted +
 * walkable at a time. Keys 1..7 teleport the player between floors.
 * Staircases and cross-floor walking land in M4.
 */
export function GalleryDungeon({ artworks }: Props) {
  const layout = useMemo(() => layoutDungeon(artworks), [artworks]);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentFloorIdx, setCurrentFloorIdx] = useState(
    layout.entry.floorIndex,
  );
  const [activeRoomIdx, setActiveRoomIdx] = useState<number>(-1);

  const currentFloor = layout.floors[currentFloorIdx];
  const activeRoom =
    activeRoomIdx >= 0 ? currentFloor.rooms[activeRoomIdx] : undefined;

  // Spawn point driver. Default: entry on floor 0. Teleport keys
  // overwrite this to the anchor of the target floor. Stair-driven
  // floor changes set it to the *current* XZ so the player continues
  // walking where they were, with Y matched to the new floor.
  const spawnForFloor = useRef<[number, number, number]>(
    layout.entry.worldPosition,
  );
  // Player preserves its last camera XZ so we can read it when stairs
  // trigger a floor swap.
  const lastCameraRef = useRef<{ x: number; z: number } | null>(null);

  const teleportToFloor = (idx: number) => {
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
  };

  const handleStairFloorChange = (newIdx: number) => {
    if (newIdx === currentFloorIdx) return;
    // Stair-driven swap: do NOT touch spawnForFloor — that would trigger
    // Player's spawn effect and teleport the camera. Just change which
    // floor's layout informs collision/rendering. The staircase
    // geometry is the same on both floors (it's the same Staircase
    // object, referenced from stairsOut on the lower floor and
    // stairsIn on the upper), so the player keeps riding it smoothly.
    setCurrentFloorIdx(newIdx);
    setActiveRoomIdx(-1);
  };

  // Debug 1..7 teleport keys.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code.startsWith("Digit")) {
        const digit = parseInt(e.code.slice(5), 10);
        const idx = digit - 1;
        if (Number.isInteger(idx) && idx >= 0 && idx < layout.floors.length) {
          teleportToFloor(idx);
        }
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

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
        <hemisphereLight
          args={["#fff3d0", "#1a120b", 0.45]}
          position={[0, 20, 0]}
        />

        <FloorScene
          floor={currentFloor}
          activeRoomIdx={activeRoomIdx}
        />

        <Player
          enabled={hasStarted}
          floor={currentFloor}
          spawnAt={spawnForFloor.current}
          onRoomChange={setActiveRoomIdx}
          onFloorChange={handleStairFloorChange}
          onPositionSample={(x, z) => {
            lastCameraRef.current = { x, z };
          }}
        />
        {hasStarted && <PointerLockControls />}
      </Canvas>

      {!hasStarted && (
        <div
          onClick={() => setHasStarted(true)}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-neutral-100 cursor-pointer"
        >
          <h1 className="text-3xl font-semibold mb-2">
            {currentFloor.era.title}
          </h1>
          <p className="text-neutral-400 text-sm mb-8 max-w-md text-center">
            {currentFloor.era.blurb}
          </p>
          <p className="text-neutral-500 text-xs">
            Click to enter · WASD / arrows to walk · Shift to run · Space to jump
          </p>
          <p className="text-neutral-600 text-xs mt-2">
            1–7 teleports between floors
          </p>
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
              <div className="text-xs text-neutral-400">
                {activeRoom.description}
              </div>
            </>
          )}
        </div>
      )}

      {hasStarted && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-neutral-300 px-3 py-1 rounded text-xs pointer-events-none">
          1 Gothic · 2 Renaissance · 3 Baroque · 4 Enlightenment ·
          5 Romantic · 6 Fin-de-siècle · 7 Modern
        </div>
      )}
    </div>
  );
}

function FloorScene({
  floor,
  activeRoomIdx,
}: {
  floor: FloorLayout;
  activeRoomIdx: number;
}) {
  return (
    <group>
      {floor.rooms.map((room, i) => (
        <RoomGeometry
          key={room.id}
          room={room}
          isActive={i === activeRoomIdx}
        />
      ))}
      {floor.hallways.map((hw) => (
        <HallwayRenderer key={hw.id} hallway={hw} floor={floor} />
      ))}
      {/* Stair geometry — outbound rises from this floor up, inbound
          rises from below into this floor. Both sets are visible when
          the stairwell room is on-screen because the stair room has
          no ceiling or mid-run floor. */}
      {floor.stairsOut.map((s) => (
        <StaircaseRenderer key={s.id} staircase={s} />
      ))}
      {floor.stairsIn.map((s) => (
        <StaircaseRenderer key={s.id} staircase={s} />
      ))}
    </group>
  );
}
