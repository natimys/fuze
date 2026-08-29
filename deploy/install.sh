#!/bin/sh
set -eu

REPOSITORY="natimys/fuze"
INSTALL_DIR="/opt/fuze"
TARGET_VERSION="latest"
MODE=""
BIND_ADDRESS=""
APP_PORT="3000"
MEDIA_PORT="9000"
APP_DOMAIN=""
STORAGE_DOMAIN=""
ACME_EMAIL=""
NON_INTERACTIVE=0
UPDATE=0
UNINSTALL=0
RESTORE_ARCHIVE=""
MODE_SET=0
BIND_ADDRESS_SET=0
BACKUP_RETENTION_DAILY="7"
BACKUP_RETENTION_PREUPDATE="3"

fail() { printf 'Fuze installer: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*"; }
command_exists() { command -v "$1" >/dev/null 2>&1; }
prompt() { label="$1"; default="$2"; printf '%s [%s]: ' "$label" "$default" >/dev/tty; IFS= read -r answer </dev/tty; printf '%s' "${answer:-$default}"; }
confirm() { [ "$NON_INTERACTIVE" -eq 1 ] && return 0; printf '%s [y/N]: ' "$1" >/dev/tty; IFS= read -r answer </dev/tty; case "$answer" in y|Y|yes|YES) return 0;; *) return 1;; esac; }
env_value() { awk -F= -v key="$1" '$1 == key {print substr($0,index($0,"=")+1); exit}' "$2" 2>/dev/null || true; }
compose_files_for_mode() { printf '%s' '-f compose.yaml'; [ "$1" = https ] && printf '%s' ' -f compose.https.yaml'; }
valid_ipv4() {
  printf '%s\n' "$1" | awk -F. 'NF != 4 {exit 1} {for (i=1;i<=4;i++) if ($i !~ /^[0-9]+$/ || $i < 0 || $i > 255 || (length($i) > 1 && substr($i,1,1) == "0")) exit 1}'
}
port_is_busy() {
  address="$1" port="$2"
  command_exists ss || return 1
  ss -H -ltn "sport = :$port" 2>/dev/null | awk -v address="$address" '
    { endpoint=$4; sub(/:[^:]*$/, "", endpoint); gsub(/^\[|\]$/, "", endpoint); if (address == "*" || endpoint == address || endpoint == "0.0.0.0" || endpoint == "::" || endpoint == "*") found=1 }
    END { exit !found }'
}
restore_previous_deployment() {
  cp "$previous/compose.yaml" "$previous/compose.https.yaml" "$previous/Caddyfile" "$previous/.env" "$previous/VERSION" "$INSTALL_DIR/"
  rollback_files="$(compose_files_for_mode "$previous_mode")"
  docker compose $rollback_files up -d || true
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --install-dir) INSTALL_DIR="$2"; shift 2;;
    --version) TARGET_VERSION="$2"; shift 2;;
    --mode) MODE="$2"; MODE_SET=1; shift 2;;
    --bind-address) BIND_ADDRESS="$2"; BIND_ADDRESS_SET=1; shift 2;;
    --app-port) APP_PORT="$2"; shift 2;;
    --media-port) MEDIA_PORT="$2"; shift 2;;
    --app-domain) APP_DOMAIN="$2"; shift 2;;
    --storage-domain) STORAGE_DOMAIN="$2"; shift 2;;
    --acme-email) ACME_EMAIL="$2"; shift 2;;
    --backup-retention) BACKUP_RETENTION_DAILY="$2"; shift 2;;
    --pre-update-retention) BACKUP_RETENTION_PREUPDATE="$2"; shift 2;;
    --non-interactive) NON_INTERACTIVE=1; shift;;
    --update) UPDATE=1; shift;;
    --uninstall) UNINSTALL=1; shift;;
    --restore) RESTORE_ARCHIVE="$2"; shift 2;;
    --help) printf '%s\n' 'Usage: install.sh [--update | --uninstall | --restore ARCHIVE] [--version vX.Y.Z] [--mode local|https|external-https] [--bind-address IPv4] [--install-dir PATH] [--non-interactive]'; exit 0;;
    *) fail "unknown option: $1";;
  esac
done

[ "$(uname -s)" = Linux ] || fail "Linux is required. Windows and macOS are supported only for development."
[ "$(id -u)" -eq 0 ] || fail "Run the installer as root, for example: curl ... | sudo bash"
command_exists docker || fail "Docker Engine is required. Install it from https://docs.docker.com/engine/install/ and retry."
docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable. Start Docker and retry."
docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin is required. Install docker-compose-plugin and retry."

