import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkLocalPressKit,
  checkPressKitForRelease,
  checkRemotePressKit,
  pressKitRedirects,
  readPressKit,
  recordPressKitBuild,
  validatePressKit,
} from "./press-kit-download.mjs";

const bytes = Buffer.from("press kit fixture bytes\n".repeat(64));
const sha256 = createHash("sha256").update(bytes).digest("hex");
const meta = (origin, extra = {}) =>
  validatePressKit({
    schema: 1,
    published: true,
    origin,
    path: `/downloads/v1/${sha256}/collection-of-beauty-press-kit.zip`,
    sha256,
    bytes: bytes.length,
    filename: "collection-of-beauty-press-kit.zip",
    ...extra,
  });

test("committed metadata is valid, and only a published object redirects", () => {
  const committed = readPressKit();
  assert.deepEqual(pressKitRedirects({ ...committed, published: false }), []);
  assert.equal(pressKitRedirects({ ...committed, published: true }).length, 1);
});

test("a published object becomes one temporary redirect to its content address", () => {
  const m = meta("https://assets.collectionofbeauty.com");
  assert.deepEqual(pressKitRedirects(m), [
    {
      source: "/press-kit.zip",
      destination: `https://assets.collectionofbeauty.com/downloads/v1/${sha256}/collection-of-beauty-press-kit.zip`,
      permanent: false,
    },
  ]);
});

test("rejects metadata that is not content addressed or not an independent origin", () => {
  const origin = "https://assets.collectionofbeauty.com";
  for (const extra of [
    { path: "/press-kit.zip" },
    { sha256: "0".repeat(63) },
    { filename: "../escape.zip" },
    { bytes: 0 },
    { origin: "http://assets.collectionofbeauty.com" },
    { origin: "https://user:pass@assets.collectionofbeauty.com" },
    { origin: "https://assets.collectionofbeauty.com/prefix" },
    { published: "yes" },
  ])
    assert.throws(() => meta(origin, extra), /Invalid press kit/);
});

test("the local check needs the built archive the metadata names", async () => {
  const root = await mkdtemp(join(tmpdir(), "press-kit-"));
  try {
    const m = meta("https://assets.collectionofbeauty.com");
    const source = join(root, "press-kit.zip");
    await assert.rejects(checkLocalPressKit({ meta: m, source }), /not built/);
    await writeFile(source, bytes);
    assert.equal((await checkLocalPressKit({ meta: m, source })).mode, "local");
    await writeFile(source, "changed");
    await assert.rejects(checkLocalPressKit({ meta: m, source }), /does not match/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a rebuild with new bytes names a new unpublished object; the same bytes change nothing", async () => {
  const root = await mkdtemp(join(tmpdir(), "press-kit-"));
  try {
    const path = join(root, "metadata.json");
    const published = `${JSON.stringify(meta("https://assets.collectionofbeauty.com"), null, 2)}\n`;
    await writeFile(path, published);

    assert.equal(recordPressKitBuild({ sha256, bytes: bytes.length }, path).published, true);
    assert.equal(await readFile(path, "utf8"), published);

    const rebuilt = "a".repeat(64);
    recordPressKitBuild({ sha256: rebuilt, bytes: 7 }, path);
    assert.deepEqual(readPressKit(path), {
      schema: 1,
      published: false,
      origin: "https://assets.collectionofbeauty.com",
      path: `/downloads/v1/${rebuilt}/collection-of-beauty-press-kit.zip`,
      sha256: rebuilt,
      bytes: 7,
      filename: "collection-of-beauty-press-kit.zip",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a release needs a published object and refuses an unpublished one without asking storage", async () => {
  await assert.rejects(
    checkPressKitForRelease({
      meta: meta("https://assets.collectionofbeauty.com", { published: false }),
      fetchImpl: () => assert.fail("an unpublished kit has no object to fetch"),
    }),
    /not published/,
  );
});

test("verifies the remote object's headers and every byte, with no archive on disk", async () => {
  let body = bytes,
    disposition = 'attachment; filename="collection-of-beauty-press-kit.zip"';
  const server = createServer((req, res) => {
    res.writeHead(200, {
      "Content-Length": body.length,
      "Content-Disposition": disposition,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Accept-Ranges": "bytes",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const m = meta(`http://127.0.0.1:${server.address().port}`);
    assert.equal((await checkRemotePressKit({ meta: m })).mode, "remote-headers");
    assert.equal((await checkRemotePressKit({ meta: m, full: true })).mode, "full-sha256");
    assert.equal((await checkPressKitForRelease({ meta: m })).mode, "full-sha256");
    body = Buffer.from(bytes).fill(0x41, 0, 4);
    await assert.rejects(checkRemotePressKit({ meta: m, full: true }), /failed verification/);
    await assert.rejects(checkPressKitForRelease({ meta: m }), /failed verification/);
    body = bytes;
    disposition = "inline";
    await assert.rejects(checkRemotePressKit({ meta: m }), /failed verification/);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
