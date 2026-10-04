# Browser assets during rolling releases

Every candidate imports the exact verified serving image by digest. CI checks its
public HTML/version identity, immutable SHA tag, and both release journal tags,
then checks those registry identities again. Rebuilding an existing SHA is
refused. Deployment checks the candidate's parent labels against the image still
serving before any promotion.

The image contains its own `_next/static` files, the previous two asset bundles,
and a fixed legacy baseline from `asset-bootstrap.mjs`. The baseline protects
already-open tabs that predate the recovery guard. Every immutable filename
collision must contain identical bytes; the baseline inventory is SHA-256 pinned.
Only public browser files and a commit marker enter these bundles. Dynamic RSC,
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
ancestry, immutable collision, or capacity over 256 MiB / 20,000 files. Under one
exclusive publication lock it atomically seeds complete bundles and hashed files,
then publishes shared lifetime metadata, before Next starts or becomes ready.
PID 1 retains a shared kernel lease for its image until the application exits.
The store retains three prepared releases plus all currently leased images
(maximum three live IDs), so cleanup cannot remove assets from a retiring image.
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

Focused source checks:

```sh
node --test scripts/release.test.mjs scripts/rolling-release.test.mjs scripts/retained-assets.test.mjs scripts/shared-assets.test.mjs scripts/shared-assets-http.test.mjs
node node_modules/vitest/vitest.mjs run src/lib/release-session.test.ts src/lib/gallery-release-state.test.ts src/lib/stale-deploy.test.ts --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
```
