import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assetInventoryHash, retainAssetReleases } from "./retain-asset-releases.mjs";
import { publishRelease, STORE_ID } from "./shared-asset-releases.mjs";
export const ids = ["a", "b", "c", "d", "e"].map((x) => x.repeat(40));
// Turbopack chunk names can contain "~" (e.g. `0kl6_f75l1~9u.js`).
export const tildeChunk = (id) => `chunks/0kl6_f75l1~${id.slice(0, 2)}.js`;
export const media = (id) => `release-public/${id}/textures/wall/wall_diff_1k.jpg`;
const digest = "sha256:" + "1".repeat(64);
export async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shared-docs-"));
  const store = join(root, "store");
  await mkdir(store);
  await mkdir(join(store, "leases"));
  await writeFile(join(store, ".store-identity.json"), JSON.stringify(STORE_ID));
  const exports = [];
  let bootstrap;
  for (let i = 0; i < ids.length; i++) {
    const raw = join(root, `raw-${i}`);
    await mkdir(join(raw, "_next/static/chunks"), { recursive: true });
    await writeFile(join(raw, "version.json"), JSON.stringify({ commit: ids[i] }));
    await writeFile(join(raw, "fixture.json"), `metadata-${ids[i]}`);
    await writeFile(join(raw, "index.html"), `<meta name="build-sha" content="${ids[i]}">`);
    await writeFile(
      join(raw, "_next/static/chunks", `${ids[i]}.js`),
      `window.revision='${ids[i]}';`,
    );
    await writeFile(join(raw, "_next/static", tildeChunk(ids[i])), `window.tilde='${ids[i]}';`);
    if (i) {
      await mkdir(join(raw, "_next/static", media(ids[i]), ".."), { recursive: true });
      await writeFile(join(raw, "_next/static", media(ids[i])), `texture-${ids[i]}`);
    }
    if (!i) {
      bootstrap = {
        sha: ids[0],
        digest,
        inventorySha256: await assetInventoryHash(join(raw, "_next/static")),
      };
      exports.push(raw);
    } else {
      const output = join(root, `image-${i}`);
      await retainAssetReleases(
        {
          current: raw,
          previous: exports.at(-1),
          output,
          sha: ids[i],
          previousSha: ids[i - 1],
          previousDigest: digest,
        },
        { bootstrap },
      );
      exports.push(output);
    }
  }
  const held = new Set();
  const lease = async (id) => {
    await writeFile(join(store, "leases", id + ".lock"), "");
    held.add(id);
  };
  const publish = (i) =>
    publishRelease(exports[i], store, {
      bootstrap,
      isHeld: (path) => held.has(path.split("/").at(-1).slice(0, 40)),
    });
  return { root, store, exports, bootstrap, held, lease, publish };
}
