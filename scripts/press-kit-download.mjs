import { createHash } from "node:crypto";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// /press-kit.zip outlives a 20-second app drain on slow links, so no image
// carries it (public/press-kit.zip is gitignored). The app redirects to the
// content-addressed object on the independent asset origin; storage owns the
// transfer and serves ranges for resumes.
const root = fileURLToPath(new URL("../", import.meta.url));
export const PRESS_KIT_METADATA = resolve(root, "scripts/press-kit-download.json");
export const PRESS_KIT_SOURCE = resolve(root, "public/press-kit.zip");

export function readPressKit(path = PRESS_KIT_METADATA) {
  return validatePressKit(JSON.parse(readFileSync(path, "utf8")));
}

export function validatePressKit(meta) {
  const fail = () => {
    throw new Error("Invalid press kit download metadata.");
  };
  if (meta?.schema !== 1 || typeof meta.published !== "boolean") fail();
  if (!/^[a-f0-9]{64}$/.test(meta.sha256 ?? "")) fail();
  if (!/^[a-z0-9][a-z0-9._-]*\.zip$/.test(meta.filename ?? "")) fail();
  if (meta.path !== `/downloads/v1/${meta.sha256}/${meta.filename}`) fail();
  if (!Number.isSafeInteger(meta.bytes) || meta.bytes <= 0) fail();
  let origin;
  try {
    origin = new URL(meta.origin);
  } catch {
    fail();
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname);
  if (
    (origin.protocol !== "https:" && !(origin.protocol === "http:" && loopback)) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/" ||
    meta.origin !== origin.origin
  )
    fail();
  return Object.freeze({ ...meta });
}

export function pressKitUrl(meta) {
  return new URL(meta.path, meta.origin).href;
}

// Next.js redirects: empty until the object is published and verified. Without
// the redirect, a build with no local archive answers /press-kit.zip with a 404,
// which is why checkPressKitForRelease refuses an unpublished kit.
export function pressKitRedirects(meta = readPressKit()) {
  if (!meta.published) return [];
  return [{ source: "/press-kit.zip", destination: pressKitUrl(meta), permanent: false }];
}

// Called by the builder. The archive is not in git, so this tracked file is the
// only trace of a rebuild: changed bytes name a new object, unpublished until
// the publish steps have run. The same bytes change nothing.
export function recordPressKitBuild({ sha256, bytes }, path = PRESS_KIT_METADATA) {
  const meta = readPressKit(path);
  if (meta.sha256 === sha256 && meta.bytes === bytes) return meta;
  const next = validatePressKit({
    ...meta,
    published: false,
    path: `/downloads/v1/${sha256}/${meta.filename}`,
    sha256,
    bytes,
  });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export async function fileSha256(path) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: hash.digest("hex"), bytes };
}

// The built archive is the one the metadata names: what publish-press-kit.sh uploads.
export async function checkLocalPressKit({
  meta = readPressKit(),
  source = PRESS_KIT_SOURCE,
} = {}) {
  const local = await fileSha256(source).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
    throw new Error("Press kit is not built; run pnpm marketing:press-kit-zip.");
  });
  if (local.sha256 !== meta.sha256 || local.bytes !== meta.bytes)
    throw new Error("Press kit does not match its metadata; run pnpm marketing:press-kit-zip.");
  return { mode: "local", published: meta.published, ...local };
}

// What storage serves at the content address, by headers or by every byte.
export async function checkRemotePressKit({
  meta = readPressKit(),
  full = false,
  fetchImpl = fetch,
} = {}) {
  const url = pressKitUrl(meta);
  const response = await fetchImpl(url, {
    method: full ? "GET" : "HEAD",
    redirect: "error",
    signal: AbortSignal.timeout(full ? 600_000 : 30_000),
  });
  if (
    response.status !== 200 ||
    Number(response.headers.get("content-length")) !== meta.bytes ||
    !/^attachment(?:;|$)/i.test(response.headers.get("content-disposition") ?? "") ||
    !/immutable/i.test(response.headers.get("cache-control") ?? "") ||
    response.headers.get("accept-ranges") !== "bytes"
  ) {
    await response.body?.cancel();
    throw new Error("Published press kit object failed verification.");
  }
  if (full) {
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > meta.bytes) throw new Error("Published press kit object failed verification.");
      hash.update(chunk);
    }
    if (bytes !== meta.bytes || hash.digest("hex") !== meta.sha256)
      throw new Error("Published press kit object failed verification.");
  } else await response.body?.cancel();
  return {
    mode: full ? "full-sha256" : "remote-headers",
    published: meta.published,
    sha256: meta.sha256,
    bytes: meta.bytes,
  };
}

// CI, before an image is built. The image has no archive to fall back on, and a
// checkout has none to compare, so only every byte ties the metadata's hash to
// what visitors download.
export async function checkPressKitForRelease({ meta = readPressKit(), fetchImpl = fetch } = {}) {
  if (!meta.published)
    throw new Error(
      "Press kit is not published, so /press-kit.zip would be a 404; see scripts/RETAINED-ASSETS.md.",
    );
  return checkRemotePressKit({ meta, full: true, fetchImpl });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  // Node's 250 ms per-address default drops slow IPv4 handshakes when IPv6 is unroutable.
  setDefaultAutoSelectFamilyAttemptTimeout(3000);
  try {
    const meta = readPressKit();
    const full = args.includes("--full");
    let result;
    if (args.includes("--ci")) result = await checkPressKitForRelease({ meta });
    else if (full || args.includes("--remote")) result = await checkRemotePressKit({ meta, full });
    else result = await checkLocalPressKit({ meta });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(
      error instanceof Error &&
        /^(Invalid press kit|Press kit|Published press kit)/.test(error.message)
        ? error.message
        : "Press kit verification failed.",
    );
    process.exitCode = 1;
  }
}
