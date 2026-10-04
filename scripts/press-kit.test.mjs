import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkPressKit,
  pressKitRedirects,
  readPressKit,
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

test("committed metadata names the exact tracked press kit", async () => {
  const committed = readPressKit();
  assert.deepEqual(pressKitRedirects({ ...committed, published: false }), []);
  const result = await checkPressKit({ meta: committed });
  assert.equal(result.sha256, committed.sha256);
  assert.equal(result.bytes, committed.bytes);
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

test("verifies the remote object's headers and every byte", async () => {
  const root = await mkdtemp(join(tmpdir(), "press-kit-"));
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
    const source = join(root, "press-kit.zip");
    await writeFile(source, bytes);
    const m = meta(`http://127.0.0.1:${server.address().port}`);
    assert.equal((await checkPressKit({ meta: m, source, remote: true })).mode, "remote-headers");
    assert.equal((await checkPressKit({ meta: m, source, full: true })).mode, "full-sha256");
    body = Buffer.from(bytes).fill(0x41, 0, 4);
    await assert.rejects(checkPressKit({ meta: m, source, full: true }), /failed verification/);
    body = bytes;
    disposition = "inline";
    await assert.rejects(checkPressKit({ meta: m, source, remote: true }), /failed verification/);
    await writeFile(source, "changed");
    await assert.rejects(checkPressKit({ meta: m, source }), /stale/);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(root, { recursive: true, force: true });
  }
});
