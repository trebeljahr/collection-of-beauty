"use client";

// A wall of framed works for judging the frames by eye (the debug page
// /gallery-3d/frames). It builds each frame exactly as `Painting` does,
// from the work's design, and lights it with the museum's environment
// and frame materials, without the museum round it.

import { MapControls, Text } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { ArtworkListing } from "@/lib/data";
import { ERAS, isEraId } from "@/lib/gallery-eras";
import { frameMoulding, pickFrameDesign } from "@/lib/gallery-layout/frame-design";
import { PAINTING_WALL_OFFSET, sizeWork } from "@/lib/gallery-layout/place-paintings";
import { variantProxyUrl } from "@/lib/utils";
import { UNREFLECTED_LAYER } from "./floor-mirror";
import { buildFrameGeometry } from "./frame-geometry";
import { frameMaterials } from "./frame-materials";
import { RoomEnvironment } from "./room-env-map";
import { isDeepWall } from "./wall-light";

export type FrameSheetProps = {
  works: ArtworkListing[];
  cols: number;
  eraId: string;
  /** Hang the works at their measured sizes; otherwise each is fitted
   *  to the same box so the frames can be compared. */
  realSize: boolean;
};

/** Width and height of one cell of the sheet, metres. */
const CELL_W = 1.55;
const CELL_H = 1.7;
/** Long edge every work is fitted to unless `realSize`. */
const FIT_EDGE = 0.9;
const FOV_DEG = 30;

function SheetWork({
  work,
  x,
  y,
  realSize,
}: {
  work: ArtworkListing;
  x: number;
  y: number;
  realSize: boolean;
}) {
  const design = useMemo(() => pickFrameDesign(work), [work]);
  const [w, h] = useMemo(() => {
    const sized = sizeWork(work);
    const k = realSize
      ? Math.min(1, (CELL_W - 0.5) / sized.wM, (CELL_H - 0.6) / sized.hM)
      : FIT_EDGE / Math.max(sized.wM, sized.hM);
    return [sized.wM * k, sized.hM * k];
  }, [work, realSize]);
  const geometry = useMemo(() => {
    const moulding = frameMoulding(design, w, h);
    return buildFrameGeometry(moulding.profile, w, h, PAINTING_WALL_OFFSET, {
      slots: design.slots,
      swell: moulding.swell,
    });
  }, [design, w, h]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let live = true;
    const loaded = new THREE.TextureLoader().load(
      variantProxyUrl(work.objectKey, 480, "avif"),
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        if (live) setTexture(t);
      },
    );
    return () => {
      live = false;
      loaded.dispose();
    };
  }, [work.objectKey]);

  const finishes = design.slots
    .filter((_, slot) => geometry.groups.some((g) => g.materialIndex === slot))
    .map((s) => s.finish)
    .join(" + ");
  const ornament = [design.options.sight, design.options.field, design.options.crown]
    .filter(Boolean)
    .join(" ");
  return (
    <group position={[x, y, PAINTING_WALL_OFFSET]}>
      <mesh geometry={geometry} material={frameMaterials(design)} />
      <mesh position={[0, 0, 0.014]}>
        <planeGeometry args={[w, h]} />
        {/* Keyed on the texture: a material compiled without a map does
            not pick one up later. */}
        <meshBasicMaterial
          key={texture ? "loaded" : "empty"}
          map={texture}
          color={texture ? "#ffffff" : "#2a2622"}
          toneMapped={false}
        />
      </mesh>
      <Text
        position={[0, -CELL_H / 2 + 0.2, 0]}
        fontSize={0.042}
        lineHeight={1.25}
        maxWidth={CELL_W - 0.1}
        textAlign="center"
        anchorY="top"
        color="#f4efe4"
        outlineWidth={0.004}
        outlineColor="#000000"
      >
        {`${design.look} · ${finishes}\n${ornament || "plain"} · ${work.movement ?? "untagged"} ${work.year ?? ""}`}
      </Text>
    </group>
  );
}

export function FrameSheet({ works, cols, eraId, realSize }: FrameSheetProps) {
  const era = ERAS.find((e) => e.id === (isEraId(eraId) ? eraId : "baroque")) ?? ERAS[0];
  const rows = Math.max(1, Math.ceil(works.length / cols));
  const width = cols * CELL_W;
  const height = rows * CELL_H;
  // Far enough back to see the whole sheet, on a screen up to twice as
  // wide as it is high.
  const distance = (Math.max(height, width / 2) / 2 / Math.tan((FOV_DEG * Math.PI) / 360)) * 1.04;
  return (
    <div className="h-screen w-full bg-black">
      <Canvas
        camera={{ fov: FOV_DEG, near: 0.05, far: 400, position: [0, 0, distance] }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
        onCreated={({ gl, camera }) => {
          gl.toneMapping = THREE.NeutralToneMapping;
          camera.layers.enable(UNREFLECTED_LAYER);
          (window as { __frameSheetCamera?: THREE.Camera }).__frameSheetCamera = camera;
        }}
      >
        <ambientLight intensity={0.1} />
        <hemisphereLight args={["#fff8ea", "#2a1f15", 0.08]} position={[0, 20, 0]} />
        <RoomEnvironment palette={era.palette} />
        <mesh>
          <planeGeometry args={[width + 2, height + 2]} />
          <meshStandardMaterial
            color={era.palette.wallColor}
            roughness={0.92}
            toneMapped={!isDeepWall(era.palette.wallColor)}
          />
        </mesh>
        {works.map((work, i) => (
          <SheetWork
            key={work.id}
            work={work}
            x={((i % cols) + 0.5) * CELL_W - width / 2}
            y={height / 2 - (Math.floor(i / cols) + 0.5) * CELL_H + 0.08}
            realSize={realSize}
          />
        ))}
        <MapControls screenSpacePanning enableRotate={false} zoomSpeed={1.4} />
      </Canvas>
    </div>
  );
}
