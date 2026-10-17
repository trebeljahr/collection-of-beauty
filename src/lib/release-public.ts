/**
 * URL of a public file that client code loads lazily (textures, audio).
 * The container release kept a SHA-scoped copy per release in a shared
 * store; the static site serves the plain public path, and a file changed
 * in a deploy reaches an open tab at its next fetch. Kept as one function
 * so the call sites name what they load.
 */
export function releasePublicPath(path: `/textures/${string}` | `/audio/${string}`): string {
  return path;
}
