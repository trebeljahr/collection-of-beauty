"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { artworkAlt } from "@/lib/artwork-format";
import {
  readReleaseState,
  registerReleaseSnapshot,
  rememberReleaseState,
} from "@/lib/release-session";
import { artworkHref, parseScopeParams, type Scope, scopeSearch } from "@/lib/scope-href";
import { Lightbox } from "./lightbox";

type LightboxArtwork = {
  id: string;
  objectKey: string;
  variantWidths: readonly number[] | null;
  title: string;
  englishTitle: string | null;
  artist: string | null;
  year: number | null;
  width: number | null;
  height: number | null;
};

type SavedLightbox = { path: string; artwork: LightboxArtwork | null };
function isSavedLightbox(value: unknown): value is SavedLightbox {
  if (!value || typeof value !== "object") return false;
  const saved = value as SavedLightbox;
  if (typeof saved.path !== "string" || saved.path.length > 2000) return false;
  const art = saved.artwork;
  return (
    art === null ||
    (typeof art === "object" &&
      [art.id, art.objectKey, art.title].every(
        (text) => typeof text === "string" && text.length <= 2000,
      ) &&
      [art.englishTitle, art.artist].every(
        (text) => text === null || (typeof text === "string" && text.length <= 2000),
      ) &&
      [art.year, art.width, art.height].every(
        (number) => number === null || (typeof number === "number" && Number.isFinite(number)),
      ) &&
      (art.variantWidths === null ||
        (Array.isArray(art.variantWidths) &&
          art.variantWidths.length < 50 &&
          art.variantWidths.every((width) => Number.isFinite(width) && width > 0))))
  );
}

type LightboxApi = {
  open: (artwork: LightboxArtwork) => void;
  close: () => void;
  isOpen: boolean;
};

const LightboxContext = createContext<LightboxApi | null>(null);

export function useLightbox(): LightboxApi {
  const ctx = useContext(LightboxContext);
  if (!ctx) {
    throw new Error("useLightbox must be used within <LightboxProvider>");
  }
  return ctx;
}

// `useSearchParams()` forces a CSR bailout, so a component that calls it
// must sit under a Suspense boundary or `next build` fails the static
// export. Isolating the read here keeps that boundary *below* the context
// provider — wrapping the provider itself would let `children` render
// without a context value during the fallback pass and blow up
// `useLightbox()`.
function ScopeParamSync({ onChange }: { onChange: (scopeKey: string | null) => void }) {
  const searchParams = useSearchParams();
  const scope = parseScopeParams(searchParams);
  const scopeKey = scope ? scopeSearch(scope) : null;
  useEffect(() => {
    onChange(scopeKey);
  }, [scopeKey, onChange]);
  return null;
}

// Hosted at the /artwork layout level so prev/next navigation inside the
// lightbox doesn't unmount the overlay. The lightbox holds its own index
// into a lazily-fetched artworks list and key-caches it per scope (the
// `?from=` value plus a filtered gallery's `q` / `era` / `sort`) so each
// scope's order survives switching between (e.g.) two different
// artist-scoped works in one session.
export function LightboxProvider({ children }: { children: ReactNode }) {
  // Starts null and settles to the real scope on the first client
  // pass. The artworks list is fetched lazily on open(), which never
  // happens before hydration, so the one-frame delay is unobservable.
  const [scopeParam, setScopeParam] = useState<string | null>(null);
  return (
    <>
      <Suspense fallback={null}>
        <ScopeParamSync onChange={setScopeParam} />
      </Suspense>
      <LightboxProviderInner scopeParam={scopeParam}>{children}</LightboxProviderInner>
    </>
  );
}

