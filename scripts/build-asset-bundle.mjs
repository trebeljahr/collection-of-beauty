import { access, cp, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { snapshotReleasePublic } from "./release-public.mjs";
import { retainAssetReleases } from "./retain-asset-releases.mjs";

// Docker passes the fixed image paths; a local proof passes scratch paths.
export async function buildAssetBundle({
  app = "/app",
  previousApp = "/previous-app",
  work = "/",
  output = "/retained-assets",
  sha,
  previousSha,
  previousDigest,
}) {
  const current = resolve(work, "asset-current");
  await mkdir(resolve(current, "_next"), { recursive: true });
  // With a deploymentId Next names every build's manifest folder the same
  // (`build-TfctsWXpff2fKS`), and its _ssgManifest.js changes when a route
  // does, which collides in the immutable namespace. App Router pages never
  // request those pages-router manifests, so they stay out of the bundle.
  const buildId = (await readFile(resolve(app, ".next/BUILD_ID"), "utf8")).trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(buildId)) throw new Error("Invalid Next build id.");
  const manifests = resolve(app, ".next/static", buildId);
  await cp(resolve(app, ".next/static"), resolve(current, "_next/static"), {
    recursive: true,
    filter: (source) => resolve(source) !== manifests,
  });
  await cp(resolve(app, "public/version.json"), resolve(current, "version.json"));
  await snapshotReleasePublic(resolve(app, "public"), resolve(current, "_next/static"), sha);
  let previous = resolve(previousApp, "release-assets");
  try {
    await access(previous);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    // The fixed legacy image predates release bundles.
    previous = resolve(work, "asset-previous");
    await mkdir(resolve(previous, "_next"), { recursive: true });
    await cp(resolve(previousApp, ".next/static"), resolve(previous, "_next/static"), {
      recursive: true,
    });
    await cp(resolve(previousApp, "public/version.json"), resolve(previous, "version.json"));
  }
  return retainAssetReleases({ current, previous, output, sha, previousSha, previousDigest });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sha, previousSha, previousDigest] = process.argv.slice(2);
  try {
    await buildAssetBundle({ sha, previousSha, previousDigest });
  } catch {
    console.error("Browser asset bundle failed validation.");
    process.exitCode = 1;
  }
}
