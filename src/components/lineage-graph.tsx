"use client";

import type { Artist, Connection } from "@/lib/data";
import {
  type SimulationLinkDatum,
  type SimulationNodeDatum,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

type Props = {
  artists: Artist[];
  connections: Connection[];
};

type Node = SimulationNodeDatum & {
  id: string;
  name: string;
  movement: string | null;
  born: number | null;
  died: number | null;
  count: number;
  nationality: string | null;
};

type GraphLink = SimulationLinkDatum<Node> & {
  source: string | Node;
  target: string | Node;
  kind: "known" | "movement";
  label: string;
};

const MOVEMENT_COLORS: Record<string, string> = {
  Impressionism: "#3b82f6",
  "Post-Impressionism": "#6366f1",
  Romanticism: "#ef4444",
  "Dutch Golden Age": "#f59e0b",
  "High Renaissance": "#d97706",
  Baroque: "#b45309",
  Cubism: "#10b981",
  Surrealism: "#8b5cf6",
  Fauvism: "#22c55e",
  Expressionism: "#a855f7",
  "Vienna Secession": "#d946ef",
  "Art Nouveau": "#ec4899",
  "Ukiyo-e": "#06b6d4",
  "Shin-hanga": "#0891b2",
  "Natural history illustration": "#84cc16",
  Neoclassicism: "#dc2626",
  Realism: "#f97316",
  Pointillism: "#14b8a6",
};

function movementColor(m: string | null): string {
  if (!m) return "#94a3b8";
  return MOVEMENT_COLORS[m] ?? "#64748b";
}

export function LineageGraph({ artists, connections }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [connectionKind, setConnectionKind] = useState<"all" | "known">("known");
  const [movementFilter, setMovementFilter] = useState<string>("");
  const [dimensions, setDimensions] = useState({ width: 1000, height: 700 });
  const [tick, setTick] = useState(0);

  const { nodes, links, connectedIds } = useMemo(() => {
    const filteredConnections =
      connectionKind === "known" ? connections.filter((c) => c.kind === "known") : connections;

    const used = new Set<string>();
    for (const c of filteredConnections) {
      used.add(c.source);
      used.add(c.target);
    }

    let ns = artists.filter((a) => used.has(a.slug));
    if (movementFilter) {
      ns = ns.filter((a) => a.movement === movementFilter);
    }
    const allowed = new Set(ns.map((a) => a.slug));
    const ls = filteredConnections.filter((c) => allowed.has(c.source) && allowed.has(c.target));

    const nodes: Node[] = ns.map((a) => ({
      id: a.slug,
      name: a.name,
      movement: a.movement,
      born: a.born,
      died: a.died,
      count: a.count,
      nationality: a.nationality,
    }));
    const links: GraphLink[] = ls.map((c) => ({
      source: c.source,
      target: c.target,
      kind: c.kind,
      label: c.label,
    }));

    return { nodes, links, connectedIds: allowed };
  }, [artists, connections, connectionKind, movementFilter]);

  useEffect(() => {
    function resize() {
      if (!svgRef.current) return;
      const rect = svgRef.current.parentElement!.getBoundingClientRect();
      // Height: never bigger than 70 % of viewport (so the graph
      // doesn't push the sidebar off-screen on phones in portrait), and
      // never smaller than 320 px (so the simulation has room to settle
      // even on a phone in landscape).
      const vh = window.innerHeight;
      const target = Math.round(vh * 0.7);
      setDimensions({
        width: rect.width,
        height: Math.max(320, Math.min(800, target)),
      });
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    if (nodes.length === 0) return;
    const { width, height } = dimensions;

    const years = nodes.map((n) => n.born).filter((y): y is number => y != null);
    const minYear = years.length ? Math.min(...years) : 1400;
    const maxYear = years.length ? Math.max(...years) : 2000;
    const span = Math.max(1, maxYear - minYear);

    const simulation = forceSimulation(nodes)
      .force(
        "link",
        forceLink<Node, GraphLink>(links)
          .id((d) => d.id)
          .strength((l) => (l.kind === "known" ? 0.25 : 0.03))
          .distance((l) => (l.kind === "known" ? 80 : 160)),
      )
      .force("charge", forceManyBody<Node>().strength(-140))
      .force(
        "collide",
        forceCollide<Node>()
          .radius((d) => 8 + Math.sqrt(d.count) * 1.6)
          .strength(0.9),
      )
      .force(
        "x",
        forceX<Node>((d) => {
          if (d.born == null) return width / 2;
          return 60 + ((d.born - minYear) / span) * (width - 120);
        }).strength(0.3),
      )
      .force("y", forceY<Node>(height / 2).strength(0.08))
      .force("center", forceCenter(width / 2, height / 2).strength(0.02));

    simulation.on("tick", () => setTick((t) => t + 1));
    simulation.alpha(1).restart();

    return () => {
      simulation.stop();
    };
  }, [nodes, links, dimensions]);

  const nodeById = useMemo(() => {
    const m = new Map<string, Node>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links) {
      const s = typeof l.source === "string" ? l.source : l.source.id;
      const t = typeof l.target === "string" ? l.target : l.target.id;
      if (!m.has(s)) m.set(s, new Set());
      if (!m.has(t)) m.set(t, new Set());
      m.get(s)!.add(t);
      m.get(t)!.add(s);
    }
    return m;
  }, [links]);

  const activeId = selected ?? hovered;
  const neighbors = activeId ? (adjacency.get(activeId) ?? new Set()) : null;

  function isHighlighted(id: string) {
    if (!activeId) return true;
    if (id === activeId) return true;
    return neighbors?.has(id) ?? false;
  }

  function linkHighlighted(l: GraphLink) {
    if (!activeId) return l.kind === "known";
    const s = typeof l.source === "string" ? l.source : l.source.id;
    const t = typeof l.target === "string" ? l.target : l.target.id;
    return s === activeId || t === activeId;
  }

  const movementOptions = useMemo(() => {
    return Array.from(
      new Set(
        artists
          .filter((a) => connectedIds.has(a.slug))
          .map((a) => a.movement)
          .filter((m): m is string => !!m),
      ),
    ).sort();
  }, [artists, connectedIds]);

  const activeArtist = activeId ? nodeById.get(activeId) : null;
  const activeLinks = activeId
    ? links.filter((l) => {
        const s = typeof l.source === "string" ? l.source : l.source.id;
        const t = typeof l.target === "string" ? l.target : l.target.id;
        return s === activeId || t === activeId;
      })
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
        <div className="flex items-center gap-1 rounded-md border border-[var(--border)] p-0.5">
          <button
            type="button"
            onClick={() => setConnectionKind("known")}
            className={`rounded-sm px-2 py-1 text-xs ${
              connectionKind === "known"
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "hover:bg-[var(--accent)]"
            }`}
          >
            Knew personally
          </button>
          <button
            type="button"
            onClick={() => setConnectionKind("all")}
            className={`rounded-sm px-2 py-1 text-xs ${
              connectionKind === "all"
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "hover:bg-[var(--accent)]"
            }`}
          >
            + shared movements
          </button>
        </div>
        <select
          value={movementFilter}
          onChange={(e) => setMovementFilter(e.target.value)}
          className="h-8 rounded-md border border-[var(--input)] bg-transparent px-2 text-xs"
        >
          <option value="">All movements</option>
          {movementOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--muted-foreground)]">
          {nodes.length} artists · {links.length} connections · x-axis = birth year
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="relative rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden touch-none">
          {/* Pinch / drag / wheel zoom. With ~200 nodes packed into a
              phone-sized SVG the hit targets are tiny — the wrapper
              lets users zoom in to ~3× and pan around. `centerOnInit`
              and `limitToBounds` keep the graph from drifting
              off-screen. */}
          <TransformWrapper
            initialScale={1}
            minScale={0.6}
            maxScale={4}
            limitToBounds
            centerOnInit
            doubleClick={{ disabled: true }}
            wheel={{ step: 0.15 }}
            pinch={{ step: 5 }}
          >
            <TransformComponent
              wrapperStyle={{
                width: dimensions.width,
                height: dimensions.height,
              }}
              contentStyle={{
                width: dimensions.width,
                height: dimensions.height,
              }}
            >
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: clicking the SVG background clears selection; artist nodes below are keyboard-accessible. */}
              <svg
                ref={svgRef}
                role="img"
                aria-label="Artist lineage graph"
                width={dimensions.width}
                height={dimensions.height}
                className="block"
                data-tick={tick}
                onClick={(e) => {
                  if (e.target === svgRef.current) setSelected(null);
                }}
              >
                <defs>
                  <marker
                    id="arrow"
                    viewBox="0 -5 10 10"
                    refX="10"
                    refY="0"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto"
                  >
                    <path d="M0,-5L10,0L0,5" fill="currentColor" opacity="0.4" />
                  </marker>
                </defs>
                <g>
                  {links.map((l) => {
                    const sourceId = typeof l.source === "string" ? l.source : l.source.id;
                    const targetId = typeof l.target === "string" ? l.target : l.target.id;
                    const s = typeof l.source === "string" ? nodeById.get(l.source) : l.source;
                    const t = typeof l.target === "string" ? nodeById.get(l.target) : l.target;
                    if (!s || !t || s.x == null || t.x == null) return null;
                    const hi = linkHighlighted(l);
                    const dim = activeId && !hi;
                    return (
                      <line
                        key={`${sourceId}-${targetId}-${l.kind}-${l.label}`}
                        x1={s.x}
                        y1={s.y}
                        x2={t.x}
                        y2={t.y}
                        stroke={l.kind === "known" ? "#525252" : "#a3a3a3"}
                        strokeWidth={l.kind === "known" ? 1.5 : 0.7}
                        strokeOpacity={dim ? 0.08 : l.kind === "known" ? 0.7 : 0.35}
                        strokeDasharray={l.kind === "movement" ? "3 3" : undefined}
                      />
                    );
                  })}
                </g>
                <g>
                  {nodes.map((n) => {
                    const hi = isHighlighted(n.id);
                    const r = 5 + Math.sqrt(n.count) * 1.4;
                    // Invisible hit-zone keeps the visual node small but
                    // gives every artist a touch-friendly tap target. Most
                    // visible circles are 5–15 px; 18 px radius brings the
                    // hit area to ~36 px diameter at scale 1, and pinch
                    // zoom takes over from there for dense clusters.
                    const hitR = Math.max(18, r);
                    return (
                      <g
                        key={n.id}
                        transform={`translate(${n.x ?? 0}, ${n.y ?? 0})`}
                        onMouseEnter={() => setHovered(n.id)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => setSelected((prev) => (prev === n.id ? null : n.id))}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          setSelected((prev) => (prev === n.id ? null : n.id));
                        }}
                        className="cursor-pointer"
                        opacity={hi ? 1 : 0.15}
                      >
                        <circle r={hitR} fill="transparent" />
                        <circle
                          r={r}
                          fill={movementColor(n.movement)}
                          stroke={selected === n.id ? "#111" : "white"}
                          strokeWidth={selected === n.id ? 2 : 1}
                        />
                        {hi && (hovered === n.id || selected === n.id || n.count > 30) && (
                          <text
                            y={-r - 4}
                            textAnchor="middle"
                            className="pointer-events-none select-none"
                            fontSize={11}
                            fill="var(--foreground)"
                            paintOrder="stroke"
                            stroke="var(--background)"
                            strokeWidth={3}
                          >
                            {n.name}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
            </TransformComponent>
          </TransformWrapper>
          {nodes.length === 0 && (
            <div className="absolute inset-0 grid place-items-center text-[var(--muted-foreground)]">
              No artists to display with current filters.
            </div>
          )}
        </div>

        <aside className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          {activeArtist ? (
            <div className="space-y-3">
              <div>
                <h3 className="font-serif text-lg">{activeArtist.name}</h3>
                <div className="text-xs text-[var(--muted-foreground)]">
                  {activeArtist.born && activeArtist.died
                    ? `${activeArtist.born}–${activeArtist.died}`
                    : "dates unknown"}
                  {activeArtist.nationality ? ` · ${activeArtist.nationality}` : ""}
                </div>
                {activeArtist.movement && (
                  <div className="mt-1 text-xs">
                    <span
                      className="inline-block h-2 w-2 rounded-full align-middle mr-1"
                      style={{ background: movementColor(activeArtist.movement) }}
                    />
                    {activeArtist.movement}
                  </div>
                )}
                <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {activeArtist.count} work
                  {activeArtist.count === 1 ? "" : "s"} in collection
                </div>
              </div>
              <Link
                href={`/artist/${activeArtist.id}`}
                className="block rounded-md bg-[var(--primary)] px-3 py-2 text-center text-xs text-[var(--primary-foreground)]"
              >
                Open artist page →
              </Link>
              {activeLinks.length > 0 && (
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                    Connections
                  </div>
                  <ul className="space-y-1 text-xs">
                    {activeLinks.slice(0, 20).map((l) => {
                      const other =
                        (typeof l.source === "string" ? l.source : l.source.id) === activeArtist.id
                          ? typeof l.target === "string"
                            ? l.target
                            : l.target.id
                          : typeof l.source === "string"
                            ? l.source
                            : l.source.id;
                      const node = nodeById.get(other);
                      if (!node) return null;
                      return (
                        <li key={`${activeArtist.id}-${node.id}-${l.kind}-${l.label}`}>
                          <button
                            type="button"
                            onClick={() => setSelected(node.id)}
                            className="w-full text-left hover:underline"
                          >
                            <span
                              className={
                                l.kind === "known"
                                  ? "font-medium"
                                  : "text-[var(--muted-foreground)]"
                              }
                            >
                              {node.name}
                            </span>
                            <span className="ml-1 text-[var(--muted-foreground)]">— {l.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-[var(--muted-foreground)]">
              <p className="mb-2">Tap an artist to see their connections — pinch to zoom in.</p>
              <p className="mb-4">
                Nodes are positioned by birth year (left = earlier). Solid lines mean direct
                acquaintance; dashed lines share a movement.
              </p>
              <div className="space-y-1">
                {Object.entries(MOVEMENT_COLORS)
                  .slice(0, 10)
                  .map(([m, c]) => (
                    <div key={m} className="flex items-center gap-2 text-xs">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: c }}
                      />
                      {m}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
