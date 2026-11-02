#!/usr/bin/env bash
set -Eeuo pipefail

[ "$(id -un)" = 'kiyt-mvp' ] || {
  echo 'ERROR: run this command as Linux user kiyt-mvp' >&2
  exit 1
}

REPO='/home/kiyt-mvp/apps/kiyt-mvp'
WORKDIR="$REPO/services/gateway"
CACHE='/home/kiyt-mvp/.cache/kiyt-cargo'
IMAGE='rust:1.99.1-bookworm'

mkdir -p "$CACHE"

exec docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e CARGO_HOME=/cargo-home \
  -e PATH=/usr/local/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  -v /etc/passwd:/etc/passwd:ro \
  -v /etc/group:/etc/group:ro \
  -v "$CACHE:/cargo-home" \
  -v "$WORKDIR:/work" \
  -w /work \
  "$IMAGE" \
  /usr/local/cargo/bin/cargo "$@"
