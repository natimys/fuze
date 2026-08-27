#!/bin/sh
set -eu

REPOSITORY="natimys/fuze"
INSTALL_DIR="/opt/fuze"
TARGET_VERSION="latest"
MODE=""
APP_PORT="3000"
MEDIA_PORT="9000"
APP_DOMAIN=""
STORAGE_DOMAIN=""
ACME_EMAIL=""
NON_INTERACTIVE=0
UPDATE=0
RESTORE_ARCHIVE=""
BACKUP_RETENTION_DAILY="7"
BACKUP_RETENTION_PREUPDATE="3"

fail() { printf 'Fuze installer: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*"; }
command_exists() { command -v "$1" >/dev/null 2>&1; }
prompt() { label="$1"; default="$2"; printf '%s [%s]: ' "$label" "$default" >/dev/tty; IFS= read -r answer </dev/tty; printf '%s' "${answer:-$default}"; }
confirm() { [ "$NON_INTERACTIVE" -eq 1 ] && return 0; printf '%s [y/N]: ' "$1" >/dev/tty; IFS= read -r answer </dev/tty; case "$answer" in y|Y|yes|YES) return 0;; *) return 1;; esac; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --install-dir) INSTALL_DIR="$2"; shift 2;;
    --version) TARGET_VERSION="$2"; shift 2;;
    --mode) MODE="$2"; shift 2;;
    --app-port) APP_PORT="$2"; shift 2;;
    --media-port) MEDIA_PORT="$2"; shift 2;;
    --app-domain) APP_DOMAIN="$2"; shift 2;;
    --storage-domain) STORAGE_DOMAIN="$2"; shift 2;;
    --acme-email) ACME_EMAIL="$2"; shift 2;;
    --backup-retention) BACKUP_RETENTION_DAILY="$2"; shift 2;;
    --pre-update-retention) BACKUP_RETENTION_PREUPDATE="$2"; shift 2;;
    --non-interactive) NON_INTERACTIVE=1; shift;;
    --update) UPDATE=1; shift;;
    --restore) RESTORE_ARCHIVE="$2"; shift 2;;
    --help) printf '%s\n' 'Usage: install.sh [--update] [--restore ARCHIVE] [--version vX.Y.Z] [--mode local|https] [--install-dir PATH]'; exit 0;;
    *) fail "unknown option: $1";;
  esac
done

