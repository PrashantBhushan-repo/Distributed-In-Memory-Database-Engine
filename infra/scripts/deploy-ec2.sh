#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# The workflow uploads each release separately; database storage stays at the
# existing path so upgrading this deployment does not create an empty database.
RELEASE_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
: "${APP_ROOT:?APP_ROOT must identify the existing EC2 application directory}"
APP_ROOT=$(cd "$APP_ROOT" && pwd -P)
export DATA_DIR="$APP_ROOT/data"
export COMPOSE_PROJECT_NAME=pbredisdb
PROMETHEUS_DATA_VOLUME=pbredisdb_prometheus-data
GRAFANA_DATA_VOLUME=pbredisdb_grafana-data
STATE_DIR="$APP_ROOT/.deploy"
OLD_ENGINE_STOPPED=false
CREDENTIAL_DIR=''
BACKUP_PATH=''
mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }

# Keep one definition before every call. Switch registry configuration when
# credentials are prepared, rather than redefining this function later.
docker_cmd() {
  if [[ -n "$CREDENTIAL_DIR" ]]; then
    sudo -n env DOCKER_CONFIG="$CREDENTIAL_DIR" DATA_DIR="$DATA_DIR" \
      PROMETHEUS_DATA_VOLUME="$PROMETHEUS_DATA_VOLUME" GRAFANA_DATA_VOLUME="$GRAFANA_DATA_VOLUME" docker "$@"
  else
    sudo -n env DATA_DIR="$DATA_DIR" PROMETHEUS_DATA_VOLUME="$PROMETHEUS_DATA_VOLUME" \
      GRAFANA_DATA_VOLUME="$GRAFANA_DATA_VOLUME" docker "$@"
  fi
}
compose() { docker_cmd compose --project-name "$COMPOSE_PROJECT_NAME" --env-file "$RELEASE_DIR/images.env" -f "$RELEASE_DIR/docker-compose.prod.yml" "$@"; }
diagnostics() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    echo 'Deployment failed. Existing database files have been preserved.' >&2
    # If backup failed before changing containers, restore the same running
    # engine. This is not a rollback to an older database binary.
    if [[ "$OLD_ENGINE_STOPPED" == true ]]; then
      docker_cmd start redisx-server || true
    fi
    if [[ -n "$BACKUP_PATH" ]]; then
      sudo -n rm -f -- "$BACKUP_PATH.tmp" || true
    fi
    compose ps -a || true
    compose logs --no-color --tail 100 || true
    for name in redisx-server redisx-gateway redisx-web; do
      docker_cmd inspect --format '{{.Name}} status={{.State.Status}} error={{.State.Error}} health={{json .State.Health}}' "$name" || true
    done
    df -h "$DATA_DIR" || true
  fi
  if [[ -n "$CREDENTIAL_DIR" ]]; then
    sudo -n rm -rf -- "$CREDENTIAL_DIR" || true
  fi
  exit "$status"
}
trap diagnostics EXIT
cd "$RELEASE_DIR"

# Bootstrap Docker on fresh Ubuntu instances as part of deployment. sudo is
# noninteractive: a missing privilege fails the job instead of hanging.
sudo -n true
if ! command -v docker >/dev/null || ! docker_cmd compose version >/dev/null 2>&1; then
  bash "$RELEASE_DIR/infra/scripts/setup-ec2.sh"
fi
sudo -n systemctl enable --now docker
docker_cmd info >/dev/null
# Inspect old containers before changing storage or stopping any service. Adopt
# their Compose project and named volumes instead of creating a second stack.
# shellcheck source=infra/scripts/inspect-ec2.sh
source "$RELEASE_DIR/infra/scripts/inspect-ec2.sh"
inspect_ec2

for file in images.env .env.production infra/configs/pbRedis.prod.conf infra/monitoring/prometheus.yml; do
  test -f "$file" || { echo "Missing release file: $file" >&2; exit 1; }
