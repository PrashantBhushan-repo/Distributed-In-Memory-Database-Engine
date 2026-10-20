#!/usr/bin/env bash
# Exercise the production storage initializer against an actual runtime image.
set -Eeuo pipefail
: "${ENGINE_IMAGE:?Set the engine image to test}"
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
TMP_DIR=$(mktemp -d)
NAME="redisx-deploy-test-$$"
docker_cmd() { docker "$@"; }
cleanup() {
  docker logs "$NAME" 2>/dev/null || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  sudo rm -rf -- "$TMP_DIR"
}
trap cleanup EXIT
# shellcheck source=infra/scripts/prepare-storage.sh
source "$ROOT/infra/scripts/prepare-storage.sh"
mkdir "$TMP_DIR/data"
# Reproduce root-owned persistence from earlier containers, preserving content.
printf sentinel > "$TMP_DIR/data/ownership-test"
sudo chown -R 0:0 "$TMP_DIR/data"
sudo chmod 700 "$TMP_DIR/data"
prepare_storage "$ENGINE_IMAGE" "$TMP_DIR/data"
prepare_storage "$ENGINE_IMAGE" "$TMP_DIR/data"
docker run --rm --entrypoint sh --mount "type=bind,src=$TMP_DIR/data,dst=/data" \
  "$ENGINE_IMAGE" -ec 'test "$(cat /data/ownership-test)" = sentinel'
docker run -d --name "$NAME" -p 127.0.0.1::6379 \
  --mount "type=bind,src=$TMP_DIR/data,dst=/data" \
  --mount "type=bind,src=$ROOT/infra/configs/pbRedis.prod.conf,dst=/etc/redisx/redis.conf,readonly" \
  "$ENGINE_IMAGE"
PORT=$(docker port "$NAME" 6379/tcp | sed 's/.*://')
python3 "$ROOT/tests/scripts/verify_deployment_persistence.py" "$PORT" write
docker stop --time 20 "$NAME" >/dev/null
docker start "$NAME" >/dev/null
PORT=$(docker port "$NAME" 6379/tcp | sed 's/.*://')
python3 "$ROOT/tests/scripts/verify_deployment_persistence.py" "$PORT" read
echo 'Storage initialization is repeatable and data survives container restart.'
