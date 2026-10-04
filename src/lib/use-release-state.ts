"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { readReleaseState, registerReleaseSnapshot, rememberReleaseState } from "./release-session";

/** Restore only after hydration; persist user edits synchronously before a hard navigation. */
export function useReleaseState<T extends string | number | boolean>(
  key: string,
  initial: T,
  valid: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);
  const latest = useRef(value);
  const validator = useRef(valid);
  validator.current = valid;
  useEffect(() => {
    setReady(false);
    const restored = readReleaseState(key, validator.current);
    const next = restored ?? initial;
    latest.current = next;
    setValue(next);
    setReady(true);
    return registerReleaseSnapshot(key, () =>
      Object.is(latest.current, initial) ? undefined : latest.current,
    );
  }, [key, initial]);
  const update = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      const result =
        typeof next === "function" ? (next as (previous: T) => T)(latest.current) : next;
      latest.current = result;
      rememberReleaseState(key, result);
      setValue(result);
    },
    [key],
  );
  return [value, update, ready];
}

export const isShortText = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 1000;
export const isPageLimit = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100_000;
