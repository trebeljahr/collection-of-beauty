"use client";

import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import type { Artwork } from "@/lib/data";
import { layoutDungeon } from "@/lib/gallery-layout/layout-dungeon";

import { RoomGeometry } from "./room-geometry";
import { HallwayRenderer } from "./hallway";
import { Player } from "./player";

type Props = { artworks: Artwork[] };

/**
 * M2 prototype: renders the ground floor and lets the player walk it.
 * No paintings yet (M3), no staircases yet (M4). A short start overlay
 * handles the pointer-lock requirement.
 */
export function GalleryDungeon({ artworks }: Props) {
  const layout = useMemo(() => layoutDungeon(artworks), [artworks]);
  const groundFloor = layout.floors[0];
  const [hasStarted, setHasStarted] = useState(false);
  const [activeRoomIdx, setActiveRoomIdx] = useState<number>(-1);
  const activeRoom =
    activeRoomIdx >= 0 ? groundFloor.rooms[activeRoomIdx] : undefined;

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

        {groundFloor.rooms.map((room, i) => (
          <RoomGeometry
            key={room.id}
            room={room}
            isActive={i === activeRoomIdx}
          />
        ))}
        {groundFloor.hallways.map((hw) => (
          <HallwayRenderer key={hw.id} hallway={hw} floor={groundFloor} />
        ))}

        <Player
          enabled={hasStarted}
          floor={groundFloor}
          spawnAt={layout.entry.worldPosition}
          onRoomChange={setActiveRoomIdx}
        />
        {hasStarted && <PointerLockControls />}
      </Canvas>

      {/* Start overlay — pointer lock requires a user gesture. */}
      {!hasStarted && (
        <div
          onClick={() => setHasStarted(true)}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-neutral-100 cursor-pointer"
        >
          <h1 className="text-3xl font-semibold mb-2">
            {groundFloor.era.title}
          </h1>
          <p className="text-neutral-400 text-sm mb-8 max-w-md text-center">
            {groundFloor.era.blurb}
          </p>
          <p className="text-neutral-500 text-xs">
            Click to enter · WASD / arrows to walk · Shift to run · Space to jump
          </p>
        </div>
      )}

      {/* Current-room banner */}
      {hasStarted && activeRoom && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 text-neutral-100 px-4 py-2 rounded text-sm pointer-events-none">
          <div className="font-semibold">{activeRoom.title}</div>
          <div className="text-xs text-neutral-400">{activeRoom.description}</div>
        </div>
      )}
    </div>
  );
}
