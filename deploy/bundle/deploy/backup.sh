#!/bin/bash
set -euo pipefail

export PGPASSWORD="$(cat "$PGPASSWORD_FILE")"
mode="${1:-backup}"

make_backup() {
  kind="${1:-daily}"
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' RETURN
  pg_dump --host="${DB_HOST:-postgres}" --username="${DB_USER:-fuze}" --dbname="${DB_NAME:-fuze}" --format=custom --file="$work/database.dump"
  cp -a /source/.env /source/VERSION /source/compose.yaml /source/compose.https.yaml /source/Caddyfile "$work/"
  cp -a /source/secrets "$work/secrets"
  chmod -R go-rwx "$work"
  printf '{"kind":"%s","created_at":"%s","version":"%s","database_format":"custom","media_included":false}\n' "$kind" "$timestamp" "$(cat /source/VERSION)" >"$work/manifest.json"
  archive="/backups/fuze-${kind}-${timestamp}.tar.gz"
  tar -C "$work" -czf "$archive" .
  sha256sum "$archive" >"$archive.sha256"
  chmod 600 "$archive" "$archive.sha256"
  keep="${BACKUP_RETENTION_DAILY:-7}"
  [ "$kind" = pre-update ] && keep="${BACKUP_RETENTION_PREUPDATE:-3}"
  find /backups -maxdepth 1 -name "fuze-${kind}-*.tar.gz" -printf '%T@ %p\n' | sort -rn | tail -n "+$((keep + 1))" | cut -d' ' -f2- | while read -r old; do rm -f "$old" "$old.sha256"; done
  echo "$archive"
}

if [ "$mode" = schedule ]; then
  while true; do
    make_backup daily
    sleep "${BACKUP_INTERVAL_SECONDS:-86400}"
  done
elif [ "$mode" = restore ]; then
  archive="${2:?restore archive is required}"
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT
  tar -C "$work" -xzf "$archive"
  pg_restore --host="${DB_HOST:-postgres}" --username="${DB_USER:-fuze}" --dbname="${DB_NAME:-fuze}" --clean --if-exists --no-owner "$work/database.dump"
else
  make_backup "${2:-daily}"
fi
