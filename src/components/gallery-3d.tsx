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

// Player physics
const WALK_SPEED = 5;
const RUN_SPEED = 10;
const JUMP_IMPULSE = 6;
const GRAVITY = 22;

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
// back to the original asset for anything that hasn't been shrunk yet.
// Both go through the /assets-raw/ rewrite in next.config.mjs so WebGL
// doesn't taint the texture — rclone doesn't emit CORS headers, so a
// direct 9100 hit would be blocked.
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
    // resizing (some source scans are 50+ MP).
    const attempts: Array<[string, boolean]> = [
      [variantAssetsRawUrl(cacheKey, VARIANT_TEX_WIDTH, "avif"), false],
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
        // ImageBitmap sources ignore UNPACK_FLIP_Y_WEBGL on some drivers;
        // Three's convention is flipY=false so pixels upload in image
        // orientation (top-left origin) rather than doubly-flipped.
        texture.flipY = false;
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
  const [texture, setTexture] = useState<THREE.Texture | null>(() =>
    textureCache.get(artwork.objectKey) ?? null,
  );

  useEffect(() => {
    if (texture) return;
    let cancelled = false;
    loadTexture(artwork)
      .then((tex) => {
        if (!cancelled) setTexture(tex);
      })
      .catch((err) => {
        console.error(
          "gallery-3d texture load failed:",
          artwork.objectKey,
          err,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [artwork, texture]);

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
      <mesh position={[0, 0, -frameDepth / 2]}>
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
        intensity={3.5}
        distance={4.5}
        decay={2}
        color="#ffd9a8"
      />
    </group>
  );
}

function CeilingLamp({
  position,
}: {
  position: [number, number, number];
}) {
  return (
    <group position={position}>
      {/* Recessed ceiling fixture — an emissive disc explains the
          soft glow you see on the ceiling so it reads as a lamp
          rather than a render artefact. */}
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.26, 0.3, 0.06, 24]} />
        <meshStandardMaterial
          color="#2a1d14"
          emissive="#ffd08a"
          emissiveIntensity={1.6}
          roughness={0.5}
        />
      </mesh>
      <pointLight
        position={[0, -0.15, 0]}
        intensity={7}
        distance={13}
        decay={2.2}
        color="#ffd9a5"
      />
    </group>
  );
}

function Room() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[ROOM.w, ROOM.d]} />
        <meshStandardMaterial color="#3a2a1f" roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM.h, 0]}>
        <planeGeometry args={[ROOM.w, ROOM.d]} />
        <meshStandardMaterial color="#f2e8d2" roughness={0.95} />
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
      <mesh position={[0, 0.3, 0]}>
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

const CEILING_LAMP_POSITIONS: Array<[number, number, number]> = [
  [-10, ROOM.h - 0.04, -6],
  [0, ROOM.h - 0.04, -6],
  [10, ROOM.h - 0.04, -6],
  [-10, ROOM.h - 0.04, 6],
  [0, ROOM.h - 0.04, 6],
  [10, ROOM.h - 0.04, 6],
];

function Player({ enabled }: { enabled: boolean }) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const velocityY = useRef(0);
  const grounded = useRef(true);

  useEffect(() => {
    camera.position.set(0, EYE_HEIGHT, 7);
    camera.lookAt(0, EYE_HEIGHT, -5);
  }, [camera]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.code === "Space" && enabled && grounded.current) {
        velocityY.current = JUMP_IMPULSE;
        grounded.current = false;
        // Don't let the browser scroll or fire a button "click" from Space.
        e.preventDefault();
      }
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
  }, [enabled]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const dt = Math.min(delta, 0.1);
    const running =
      keys.current["ShiftLeft"] || keys.current["ShiftRight"] || false;
    const speed = running ? RUN_SPEED : WALK_SPEED;

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

    // Clamp to walls
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

    // Bench collision (XZ only — can't jump on top, but the impulse
    // carries you over when you're airborne thanks to the y guard).
    const BENCH_HEIGHT = 0.66;
    const bench = { x: 3, z: 0.9 };
    const benchBlocking = camera.position.y < EYE_HEIGHT + BENCH_HEIGHT - 0.1;
    if (
      benchBlocking &&
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

    // Vertical integration (jump / gravity). Floor at EYE_HEIGHT.
    velocityY.current -= GRAVITY * dt;
    camera.position.y += velocityY.current * dt;
    if (camera.position.y <= EYE_HEIGHT) {
      camera.position.y = EYE_HEIGHT;
      velocityY.current = 0;
      grounded.current = true;
    } else {
      grounded.current = false;
    }
  });

  return null;
}

function StartOverlay({
  onStart,
  loadedCount,
  total,
}: {
  onStart: () => void;
  loadedCount: number;
  total: number;
}) {
  const ready = loadedCount >= total;
  const pct = total > 0 ? Math.round((loadedCount / total) * 100) : 0;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/65 backdrop-blur-sm">
      <div className="w-[min(420px,92vw)] rounded-xl border border-white/15 bg-black/60 p-6 text-center text-white shadow-2xl">
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
          to run,{" "}
          <kbd className="rounded border border-white/30 px-1.5">Space</kbd>{" "}
          to jump, and{" "}
          <kbd className="rounded border border-white/30 px-1.5">Esc</kbd>{" "}
          to release.
        </p>

        <div className="mt-5 space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-white/70 transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-xs text-white/55">
            {ready
              ? "Paintings loaded"
              : `Loading paintings… ${loadedCount}/${total}`}
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
      WASD · mouse to look · Shift to run · Space to jump · Esc to release
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
  const [loadedCount, setLoadedCount] = useState(() =>
    placements.filter((p) => textureCache.has(p.artwork.objectKey)).length,
  );
  const controlsRef = useRef<PointerLockControlsHandle | null>(null);

  // Kick every texture load off immediately at mount so all 12 fetches
  // are in flight before the first Painting useEffect runs. Failures
  // still count as "done" so the Enter button can unblock even if a
  // variant 404s and we have to fall through to the raw original.
  useEffect(() => {
    let cancelled = false;
    for (const p of placements) {
      if (textureCache.has(p.artwork.objectKey)) continue;
      loadTexture(p.artwork)
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setLoadedCount((c) => c + 1);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [placements]);

  const start = () => {
    controlsRef.current?.lock?.();
  };

  return (
    <div className="fixed left-0 right-0 bottom-0 top-[57px] bg-[#0a0604]">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ fov: 70, near: 0.1, far: 120, position: [0, EYE_HEIGHT, 7] }}
        gl={{ antialias: true, toneMappingExposure: 1.15 }}
      >
        <color attach="background" args={["#0a0604"]} />
        <fog attach="fog" args={["#0a0604", 16, 48]} />

        <ambientLight intensity={0.38} color="#fff1dd" />
        <hemisphereLight
          intensity={0.32}
          color={"#fff1dd" as unknown as THREE.ColorRepresentation}
          groundColor={"#2a1d14" as unknown as THREE.ColorRepresentation}
        />

        {CEILING_LAMP_POSITIONS.map((p, i) => (
          <CeilingLamp key={i} position={p} />
        ))}

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
      {!locked && (
        <StartOverlay
          onStart={start}
          loadedCount={loadedCount}
          total={placements.length}
        />
      )}
      {locked && (
        <>
          <Crosshair />
          <HintBar />
        </>
      )}
    </div>
  );
}
