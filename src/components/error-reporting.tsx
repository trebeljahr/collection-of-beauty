"use client";
import { useEffect } from "react";
import { startErrorReporting } from "@/lib/error-reporting/reporter";

/** Loads the error reporter after mount, in a build that has a DSN. Renders nothing. */
export function ErrorReporting() {
  useEffect(() => {
    void startErrorReporting();
  }, []);
  return null;
}
