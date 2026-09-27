"use client";

import { useEffect, useSyncExternalStore } from "react";
import { type Scope, scopeSearch } from "@/lib/scope-href";

export type ScopeOrder =
  | { status: "loading" }
  | { status: "failed" }
  | {
      status: "ready";
      ids: string[];
      /** id → position in `ids`, so each detail page finds itself in O(1). */
      positions: Map<string, number>;
    };

const LOADING: ScopeOrder = { status: "loading" };
const FAILED: ScopeOrder = { status: "failed" };

// Module scope, not component state: a walk through a scope is a chain
// of separate /artwork/<id> pages, each mounting its own nav. Keeping
// the order here means only the first page of the walk fetches it, and
// every later one renders its prev/next on the first frame.
const orders = new Map<string, ScopeOrder>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function settle(key: string, order: ScopeOrder): void {
  orders.set(key, order);
  for (const listener of listeners) listener();
}

function load(key: string): void {
  const current = orders.get(key);
  // A failed order is retried by the next page that asks for it.
  if (current && current.status !== "failed") return;
  settle(key, LOADING);
  fetch(`/api/artworks/scope?${key}&fields=id`)
    .then((res) => {
      if (!res.ok) throw new Error(`scope order ${key}: ${res.status}`);
      return res.json() as Promise<string[]>;
    })
    .then((ids) => {
      settle(key, { status: "ready", ids, positions: new Map(ids.map((id, i) => [id, i])) });
    })
    .catch((err) => {
      console.warn("artwork nav: scope order unavailable, using catalogue order", err);
      settle(key, FAILED);
    });
}

/** The ordered ids of a scope, fetched once per session and shared by
 *  every detail page in it. Null for no scope. */
export function useScopeOrder(scope: Scope | null): ScopeOrder | null {
  const key = scope ? scopeSearch(scope) : null;
  const order = useSyncExternalStore(
    subscribe,
    () => (key ? (orders.get(key) ?? LOADING) : null),
    () => null,
  );
  useEffect(() => {
    if (key) load(key);
  }, [key]);
  return order;
}
