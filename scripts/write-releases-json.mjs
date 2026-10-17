import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// out/releases.json: the commits whose browser files this upload still
// holds, newest first. Open tabs poll it (release-navigation-guard.tsx)
// and reload once their own commit has dropped out, before a lazy chunk
// of theirs can 404. Read from the chunk carry's manifest
// (scripts/carry-static.mjs, /release-assets.json); a build without a
// carry holds only its own commit.

export function releasesOf(out, commit) {
  const manifestPath = join(out, "release-assets.json");
  const carried = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8")).releases.map((r) => r.sha)
    : [];
  const releases = [commit, ...carried.filter((sha) => sha !== commit)];
  if (!releases.every((sha) => /^[a-f0-9]{40}$/.test(sha))) {
    throw new Error("releases.json takes full lowercase commit SHAs only.");
  }
  return { schema: 2, releases: releases.slice(0, 6) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(process.argv[2] ?? "out");
  const body = releasesOf(out, process.env.NEXT_PUBLIC_BUILD_COMMIT);
  writeFileSync(join(out, "releases.json"), `${JSON.stringify(body)}\n`);
  console.log(`[releases] ${body.releases.length} release(s) held: ${body.releases.join(", ")}`);
}
