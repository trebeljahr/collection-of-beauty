import { type ColorBucketId, isColorBucketId } from "@/lib/color-buckets.mjs";
import { type EraId, eraForMovement, isEraId } from "@/lib/gallery-eras";
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
  | { kind: "gallery"; filter?: ScopeFilter }
  | { kind: "artist"; slug: string }
  | { kind: "decade"; start: number; filter?: ScopeFilter }
  | { kind: "era"; id: EraId }
  | { kind: "collection"; id: PlateSetId }
  | { kind: "color"; id: ColorBucketId };

/** The search box, era select and sort select of a surface that has
 *  them: the home gallery, and the timeline (which has no sort — it is
 *  chronological by definition). Absent fields are the surface's
 *  default, and a scope with nothing filtered carries no `filter` at
 *  all, so `{ kind: "gallery" }` still means the plain home grid.
 *
 *  The same three URL params (`q`, `era`, `sort`) sit on the surface's
 *  own URL and on every `/artwork/<id>` link it hands out. That is what
 *  lets prev/next walk the filtered selection and "Back" land on it. */
export type ScopeFilter = {
  q?: string;
  era?: EraId;
  sort?: FilterSort;
};

/** The home gallery's non-default sorts. "shuffle" is the default and
 *  never reaches a URL. */
export type FilterSort = "year" | "artist";

/** Anything with URLSearchParams' `get` — URLSearchParams itself and
 *  Next's ReadonlyURLSearchParams both qualify. */
type ParamReader = { get(name: string): string | null };

/** Parse a `?from=<kind>:<value>` query value. Returns null for any
 *  malformed input so callers can fall back to the global pool. Reads
 *  the scope's kind and value only; `parseScopeParams` adds the filter. */
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
  // Movement scopes are gone; eras are the one category visitors see.
  // Links shared before that still land on the movement's era.
  if (kind === "movement") {
    const id = eraForMovement(value);
    return id ? { kind: "era", id } : null;
  }
  if (kind === "decade") {
    if (!/^-?\d+$/.test(value)) return null;
    const start = Number.parseInt(value, 10);
    if (!Number.isFinite(start) || start % 10 !== 0) return null;
    return { kind, start };
  }
  if (kind === "era") {
    if (!isEraId(value)) return null;
    return { kind, id: value };
  }
  if (kind === "collection") {
    // isPlateSetId comes from plate-set-definitions, which is data-free
    // — validating here costs the client nothing.
    if (!isPlateSetId(value)) return null;
    return { kind, id: value };
  }
  if (kind === "color") {
    // Same story: the bucket registry in color-buckets.mjs is pure.
    if (!isColorBucketId(value)) return null;
    return { kind, id: value };
  }
  return null;
}

/** Parse the whole scope out of a query string: `from` plus, for the
 *  two kinds that have filter controls, `q` / `era` / `sort`. Filter
 *  params next to any other kind are ignored — an artist page has no
 *  search box, so there is nothing for them to mean. */
export function parseScopeParams(params: ParamReader | null | undefined): Scope | null {
  const scope = parseScope(params?.get("from"));
  if (!scope || !params) return scope;
  if (scope.kind === "gallery") {
    const filter = parseFilterParams(params);
    return filter ? { ...scope, filter } : scope;
  }
  if (scope.kind === "decade") {
    // The timeline has no sort control, so a stray `sort` means nothing.
    const filter = cleanFilter({ q: params.get("q"), era: params.get("era") });
    return filter ? { ...scope, filter } : scope;
  }
  return scope;
}

/** Read `q` / `era` / `sort` from a query string. Undefined when none
 *  of them holds a usable value. */
export function parseFilterParams(params: ParamReader): ScopeFilter | undefined {
  return cleanFilter({
    q: params.get("q"),
    era: params.get("era"),
    sort: params.get("sort"),
  });
}

/** Validate and trim raw filter values, dropping defaults. Returns
 *  undefined when nothing is left, so an unfiltered scope stays
 *  `{ kind: "gallery" }` rather than growing an empty `filter`. */
export function cleanFilter(raw: {
  q?: string | null;
  era?: string | null;
  sort?: string | null;
}): ScopeFilter | undefined {
  const filter: ScopeFilter = {};
  const q = raw.q?.trim();
  if (q) filter.q = q;
  if (raw.era && isEraId(raw.era)) filter.era = raw.era;
  if (raw.sort === "year" || raw.sort === "artist") filter.sort = raw.sort;
  return filter.q || filter.era || filter.sort ? filter : undefined;
}

/** `q=…&era=…&sort=…` for a filter, in that fixed order so equal
 *  filters always serialise to equal strings. Empty for no filter. */
export function filterSearch(filter: ScopeFilter | undefined): string {
  if (!filter) return "";
  const params = new URLSearchParams();
  if (filter.q) params.set("q", filter.q);
  if (filter.era) params.set("era", filter.era);
  if (filter.sort) params.set("sort", filter.sort);
  return params.toString();
}

/** Inverse of `parseScope`. Returns the raw `?from=` value with the
 *  value half percent-encoded. Leaves out the filter: this is the
 *  scope's identity as a *place* (the gallery, an artist, an era), which
 *  is what labels are keyed by. `scopeSearch` is the full query. */
export function encodeScope(scope: Scope): string {
  if (scope.kind === "gallery") return "gallery";
  if (scope.kind === "artist") return `artist:${encodeURIComponent(scope.slug)}`;
  if (scope.kind === "decade") return `decade:${scope.start}`;
  // Era, plate-set and colour ids are pre-validated lowercase kebab — no
  // percent-encoding needed.
  if (scope.kind === "collection") return `collection:${scope.id}`;
  if (scope.kind === "color") return `color:${scope.id}`;
  return `era:${scope.id}`;
}

/** The full query string a scope rides on — `from=…` plus its filter,
 *  without the leading `?`. Inverse of `parseScopeParams`, and stable
 *  for equal scopes, so it doubles as a cache key. */
export function scopeSearch(scope: Scope): string {
  const from = `from=${encodeScope(scope)}`;
  const filter = scope.kind === "gallery" || scope.kind === "decade" ? scope.filter : undefined;
  const rest = filterSearch(filter);
  return rest ? `${from}&${rest}` : from;
}

/** URL of the page that originated this scope, for "back to source"
 *  affordances. Carries the filter, so the page reopens with the same
 *  search, era and sort the visitor left it with. */
export function scopeHref(scope: Scope): string {
  if (scope.kind === "gallery") {
    const search = filterSearch(scope.filter);
    return search ? `/?${search}` : "/";
  }
  if (scope.kind === "artist") return `/artist/${scope.slug}`;
  if (scope.kind === "decade") {
    const search = filterSearch(scope.filter);
    return `/timeline${search ? `?${search}` : ""}#decade-${scope.start}`;
  }
  if (scope.kind === "collection") return `/collection/${scope.id}`;
  if (scope.kind === "color") return `/colours/${scope.id}`;
  return `/era/${scope.id}`;
}

/** Build an `/artwork/<id>` href, threading the scope as `?from=` (and
 *  its filter) when present. */
export function artworkHref(id: string, scope: Scope | null): string {
  if (!scope) return `/artwork/${id}`;
  return `/artwork/${id}?${scopeSearch(scope)}`;
}
