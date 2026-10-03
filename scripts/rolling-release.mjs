import { writeFileSync } from "node:fs";
import { rollingRelease } from "./lib/rolling-release.mjs";

const env = (name) => (process.env[name] ?? "").trim();
try {
  if (
    env("GITHUB_REPOSITORY") !== "trebeljahr/collection-of-beauty" ||
    env("GITHUB_REF") !== "refs/heads/main"
  ) {
    throw new Error("Rolling deployment only runs from this repository's main workflow.");
  }
  if (!["push", "workflow_dispatch"].includes(env("GITHUB_EVENT_NAME")))
    throw new Error("Unsupported release trigger.");
  await rollingRelease(
    {
      baseUrl: env("COOLIFY_BASE_URL").replace(/\/$/, ""),
      uuid: env("COOLIFY_RESOURCE_UUID"),
      repository: env("COOLIFY_DEPLOY_REPOSITORY"),
      branch: env("COOLIFY_DEPLOY_BRANCH"),
      secret: env("COOLIFY_DEPLOY_SECRET"),
      actor: env("GITHUB_ACTOR"),
      token: env("GITHUB_TOKEN"),
      mode: env("ROLLOUT_MODE"),
    },
    {
      sha: env("TARGET_SHA"),
      digest: env("TARGET_DIGEST"),
      expectedCurrentDigest: env("EXPECTED_CURRENT_DIGEST"),
      automatic: env("GITHUB_EVENT_NAME") === "push",
    },
    {
      record: (report) => {
        writeFileSync("rollout.json", `${JSON.stringify(report, null, 2)}\n`);
        console.log(`Release stage: ${report.stage}`);
      },
    },
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Rolling deployment failed.");
  process.exitCode = 1;
}
