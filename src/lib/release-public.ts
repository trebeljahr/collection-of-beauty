const COMMIT = process.env.NEXT_PUBLIC_BUILD_COMMIT;

/**
 * URL of a public file that client code loads lazily. A release build
 * addresses its own SHA-scoped snapshot in the shared asset store, so the
 * bytes stay correct whichever replica answers during a rolling overlap
 * (see scripts/RETAINED-ASSETS.md). Development keeps the plain path.
 */
export function releasePublicPath(path: `/textures/${string}` | `/audio/${string}`): string {
  return COMMIT && /^[a-f0-9]{40}$/.test(COMMIT)
    ? `/_next/static/release-public/${COMMIT}${path}`
    : path;
}
