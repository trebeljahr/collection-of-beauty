import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCollectionZips, verifyCollectionZips } from "../src/lib/collection-zips.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
export const COLLECTION_ZIPS_METADATA = resolve(root, "src/data/collection-zips.json");

export function readCollectionZips(path = COLLECTION_ZIPS_METADATA) {
  return validateCollectionZips(JSON.parse(readFileSync(path, "utf8")));
}

// node scripts/collection-zips.mjs --verify [--mark-published]
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const meta = readCollectionZips();
  const results = await verifyCollectionZips(meta);
  let failed = false;
  for (const [slug, ok] of Object.entries(results)) {
    console.log(
      `${ok ? "ok  " : "FAIL"} ${slug} ${new URL(meta.sets[slug].path, meta.origin).href}`,
    );
    if (!ok) failed = true;
    else if (process.argv.includes("--mark-published")) meta.sets[slug].published = true;
  }
  if (process.argv.includes("--mark-published")) {
    writeFileSync(COLLECTION_ZIPS_METADATA, `${JSON.stringify(meta, null, 2)}\n`);
  }
  process.exit(failed ? 1 : 0);
}
