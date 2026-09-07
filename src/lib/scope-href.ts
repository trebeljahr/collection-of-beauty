import { ERAS, type EraId } from "@/lib/gallery-eras";
import { isPlateSetId, type PlateSetId } from "@/lib/plate-set-definitions";

/** The pure half of the scope helpers: the `Scope` shape and the
 *  string<->object conversions around `?from=`. Split out of
 *  `artwork-scope.ts` because that module pulls `artworkListings` (and
 *  through it the whole 6 MB artworks.json) for `resolveScope` — every
 *  client component that only wanted `artworkHref` was dragging the
 *  entire catalogue into its browser chunk. Nothing here touches the
 *  data files, so importing it from a client component costs nothing.
 *  Server code can keep importing these names from `artwork-scope`,
 *  which re-exports them. */
export type Scope =
  | { kind: "gallery" }
  | { kind: "artist"; slug: string }
  | { kind: "movement"; name: string }
  | { kind: "decade"; start: number }
  | { kind: "era"; id: EraId }
  | { kind: "collection"; id: PlateSetId };

// Set-based lookup so parseScope can validate without throwing via getEra.
const ERA_IDS: Set<string> = new Set(ERAS.map((e) => e.id));

/** Parse a `?from=<kind>:<value>` query value. Returns null for any
 *  malformed input so callers can fall back to the global pool. */
export function parseScope(param: string | null | undefined): Scope | null {
  if (!param) return null;
  // Bare `gallery` — the only kind without a value half.
  if (param === "gallery") return { kind: "gallery" };
  const colon = param.indexOf(":");
  if (colon <= 0 || colon === param.length - 1) return null;

  const kind = param.slice(0, colon);
  let value: string;
  try {
    value = decodeURIComponent(param.slice(colon + 1));
  } catch {
    return null;
  }
  if (!value) return null;

  if (kind === "artist") return { kind, slug: value };
  if (kind === "movement") return { kind, name: value };
  if (kind === "decade") {
    if (!/^-?\d+$/.test(value)) return null;
    const start = Number.parseInt(value, 10);
    if (!Number.isFinite(start) || start % 10 !== 0) return null;
    return { kind, start };
  }
  if (kind === "era") {
    if (!ERA_IDS.has(value)) return null;
    return { kind, id: value as EraId };
  }
  if (kind === "collection") {
    // isPlateSetId comes from plate-set-definitions, which is data-free
    // — validating here costs the client nothing.
    if (!isPlateSetId(value)) return null;
    return { kind, id: value };
  }
  return null;
}

/** Inverse of `parseScope`. Returns the raw `?from=` value with the
 *  value half percent-encoded. */
export function encodeScope(scope: Scope): string {
  if (scope.kind === "gallery") return "gallery";
  if (scope.kind === "artist") return `artist:${encodeURIComponent(scope.slug)}`;
  if (scope.kind === "movement") return `movement:${encodeURIComponent(scope.name)}`;
  if (scope.kind === "decade") return `decade:${scope.start}`;
  // Era and plate-set ids are pre-validated lowercase kebab — no
  // percent-encoding needed.
  if (scope.kind === "collection") return `collection:${scope.id}`;
  return `era:${scope.id}`;
}

/** URL of the page that originated this scope, for "back to source"
 *  affordances. */
export function scopeHref(scope: Scope): string {
  if (scope.kind === "gallery") return "/";
  if (scope.kind === "artist") return `/artist/${scope.slug}`;
  if (scope.kind === "movement") return `/timeline?movement=${encodeURIComponent(scope.name)}`;
  if (scope.kind === "decade") return `/timeline#decade-${scope.start}`;
  if (scope.kind === "collection") return `/collection/${scope.id}`;
  return `/era/${scope.id}`;
}

/** Build an `/artwork/<id>` href, threading the scope as `?from=` when
 *  present. */
export function artworkHref(id: string, scope: Scope | null): string {
  if (!scope) return `/artwork/${id}`;
  return `/artwork/${id}?from=${encodeScope(scope)}`;
}