if [ "$UNINSTALL" -eq 1 ]; then
  [ "$UPDATE" -eq 0 ] && [ -z "$RESTORE_ARCHIVE" ] || fail "--uninstall cannot be combined with --update or --restore"
  [ "$INSTALL_DIR" != / ] && [ -n "$INSTALL_DIR" ] || fail "refusing to uninstall from an unsafe installation directory"
  [ -f "$INSTALL_DIR/compose.yaml" ] && [ -f "$INSTALL_DIR/VERSION" ] || fail "no Fuze installation found at $INSTALL_DIR"
  printf '%s\n' 'WARNING: This permanently deletes Fuze containers, database, media, Docker volumes, secrets, and local backups.'
  confirm "Completely uninstall Fuze from $INSTALL_DIR?" || fail "uninstall cancelled"
  cd "$INSTALL_DIR"
  uninstall_mode="$(awk -F= '/^DEPLOYMENT_MODE=/{print $2}' .env 2>/dev/null || echo local)"
  uninstall_files="-f compose.yaml"
  case "$uninstall_mode" in https|external-https) uninstall_files="$uninstall_files -f compose.https.yaml";; esac
  info "Removing Fuze containers, networks, and volumes"
  if [ "$uninstall_mode" = external-https ]; then
    ACME_EMAIL=unused@invalid docker compose $uninstall_files down --volumes --remove-orphans || fail "failed to remove Fuze Docker resources"
  else
    docker compose $uninstall_files down --volumes --remove-orphans || fail "failed to remove Fuze Docker resources"
  fi
  cd /
  rm -rf -- "$INSTALL_DIR"
  info "Fuze was completely removed"
  exit 0
fi

command_exists curl || fail "curl is required."
command_exists sha256sum || fail "sha256sum is required."
command_exists tar || fail "tar is required."

case "$(uname -m)" in x86_64|amd64|aarch64|arm64) :;; *) fail "unsupported architecture: $(uname -m); use amd64 or arm64";; esac
free_kb="$(df -Pk "$(dirname "$INSTALL_DIR")" 2>/dev/null | awk 'NR==2 {print $4}' || true)"
[ -z "$free_kb" ] || [ "$free_kb" -ge 4194304 ] || fail "at least 4 GiB of free disk space is required"

