"use client";

import { useSearchParams } from "next/navigation";
import { type ReactNode, Suspense } from "react";

type Props = {
  /** Query parameter to read. */
  param: string;
  /** What to show for each value of it. */
  cases: Record<string, ReactNode>;
  /** For any other value, no value, and the static HTML before hydration. */
  fallback?: ReactNode;
};

function Switch({ param, cases, fallback = null }: Props) {
  const value = useSearchParams().get(param) ?? "";
  return Object.hasOwn(cases, value) ? cases[value] : fallback;
}

/** Part of a static page that depends on its query string, which only the
 *  browser can read once the page is a file. */
export function SearchParamSwitch(props: Props) {
  return (
    <Suspense fallback={props.fallback ?? null}>
      <Switch {...props} />
    </Suspense>
  );
}
