#!/usr/bin/env bash

set -euo pipefail
umask 077

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIRECTORY="${BACKUP_DIRECTORY:-${PROJECT_ROOT}/backups}"
BACKUP_PATH="${1:-${BACKUP_DIRECTORY}/orbicheck-$(date -u +%Y%m%dT%H%M%SZ).dump.enc}"
DATABASE_NAME="${POSTGRES_DB:-orbicheck}"
DATABASE_USER="${POSTGRES_USER:-orbicheck}"
DRILL_DATABASE="orbicheck_restore_drill_$$"
ENCRYPTION_CIPHER="aes-256-cbc"

: "${BACKUP_ENCRYPTION_PASSWORD:?Set BACKUP_ENCRYPTION_PASSWORD to encrypt the backup artifact}"

cd "${PROJECT_ROOT}"
mkdir -p "$(dirname "${BACKUP_PATH}")"
RAW_BACKUP="$(mktemp "${TMPDIR:-/tmp}/orbicheck-backup.XXXXXX.dump")"
RESTORE_BACKUP="$(mktemp "${TMPDIR:-/tmp}/orbicheck-restore.XXXXXX.dump")"
chmod 600 "${RAW_BACKUP}" "${RESTORE_BACKUP}"

compose_exec() {
  docker compose exec -T postgres "$@"
}

cleanup() {
  compose_exec dropdb \
    --username "${DATABASE_USER}" \
    --if-exists "${DRILL_DATABASE}" >/dev/null 2>&1 || true
  rm -f "${RAW_BACKUP}" "${RESTORE_BACKUP}"
}
trap cleanup EXIT

compose_exec pg_isready --username "${DATABASE_USER}" --dbname "${DATABASE_NAME}"
compose_exec pg_dump \
  --username "${DATABASE_USER}" \
  --dbname "${DATABASE_NAME}" \
  --format=custom >"${RAW_BACKUP}"

openssl enc "-${ENCRYPTION_CIPHER}" -pbkdf2 -salt \
  -in "${RAW_BACKUP}" \
  -out "${BACKUP_PATH}" \
  -pass env:BACKUP_ENCRYPTION_PASSWORD
chmod 600 "${BACKUP_PATH}"
openssl enc "-${ENCRYPTION_CIPHER}" -d -pbkdf2 \
  -in "${BACKUP_PATH}" \
  -out "${RESTORE_BACKUP}" \
  -pass env:BACKUP_ENCRYPTION_PASSWORD

compose_exec pg_restore --list <"${RESTORE_BACKUP}" >/dev/null
compose_exec createdb --username "${DATABASE_USER}" "${DRILL_DATABASE}"
compose_exec pg_restore \
  --username "${DATABASE_USER}" \
  --dbname "${DRILL_DATABASE}" \
  --no-owner \
  --no-privileges <"${RESTORE_BACKUP}"

TABLE_COUNT="$(
  compose_exec psql \
    --username "${DATABASE_USER}" \
    --dbname "${DRILL_DATABASE}" \
    --tuples-only \
    --no-align \
    --command "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
)"
ALEMBIC_VERSION="$(
  compose_exec psql \
    --username "${DATABASE_USER}" \
    --dbname "${DRILL_DATABASE}" \
    --tuples-only \
    --no-align \
    --command "SELECT version_num FROM alembic_version LIMIT 1;"
)"

if [ "${TABLE_COUNT}" -le 0 ] || [ -z "${ALEMBIC_VERSION}" ]; then
  echo "Restore verification failed: tables=${TABLE_COUNT}, alembic=${ALEMBIC_VERSION:-missing}" >&2
  exit 1
fi

echo "Backup and restore drill passed."
echo "Backup: ${BACKUP_PATH}"
echo "Restored tables: ${TABLE_COUNT}; Alembic revision: ${ALEMBIC_VERSION}"
