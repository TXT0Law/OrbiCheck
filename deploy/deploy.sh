#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

usage() {
  cat <<'EOF'
Usage: bash deploy/deploy.sh [--prod] [--down]

  --prod  Start with docker-compose.prod.yml and external DATABASE_URL/REDIS_URL
  --down  Stop the running stack and remove orphan containers
EOF
}

PROD_MODE=0
DOWN_MODE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --prod)
      PROD_MODE=1
      ;;
    --down)
      DOWN_MODE=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

COMPOSE_ARGS=(-f docker-compose.yml)
if [ "${PROD_MODE}" -eq 1 ]; then
  COMPOSE_ARGS+=(-f docker-compose.prod.yml)
fi

compose() {
  docker compose "${COMPOSE_ARGS[@]}" "$@"
}

copy_if_missing() {
  local source_path="$1"
  local target_path="$2"

  if [ -f "${target_path}" ] || [ ! -f "${source_path}" ]; then
    return 0
  fi

  cp "${source_path}" "${target_path}"
  echo "Created ${target_path} from ${source_path}"
}

ensure_env_files() {
  copy_if_missing ".env.example" ".env"
  copy_if_missing "backend/.env.example" "backend/.env"
  copy_if_missing "backend/scan/.env.example" "backend/scan/.env"
}

container_status() {
  local service_name="$1"
  local container_id

  container_id="$(compose ps -q "${service_name}")"
  if [ -z "${container_id}" ]; then
    echo "missing"
    return 0
  fi

  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}"
}

wait_for_service() {
  local service_name="$1"
  local timeout_seconds="${2:-240}"
  local elapsed=0
  local status

  printf 'Waiting for %s' "${service_name}"
  while [ "${elapsed}" -lt "${timeout_seconds}" ]; do
    status="$(container_status "${service_name}")"
    if [ "${status}" = "healthy" ] || [ "${status}" = "running" ]; then
      echo " healthy"
      return 0
    fi
    if [ "${status}" = "exited" ] || [ "${status}" = "dead" ]; then
      echo ""
      compose logs --no-color --tail=50 "${service_name}" || true
      echo "Service ${service_name} exited before becoming healthy." >&2
      exit 1
    fi

    printf '.'
    sleep 5
    elapsed=$((elapsed + 5))
  done

  echo ""
  compose logs --no-color --tail=50 "${service_name}" || true
  echo "Timed out waiting for ${service_name} to become healthy." >&2
  exit 1
}

if [ "${DOWN_MODE}" -eq 1 ]; then
  compose down --remove-orphans
  echo "Stack stopped."
  exit 0
fi

ensure_env_files

if [ "${PROD_MODE}" -eq 1 ]; then
  : "${DATABASE_URL:?DATABASE_URL is required when using --prod}"
  : "${REDIS_URL:?REDIS_URL is required when using --prod}"
fi

compose build

if [ "${PROD_MODE}" -eq 1 ]; then
  compose up -d --remove-orphans --scale postgres=0 --scale redis=0
  services=(scan-service backend celery-worker celery-beat frontend)
else
  compose up -d --remove-orphans
  services=(postgres redis scan-service backend celery-worker celery-beat frontend)
fi

for service in "${services[@]}"; do
  wait_for_service "${service}"
done

echo ""
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:8000"
