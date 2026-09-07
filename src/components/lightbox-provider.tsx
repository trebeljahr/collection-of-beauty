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
import { artworkHref, parseScope, type Scope } from "@/lib/scope-href";
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
function FromParamSync({ onChange }: { onChange: (from: string | null) => void }) {
  const searchParams = useSearchParams();
  const from = searchParams?.get("from") ?? null;
  useEffect(() => {
    onChange(from);
  }, [from, onChange]);
  return null;
}

// Hosted at the /artwork layout level so prev/next navigation inside the
// lightbox doesn't unmount the overlay. The lightbox holds its own index
// into a lazily-fetched artworks list and key-caches it per `?from=`
// scope so each scope's order survives switching between (e.g.) two
// different artist-scoped works in one session.
export function LightboxProvider({ children }: { children: ReactNode }) {
  // Starts null and settles to the real `?from=` on the first client
  // pass. The artworks list is fetched lazily on open(), which never
  // happens before hydration, so the one-frame delay is unobservable.
  const [fromParam, setFromParam] = useState<string | null>(null);
  return (
    <>
      <Suspense fallback={null}>
        <FromParamSync onChange={setFromParam} />
      </Suspense>
      <LightboxProviderInner fromParam={fromParam}>{children}</LightboxProviderInner>
    </>
  );
}

function LightboxProviderInner({
  fromParam,
  children,
}: {
  fromParam: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const scope = useMemo<Scope | null>(() => parseScope(fromParam), [fromParam]);
  // Key the cache by the raw `?from=` value (or "__all__" for the
  // global pool). Same artwork can sit in both the artist and movement
  // lists at different indices, so identity hinges on the scope string.
  const scopeKey = fromParam ?? "__all__";

  const [current, setCurrent] = useState<LightboxArtwork | null>(null);
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

    const url = scope ? `/api/artworks/scope?from=${fromParam}` : "/api/artworks";
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
        promisesByScopeRef.current.delete(scopeKey);
        throw err;
      });
    promisesByScopeRef.current.set(scopeKey, p);
    return p;
  }, [artworks, fromParam, scope, scopeKey]);

  // When ?from= changes (chevron click, deep link, manual URL edit) the
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
      setCurrent(artwork);
      void loadArtworks();
    },
    [loadArtworks],
  );

  const close = useCallback(() => setCurrent(null), []);

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
