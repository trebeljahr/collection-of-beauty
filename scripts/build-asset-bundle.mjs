import { access, cp, mkdir } from "node:fs/promises";
import { retainAssetReleases } from "./retain-asset-releases.mjs";

const [sha, previousSha, previousDigest] = process.argv.slice(2);
try {
  await mkdir("/asset-current/_next", { recursive: true });
  await cp("/app/.next/static", "/asset-current/_next/static", { recursive: true });
  await cp("/app/public/version.json", "/asset-current/version.json");
  let previous = "/previous-app/release-assets";
  try {
    await access(previous);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    previous = "/asset-previous";
    await mkdir(previous + "/_next", { recursive: true });
    await cp("/previous-app/.next/static", previous + "/_next/static", { recursive: true });
    await cp("/previous-app/public/version.json", previous + "/version.json");
  }
  await retainAssetReleases({
    current: "/asset-current",
    previous,
    output: "/retained-assets",
    sha,
    previousSha,
    previousDigest,
  });
} catch {
  console.error("Browser asset bundle failed validation.");
  process.exitCode = 1;
}
