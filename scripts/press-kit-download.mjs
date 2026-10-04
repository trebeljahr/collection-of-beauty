import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// /press-kit.zip outlives a 20-second app drain on slow links. Once its
// content-addressed object is published on the independent asset origin, the
// app only redirects; storage owns the transfer and serves ranges for resumes.
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

// Next.js redirects: empty until the object is published and verified.
export function pressKitRedirects(meta = readPressKit()) {
  if (!meta.published) return [];
  return [{ source: "/press-kit.zip", destination: pressKitUrl(meta), permanent: false }];
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

export async function checkPressKit({
  meta = readPressKit(),
  source = PRESS_KIT_SOURCE,
  remote = false,
  full = false,
  fetchImpl = fetch,
} = {}) {
  const local = await fileSha256(source);
  if (local.sha256 !== meta.sha256 || local.bytes !== meta.bytes)
    throw new Error("Press kit metadata is stale; regenerate and publish a new object.");
  if (!remote && !full) return { mode: "local", published: meta.published, ...local };
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
  return { mode: full ? "full-sha256" : "remote-headers", published: meta.published, ...local };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  // Node's 250 ms per-address default drops slow IPv4 handshakes when IPv6 is unroutable.
  setDefaultAutoSelectFamilyAttemptTimeout(3000);
  try {
    const meta = readPressKit();
    // CI: always the local identity; the remote object only once redirects use it.
    const remote = args.includes("--remote") || (args.includes("--ci") && meta.published);
    console.log(
      JSON.stringify(await checkPressKit({ meta, remote, full: args.includes("--full") })),
    );
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