if [ -n "$RESTORE_ARCHIVE" ]; then
  [ -d "$INSTALL_DIR" ] || fail "no Fuze installation found at $INSTALL_DIR"
  [ -f "$RESTORE_ARCHIVE" ] || fail "backup archive not found: $RESTORE_ARCHIVE"
  if [ -f "$RESTORE_ARCHIVE.sha256" ]; then (cd "$(dirname "$RESTORE_ARCHIVE")" && sha256sum -c "$(basename "$RESTORE_ARCHIVE").sha256") || fail "backup checksum verification failed"; fi
  confirm "Restore overwrites the current database and deployment secrets. Continue?" || fail "restore cancelled"
  info "Stopping write services"
  cd "$INSTALL_DIR"
  current_mode="$(env_value DEPLOYMENT_MODE .env)"; current_mode="${current_mode:-local}"
  current_files="$(compose_files_for_mode "$current_mode")"
  docker compose $current_files stop frontend backend worker beat backup
  restore_copy="$INSTALL_DIR/backups/restore-input.tar.gz"
  cp "$RESTORE_ARCHIVE" "$restore_copy"
  temp_restore="$(mktemp -d)"
  tar -C "$temp_restore" -xzf "$RESTORE_ARCHIVE"
  [ -f "$temp_restore/.env" ] && [ -f "$temp_restore/compose.yaml" ] || fail "backup archive is missing deployment files"
  restore_mode="$(env_value DEPLOYMENT_MODE "$temp_restore/.env")"; restore_mode="${restore_mode:-local}"
  case "$restore_mode" in local|https|external-https) :;; *) fail "backup contains an invalid deployment mode";; esac
  restore_bind="$(env_value BIND_ADDRESS "$temp_restore/.env")"; restore_bind="${restore_bind:-$([ "$restore_mode" = external-https ] && echo 127.0.0.1 || echo 0.0.0.0)}"
  valid_ipv4 "$restore_bind" || fail "backup contains an invalid bind address"
  grep -q '^BIND_ADDRESS=' "$temp_restore/.env" || printf 'BIND_ADDRESS=%s\n' "$restore_bind" >>"$temp_restore/.env"
  docker compose $current_files run --rm backup restore /backups/restore-input.tar.gz || fail "database restore failed"
  cp -a "$temp_restore/secrets/." "$INSTALL_DIR/secrets/"
  # Compose bind-mounts file-backed secrets without applying uid/gid/mode.
  # The backend image runs as the unprivileged `fuze` user, so the mounted
  # files must be readable inside the container. The parent directory remains
  # root-only on the host.
  chmod 644 "$INSTALL_DIR"/secrets/*
  cp "$temp_restore/.env" "$temp_restore/compose.yaml" "$INSTALL_DIR/"
  [ ! -f "$temp_restore/compose.https.yaml" ] || cp "$temp_restore/compose.https.yaml" "$INSTALL_DIR/"
  [ ! -f "$temp_restore/Caddyfile" ] || cp "$temp_restore/Caddyfile" "$INSTALL_DIR/"
  restore_files="$(compose_files_for_mode "$restore_mode")"
  restored_db_password="$(cat "$INSTALL_DIR/secrets/postgres_password")"
  printf "ALTER USER fuze PASSWORD '%s';\n" "$restored_db_password" | docker compose $current_files exec -T postgres psql -U fuze -d fuze >/dev/null
  rm -rf "$temp_restore"
  docker compose $restore_files run --rm migrate
  docker compose $restore_files up -d
  docker compose $restore_files exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/ready', timeout=5)" || fail "restored services are not ready"
  info "Restore completed successfully"
  exit 0
fi

if [ -d "$INSTALL_DIR" ] && [ "$UPDATE" -ne 1 ]; then
  fail "an installation already exists at $INSTALL_DIR; rerun with --update"
fi
if [ "$UPDATE" -eq 1 ] && [ ! -f "$INSTALL_DIR/VERSION" ]; then
  fail "--update requires an existing installation at $INSTALL_DIR"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM
if [ "$TARGET_VERSION" = latest ]; then
  release_base="https://github.com/$REPOSITORY/releases/latest/download"
else
  case "$TARGET_VERSION" in v[0-9]*.[0-9]*.[0-9]*) :;; *) fail "--version must use vX.Y.Z";; esac
  release_base="https://github.com/$REPOSITORY/releases/download/$TARGET_VERSION"
fi
info "Downloading signed release metadata and deployment bundle"
curl -fsSL "$release_base/SHA256SUMS" -o "$tmp/SHA256SUMS"
curl -fsSL "$release_base/fuze-deploy.tar.gz" -o "$tmp/fuze-deploy.tar.gz"
(cd "$tmp" && grep ' fuze-deploy.tar.gz$' SHA256SUMS | sha256sum -c -) || fail "deployment bundle checksum verification failed"
mkdir "$tmp/bundle"
tar -C "$tmp/bundle" -xzf "$tmp/fuze-deploy.tar.gz"
[ -f "$tmp/bundle/compose.yaml" ] || fail "release bundle is invalid"
target_version="$(cat "$tmp/bundle/VERSION")"
if [ "$UPDATE" -eq 1 ]; then
  installed_version="$(cat "$INSTALL_DIR/VERSION")"
  if [ "$installed_version" = "$target_version" ] && [ "$MODE_SET" -eq 0 ] && [ "$BIND_ADDRESS_SET" -eq 0 ]; then
    info "Fuze $target_version is already installed"
    exit 0
  fi
  info "Creating pre-update backup"
  (cd "$INSTALL_DIR" && docker compose run --rm backup backup pre-update) || fail "pre-update backup failed; installation was not changed"
  previous="$INSTALL_DIR/deploy/previous-$installed_version"
  previous_mode="$(env_value DEPLOYMENT_MODE "$INSTALL_DIR/.env")"; previous_mode="${previous_mode:-local}"
  mkdir -p "$previous"
  cp "$INSTALL_DIR/compose.yaml" "$INSTALL_DIR/compose.https.yaml" "$INSTALL_DIR/Caddyfile" "$INSTALL_DIR/.env" "$INSTALL_DIR/VERSION" "$previous/"
else
  MODE="${MODE:-$(prompt 'Deployment mode (local/https/external-https)' 'local')}"
fi

MODE="${MODE:-$(awk -F= '/^DEPLOYMENT_MODE=/{print $2}' "$INSTALL_DIR/.env" 2>/dev/null || true)}"
if [ "$UPDATE" -eq 1 ]; then
  [ -n "$APP_DOMAIN" ] || APP_DOMAIN="$(awk -F= '/^APP_DOMAIN=/{print substr($0,index($0,"=")+1)}' "$INSTALL_DIR/.env")"
  [ -n "$STORAGE_DOMAIN" ] || STORAGE_DOMAIN="$(awk -F= '/^STORAGE_DOMAIN=/{print substr($0,index($0,"=")+1)}' "$INSTALL_DIR/.env")"
  [ -n "$ACME_EMAIL" ] || ACME_EMAIL="$(awk -F= '/^ACME_EMAIL=/{print substr($0,index($0,"=")+1)}' "$INSTALL_DIR/.env")"
  APP_PORT="$(awk -F= '/^APP_PORT=/{print $2}' "$INSTALL_DIR/.env" 2>/dev/null || echo "$APP_PORT")"
  MEDIA_PORT="$(awk -F= '/^MEDIA_PORT=/{print $2}' "$INSTALL_DIR/.env" 2>/dev/null || echo "$MEDIA_PORT")"
  if [ "$BIND_ADDRESS_SET" -eq 0 ]; then BIND_ADDRESS="$(env_value BIND_ADDRESS "$INSTALL_DIR/.env")"; fi
fi
case "$MODE" in
  local)
    [ "$NON_INTERACTIVE" -eq 1 ] || APP_PORT="$(prompt 'Application HTTP port' "$APP_PORT")"
    printf '%s\n' 'WARNING: Local/LAN mode uses HTTP and must not be exposed directly to the Internet.'
    ;;
  https|external-https)
    [ -n "$APP_DOMAIN" ] || APP_DOMAIN="$(prompt 'Application domain' '')"
    [ -n "$STORAGE_DOMAIN" ] || STORAGE_DOMAIN="$(prompt 'Storage domain' '')"
    if [ "$MODE" = https ]; then [ -n "$ACME_EMAIL" ] || ACME_EMAIL="$(prompt 'ACME email' '')"; fi
    domain_re='^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])$'
    printf '%s' "$APP_DOMAIN" | grep -Eq "$domain_re" || fail "invalid application domain"
    printf '%s' "$STORAGE_DOMAIN" | grep -Eq "$domain_re" || fail "invalid storage domain"
    command_exists getent || fail "getent is required for Public HTTPS DNS validation"
    getent ahosts "$APP_DOMAIN" >/dev/null || fail "application domain does not resolve"
    getent ahosts "$STORAGE_DOMAIN" >/dev/null || fail "storage domain does not resolve"
    if [ "$MODE" = external-https ]; then
      BIND_ADDRESS="${BIND_ADDRESS:-127.0.0.1}"
      [ "$NON_INTERACTIVE" -eq 1 ] || BIND_ADDRESS="$(prompt 'Upstream bind address' "$BIND_ADDRESS")"
    fi
    ;;
  *) fail "deployment mode must be local, https, or external-https";;
esac
BIND_ADDRESS="${BIND_ADDRESS:-0.0.0.0}"
valid_ipv4 "$BIND_ADDRESS" || fail "bind address must be a valid IPv4 address"

if [ "$UPDATE" -ne 1 ] || { [ "$previous_mode" = https ] && [ "$MODE" = external-https ]; }; then
  ports="$APP_PORT"
  [ "$MODE" = https ] && ports="80 443"
  [ "$MODE" = external-https ] && ports="$APP_PORT $MEDIA_PORT"
  for port in $ports; do
    check_address="*"; [ "$MODE" = external-https ] && check_address="$BIND_ADDRESS"
    if port_is_busy "$check_address" "$port"; then fail "TCP port $port is already in use on $check_address"; fi
  done
fi
if [ "$UPDATE" -ne 1 ]; then
  mkdir -p "$INSTALL_DIR/secrets" "$INSTALL_DIR/backups" "$INSTALL_DIR/deploy"
  chmod 700 "$INSTALL_DIR/secrets" "$INSTALL_DIR/backups"
  for secret in postgres_password jwt_key config_encryption_key minio_root_access_key minio_root_secret_key minio_media_access_key minio_media_secret_key; do
    [ -s "$INSTALL_DIR/secrets/$secret" ] || { umask 177; dd if=/dev/urandom bs=48 count=1 2>/dev/null | base64 | tr -d '\n' >"$INSTALL_DIR/secrets/$secret"; }
  done
fi

# Docker Compose implements local file-backed secrets as bind mounts and
# preserves the source file mode. Keep the directory private on the host while
# allowing non-root service users to read the individual mounted secret files.
chmod 700 "$INSTALL_DIR/secrets"
chmod 644 "$INSTALL_DIR"/secrets/*

cp "$tmp/bundle/compose.yaml" "$tmp/bundle/compose.https.yaml" "$tmp/bundle/Caddyfile" "$tmp/bundle/VERSION" "$INSTALL_DIR/"
cp -a "$tmp/bundle/deploy/." "$INSTALL_DIR/deploy/"
chmod 755 "$INSTALL_DIR/deploy"/*.sh
backend_image="$(awk -F= '/^BACKEND_IMAGE=/{print substr($0,index($0,"=")+1)}' "$tmp/bundle/.env.release")"
frontend_image="$(awk -F= '/^FRONTEND_IMAGE=/{print substr($0,index($0,"=")+1)}' "$tmp/bundle/.env.release")"
cat >"$INSTALL_DIR/.env" <<EOF
DEPLOYMENT_MODE=$MODE
BACKEND_IMAGE=$backend_image
FRONTEND_IMAGE=$frontend_image
DB_NAME=fuze
DB_USER=fuze
ENVIRONMENT=$([ "$MODE" = local ] && echo development || echo production)
APP_PORT=$APP_PORT
MEDIA_PORT=$MEDIA_PORT
BIND_ADDRESS=$BIND_ADDRESS
MINIO_EXTERNAL_ENDPOINT=$([ "$MODE" = local ] && printf 'localhost:%s' "$MEDIA_PORT" || printf '%s' "$STORAGE_DOMAIN")
MINIO_EXTERNAL_SECURE=$([ "$MODE" = local ] && echo false || echo true)
MINIO_BUCKET=tracks
CORS_ORIGINS=$([ "$MODE" = local ] && printf '["http://localhost:%s"]' "$APP_PORT" || printf '["https://%s"]' "$APP_DOMAIN")
CORS_ALLOW_CREDENTIALS=true
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
COOKIE_SECURE=$([ "$MODE" = local ] && echo false || echo true)
COOKIE_SAMESITE=lax
ACCESS_TOKEN_EXPIRES=15
REFRESH_TOKEN_EXPIRES=30
BACKUP_RETENTION_DAILY=$BACKUP_RETENTION_DAILY
BACKUP_RETENTION_PREUPDATE=$BACKUP_RETENTION_PREUPDATE
APP_DOMAIN=$APP_DOMAIN
STORAGE_DOMAIN=$STORAGE_DOMAIN
ACME_EMAIL=$ACME_EMAIL
EOF

cd "$INSTALL_DIR"
compose_files="-f compose.yaml"
[ "$MODE" = https ] && compose_files="$compose_files -f compose.https.yaml"
docker compose $compose_files config >/dev/null || fail "generated Compose configuration is invalid"
docker compose $compose_files pull
if [ "$UPDATE" -eq 1 ] && [ "$previous_mode" = https ] && [ "$MODE" = external-https ]; then
  info "Stopping the built-in Caddy before publishing upstream ports"
  docker compose -f "$previous/compose.yaml" -f "$previous/compose.https.yaml" --env-file "$previous/.env" stop caddy || { restore_previous_deployment; fail "failed to stop the built-in Caddy"; }
fi
if ! docker compose $compose_files up -d; then
  if [ "$UPDATE" -eq 1 ]; then restore_previous_deployment; fi
  fail "services failed to start; previous deployment files were restored when available"
fi
info "Waiting for migrations and service readiness"
attempt=0
until docker compose $compose_files exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/ready', timeout=5)" >/dev/null 2>&1; do
  attempt=$((attempt + 1)); [ "$attempt" -lt 60 ] || { docker compose $compose_files logs --no-color >"$INSTALL_DIR/deploy/failed-$target_version.log" 2>&1; if [ "$UPDATE" -eq 1 ]; then restore_previous_deployment; fi; fail "readiness failed; see deploy/failed-$target_version.log"; }; sleep 5
done
if [ "$UPDATE" -eq 1 ] && [ "$previous_mode" = https ] && [ "$MODE" = external-https ]; then
  if ! ACME_EMAIL="${ACME_EMAIL:-unused@invalid}" docker compose -f compose.yaml -f compose.https.yaml rm -sf caddy; then
    restore_previous_deployment
    fail "failed to remove the obsolete built-in Caddy container; the previous HTTPS deployment was restored"
  fi
fi
if [ "$UPDATE" -ne 1 ]; then docker compose $compose_files run --rm backend fuze rescue bootstrap-admin; fi
url="http://localhost:$APP_PORT"
[ "$MODE" = https ] && url="https://$APP_DOMAIN"
[ "$MODE" = external-https ] && url="https://$APP_DOMAIN"
info "Fuze $target_version is ready at $url"
printf 'Install path: %s\nBackups: %s/backups\nStatus: cd %s && docker compose ps\nLogs: cd %s && docker compose logs -f\n' "$INSTALL_DIR" "$INSTALL_DIR" "$INSTALL_DIR" "$INSTALL_DIR"
