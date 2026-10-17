import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyRelease } from "./verify-release.mjs";
import { writeVersion } from "./write-version.mjs";

const SHA = "a".repeat(40);
const OLD_SHA = "b".repeat(40);

test("the build writes an exact commit and rejects moving or abbreviated identities", () => {
  const directory = mkdtempSync(join(tmpdir(), "cob-version-"));
  try {
    writeVersion(SHA, directory);
    assert.deepEqual(JSON.parse(readFileSync(join(directory, "version.json"))), { commit: SHA });
    for (const invalid of [undefined, "", "latest", SHA.slice(0, 7), SHA.toUpperCase()]) {
      assert.throws(() => writeVersion(invalid, directory), /full lowercase Git commit SHA/);
    }
    assert.deepEqual(JSON.parse(readFileSync(join(directory, "version.json"))), { commit: SHA });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fakeHttp({
  commits = [SHA],
  cache = "no-store",
  homepage = 200,
  htmlCommit = SHA,
  alias = 308,
  dropQuery = false,
} = {}) {
  let versions = 0;
  const requests = [];
  return {
    requests,
    fetch: async (url, options) => {
      requests.push({ url, options });
      const target = new URL(url);
      if (target.hostname !== "collectionofbeauty.com") {
        return new Response(null, {
          status: alias,
          headers: { location: `https://collectionofbeauty.com/${dropQuery ? "" : target.search}` },
        });
      }
      if (target.pathname === "/version.json") {
        const commit = commits[Math.min(versions++, commits.length - 1)];
        return Response.json({ commit }, { headers: { "cache-control": cache } });
      }
      return new Response(
        `<html><head><meta name="build-commit" content="${htmlCommit}"/></head>Collection of Beauty</html>`,
        { status: homepage },
      );
    },
  };
}

const quick = { sleep: async () => {}, attempts: 5, stableSamples: 2 };

test("verification tolerates old/new overlap but restarts its stable sample window", async () => {
  const http = fakeHttp({ commits: [SHA, OLD_SHA, SHA, SHA] });
  assert.deepEqual(await verifyRelease(SHA, { ...quick, fetch: http.fetch }), {
    commit: SHA,
    samples: 2,
  });
  assert.equal(http.requests.filter(({ url }) => url.includes("/version.json")).length, 4);
  assert.equal(
    http.requests.filter(({ url }) => !url.startsWith("https://collectionofbeauty.com/")).length,
    2,
  );
  for (const { url, options } of http.requests) {
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "manual");
    assert.equal(options.cache, "no-store");
    assert.ok(new URL(url).searchParams.get("release"));
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test("a queued or perpetually old release never passes HTTP verification", async () => {
  const http = fakeHttp({ commits: [OLD_SHA] });
  await assert.rejects(
    verifyRelease(SHA, { ...quick, fetch: http.fetch }),
    /not the expected commit/,
  );
});

test("cached version, broken homepage, and wrong redirect each fail closed", async () => {
  for (const scenario of [
    { cache: "public, max-age=3600" },
    { homepage: 503 },
    { htmlCommit: OLD_SHA },
    { alias: 200 },
    { dropQuery: true },
  ]) {
    await assert.rejects(
      verifyRelease(SHA, { ...quick, fetch: fakeHttp(scenario).fetch }),
      /Release did not remain healthy/,
    );
  }
});

test("invalid release identity fails before making any request", async () => {
  const http = fakeHttp();
  await assert.rejects(verifyRelease("latest", { ...quick, fetch: http.fetch }), /full lowercase/);
  assert.equal(http.requests.length, 0);
});

test("network failures reset readiness and time out without mutations", async () => {
  let requests = 0;
  await assert.rejects(
    verifyRelease(SHA, {
      ...quick,
      fetch: async (_url, options) => {
        requests += 1;
        assert.equal(options.method, "GET");
        throw new Error("network unavailable");
      },
    }),
    /network unavailable/,
  );
  assert.equal(requests, quick.attempts);
});
