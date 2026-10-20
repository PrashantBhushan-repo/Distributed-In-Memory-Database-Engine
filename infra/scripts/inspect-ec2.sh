#!/usr/bin/env bash
# Read-only inventory and compatibility checks; never delete unknown resources.
inspect_ec2() {
  local name service project selected_project='' existing_data volume port owner expected
  echo '==> EC2 inventory: containers, projects, ports and disk usage'
  docker_cmd ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Label "com.docker.compose.project"}}'
  docker_cmd volume ls --format 'table {{.Name}}\t{{.Label "com.docker.compose.project"}}'
  docker_cmd system df
  df -h "$APP_ROOT"

  for service in redisx gateway web prometheus grafana; do
    case "$service" in
      redisx) name=redisx-server ;;
      *) name="redisx-$service" ;;
    esac
    if ! docker_cmd container inspect "$name" >/dev/null 2>&1; then continue; fi
    project=$(docker_cmd inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$name")
    if [[ ! "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] ||
       [[ "$(docker_cmd inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$name")" != "$service" ]]; then
      echo "Container $name is not owned by a recognized Compose service; refusing to replace it" >&2
      return 1
    fi
    if [[ -n "$selected_project" && "$selected_project" != "$project" ]]; then
      echo "Existing application containers belong to different projects: $selected_project and $project" >&2
      return 1
    fi
    selected_project="$project"
    if [[ "$service" == redisx ]]; then
      existing_data=$(docker_cmd inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' "$name")
      if [[ "$existing_data" != "$DATA_DIR" ]]; then
        echo "Engine storage differs: expected $DATA_DIR, found $existing_data. Refusing to switch databases." >&2
        return 1
      fi
    fi
    if [[ "$service" == prometheus || "$service" == grafana ]]; then
      if [[ "$service" == prometheus ]]; then
        volume=$(docker_cmd inspect --format '{{range .Mounts}}{{if eq .Destination "/prometheus"}}{{.Name}}{{end}}{{end}}' "$name")
      else
        volume=$(docker_cmd inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/grafana"}}{{.Name}}{{end}}{{end}}' "$name")
      fi
      if [[ ! "$volume" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
        echo "$name has no recognized named data volume; refusing to replace its storage" >&2
        return 1
      fi
      if [[ "$service" == prometheus ]]; then PROMETHEUS_DATA_VOLUME="$volume"; else GRAFANA_DATA_VOLUME="$volume"; fi
    fi
  done
  if [[ -n "$selected_project" ]]; then COMPOSE_PROJECT_NAME="$selected_project"; fi
  echo "==> Deploying project $COMPOSE_PROJECT_NAME; database $DATA_DIR"
  echo "==> Preserving monitoring volumes: $PROMETHEUS_DATA_VOLUME, $GRAFANA_DATA_VOLUME"
  # Refuse unrelated Docker port owners before stopping the database.
  for port in 6379 9121 4000 3000 9090 3002; do
    case "$port" in
      6379|9121) expected=redisx-server ;;
      4000) expected=redisx-gateway ;;
      3000) expected=redisx-web ;;
      9090) expected=redisx-prometheus ;;
      3002) expected=redisx-grafana ;;
    esac
    while IFS= read -r owner; do
      if [[ -n "$owner" && "$owner" != "$expected" ]]; then
        echo "Port $port is published by unrelated container $owner; refusing to interrupt the database" >&2
        return 1
      fi
    done < <(docker_cmd ps --filter "publish=$port" --format '{{.Names}}')
  done
}