done
chmod 600 .env.production images.env
# Only image references are allowed in this generated file. Do not source it as
# shell code, and refuse mutable tags in the production deployment path.
for key in ENGINE_IMAGE GATEWAY_IMAGE WEB_IMAGE; do
  value=$(sed -n "s/^${key}=//p" images.env)
  [[ "$value" =~ ^ghcr\.io/[a-z0-9/_.-]+@sha256:[a-f0-9]{64}$ ]] || {
    echo "Missing or invalid immutable image reference: $key" >&2; exit 1;
  }
done
compose config --quiet
: "${GH_TOKEN:?Registry token is required}"
: "${GH_ACTOR:?Registry username is required}"
# Use an ephemeral registry login rather than leaving the Actions token on EC2.
CREDENTIAL_DIR=$(mktemp -d)
export DOCKER_CONFIG="$CREDENTIAL_DIR"
printf '%s' "$GH_TOKEN" | docker_cmd login ghcr.io -u "$GH_ACTOR" --password-stdin
unset GH_TOKEN
compose pull
ENGINE_IMAGE=$(sed -n 's/^ENGINE_IMAGE=//p' images.env)
# shellcheck source=infra/scripts/prepare-storage.sh
source "$RELEASE_DIR/infra/scripts/prepare-storage.sh"
prepare_storage "$ENGINE_IMAGE" "$DATA_DIR"

# Back up only while the existing engine is stopped, so RDB/AOF files form a
# consistent set. Keep three verified-release backups plus the current attempt.
mkdir -p "$STATE_DIR/backups"
required_kb=$(sudo -n du -sk "$DATA_DIR" | awk '{print $1}')
available_kb=$(df -Pk "$DATA_DIR" | awk 'NR==2 {print $4}')
if (( available_kb < required_kb + 65536 )); then
  echo 'Insufficient disk space for a consistent pre-deployment backup' >&2
  exit 1
fi
if [[ "$(docker_cmd inspect --format '{{.State.Running}}' redisx-server 2>/dev/null || true)" == true ]]; then
  docker_cmd stop --time 30 redisx-server >/dev/null
  OLD_ENGINE_STOPPED=true
fi
BACKUP_PATH="$STATE_DIR/backups/$(basename "$RELEASE_DIR").tar"
sudo -n tar --one-file-system -C "$DATA_DIR" -cf "$BACKUP_PATH.tmp" .
sudo -n mv "$BACKUP_PATH.tmp" "$BACKUP_PATH"

# Config-only changes also require recreation of bind-mounted config consumers.
# No automatic database rollback: an older binary may not understand new data.
OLD_ENGINE_STOPPED=false
compose up -d --remove-orphans --force-recreate --wait --wait-timeout 180
# /health always returns HTTP 200; require a real connected engine as well.
docker_cmd exec redisx-gateway node --input-type=module -e '
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch("http://127.0.0.1:4000/health", { signal: AbortSignal.timeout(2000) });
      const health = await response.json();
      if (response.ok && health.redis?.status === "connected" && !health.redis?.isDemo) process.exit(0);
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.error("Gateway did not connect to the real engine");
  process.exit(1);
'
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:3000/ >/dev/null
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:9090/-/ready >/dev/null
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:3002/api/health >/dev/null
if [[ -L "$STATE_DIR/current" ]]; then
  ln -sfn "$(readlink "$STATE_DIR/current")" "$STATE_DIR/previous"
fi
ln -sfn "$RELEASE_DIR" "$STATE_DIR/current"
# Delete only older backup archives, never live database files or images.
mapfile -t old_backups < <(find "$STATE_DIR/backups" -maxdepth 1 -type f -name '*.tar' -printf '%T@ %p\n' | sort -nr | tail -n +4 | cut -d ' ' -f 2-)
for backup in "${old_backups[@]}"; do sudo -n rm -f -- "$backup"; done
compose ps
echo "Deployment verified: $RELEASE_DIR"
