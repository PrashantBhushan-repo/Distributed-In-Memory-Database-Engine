#!/usr/bin/env bash
# A running container may still be loading plugins, recovering data or opening
# its HTTP listener. Retry both HTTP errors and transient connection resets.
wait_http() {
  local service="$1" url="$2" retry_seconds="${3:-120}" status
  echo "==> Waiting for $service readiness: $url"
  if curl --fail --silent --show-error --connect-timeout 2 --max-time 5 \
      --retry 60 --retry-all-errors --retry-delay 2 --retry-max-time "$retry_seconds" \
      "$url" >/dev/null; then
    echo "==> $service is ready"
  else
    status=$?
    echo "$service readiness failed at $url (curl exit $status, retry budget ${retry_seconds}s)" >&2
    return "$status"
  fi
}
