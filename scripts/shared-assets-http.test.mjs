import assert from "node:assert/strict";
import { once } from "node:events";
import { rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { fixture, ids } from "./shared-assets-fixtures.mjs";

const { handler } = createRequire(import.meta.url)("../shared-assets.cjs");
test("running old/new handlers serve changed future/old chunks and guard mismatched RSC in both directions", async () => {
  const f = await fixture(),
    servers = [];
  const start = async (id) => {
    const shared = handler(f.store, id);
    const server = createServer((req, res) => {
      if (shared(req, res)) return;
      res.setHeader("Content-Type", "text/html");
      res.end(`<meta name="build-commit" content="${id}">`);
    });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return `http://127.0.0.1:${server.address().port}`;
  };
  try {
    await f.lease(ids[1]);
    await f.publish(1);
    const b = await start(ids[1]);
    assert.equal((await fetch(b + `/_next/static/chunks/${ids[2]}.js`)).status, 404);
    await f.lease(ids[2]);
    await f.publish(2);
    const c = await start(ids[2]);
    for (const server of [b, c]) {
      for (const id of [ids[1], ids[2]]) {
        const r = await fetch(server + `/_next/static/chunks/${id}.js?dpl=${id}`);
        assert.equal(r.status, 200);
        assert.match(r.headers.get("content-type"), /javascript/);
        assert.equal(await r.text(), `window.revision='${id}';`);
      }
      const metadata = await (await fetch(server + "/releases.json")).json();
      assert.equal(metadata.head, ids[2]);
      const range = await fetch(server + `/_next/static/chunks/${ids[2]}.js`, {
        headers: { Range: "bytes=0-5" },
      });
      assert.equal(range.status, 206);
      assert.equal(await range.text(), "window");
      assert.equal((await fetch(server + "/_next/static/%2e%2e%2fsecret")).status, 400);
      assert.equal((await fetch(server + "/_next/static/chunks/missing.js")).status, 404);
    }
    for (const [server, foreign] of [
      [b, ids[2]],
      [c, ids[1]],
    ]) {
      const r = await fetch(server + "/artists?_rsc=fixture", {
        headers: { RSC: "1", "x-deployment-id": foreign },
      });
      assert.equal(r.status, 409);
      assert.match(r.headers.get("content-type"), /text\/plain/);
    }
    assert.equal(
      (
        await fetch(c + "/artists?_rsc=fixture", {
          headers: { RSC: "1", "x-deployment-id": "../../oops" },
        })
      ).status,
      400,
    );
    const large = "/* a compressible public browser module */\n".repeat(100);
    await writeFile(join(f.store, "_next/static/chunks/large.js"), large);
    const compressed = await fetch(c + "/_next/static/chunks/large.js", {
      headers: { "Accept-Encoding": "gzip" },
    });
    assert.equal(compressed.headers.get("content-encoding"), "gzip");
    assert.equal(await compressed.text(), large);
    const identity = await fetch(c + "/_next/static/chunks/large.js", {
      headers: { "Accept-Encoding": "gzip;q=0" },
    });
    assert.equal(identity.headers.get("content-encoding"), null);
    assert.equal(await identity.text(), large);
    const partial = await fetch(c + "/_next/static/chunks/large.js", {
      headers: { "Accept-Encoding": "gzip", Range: "bytes=0-5" },
    });
    assert.equal(partial.headers.get("content-encoding"), null);
    assert.equal(partial.status, 206);
    assert.equal(await partial.text(), large.slice(0, 6));
    await writeFile(join(f.store, "_next/static/chunks/empty.js"), "");
    assert.equal((await fetch(c + "/_next/static/chunks/empty.js")).status, 200);
  } finally {
    for (const s of servers) {
      s.closeAllConnections();
      await new Promise((r) => s.close(r));
    }
    await rm(f.root, { recursive: true, force: true });
  }
});
