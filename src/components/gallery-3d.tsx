"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls, Text } from "@react-three/drei";
import * as THREE from "three";
import type { Artwork } from "@/lib/data";

type Props = { artworks: Artwork[] };

const ROOM = { w: 30, h: 6, d: 20 } as const;
const EYE_HEIGHT = 1.65;

type Placement = {
  artwork: Artwork;
  position: [number, number, number];
  rotation: [number, number, number];
};

function layout(arts: Artwork[]): Placement[] {
  const y = 2.4;
  const nz = -ROOM.d / 2 + 0.06;
  const pz = ROOM.d / 2 - 0.06;
  const nx = -ROOM.w / 2 + 0.06;
  const px = ROOM.w / 2 - 0.06;

  const slots: Array<{
    pos: [number, number, number];
    rot: [number, number, number];
  }> = [
    { pos: [-11, y, nz], rot: [0, 0, 0] },
    { pos: [-3.7, y, nz], rot: [0, 0, 0] },
    { pos: [3.7, y, nz], rot: [0, 0, 0] },
    { pos: [11, y, nz], rot: [0, 0, 0] },
    { pos: [11, y, pz], rot: [0, Math.PI, 0] },
    { pos: [3.7, y, pz], rot: [0, Math.PI, 0] },
    { pos: [-3.7, y, pz], rot: [0, Math.PI, 0] },
    { pos: [-11, y, pz], rot: [0, Math.PI, 0] },
    { pos: [px, y, -4], rot: [0, -Math.PI / 2, 0] },
    { pos: [px, y, 4], rot: [0, -Math.PI / 2, 0] },
    { pos: [nx, y, 4], rot: [0, Math.PI / 2, 0] },
    { pos: [nx, y, -4], rot: [0, Math.PI / 2, 0] },
  ];

  return arts.slice(0, slots.length).map((a, i) => ({
    artwork: a,
    position: slots[i].pos,
    rotation: slots[i].rot,
  }));
}

// Preferred URL: the 1280w AVIF variant emitted by `pnpm shrink`. Falls
// back to the original asset for anything that hasn't been shrunk yet
// (e.g. new imports running before the nightly shrink). Both go through
// the /assets-raw/ rewrite in next.config.mjs so WebGL doesn't taint the
// texture — rclone doesn't emit CORS headers, so a direct 9100 hit would
// be blocked.
const VARIANT_TEX_WIDTH = 1280;
const MAX_TEX_WIDTH = 1400;

// Path portion of the pre-built variant URL — mirrors the layout emitted
// by scripts/shrink-sources.mjs (and `variantUrl()` in lib/utils.ts):
// <dir>/<basename>/<width>.<format>
function variantAssetPath(
  objectKey: string,
  width: number,
  format: "avif" | "webp",
): string {
  const lastSlash = objectKey.lastIndexOf("/");
  const dir = objectKey.slice(0, lastSlash);
  const filename = objectKey.slice(lastSlash + 1);
  const basename = filename.replace(/\.[^.]+$/, "");
  const segments = [...dir.split("/"), basename, `${width}.${format}`];
  return segments.map(encodeURIComponent).join("/");
}

function variantAssetsRawUrl(
  objectKey: string,
  width: number,
  format: "avif" | "webp",
): string {
  return `/assets-raw/${variantAssetPath(objectKey, width, format)}`;
}

function rawOriginalUrl(objectKey: string): string {
  const encoded = objectKey.split("/").map(encodeURIComponent).join("/");
  return `/assets-raw/${encoded}`;
}

const textureCache = new Map<string, THREE.Texture>();
const textureInFlight = new Map<string, Promise<THREE.Texture>>();

async function loadTexture(artwork: Artwork): Promise<THREE.Texture> {
  const cacheKey = artwork.objectKey;
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;
  const pending = textureInFlight.get(cacheKey);
  if (pending) return pending;

  const promise = (async () => {
    // Tuple: [url, shouldDownsample]. The pre-built 1280w variant is
    // already the right size; only the raw-original fallback needs
    // resizing (some source scans are 50+ MP and blow up GPU memory).
    const attempts: Array<[string, boolean]> = [
      [variantAssetsRawUrl(cacheKey, VARIANT_TEX_WIDTH, "avif"), false],
      [variantAssetsRawUrl(cacheKey, VARIANT_TEX_WIDTH, "webp"), false],
      [rawOriginalUrl(cacheKey), true],
    ];
    let lastErr: unknown = null;
    for (const [url, downsample] of attempts) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
        const blob = await res.blob();
        const bitmap = downsample
          ? await createImageBitmap(blob, {
              resizeWidth: MAX_TEX_WIDTH,
              resizeQuality: "high",
            })
          : await createImageBitmap(blob);
        const texture = new THREE.Texture(
          bitmap as unknown as HTMLImageElement,
        );
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.minFilter = THREE.LinearMipMapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        textureCache.set(cacheKey, texture);
        return texture;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr ?? new Error("texture load failed");
  })();
  textureInFlight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    textureInFlight.delete(cacheKey);
  }
}

