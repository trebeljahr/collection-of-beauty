#!/bin/sh
# PID 1 for a Node image that drains on shutdown (see drain.cjs).
#
# Runs the image's command and hands `docker stop`'s SIGTERM straight to
# the Node process drain.cjs runs in, past whatever sits in between.
# `dotenvx run` is why: it forwards SIGTERM to its command and SIGKILLs
# it 5 s later, long before the drain is over. drain.cjs writes its pid
# to $HATCHKIT_DRAIN_PIDFILE; without one (drain off), the signal goes
# to the command as usual.
# Seed the shared immutable assets before starting Next or passing readiness.
# This descriptor remains leased until the application process has exited.
if [ "${COB_SHARED_ASSETS:-0}" = "1" ]; then
  set -e
  release_sha=$(node /usr/local/lib/releases/shared-asset-releases.mjs check)
  store=/var/lib/collection-of-beauty-releases
  mkdir -p "$store/leases"
  exec 9>"$store/leases/$release_sha.lock"
  flock -s 9
  exec 8>"$store/.publish.lock"
  flock -x 8
  node /usr/local/lib/releases/shared-asset-releases.mjs publish
  flock -u 8
  exec 8>&-
  set +e
fi
export HATCHKIT_DRAIN_PIDFILE="${HATCHKIT_DRAIN_PIDFILE:-/tmp/hatchkit-drain.pid}"
rm -f "$HATCHKIT_DRAIN_PIDFILE"
"$@" &
child=$!
forward() {
  target=$child
  if [ -s "$HATCHKIT_DRAIN_PIDFILE" ]; then
    target=$(cat "$HATCHKIT_DRAIN_PIDFILE")
  fi
  kill -"$1" "$target" 2>/dev/null
}
trap 'forward TERM' TERM
trap 'forward INT' INT
# `wait` returns early when a trapped signal arrives; keep waiting until
# the command itself has exited, and exit with its status.
status=0
while kill -0 "$child" 2>/dev/null; do
  wait "$child"
  status=$?
done
exit "$status"
