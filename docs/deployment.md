# Deployment

On push to `main`, CI runs typecheck, unit tests and release contract tests,
then publishes `ghcr.io/trebeljahr/collection-of-beauty:<full-commit-sha>`.
The `release-<sha>-<run>-<attempt>` artifact records the exact registry digest.
Rebuilding a commit can produce a different image; the digest identifies the
reviewed image. Builds never move `latest`.

Deployment is off until the repository variable
`COLLECTION_OF_BEAUTY_ROLLOUT_MODE` is set. `manual` allows an explicit
**Build & Release** dispatch with operation `deploy`, a full `target_sha`, its
`image_digest`, and the reviewed `expected_current_digest` of `latest`.
`automatic` also deploys successful future pushes to `main`. An unset variable
or `off` leaves pushes as build-only; a manual deploy request fails closed.
The same workflow concurrency group serializes builds and deployments and does
not cancel a running release.

The release controller uses the existing generic `COOLIFY_*` hook bundle and
GitHub's built-in package token. It checks the exact application UUID,
repository and branch, hashes the registry manifest and image config, confirms
the Linux amd64 image revision, and checks the currently served build against
`latest`. It copies the reviewed manifest bytes to `latest`, reads the digest
back, then sends one signed hook. Queue acceptance must name this app and one
exact deployment UUID. The controller then requires the public release to
remain healthy for 16 samples over at least 30 seconds and rechecks `latest`.
It does not hold a Coolify API token or inspect provider terminal status.

Before first activation, an operator must check the existing Docker Image app
`bbu24hzgels1n2m1sznx3fdu`: image repository, port 80, no host port bindings or
persistent mounts, and names that allow two versions to overlap. Configure
`GET /` on loopback port 80, expected 200, interval 2 seconds, timeout 5 seconds,
retries 5 and start period 15 seconds. The image drains for 20 seconds; its
platform stop timeout must allow at least 30 seconds. Confirm a unique manual
hook secret, watch path `.hatchkit/deploy-webhook`, and no other writer or
pending deployment. The signed endpoint selects apps by repository and secret;
its commit payload cannot choose an image tag.

Set the app's `git_repository` and the existing GitHub Actions secret
`COOLIFY_DEPLOY_REPOSITORY` to `trebeljahr/collection-of-beauty`, with
`git_branch` and `COOLIFY_DEPLOY_BRANCH` both set to `main`. Docker Image apps
can retain Coolify's placeholder repository `coollabsio/coolify`; publishing
the correct image does not repair that hook binding. Inspect both sides and
reconcile them before enabling the rollout variable. Keep this configuration
step separate from webhook-secret rotation, which changes credentials only.

An old image without build identity or draining needs operator-led adoption.
Keep the rollout variable off, save the prior digest and configuration, and
first deploy the candidate by exact digest. Coolify 4.0.0-beta.469 represents a
digest pin as `sha256-<64 hex characters>` in its image tag field. Inspect the
exact deployment, running digest and old-container retirement, then align
`latest` with that verified image and configure the app to pull `latest`.
Next, enable `manual` and deploy a distinct reviewed candidate through the
workflow. This second replacement exercises the outgoing image's drain and
initializes the registry journal. An already-serving no-op does not initialize
that journal. Enable `automatic` only after this replacement passes.

The controller keeps `rolling-started` and `rolling-verified` manifest tags.
Both must agree with `latest` before another run may mutate anything. A crash,
failed verification or ambiguous hook leaves the journal closed. The
`rollout-<run>-<attempt>` artifact records the previous digest and any returned
deployment UUID. After a hook attempt, the controller never rewrites `latest`
or sends a second hook on failure: the queued job could still pull the tag.
An operator must inspect and settle that exact queue before rollback, verify
the chosen running digest and public build, then align both journal tags with
that digest. Do not clear a journal solely because old HTML is briefly visible.
Pre-hook failures may restore the old tag because no deployment was requested.

For a read-only check, dispatch operation `verify` with the full target SHA,
or run `node scripts/verify-release.mjs <full-sha>`. Both `/version.json` and
the homepage's build meta tag must identify that commit. The check also checks
the gallery response and both canonical redirects, preserving cache-busting
queries. It supplements container checks; HTTP identity alone does not prove
that the old container finished draining.

The asset bucket and ListMonk instance are shared between dev and prod
(separated by list id). Release checks do not send newsletters or modify assets.
