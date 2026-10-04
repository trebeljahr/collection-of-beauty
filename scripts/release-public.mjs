import { copyFile, lstat, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

// Public files that client code fetches after its document loaded. During an
// overlap either replica may answer, so a tab must address its own release's
// bytes: these directories are snapshotted into the SHA-scoped shared
// namespace instead of being read from unversioned /public paths.
export const RELEASE_PUBLIC_DIRS = Object.freeze(["textures", "audio"]);
export const RELEASE_PUBLIC_PREFIX = "release-public";
const MEDIA = /\.(?:jpe?g|png|webp|avif|mp3|ogg|glb)$/i;

export async function snapshotReleasePublic(publicDir, staticDir, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("Invalid release identity.");
  const target = join(staticDir, RELEASE_PUBLIC_PREFIX, sha);
  let files = 0,
    bytes = 0;
  async function walk(from, to) {
    for (const entry of await readdir(from, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("Symlinks are not allowed in public snapshots.");
      if (!/^[a-zA-Z0-9_.-]+$/.test(entry.name)) throw new Error("Unsupported public file name.");
      if (entry.isDirectory()) await walk(join(from, entry.name), join(to, entry.name));
      else if (entry.isFile() && MEDIA.test(entry.name)) {
        await mkdir(to, { recursive: true });
        await copyFile(join(from, entry.name), join(to, entry.name));
        files++;
        bytes += (await lstat(join(to, entry.name))).size;
      }
    }
  }
  for (const directory of RELEASE_PUBLIC_DIRS)
    await walk(join(publicDir, directory), join(target, directory));
  if (!files) throw new Error("Release public snapshot is empty.");
  return { files, bytes };
}
