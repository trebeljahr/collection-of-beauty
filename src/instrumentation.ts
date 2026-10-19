import type { Instrumentation } from "next";

// Server-side error reporting (lib/error-reporting/server.ts). Both hooks
// import it on demand and only on the Node runtime, so a server without
// SENTRY_DSN loads no SDK, and no edge bundle ever pulls in a Node one.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.SENTRY_DSN) return;
  const { startServerReporting } = await import("./lib/error-reporting/server");
  await startServerReporting();
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.SENTRY_DSN) return;
  const { reportServerError } = await import("./lib/error-reporting/server");
  const digest = (error as { digest?: unknown } | null)?.digest;
  await reportServerError(error, {
    source: "request",
    request: { method: request.method, path: request.path },
    route: context.routePath,
    routeType: context.routeType,
    ...(typeof digest === "string" ? { digest } : {}),
  });
};
