# Browser assets during rolling releases

Every candidate imports the exact verified serving image by digest. CI checks its
public HTML/version identity, immutable SHA tag, and both release journal tags,
then checks those registry identities again. Rebuilding an existing SHA is
refused. Deployment checks the candidate's parent labels against the image still
serving before any promotion.

The image contains release snapshots for itself and the previous two releases,
and a fixed legacy baseline from `asset-bootstrap.mjs`. Each snapshot holds that
release's `_next/static` files plus its release-sensitive public media. The baseline protects
already-open tabs that predate the recovery guard. Every immutable filename
collision must contain identical bytes; the baseline inventory is SHA-256 pinned.
The merge of all snapshots into one immutable namespace is checked at build
time but not written into the image. Only public browser files and a commit
marker enter these bundles. Dynamic RSC,
HTML, application data, and runtime credentials do not enter the store.

## Required app-owned volume

Mount Docker named volume `collection-of-beauty-releases` read/write at
`/var/lib/collection-of-beauty-releases`. The host adoption controller must verify
mount type, exact volume name, destination, and write permission. Initialize the
volume for runtime UID/GID 1000 with this `.store-identity.json`, in this order:

```json
{"schema":1,"app":"trebeljahr/collection-of-beauty","volume":"collection-of-beauty-releases","purpose":"immutable-next-assets"}
```

Startup refuses an absent mount, unexpected marker, symlink, invalid image
ancestry, immutable collision, or capacity over 1 GiB / 40,000 files. Capacity
counts every file in the store once per inode, including crash leftovers, plus
the whole incoming image bundle at full size. Snapshot files are hard-linked
into the shared namespace, so a release's bytes are stored once on the volume. Under one
exclusive publication lock it atomically seeds complete bundles and hashed files,
then publishes shared lifetime metadata, before Next starts or becomes ready.
PID 1 retains a shared kernel lease for its image until the application exits.
The store retains three prepared releases plus all currently leased images
(at most three leased IDs, six entries in total), so cleanup cannot remove assets from a retiring image.
All servers read the same metadata; a new client routed through an old process
cannot mistake its own release for an expired one. The fixed legacy asset
baseline survives all normal pruning. Empty lease files remain to avoid a lock
unlink/reopen race; they count toward the capacity limit.

A previously prepared failed candidate may leave the shared head ahead of the
serving image. Do not erase or rewind it automatically. Reconcile image identity,
active leases, registry journals, and the failed deployment first. Restarting an
image within the retained window is allowed without rewinding the shared head.
Starting an expired image is refused. This volume holds reproducible public
artifacts and has no application-data backup requirement.

## Release-sensitive public files

Client code loads gallery textures (`public/textures/`) and ambience audio
(`public/audio/`) after the document. During overlap either replica can answer,
and an unversioned `/textures/...` path would return the other release's bytes
or a 404. `scripts/release-public.mjs` snapshots those directories into
`_next/static/release-public/<sha>/` for every release, and
`src/lib/release-public.ts` makes release builds request that SHA path. The
shared store serves, retains and prunes the snapshot exactly like the release's
chunks. Development builds without `NEXT_PUBLIC_BUILD_COMMIT` keep plain paths.
Today the media adds about 33 MB per release; a steady-state bundle with three
releases is about 130 MB. Add a directory to `RELEASE_PUBLIC_DIRS` when client
code starts loading files from it. Document-level files (favicons, marketing
images, OG images) are referenced by HTML and stay unversioned; change their
bytes only under a new filename.

## Press kit

`/press-kit.zip` is 25.6 MB and can outlive the 20-second drain. When
`scripts/press-kit-download.json` says `"published": true`, `next.config.mjs`
answers `/press-kit.zip` with a 307 to the content-addressed object
`/downloads/v1/<sha256>/collection-of-beauty-press-kit.zip` on the independent
asset origin, so storage owns the transfer and its ranges. The press page links
are plain download anchors, so Next never prefetches the archive.

Published 2026-10-05 (object verified by full SHA-256 from the public origin).
To publish a changed press kit, with release authorization:

1. `pnpm exec dotenvx run -f .env.production -- bash scripts/publish-press-kit.sh`
   (append-only `rclone copyto --immutable`, attachment and immutable headers).
2. `node scripts/press-kit-download.mjs --full`: status, length, attachment,
   ranges, caching and full SHA-256 from the public origin.
3. Set `"published": true`, commit, release.

CI runs `press-kit-download.mjs --ci`: the local file must match the metadata,
and a published object must pass the remote header check before an image is
built. `scripts/sync-assets.sh` excludes `downloads/**`, because `rclone sync`
would otherwise delete these objects. Never delete a published object; a new
press kit gets a new SHA path. Confirm the production `R2_ASSETS_BUCKET` serves
`https://assets.collectionofbeauty.com` before step 1.

## Routing and client state

Next indexes static filenames at startup. Merely adding future files to its disk
would leave an old process unable to serve new chunks. `shared-assets.cjs`
handles the exact `/_next/static/` namespace directly before Next, including
HEAD/range requests, with strict path validation and immutable cache headers.
Missing chunks return 404 rather than an HTML page. Load the asset preload before
`drain.cjs`, so the drain health probe remains the outer request handler.

RSC is dynamic and is not stored here. A foreign `x-deployment-id` on an RSC
request receives 409/text before React decodes foreign module references. Next
then loads a complete document at the navigation destination. This may change a
client to either healthy release during overlap; shared assets keep that
complete document coherent. The changed-module browser proof must exercise both
directions and show navigation settles without a reload loop.

Recovery records are small, tab-local, schema-checked, and expire after seven
days. Artist search/limit, newsletter draft, open artwork, deep-zoom position, and
museum floor/camera/selected artwork are saved before navigation. A museum visit
requires a fresh Enter gesture after reload; autoplay and pointer lock cannot be
restored silently. If geometry changed, the selected era/work survives but the
camera resumes at that floor's safe room centre. Slideshow/audio preferences
already have their own persistence; main gallery filters are URL-backed.
No submitted operation is replayed. Automatic recovery stops when storage cannot
save a record or a newsletter submission is still in flight. A browser unload
prompt protects an explicit document navigation in that case. Recovery has a
30-second loop guard. Expired tabs reload the same URL only after state flush.

## Adoption and verification

The fixed legacy image lacks this shared handler. Its first replacement requires
a controlled adoption; do not claim mixed-release compatibility for that step.
Keep automatic mode off until the shared-store successor passes an actual
changed-lazy-module browser test in both routing directions, a state-safe RSC
transition, expiry recovery, and the separate host HTTP/drain/image-identity gate.

Local mixed-release proof (2026-10-05, two real Next 16.3.8 builds, production
preload and drain, Chromium with the HTTP cache disabled) passed: changed lazy
chunks and SHA-scoped textures/audio through the other replica in both
directions, 409 RSC refusal with one full navigation and restored search draft
in both directions, B drain and expiry reload restoring the open artwork and
deep-zoom viewport, and a press-kit download completing after the app exited.
It does not replace the Docker lease test or the live host gate.

Focused source checks:

```sh
node --test scripts/release.test.mjs scripts/rolling-release.test.mjs scripts/retained-assets.test.mjs scripts/shared-assets.test.mjs scripts/shared-assets-http.test.mjs scripts/press-kit.test.mjs
node node_modules/vitest/vitest.mjs run src/lib/release-session.test.ts src/lib/gallery-release-state.test.ts src/lib/stale-deploy.test.ts --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
```
