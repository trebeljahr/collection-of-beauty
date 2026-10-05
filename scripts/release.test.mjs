import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyRelease } from "./verify-release.mjs";
import { writeVersion } from "./write-version.mjs";

const SHA = "a".repeat(40);
const OLD_SHA = "b".repeat(40);
const ROOT = new URL("../", import.meta.url).pathname;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

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

test("entrypoint bypasses wrapper signals and finishes in-flight work after the drain", {
  timeout: 10000,
}, async () => {
  const directory = mkdtempSync(join(tmpdir(), "cob-drain-"));
  const server = join(directory, "server.mjs");
  const wrapper = join(directory, "wrapper.mjs");
  const pidfile = join(directory, "drain.pid");
  writeFileSync(
    server,
    `
    import { createServer } from 'node:http';
    const server = createServer((request, response) => {
      if (request.url === '/slow') {
        response.writeHead(200);
        response.write('accepted\\n');
        setTimeout(() => response.end('completed\\n'), 1300);
      } else response.end('ok');
    });
    server.listen(0, '127.0.0.1', () => console.log('PORT=' + server.address().port));
    process.once('SIGTERM', () => server.close(() => process.exit(7)));
  `,
  );
  writeFileSync(
    wrapper,
    `
    import { spawn } from 'node:child_process';
    const child = spawn(process.execPath, ['--require', process.argv[2], process.argv[3]], { stdio: 'inherit' });
    process.on('SIGTERM', () => { child.kill('SIGKILL'); process.exit(99); });
    child.on('exit', code => process.exit(code ?? 98));
  `,
  );
  const child = spawn(
    "sh",
    [join(ROOT, "drain-entrypoint.sh"), process.execPath, wrapper, join(ROOT, "drain.cjs"), server],
    {
      env: {
        PATH: process.env.PATH,
        SHUTDOWN_DRAIN_SECONDS: "0.3",
        HEALTH_CHECK_PATH: "/",
        HATCHKIT_DRAIN_PIDFILE: pidfile,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const exited = once(child, "exit");
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  try {
    for (let attempt = 0; !output.includes("PORT=") && attempt < 100; attempt += 1) await sleep(20);
    const port = output.match(/PORT=(\d+)/)?.[1];
    assert.ok(port, `Fixture did not start: ${output}`);
    const base = `http://127.0.0.1:${port}`;
    const options = { signal: AbortSignal.timeout(5000) };
    assert.equal((await fetch(`${base}/`, options)).status, 200);
    const accepted = await fetch(`${base}/slow`, options);
    const started = Date.now();
    child.kill("SIGTERM");
    await sleep(80);
    assert.equal((await fetch(`${base}/?probe=1`, options)).status, 503);
    assert.equal((await fetch(`${base}/gallery-3d`, options)).status, 200);
    assert.equal(await accepted.text(), "accepted\ncompleted\n");
    assert.ok(Date.now() - started > 900, "In-flight request must outlast the drain.");
    assert.deepEqual(await exited, [7, null], "App exit status must survive both wrappers.");
  } finally {
    try {
      process.kill(Number(readFileSync(pidfile, "utf8")), "SIGKILL");
    } catch {
      /* Fixture already stopped. */
    }
    child.kill("SIGKILL");
    await exited;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a stuck server shutdown is cut before docker stop escalates to SIGKILL", { timeout: 30000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "cob-drain-stuck-"));
  const server = join(directory, "server.cjs");
  // Next registers its own SIGTERM handler; this one never completes, like a
  // server.close() waiting on a connection that stays open.
  writeFileSync(
    server,
    `const http=require("node:http");const s=http.createServer((q,r)=>{r.writeHead(200);r.write("x");});s.listen(0,"127.0.0.1",()=>process.send(s.address().port));process.on("SIGTERM",()=>s.close());`,
  );
  const child = spawn(process.execPath, ["--require", join(ROOT, "drain.cjs"), server], {
    env: { ...process.env, SHUTDOWN_DRAIN_SECONDS: "1", HEALTH_CHECK_PATH: "/health" },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  try {
    const [port] = await once(child, "message");
    const request = http.get(`http://127.0.0.1:${port}/stream`);
    await once(request, "response");
    const started = Date.now();
    child.kill("SIGTERM");
    const [code, signal] = await once(child, "exit");
    const elapsed = Date.now() - started;
    assert.equal(signal, null);
    assert.equal(code, 0);
    assert.ok(elapsed >= 8900 && elapsed < 12000, `exited after ${elapsed} ms`);
    request.destroy();
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    rmSync(directory, { recursive: true, force: true });
  }
});

// Starts a plain server under the drain and returns its port and child.
async function drainedServer(env) {
  const directory = mkdtempSync(join(tmpdir(), "cob-drain-probe-"));
  const server = join(directory, "server.cjs");
  writeFileSync(
    server,
    `require("node:http").createServer((q,r)=>r.end("ok")).listen(0,"127.0.0.1",function(){process.send(this.address().port)});`,
  );
  const child = spawn(process.execPath, ["--require", join(ROOT, "drain.cjs"), server], {
    env: { ...process.env, HEALTH_CHECK_PATH: "/health", ...env },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const [port] = await once(child, "message");
  return { child, port, directory };
}
const probe = (port) =>
  fetch(`http://127.0.0.1:${port}/health`)
    .then((r) => r.status)
    .catch(() => "closed");

test("the drain ends once Docker has seen enough failed probes, waiting for late ones", { timeout: 60000 }, async () => {
  const env = { SHUTDOWN_DRAIN_SECONDS: "1", SHUTDOWN_DRAIN_EXTRA_SECONDS: "5", HEALTH_CHECK_RETRIES: "3" };
  const timed = async (schedule) => {
    const { child, port, directory } = await drainedServer(env);
    try {
      const started = Date.now();
      child.kill("SIGTERM");
      const statuses = [];
      const probing = schedule(port, statuses);
      const [code, signal] = await once(child, "exit");
      await probing;
      return { elapsed: Date.now() - started, code, signal, statuses };
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      rmSync(directory, { recursive: true, force: true });
    }
  };
  // Prompt probes: third failure at ~0.3 s, plus the 2 s margin.
  const prompt = await timed(async (port, statuses) => {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 100));
      statuses.push(await probe(port));
    }
  });
  assert.deepEqual(prompt.statuses, [503, 503, 503]);
  assert.equal(prompt.code, 0);
  assert.ok(prompt.elapsed >= 2000 && prompt.elapsed < 3500, `prompt ${prompt.elapsed} ms`);
  // Late probes: nothing until 3 s, so the drain outlasts its 1 s minimum.
  const late = await timed(async (port, statuses) => {
    await new Promise((r) => setTimeout(r, 3000));
    for (let i = 0; i < 3; i++) statuses.push(await probe(port));
  });
  assert.deepEqual(late.statuses, [503, 503, 503]);
  assert.ok(late.elapsed >= 4800 && late.elapsed < 6000, `late ${late.elapsed} ms`);
  // No probes at all: bounded by the extension.
  const none = await timed(async () => {});
  assert.equal(none.code, 0);
  assert.ok(none.elapsed >= 5900 && none.elapsed < 7500, `none ${none.elapsed} ms`);
});