function Painting({ placement }: { placement: Placement }) {
  const { artwork, position, rotation } = placement;
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTexture(artwork)
      .then((tex) => {
        if (!cancelled) setTexture(tex);
      })
      .catch((err) => {
        console.error("gallery-3d texture load failed:", artwork.objectKey, err);
      });
    return () => {
      cancelled = true;
    };
  }, [artwork]);

  const img = texture?.image as
    | { width?: number; height?: number }
    | undefined;
  const aspect =
    img?.width && img?.height ? img.width / img.height : 1;

  const MAX_W = 2.8;
  const MAX_H = 2.4;
  let w = MAX_W;
  let h = MAX_W / aspect;
  if (h > MAX_H) {
    h = MAX_H;
    w = MAX_H * aspect;
  }

  const frameT = 0.08;
  const frameDepth = 0.14;
  const label = artwork.title.length > 70
    ? artwork.title.slice(0, 67) + "…"
    : artwork.title;
  const byline =
    (artwork.artist ?? "Unknown") +
    (artwork.year ? ` · ${artwork.year}` : "");

  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, -frameDepth / 2]} castShadow>
        <boxGeometry args={[w + frameT * 2, h + frameT * 2, frameDepth]} />
        <meshStandardMaterial color="#241810" roughness={0.55} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[w + frameT * 0.9, h + frameT * 0.9]} />
        <meshStandardMaterial color="#e9dfcb" roughness={0.95} />
      </mesh>
      {texture && (
        <mesh position={[0, 0, 0.006]}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial
            map={texture}
            roughness={0.85}
            metalness={0}
            emissive="#2a1e10"
            emissiveIntensity={0.08}
            emissiveMap={texture}
          />
        </mesh>
      )}
      <Text
        position={[0, -h / 2 - 0.26, 0.02]}
        fontSize={0.085}
        color="#efe6d0"
        anchorX="center"
        anchorY="top"
        maxWidth={Math.max(w + 0.5, 2)}
      >
        {label}
      </Text>
      <Text
        position={[0, -h / 2 - 0.42, 0.02]}
        fontSize={0.07}
        color="#a89b82"
        anchorX="center"
        anchorY="top"
        maxWidth={Math.max(w + 0.5, 2)}
      >
        {byline}
      </Text>
      <pointLight
        position={[0, 0.8, 1.3]}
        intensity={5}
        distance={5}
        decay={2}
        color="#ffd9a8"
      />
    </group>
  );
}

function Room() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM.w, ROOM.d]} />
        <meshStandardMaterial color="#3a2a1f" roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM.h, 0]}>
        <planeGeometry args={[ROOM.w, ROOM.d]} />
        <meshStandardMaterial color="#f0e6d0" roughness={0.95} />
      </mesh>
      <mesh position={[0, ROOM.h / 2, -ROOM.d / 2]}>
        <planeGeometry args={[ROOM.w, ROOM.h]} />
        <meshStandardMaterial color="#e4d8bf" roughness={0.92} />
      </mesh>
      <mesh position={[0, ROOM.h / 2, ROOM.d / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[ROOM.w, ROOM.h]} />
        <meshStandardMaterial color="#e4d8bf" roughness={0.92} />
      </mesh>
      <mesh
        position={[ROOM.w / 2, ROOM.h / 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM.d, ROOM.h]} />
        <meshStandardMaterial color="#e8ddc4" roughness={0.92} />
      </mesh>
      <mesh
        position={[-ROOM.w / 2, ROOM.h / 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM.d, ROOM.h]} />
        <meshStandardMaterial color="#e8ddc4" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[3, 0.6, 0.9]} />
        <meshStandardMaterial color="#2a1d14" roughness={0.65} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.66, 0]}>
        <boxGeometry args={[3.1, 0.05, 1]} />
        <meshStandardMaterial color="#5a3d28" roughness={0.5} metalness={0.2} />
      </mesh>
    </group>
  );
}