function LightboxProviderInner({
  scopeParam,
  children,
}: {
  /** `scopeSearch()` of the current scope — `from=…` plus any filter. */
  scopeParam: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const scope = useMemo<Scope | null>(
    () => parseScopeParams(new URLSearchParams(scopeParam ?? "")),
    [scopeParam],
  );
  // Key the cache by the scope's query string (or "__all__" for the
  // global pool). Same artwork can sit in both the artist and era
  // lists at different indices, so identity hinges on the scope string.
  const scopeKey = scopeParam ?? "__all__";

  const [current, setCurrent] = useState<LightboxArtwork | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  useEffect(() => {
    const saved = readReleaseState("artwork-lightbox", isSavedLightbox);
    if (saved?.path === window.location.pathname + window.location.search) {
      currentRef.current = saved.artwork;
      setCurrent(saved.artwork);
    }
    return registerReleaseSnapshot("artwork-lightbox", () =>
      currentRef.current
        ? {
            path: window.location.pathname + window.location.search,
            artwork: currentRef.current,
          }
        : undefined,
    );
  }, []);
  const [artworks, setArtworks] = useState<LightboxArtwork[] | null>(null);
  const artworksByScopeRef = useRef<Map<string, LightboxArtwork[]>>(new Map());
  const promisesByScopeRef = useRef<Map<string, Promise<LightboxArtwork[]>>>(new Map());
  // Latest scope, readable from an in-flight fetch's continuation.
  const scopeKeyRef = useRef(scopeKey);
  scopeKeyRef.current = scopeKey;

  const loadArtworks = useCallback(() => {
    const cached = artworksByScopeRef.current.get(scopeKey);
    if (cached) {
      // setState is idempotent — only fire when actually swapping lists.
      if (artworks !== cached) setArtworks(cached);
      return Promise.resolve(cached);
    }
    const existing = promisesByScopeRef.current.get(scopeKey);
    if (existing) return existing;

    const url = scope ? `/api/artworks/scope?${scopeParam}` : "/api/artworks";
    const p = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
        return res.json() as Promise<LightboxArtwork[]>;
      })
      .then((data) => {
        artworksByScopeRef.current.set(scopeKey, data);
        // Only swap the active list if we're still on the same scope by
        // the time the fetch resolves (user may have navigated away).
        if (scopeKey === scopeKeyRef.current) {
          setArtworks(data);
        }
        return data;
      })
      .catch((err) => {
        // Drop the memo so the next open() retries, then resolve empty
        // rather than rethrowing: both call sites discard the promise
        // with `void`, so a rejection here would surface as an unhandled
        // rejection for a failure whose intended degradation — no
        // prev/next chevrons, the artwork itself still shown — is benign.
        promisesByScopeRef.current.delete(scopeKey);
        console.warn("lightbox: neighbour list unavailable, chevrons disabled", err);
        return [];
      });
    promisesByScopeRef.current.set(scopeKey, p);
    return p;
  }, [artworks, scopeParam, scope, scopeKey]);

  // When the scope changes (chevron click, deep link, manual URL edit) the
  // active list must swap to match. If we've already fetched this scope
  // it's a synchronous Map lookup; otherwise the next open()/navigate()
  // triggers a fresh fetch. We don't fetch eagerly here — the lightbox
  // might never be opened on this page view.
  useEffect(() => {
    const cached = artworksByScopeRef.current.get(scopeKey);
    setArtworks(cached ?? null);
  }, [scopeKey]);

  const open = useCallback(
    (artwork: LightboxArtwork) => {
      currentRef.current = artwork;
      setCurrent(artwork);
      void loadArtworks();
    },
    [loadArtworks],
  );

  const close = useCallback(() => {
    currentRef.current = null;
    setCurrent(null);
    rememberReleaseState("artwork-lightbox", {
      path: window.location.pathname + window.location.search,
      artwork: null,
    });
  }, []);

  useEffect(() => {
    if (current) void loadArtworks();
  }, [current, loadArtworks]);

  const index = useMemo(() => {
    if (!current || !artworks) return -1;
    return artworks.findIndex((a) => a.id === current.id);
  }, [artworks, current]);

  const navigate = useCallback(
    (delta: number) => {
      if (!artworks || index < 0) {
        void loadArtworks();
        return;
      }
      const target = index + delta;
      if (target < 0 || target >= artworks.length) return;
      const artwork = artworks[target];
      currentRef.current = artwork;
      setCurrent(artwork);
      // Soft URL sync: page below the modal swaps for the new artwork
      // (so closing the lightbox lands on what the user was viewing,
      // and reload preserves state). The `?from=` param rides along so
      // chevron-driven nav keeps the user in their original scope.
      // Fired outside the setState updater because router.push triggers
      // an update in the Router component, which React forbids during
      // the render phase that the updater function runs in.
      router.push(artworkHref(artwork.id, scope), { scroll: false });
    },
    [artworks, index, loadArtworks, router, scope],
  );

  const api = useMemo<LightboxApi>(
    () => ({ open, close, isOpen: current != null }),
    [open, close, current],
  );

  const hasPrev = artworks != null && index > 0;
  const hasNext = artworks != null && index >= 0 && index < artworks.length - 1;

  return (
    <LightboxContext.Provider value={api}>
      {children}
      <Lightbox
        open={current != null}
        onClose={close}
        objectKey={current?.objectKey ?? ""}
        variantWidths={current?.variantWidths ?? null}
        alt={current ? artworkAlt(current) : ""}
        srcWidth={current?.width}
        srcHeight={current?.height}
        caption={current ? artworkAlt(current) : undefined}
        onPrev={hasPrev ? () => navigate(-1) : null}
        onNext={hasNext ? () => navigate(1) : null}
      />
    </LightboxContext.Provider>
  );
}
