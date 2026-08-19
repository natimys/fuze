# Fuze

Fuze is a self-hosted music player with YouTube, Yandex Music and Spotify discovery, PostgreSQL-backed instance configuration, Redis jobs and S3-compatible media storage.

## Install on a server

Production installation does not require Git, Python, Node.js or `uv`. It requires Linux, a running Docker Engine and the Docker Compose plugin.

```bash
curl -fsSL https://github.com/natimys/fuze/releases/latest/download/install.sh | sudo bash
```

The installer verifies the host, asks for Local/LAN or Public HTTPS mode, downloads digest-pinned multi-architecture images from GHCR, runs migrations and starts an interactive first-admin bootstrap. The default installation is `/opt/fuze`.

Local/LAN mode serves HTTP on port 3000 by default and must not be exposed directly to the Internet. Public HTTPS mode asks for application/storage domains and an ACME email; Caddy exposes only ports 80 and 443.

After installation, application settings are managed by an administrator at `/player/settings`. Infrastructure endpoints, TLS, image versions and deployment secrets remain file-managed and cannot be edited from the site.

## Update

Stable updates are always explicit:

```bash
curl -fsSL https://github.com/natimys/fuze/releases/latest/download/install.sh |
  sudo bash -s -- --update
```

An update creates a pre-update backup, preserves the previous deployment bundle, pulls digest-pinned images, runs the one-shot migration service and waits for readiness. Failed readiness restores the previous bundle and writes a redacted diagnostic log under `/opt/fuze/deploy`.

To install a specific release, pass `--version vX.Y.Z`. Fuze never updates itself in the background and stable installs never consume the `edge` channel.

## Backup and restore

The Compose `backup` service creates a daily custom-format PostgreSQL dump and retains seven daily backups by default. Each archive also contains the deployment environment, Compose/Caddy files, version manifest and encryption/deployment secrets. MinIO media is deliberately excluded because it is treated as a rebuildable cache.

Create an explicit backup:

```bash
cd /opt/fuze
sudo docker compose run --rm backup backup daily
```

Restore only through the installer:

```bash
curl -fsSL https://github.com/natimys/fuze/releases/latest/download/install.sh |
  sudo bash -s -- --restore /opt/fuze/backups/fuze-daily-TIMESTAMP.tar.gz
```

Keep off-host copies of both `.tar.gz` and `.tar.gz.sha256`. Anyone with a backup can recover provider credentials and signing keys, so protect it like a password vault.

## Operations and rescue

Container lifecycle is standard Docker Compose; there is no host CLI.

```bash
cd /opt/fuze
sudo docker compose ps
sudo docker compose logs -f backend worker
sudo docker compose restart backend
```

The backend image contains a narrowly scoped rescue CLI:

```bash
sudo docker compose run --rm backend fuze rescue bootstrap-admin
sudo docker compose run --rm backend fuze rescue reset-admin-password EMAIL
sudo docker compose run --rm backend fuze rescue promote-user EMAIL
sudo docker compose exec backend fuze rescue doctor
sudo docker compose exec backend fuze rescue db-status
sudo docker compose exec backend fuze rescue config-show
```

Rescue commands do not edit host deployment files, invoke Docker or perform schema downgrade. See [operations runbooks](docs/operations/runbooks.md) for failed updates, key loss, migration and provider diagnostics.

## Developer setup from Git

The repository checkout is only for development. Developers need Python 3.12, `uv`, Node.js 22 and Docker Compose.

```bash
cp .env.example .env
cp .env.test.example .env.test
uv sync
docker compose up -d --build
```

Development Compose keeps `build:` and exposes PostgreSQL/MinIO on loopback for debugging. It uses the same one-shot `migrate` service as production. `fuze.toml` is legacy-only and is not mounted by new deployments; transition installations can import it with `fuze rescue import-legacy-config`.

Run checks:

```bash
docker compose --profile test up -d db-test
uv run pytest
uv run ruff check .
cd src/frontend
npm ci
npm test -- --run
npm run build
```

## Architecture and security

- Backend, worker, beat, migration and rescue commands use the same non-root backend image.
- Application configuration and audit history live in PostgreSQL. Provider secrets are encrypted with a dedicated config key and are never returned by the API.
- PostgreSQL, Redis and the MinIO console are not published in Public HTTPS mode. Proxy/frontend have no direct database network access.
- No Fuze service receives the Docker socket.
- Telemetry is disabled; Fuze sends no product metrics unless a future explicit opt-in is implemented.
- Release images target `linux/amd64` and `linux/arm64`, carry OCI metadata, SBOM/provenance attestations and keyless Cosign signatures.

## License

MIT
