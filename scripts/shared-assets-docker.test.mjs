import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { STORE, STORE_ID } from "./shared-asset-releases.mjs";
import { fixture, ids } from "./shared-assets-fixtures.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
function docker(args) {
  const r = spawnSync("docker", args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  assert.equal(r.status, 0, `Docker fixture operation failed: ${args[0]}`);
  return r.stdout.trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
test("production startup lease, immutable asset handler, and Node drain cooperate on the shared volume", {
  skip: process.env.RUN_DOCKER_TESTS !== "1",
  timeout: 120000,
}, async () => {
  const f = await fixture();
  const image = `cob-shared-fixture:${process.pid}`,
    volume = `cob-shared-fixture-${process.pid}`,
    containers = [];
  try {
    const context = join(f.root, "context");
    await mkdir(join(context, "scripts"), { recursive: true });
    for (const name of ["drain.cjs", "drain-entrypoint.sh", "shared-assets.cjs"])
      await cp(join(root, name), join(context, name));
    for (const name of ["shared-asset-releases.mjs", "retain-asset-releases.mjs"])
      await cp(join(root, "scripts", name), join(context, "scripts", name));
    await writeFile(
      join(context, "scripts/asset-bootstrap.mjs"),
      `export const ASSET_BOOTSTRAP=Object.freeze(${JSON.stringify(f.bootstrap)});`,
    );
    await writeFile(
      join(context, "server.cjs"),
      `const http=require('node:http');const fs=require('node:fs');const sha=JSON.parse(fs.readFileSync('/app/release-assets/version.json')).commit;http.createServer((req,res)=>res.end(sha)).listen(80,'0.0.0.0');`,
    );
    await writeFile(
      join(context, "Dockerfile"),
      `FROM node:24-alpine\nWORKDIR /app\nCOPY scripts/ /usr/local/lib/releases/\nCOPY shared-assets.cjs drain.cjs /usr/local/lib/\nCOPY --chmod=755 drain-entrypoint.sh /usr/local/bin/drain-entrypoint\nCOPY server.cjs /app/server.cjs\nENV COB_SHARED_ASSETS=1 SHUTDOWN_DRAIN_SECONDS=2 HEALTH_CHECK_PATH=/\nUSER node\nENTRYPOINT ["/usr/local/bin/drain-entrypoint"]\nCMD ["node","--require","/usr/local/lib/shared-assets.cjs","--require","/usr/local/lib/drain.cjs","/app/server.cjs"]\n`,
    );
    docker(["build", "--pull=false", "-q", "-t", image, context]);
    docker(["volume", "create", volume]);
    const init = `const f=require('node:fs');f.writeFileSync('${STORE}/.store-identity.json',${JSON.stringify(JSON.stringify(STORE_ID))});f.chownSync('${STORE}',1000,1000);f.chownSync('${STORE}/.store-identity.json',1000,1000);`;
    docker([
      "run",
      "--rm",
      "--user",
      "0",
      "--entrypoint",
      "node",
      "-v",
      `${volume}:${STORE}`,
      image,
      "-e",
      init,
    ]);
    const start = async (i) => {
      const name = `cob-shared-fixture-${process.pid}-${i}`;
      containers.push(name);
      docker([
        "run",
        "-d",
        "--name",
        name,
        "--memory",
        "192m",
        "--cpus",
        "0.5",
        "-p",
        "127.0.0.1::80",
        "-v",
        `${volume}:${STORE}`,
        "-v",
        `${f.exports[i]}:/app/release-assets:ro`,
        image,
      ]);
      const address = docker(["port", name, "80/tcp"]);
      const url = "http://" + address;
      for (let n = 0; n < 100; n++) {
        try {
          if ((await (await fetch(url)).text()) === ids[i]) return { name, url };
        } catch {}
        await sleep(100);
      }
      throw Error("Fixture readiness timeout");
    };
    const b = await start(1);
    assert.equal((await fetch(b.url + `/_next/static/chunks/${ids[2]}.js`)).status, 404);
    const c = await start(2);
    for (const server of [b, c])
      for (const id of [ids[1], ids[2]])
        assert.equal(
          await (await fetch(server.url + `/_next/static/chunks/${id}.js`)).text(),
          `window.revision='${id}';`,
        );
    const leased = docker([
      "exec",
      c.name,
      "sh",
      "-c",
      `if flock -n -x ${STORE}/leases/${ids[1]}.lock true; then echo unleased; else echo leased; fi`,
    ]);
    assert.equal(leased, "leased");
    const before = Date.now();
    const stopping = spawn("docker", ["stop", "-t", "8", b.name], { stdio: "ignore" });
    await once(stopping, "exit");
    assert.ok(Date.now() - before >= 1900);
    assert.equal(
      docker(["inspect", "--format", "{{.State.ExitCode}}/{{.State.OOMKilled}}", b.name]),
      "0/false",
    );
    assert.equal(await (await fetch(c.url)).text(), ids[2]);
    assert.equal(
      docker([
        "exec",
        c.name,
        "sh",
        "-c",
        `if flock -n -x ${STORE}/leases/${ids[1]}.lock true; then echo unleased; else echo leased; fi`,
      ]),
      "unleased",
    );
  } finally {
    for (const name of containers) spawnSync("docker", ["rm", "-f", name], { stdio: "ignore" });
    spawnSync("docker", ["volume", "rm", volume], { stdio: "ignore" });
    spawnSync("docker", ["image", "rm", image], { stdio: "ignore" });
    await rm(f.root, { recursive: true, force: true });
  }
});