function Player({ enabled }: { enabled: boolean }) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    camera.position.set(0, EYE_HEIGHT, 7);
    camera.lookAt(0, EYE_HEIGHT, -5);
  }, [camera]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, delta) => {
    if (!enabled) return;
    const dt = Math.min(delta, 0.1);
    const running =
      keys.current["ShiftLeft"] || keys.current["ShiftRight"] || false;
    const speed = running ? 6 : 3;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0) forward.normalize();
    const right = new THREE.Vector3().crossVectors(
      forward,
      new THREE.Vector3(0, 1, 0),
    );
    if (right.lengthSq() > 0) right.normalize();

    const move = new THREE.Vector3();
    if (keys.current["KeyW"] || keys.current["ArrowUp"]) move.add(forward);
    if (keys.current["KeyS"] || keys.current["ArrowDown"]) move.sub(forward);
    if (keys.current["KeyD"] || keys.current["ArrowRight"]) move.add(right);
    if (keys.current["KeyA"] || keys.current["ArrowLeft"]) move.sub(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      camera.position.add(move);
    }

    const buf = 0.7;
    camera.position.x = THREE.MathUtils.clamp(
      camera.position.x,
      -ROOM.w / 2 + buf,
      ROOM.w / 2 - buf,
    );
    camera.position.z = THREE.MathUtils.clamp(
      camera.position.z,
      -ROOM.d / 2 + buf,
      ROOM.d / 2 - buf,
    );
    const bench = { x: 3, z: 0.9 };
    if (
      Math.abs(camera.position.x) < bench.x / 2 + 0.4 &&
      Math.abs(camera.position.z) < bench.z / 2 + 0.4
    ) {
      const dx = camera.position.x;
      const dz = camera.position.z;
      if (Math.abs(dx) > Math.abs(dz)) {
        camera.position.x = Math.sign(dx || 1) * (bench.x / 2 + 0.4);
      } else {
        camera.position.z = Math.sign(dz || 1) * (bench.z / 2 + 0.4);
      }
    }
    camera.position.y = EYE_HEIGHT;
  });

  return null;
}

function StartOverlay({ onStart }: { onStart: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/65 backdrop-blur-sm">
      <div className="max-w-md rounded-xl border border-white/15 bg-black/60 p-6 text-center text-white shadow-2xl">
        <h2 className="font-serif text-2xl tracking-wide">Enter the gallery</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/75">
          Click <span className="font-medium">Enter</span> to lock the cursor,
          then move with{" "}
          <kbd className="rounded border border-white/30 px-1.5">W</kbd>{" "}
          <kbd className="rounded border border-white/30 px-1.5">A</kbd>{" "}
          <kbd className="rounded border border-white/30 px-1.5">S</kbd>{" "}
          <kbd className="rounded border border-white/30 px-1.5">D</kbd>, look
          with the mouse, hold{" "}
          <kbd className="rounded border border-white/30 px-1.5">Shift</kbd>{" "}
          to walk faster, and press{" "}
          <kbd className="rounded border border-white/30 px-1.5">Esc</kbd>{" "}
          to release.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-5 rounded-md bg-white px-5 py-2 text-sm font-medium text-black transition hover:bg-white/85"
        >
          Enter
        </button>
        <div className="mt-4 text-xs text-white/45">
          <Link href="/" className="underline hover:text-white/80">
            Back to the 2D gallery
          </Link>
        </div>
      </div>
    </div>
  );
}

function Crosshair() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div className="h-1.5 w-1.5 rounded-full bg-white/70 ring-1 ring-black/40" />
    </div>
  );
}

function HintBar() {
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-4 py-1.5 text-xs text-white/80 backdrop-blur">
      WASD to move · mouse to look · Shift to run · Esc to release
    </div>
  );
}

type PointerLockControlsHandle = {
  lock: () => void;
  unlock: () => void;
};

export function Gallery3D({ artworks }: Props) {
  const placements = useMemo(() => layout(artworks), [artworks]);
  const [locked, setLocked] = useState(false);
  const controlsRef = useRef<PointerLockControlsHandle | null>(null);

  const start = () => {
    controlsRef.current?.lock?.();
  };

  return (
    <div className="fixed left-0 right-0 bottom-0 top-[57px] bg-[#0a0604]">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ fov: 70, near: 0.1, far: 120, position: [0, EYE_HEIGHT, 7] }}
        gl={{ antialias: true, toneMappingExposure: 1.1 }}
      >
        <color attach="background" args={["#0a0604"]} />
        <fog attach="fog" args={["#0a0604", 14, 42]} />

        <ambientLight intensity={0.28} color="#fff1dd" />
        <hemisphereLight
          intensity={0.35}
          color={"#fff1dd" as unknown as THREE.ColorRepresentation}
          groundColor={"#2a1d14" as unknown as THREE.ColorRepresentation}
        />
        <pointLight
          position={[0, ROOM.h - 0.3, 0]}
          intensity={18}
          distance={24}
          decay={2}
          color="#ffe6bf"
          castShadow
        />
        <pointLight
          position={[-8, ROOM.h - 0.3, -5]}
          intensity={12}
          distance={18}
          decay={2}
          color="#ffe0b5"
        />
        <pointLight
          position={[8, ROOM.h - 0.3, 5]}
          intensity={12}
          distance={18}
          decay={2}
          color="#ffe0b5"
        />

        <Room />
        {placements.map((p) => (
          <Painting key={p.artwork.id} placement={p} />
        ))}

        <Player enabled={locked} />
        <PointerLockControls
          ref={controlsRef as unknown as React.Ref<never>}
          onLock={() => setLocked(true)}
          onUnlock={() => setLocked(false)}
        />
      </Canvas>
      {!locked && <StartOverlay onStart={start} />}
      {locked && (
        <>
          <Crosshair />
          <HintBar />
        </>
      )}
    </div>
  );
}
