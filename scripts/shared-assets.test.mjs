import assert from "node:assert/strict";
import {
  access,
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { retainAssetReleases } from "./retain-asset-releases.mjs";
import { publishRelease, storeUsage } from "./shared-asset-releases.mjs";
import { fixture, ids, media } from "./shared-assets-fixtures.mjs";

test("publishes future assets before readiness and protects all live image leases during bounded GC", async () => {
  const f = await fixture();
  try {
    await f.lease(ids[1]);
    await f.publish(1);
    await f.lease(ids[2]);
    await f.publish(2);
    assert.equal(
      await readFile(join(f.store, "releases", ids[2], "fixture.json"), "utf8"),
      `metadata-${ids[2]}`,
    );
    assert.equal(
      await readFile(join(f.store, "_next/static/chunks", ids[2] + ".js"), "utf8"),
      `window.revision='${ids[2]}';`,
    );
    let meta = JSON.parse(await readFile(join(f.store, "releases.json")));
    assert.deepEqual(meta.releases, [ids[2], ids[1], ids[0]]); // same metadata through old B and new C
    await f.publish(1); // restarting B must not rewind C or expire a C tab
    assert.equal(JSON.parse(await readFile(join(f.store, "releases.json"))).head, ids[2]);
    f.held.delete(ids[2]);
    await f.lease(ids[3]);
    await f.publish(3);
    f.held.delete(ids[3]);
    await f.lease(ids[4]);
    await f.publish(4);
    meta = JSON.parse(await readFile(join(f.store, "releases.json")));
    assert.deepEqual(meta.window, [ids[4], ids[3], ids[2]]);
    assert.ok(meta.releases.includes(ids[1]), "old B still has a running container lease");
    await access(join(f.store, "releases", ids[1]));
    f.held.delete(ids[1]);
    await f.publish(4);
    await assert.rejects(access(join(f.store, "releases", ids[1])));
    await assert.rejects(access(join(f.store, "_next/static/chunks", ids[1] + ".js")));
    await access(join(f.store, "_next/static/chunks", ids[0] + ".js")); // fixed legacy baseline
    await f.lease(ids[1]);
    await assert.rejects(f.publish(1), /Prepared head/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test("refuses absent leases, changed immutable exports, unknown lease names, and symlinks", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.publish(1), /Missing image lease/);
    await f.lease(ids[1]);
    await f.publish(1);
    await writeFile(join(f.store, "releases", ids[1], "fixture.json"), "modified");
    await assert.rejects(f.publish(1), /Immutable export/);
    await writeFile(join(f.store, "releases", ids[1], "fixture.json"), `metadata-${ids[1]}`);
    await writeFile(join(f.store, "leases", "unknown.lock"), "");
    await assert.rejects(f.publish(1), /Invalid lease/);
    await rm(join(f.store, "leases", "unknown.lock"));
    await symlink("/tmp", join(f.store, "escape"));
    await assert.rejects(f.publish(1), /Unsupported/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("caps accumulated store bytes before adding another image", async () => {
  const f = await fixture();
  try {
    await f.lease(ids[1]);
    const oversized = join(f.store, "interrupted-publication");
    await writeFile(oversized, "");
    await truncate(oversized, 1025 * 1024 * 1024);
    await assert.rejects(f.publish(1), /capacity/);
    await assert.rejects(access(join(f.store, "releases.json")));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("SHA-scoped public snapshots follow release retention and share inodes with their export", async () => {
  const f = await fixture();
  try {
    await f.lease(ids[1]);
    await f.publish(1);
    await f.lease(ids[2]);
    await f.publish(2);
    for (const id of [ids[1], ids[2]]) {
      const shared = join(f.store, "_next/static", media(id));
      assert.equal(await readFile(shared, "utf8"), `texture-${id}`);
      const exported = join(f.store, "releases", id, "_next/static", media(id));
      assert.equal((await lstat(shared)).ino, (await lstat(exported)).ino);
    }
    // Same public path, different release: each tab keeps its own bytes.
    assert.notEqual(media(ids[1]), media(ids[2]));
    f.held.delete(ids[1]);
    f.held.delete(ids[2]);
    for (const i of [3, 4]) {
      await f.lease(ids[i]);
      await f.publish(i);
      f.held.delete(ids[i]);
    }
    await f.lease(ids[4]);
    await f.publish(4);
    await assert.rejects(access(join(f.store, "_next/static", media(ids[1]))));
    await access(join(f.store, "_next/static", media(ids[2])));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("store usage counts hard-linked names once", async () => {
  const f = await fixture();
  try {
    await f.lease(ids[1]);
    await f.publish(1);
    const usage = await storeUsage(f.store);
    let naive = 0;
    async function walk(path) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isDirectory()) await walk(join(path, entry.name));
        else naive += (await lstat(join(path, entry.name))).size;
      }
    }
    await walk(f.store);
    assert.ok(usage.bytes < naive, "linked snapshot bytes are not double counted");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("after a rollback the next build replaces the abandoned head once it stops running", async () => {
  const f = await fixture();
  try {
    await f.lease(ids[1]);
    await f.publish(1);
    await f.lease(ids[2]);
    await f.publish(2);
    f.held.delete(ids[1]);
    // Roll back from C to B: B restarts inside the window, head stays C.
    await f.lease(ids[1]);
    await f.publish(1);
    assert.equal(JSON.parse(await readFile(join(f.store, "releases.json"))).head, ids[2]);
    // The next build is a new child of B.
    const x = "f".repeat(40);
    const raw = join(f.root, "raw-x");
    await mkdir(join(raw, "_next/static/chunks"), { recursive: true });
    await writeFile(join(raw, "version.json"), JSON.stringify({ commit: x }));
    await writeFile(join(raw, "_next/static/chunks", `${x}.js`), `window.revision='${x}';`);
    const image = join(f.root, "image-x");
    await retainAssetReleases(
      {
        current: raw,
        previous: f.exports[1],
        output: image,
        sha: x,
        previousSha: ids[1],
        previousDigest: "sha256:" + "1".repeat(64),
      },
      { bootstrap: f.bootstrap },
    );
    await f.lease(x);
    const isHeld = (path) => f.held.has(path.split("/").at(-1).slice(0, 40));
    // C is still running: its assets must not be dropped under it.
    await assert.rejects(
      publishRelease(image, f.store, { bootstrap: f.bootstrap, isHeld }),
      /Prepared head/,
    );
    f.held.delete(ids[2]);
    const meta = await publishRelease(image, f.store, { bootstrap: f.bootstrap, isHeld });
    assert.equal(meta.head, x);
    assert.deepEqual(meta.window, [x, ids[1], ids[0]]);
    assert.ok(!meta.releases.includes(ids[2]));
    await assert.rejects(access(join(f.store, "_next/static/chunks", ids[2] + ".js")));
    await access(join(f.store, "_next/static/chunks", ids[1] + ".js"));
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
