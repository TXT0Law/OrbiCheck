#!/usr/bin/env bash

set -euo pipefail

APP_SERVICES=(frontend backend scan-service scanner celery-worker celery-beat)
HTTP_OK=200
PORT_SCAN_TARGET="${PORT_SCAN_TARGET:-example.com}"

for service in "${APP_SERVICES[@]}"; do
  container_id="$(docker compose ps -q "${service}")"
  if [ -z "${container_id}" ]; then
    echo "Missing running container for ${service}" >&2
    exit 1
  fi

  runtime_user="$(docker inspect --format '{{.Config.User}}' "${container_id}")"
  readonly_root="$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "${container_id}")"
  cap_drop="$(docker inspect --format '{{json .HostConfig.CapDrop}}' "${container_id}")"
  pids_limit="$(docker inspect --format '{{.HostConfig.PidsLimit}}' "${container_id}")"
  memory_limit="$(docker inspect --format '{{.HostConfig.Memory}}' "${container_id}")"
  nano_cpus="$(docker inspect --format '{{.HostConfig.NanoCpus}}' "${container_id}")"

  if [ -z "${runtime_user}" ] || [ "${runtime_user}" = "0" ] || [ "${runtime_user}" = "root" ]; then
    echo "${service} is not configured with a non-root user" >&2
    exit 1
  fi
  test "${readonly_root}" = "true"
  test "${cap_drop}" = '["ALL"]'
  test "${pids_limit}" -gt 0
  test "${memory_limit}" -gt 0
  test "${nano_cpus}" -gt 0

  if ! docker compose exec -T "${service}" sh -eu -c '
      test "$HOME" = "/tmp"
      touch /tmp/orbicheck-write-test
      rm /tmp/orbicheck-write-test
      if touch /orbicheck-root-write-test 2>/dev/null; then
        rm -f /orbicheck-root-write-test
        exit 1
      fi
    '; then
    echo "${service} failed writable tmp/read-only root verification" >&2
    exit 1
  fi
done

docker compose exec -T frontend sh -eu -c '
  touch /app/.next/cache/orbicheck-cache-write-test
  rm /app/.next/cache/orbicheck-cache-write-test
'

port_scan_status="$(
  docker compose exec -T \
    -e PORT_SCAN_TARGET="${PORT_SCAN_TARGET}" \
    scan-service node --input-type=module -e "
      import { buildInternalAuthHeaders } from './_common/internal-auth.js';
      const target = '/scan/ports';
      const body = JSON.stringify({
        target: process.env.PORT_SCAN_TARGET,
        profile: 'quick',
        authorization_acknowledged: true,
      });
      const headers = {
        'Content-Type': 'application/json',
        ...buildInternalAuthHeaders({
          secret: process.env.INTERNAL_SERVICE_SECRET,
          method: 'POST',
          target,
          body: Buffer.from(body),
        }),
      };
      const response = await fetch('http://scanner:5000' + target, {
        method: 'POST',
        headers,
        body,
      });
      const payload = await response.json();
      if (
        response.status === ${HTTP_OK} &&
        payload.original_target === process.env.PORT_SCAN_TARGET &&
        typeof payload.resolved_ip === 'string' &&
        payload.authorization_acknowledged === true
      ) {
        console.log(response.status);
      } else {
        console.error(JSON.stringify(payload));
        process.exit(1);
      }
    "
)"
test "${port_scan_status}" = "${HTTP_OK}"

echo "P2 container hardening and port scan smoke checks passed."
