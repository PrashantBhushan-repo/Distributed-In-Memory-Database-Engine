#!/usr/bin/env bash
# Container-side shell expressions intentionally remain unexpanded on the host.
# shellcheck disable=SC2016
# Called by deploy-ec2.sh with a Docker command function already defined.
prepare_storage() {
  local engine_image="$1" data_dir="$2" identity uid gid
  identity=$(docker_cmd run --rm --entrypoint sh "$engine_image" -ec 'id -u; id -g')
  read -r uid gid <<< "$(echo "$identity" | tr '\n' ' ')"
  [[ "$uid" =~ ^[0-9]+$ && "$gid" =~ ^[0-9]+$ && "$uid" != 0 ]] || {
    echo 'Engine must declare a non-root numeric user/group' >&2; return 1;
  }
  mkdir -p "$data_dir"
  # The bind mount hides the image's /data ownership. Repair the host storage
  # using the exact image's identity. Never follow symlinks or erase data.
  docker_cmd run --rm --user 0:0 --entrypoint sh \
    --mount "type=bind,src=$data_dir,dst=/data" "$engine_image" -ec '
      find /data -xdev \( -type d -o -type f \) -exec chown "$1:$2" {} +
      find /data -xdev -type d -exec chmod u+rwx {} +
      find /data -xdev -type f -exec chmod u+rw {} +
    ' sh "$uid" "$gid"
  # Run as the normal image user, not root. Include a real write test.
  docker_cmd run --rm --entrypoint sh \
    --mount "type=bind,src=$data_dir,dst=/data" "$engine_image" -ec '
      probe=$(mktemp /data/.deploy-write-check.XXXXXX)
      trap '\''rm -f "$probe"'\'' EXIT
      printf writable > "$probe"
      for file in /data/appendonly.aof /data/dump.rdb; do
        if [ -e "$file" ]; then test -f "$file" && test -r "$file" && test -w "$file"; fi
      done
    '
}
