#!/usr/bin/env bash

set -euo pipefail

PROJECT_NAME="orbicheck-phase1-$RANDOM"
WAIT_TIMEOUT_SECONDS=180
HTTP_OK=200
HTTP_BAD_REQUEST=400
HTTP_UNAUTHORIZED=401
HTTP_UNPROCESSABLE_ENTITY=422
INTERNAL_SERVICE_SECRET="$(
  python3 -c 'import secrets; print(secrets.token_urlsafe(48))'
)"
export INTERNAL_SERVICE_SECRET

cleanup() {
  docker compose -p "$PROJECT_NAME" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -p "$PROJECT_NAME" up \
  --detach \
  --build \
  --wait \
  --wait-timeout "$WAIT_TIMEOUT_SECONDS" \
  scan-service \
  scanner

unsigned_scan_status="$(
  docker compose -p "$PROJECT_NAME" exec -T scan-service node -e "
    fetch('http://127.0.0.1:4000/api/scan/modules')
      .then((response) => console.log(response.status));
  "
)"
test "$unsigned_scan_status" = "$HTTP_UNAUTHORIZED"

unsigned_scanner_status="$(
  docker compose -p "$PROJECT_NAME" exec -T scan-service node -e "
    fetch('http://scanner:5000/scan/ports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: 'example.com',
        authorization_acknowledged: true,
      }),
    }).then((response) => console.log(response.status));
  "
)"
test "$unsigned_scanner_status" = "$HTTP_UNAUTHORIZED"

scan_status="$(
  docker compose -p "$PROJECT_NAME" exec -T scan-service node --input-type=module -e "
    import { buildInternalAuthHeaders } from './_common/internal-auth.js';
    const target = '/api/scan/modules';
    const headers = buildInternalAuthHeaders({
      secret: process.env.INTERNAL_SERVICE_SECRET,
      method: 'GET',
      target,
    });
    const response = await fetch('http://127.0.0.1:4000' + target, { headers });
    console.log(response.status);
  "
)"
test "$scan_status" = "$HTTP_OK"

blocked_target_status="$(
  docker compose -p "$PROJECT_NAME" exec -T scan-service node --input-type=module -e "
    import { buildInternalAuthHeaders } from './_common/internal-auth.js';
    const target = '/api/scan/status?url=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data';
    const headers = buildInternalAuthHeaders({
      secret: process.env.INTERNAL_SERVICE_SECRET,
      method: 'GET',
      target,
    });
    const response = await fetch('http://127.0.0.1:4000' + target, { headers });
    console.log(response.status);
  "
)"
test "$blocked_target_status" = "$HTTP_BAD_REQUEST"

scanner_status="$(
  docker compose -p "$PROJECT_NAME" exec -T scan-service node --input-type=module -e "
    import { buildInternalAuthHeaders } from './_common/internal-auth.js';
    const target = '/scan/ports';
    const body = JSON.stringify({
      target: '127.0.0.1',
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
    console.log(response.status);
  "
)"
test "$scanner_status" = "$HTTP_UNPROCESSABLE_ENTITY"

echo "Phase 1 container network checks passed."