[ "$(uname -s)" = Linux ] || fail "Linux is required. Windows and macOS are supported only for development."
[ "$(id -u)" -eq 0 ] || fail "Run the installer as root, for example: curl ... | sudo bash"
command_exists docker || fail "Docker Engine is required. Install it from https://docs.docker.com/engine/install/ and retry."
docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable. Start Docker and retry."
docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin is required. Install docker-compose-plugin and retry."
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
  restore_mode="$(awk -F= '/^DEPLOYMENT_MODE=/{print $2}' .env 2>/dev/null || echo local)"
  restore_files="-f compose.yaml"
  [ "$restore_mode" = https ] && restore_files="$restore_files -f compose.https.yaml"
  docker compose $restore_files stop frontend backend worker beat backup
  restore_copy="$INSTALL_DIR/backups/restore-input.tar.gz"
  cp "$RESTORE_ARCHIVE" "$restore_copy"
  docker compose $restore_files run --rm backup restore /backups/restore-input.tar.gz || fail "database restore failed"
  temp_restore="$(mktemp -d)"
  tar -C "$temp_restore" -xzf "$RESTORE_ARCHIVE"
  cp -a "$temp_restore/secrets/." "$INSTALL_DIR/secrets/"
  chmod 600 "$INSTALL_DIR"/secrets/*
  cp "$temp_restore/.env" "$INSTALL_DIR/.env"
  restored_db_password="$(cat "$INSTALL_DIR/secrets/postgres_password")"
  printf "ALTER USER fuze PASSWORD '%s';\n" "$restored_db_password" | docker compose $restore_files exec -T postgres psql -U fuze -d fuze >/dev/null
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
  [ "$installed_version" != "$target_version" ] || { info "Fuze $target_version is already installed"; exit 0; }
  info "Creating pre-update backup"
  (cd "$INSTALL_DIR" && docker compose run --rm backup backup pre-update) || fail "pre-update backup failed; installation was not changed"
  previous="$INSTALL_DIR/deploy/previous-$installed_version"
  mkdir -p "$previous"
  cp "$INSTALL_DIR/compose.yaml" "$INSTALL_DIR/compose.https.yaml" "$INSTALL_DIR/Caddyfile" "$INSTALL_DIR/.env" "$INSTALL_DIR/VERSION" "$previous/"
else
  MODE="${MODE:-$(prompt 'Deployment mode (local/https)' 'local')}"
fi

MODE="${MODE:-$(awk -F= '/^DEPLOYMENT_MODE=/{print $2}' "$INSTALL_DIR/.env" 2>/dev/null || true)}"
if [ "$UPDATE" -eq 1 ]; then
  [ -n "$APP_DOMAIN" ] || APP_DOMAIN="$(awk -F= '/^APP_DOMAIN=/{print substr($0,index($0,"=")+1)}' "$INSTALL_DIR/.env")"
  [ -n "$STORAGE_DOMAIN" ] || STORAGE_DOMAIN="$(awk -F= '/^STORAGE_DOMAIN=/{print substr($0,index($0,"=")+1)}' "$INSTALL_DIR/.env")"
  [ -n "$ACME_EMAIL" ] || ACME_EMAIL="$(awk -F= '/^ACME_EMAIL=/{print substr($0,index($0,"=")+1)}' "$INSTALL_DIR/.env")"
  APP_PORT="$(awk -F= '/^APP_PORT=/{print $2}' "$INSTALL_DIR/.env" 2>/dev/null || echo "$APP_PORT")"
fi
case "$MODE" in
  local)
    [ "$NON_INTERACTIVE" -eq 1 ] || APP_PORT="$(prompt 'Application HTTP port' "$APP_PORT")"
    printf '%s\n' 'WARNING: Local/LAN mode uses HTTP and must not be exposed directly to the Internet.'
    ;;
  https)
    [ -n "$APP_DOMAIN" ] || APP_DOMAIN="$(prompt 'Application domain' '')"
    [ -n "$STORAGE_DOMAIN" ] || STORAGE_DOMAIN="$(prompt 'Storage domain' '')"
    [ -n "$ACME_EMAIL" ] || ACME_EMAIL="$(prompt 'ACME email' '')"
    domain_re='^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])$'
    printf '%s' "$APP_DOMAIN" | grep -Eq "$domain_re" || fail "invalid application domain"
    printf '%s' "$STORAGE_DOMAIN" | grep -Eq "$domain_re" || fail "invalid storage domain"
    command_exists getent || fail "getent is required for Public HTTPS DNS validation"
    getent ahosts "$APP_DOMAIN" >/dev/null || fail "application domain does not resolve"
    getent ahosts "$STORAGE_DOMAIN" >/dev/null || fail "storage domain does not resolve"
    ;;
  *) fail "deployment mode must be local or https";;
esac

if [ "$UPDATE" -ne 1 ]; then
  ports="$APP_PORT"
  [ "$MODE" = https ] && ports="80 443"
  for port in $ports; do
    if command_exists ss && ss -H -ltn "sport = :$port" 2>/dev/null | grep -q .; then fail "TCP port $port is already in use"; fi
  done
  mkdir -p "$INSTALL_DIR/secrets" "$INSTALL_DIR/backups" "$INSTALL_DIR/deploy"
  chmod 700 "$INSTALL_DIR/secrets" "$INSTALL_DIR/backups"
  for secret in postgres_password jwt_key config_encryption_key minio_root_access_key minio_root_secret_key minio_media_access_key minio_media_secret_key; do
    [ -s "$INSTALL_DIR/secrets/$secret" ] || { umask 177; dd if=/dev/urandom bs=48 count=1 2>/dev/null | base64 | tr -d '\n' >"$INSTALL_DIR/secrets/$secret"; }
  done
fi

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
ENVIRONMENT=$([ "$MODE" = https ] && echo production || echo development)
APP_PORT=$APP_PORT
MINIO_EXTERNAL_ENDPOINT=$([ "$MODE" = https ] && printf '%s' "$STORAGE_DOMAIN" || printf 'localhost:%s' "$MEDIA_PORT")
MINIO_EXTERNAL_SECURE=$([ "$MODE" = https ] && echo true || echo false)
MINIO_BUCKET=tracks
CORS_ORIGINS=$([ "$MODE" = https ] && printf '["https://%s"]' "$APP_DOMAIN" || printf '["http://localhost:%s"]' "$APP_PORT")
CORS_ALLOW_CREDENTIALS=true
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
COOKIE_SECURE=$([ "$MODE" = https ] && echo true || echo false)
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
if ! docker compose $compose_files up -d; then
  if [ "$UPDATE" -eq 1 ]; then cp "$previous/compose.yaml" "$previous/compose.https.yaml" "$previous/Caddyfile" "$previous/.env" "$previous/VERSION" "$INSTALL_DIR/"; docker compose $compose_files up -d || true; fi
  fail "services failed to start; previous deployment files were restored when available"
fi
info "Waiting for migrations and service readiness"
attempt=0
until docker compose $compose_files exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/ready', timeout=5)" >/dev/null 2>&1; do
  attempt=$((attempt + 1)); [ "$attempt" -lt 60 ] || { docker compose $compose_files logs --no-color >"$INSTALL_DIR/deploy/failed-$target_version.log" 2>&1; if [ "$UPDATE" -eq 1 ]; then cp "$previous/compose.yaml" "$previous/compose.https.yaml" "$previous/Caddyfile" "$previous/.env" "$previous/VERSION" "$INSTALL_DIR/"; docker compose $compose_files up -d || true; fi; fail "readiness failed; see deploy/failed-$target_version.log"; }; sleep 5
done
if [ "$UPDATE" -ne 1 ]; then docker compose $compose_files run --rm backend fuze rescue bootstrap-admin; fi
url="http://localhost:$APP_PORT"
[ "$MODE" = https ] && url="https://$APP_DOMAIN"
info "Fuze $target_version is ready at $url"
printf 'Install path: %s\nBackups: %s/backups\nStatus: cd %s && docker compose ps\nLogs: cd %s && docker compose logs -f\n' "$INSTALL_DIR" "$INSTALL_DIR" "$INSTALL_DIR" "$INSTALL_DIR"
