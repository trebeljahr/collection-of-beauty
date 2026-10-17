#!/usr/bin/env node
// Activate one commit's uploaded versions of the two Workers and prove the
// public site serves it.
//
//   node scripts/worker-release.mjs deploy <sha> [<site-version> <api-version>]
//
// The build job uploads a version of each Worker tagged with the commit
// (`wrangler versions upload --tag <sha>`); nothing is live until this
// runs. Without version ids it looks them up by that tag, so dispatching
// `deploy` with an earlier commit is the rollback while that commit's
// versions are among each Worker's last 100.
//
// Order: the API Worker first (its manifest is a superset of what any
// live page links), then the site. Then scripts/verify-release.mjs must
// see the commit in /version.json and the homepage. On a failed check both
// Workers go back to the versions that were live before, and the run
// still fails. rollout.json records what happened.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyRelease } from "./verify-release.mjs";

const WORKERS = [
  { name: "collection-of-beauty-api", config: "workers/api/wrangler.jsonc" },
  { name: "collection-of-beauty", config: "wrangler.jsonc" },
];
const WRANGLER = process.env.WRANGLER_VERSION
  ? ["--yes", `wrangler@${process.env.WRANGLER_VERSION}`]
  : ["wrangler"];
const SHA = /^[a-f0-9]{40}$/;
const VERSION = /^[0-9a-f-]{36}$/;

function wrangler(args) {
  return execFileSync("npx", [...WRANGLER, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

/** The version of `worker` uploaded with tag `sha`, newest first. */
export function versionForTag(versions, sha) {
  const match = versions.find((v) => v?.annotations?.["workers/tag"] === sha);
  return match?.id ?? null;
}

/** The single version serving 100 % of `deployment`, or null. */
export function liveVersion(deployment) {
  const versions = deployment?.versions ?? [];
  return versions.length === 1 && versions[0].percentage === 100 ? versions[0].version_id : null;
}

function listVersions(worker) {
  return JSON.parse(wrangler(["versions", "list", "--json", "-c", worker.config]));
}

function currentDeployment(worker) {
  return JSON.parse(wrangler(["deployments", "status", "--json", "-c", worker.config]));
}

function activate(worker, versionId, message) {
  wrangler([
    "versions",
    "deploy",
    `${versionId}@100%`,
    "--yes",
    "--message",
    message,
    "-c",
    worker.config,
  ]);
}

export async function deploy(sha, ids = [], { verify = verifyRelease } = {}) {
  if (!SHA.test(sha ?? "")) throw new Error("Expected a full lowercase commit SHA.");
  const record = { commit: sha, stage: "resolving", workers: {} };
  const save = () => writeFileSync("rollout.json", `${JSON.stringify(record, null, 2)}\n`);
  const [siteId, apiId] = ids;
  const given = { "collection-of-beauty": siteId, "collection-of-beauty-api": apiId };

  for (const worker of WORKERS) {
    const target = given[worker.name] || versionForTag(listVersions(worker), sha);
    if (!VERSION.test(target ?? "")) {
      throw new Error(`No uploaded version of ${worker.name} is tagged ${sha}.`);
    }
    record.workers[worker.name] = {
      target,
      previous: liveVersion(currentDeployment(worker)),
    };
  }
  save();

  record.stage = "activating";
  for (const worker of WORKERS) {
    activate(worker, record.workers[worker.name].target, `release ${sha.slice(0, 12)}`);
    record.workers[worker.name].activated = true;
    save();
  }

  record.stage = "verifying";
  save();
  try {
    const result = await verify(sha);
    record.stage = "http-verified";
    record.samples = result.samples;
    save();
    return record;
  } catch (error) {
    record.stage = "rolling-back";
    record.error = error instanceof Error ? error.message : String(error);
    save();
    for (const worker of [...WORKERS].reverse()) {
      const previous = record.workers[worker.name].previous;
      if (previous && previous !== record.workers[worker.name].target) {
        activate(worker, previous, `roll back failed release ${sha.slice(0, 12)}`);
        record.workers[worker.name].rolledBack = true;
      }
    }
    record.stage = "rolled-back";
    save();
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, sha, ...ids] = process.argv.slice(2);
  if (operation !== "deploy") {
    console.error(
      "Usage: node scripts/worker-release.mjs deploy <sha> [<site-version> <api-version>]",
    );
    process.exit(2);
  }
  try {
    const record = await deploy(sha, ids);
    console.log(`Release ${sha} is live and verified (${record.samples} samples).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Release failed.");
    process.exitCode = 1;
  }
}
