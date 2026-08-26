# Fuze

[Русский](README.ru.md) | English

Fuze is a self-hosted music player that brings music from YouTube, Yandex Music,
and Spotify into one library.

It runs as a set of Docker containers and stores its configuration in PostgreSQL.
Redis handles background jobs, while downloaded media is kept in S3-compatible
storage.

## Install

You need a Linux server with Docker Engine and the Docker Compose plugin. Git,
Python, Node.js, and `uv` are not required on the server.

```bash
curl -fsSL https://github.com/natimys/fuze/releases/latest/download/install.sh | sudo bash
```

The installer offers two modes:

- **Local/LAN** — HTTP on port 3000 by default. Do not expose it directly to the
  internet.
- **Public HTTPS** — Caddy configures HTTPS for the application and storage
  domains. Ports 80 and 443 must be available.

The default installation directory is `/opt/fuze`. Once Fuze is running, instance
settings are available at `/player/admin-settings`; personal settings are at
`/player/settings`.

## Update

Fuze does not update itself. To install the latest stable release, run:

```bash
curl -fsSL https://github.com/natimys/fuze/releases/latest/download/install.sh |
  sudo bash -s -- --update
```

Use `--version vX.Y.Z` to install a specific release. Before updating, the
installer creates a backup. If the new version does not become ready, it restores
the previous deployment.

## Backup and restore

Fuze keeps seven daily PostgreSQL backups by default. Create one manually with:

```bash
cd /opt/fuze
sudo docker compose run --rm backup backup daily
```

Restore a backup through the installer:

```bash
curl -fsSL https://github.com/natimys/fuze/releases/latest/download/install.sh |
  sudo bash -s -- --restore /opt/fuze/backups/fuze-daily-TIMESTAMP.tar.gz
```

Store copies of both the `.tar.gz` archive and its `.sha256` file outside the
server. Backups contain credentials and signing keys, so treat them as secrets.
Downloaded media is not included; Fuze can rebuild it when needed.

For recovery procedures and diagnostics, see the
[operations runbook](docs/operations/runbooks.md).

## Development

You need Python 3.12, `uv`, Node.js 22, and Docker Compose.

```bash
cp .env.example .env
cp .env.test.example .env.test
uv sync
docker compose up -d --build
```

The web app is served at `http://localhost:3000`. The API listens on
`http://localhost:8000`.

Run the checks:

```bash
docker compose --profile test up -d db-test
uv run pytest
uv run ruff check .

cd src/frontend
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

For frontend development, run `npm run dev` from `src/frontend`. Vite uses port
3000 and proxies `/api` to `API_PROXY_TARGET` (`http://127.0.0.1:8000` by
default).

## Useful commands

```bash
cd /opt/fuze
sudo docker compose ps
sudo docker compose logs -f backend worker
sudo docker compose restart backend
```

Admin recovery commands are available inside the backend container:

```bash
sudo docker compose run --rm backend fuze rescue bootstrap-admin
sudo docker compose run --rm backend fuze rescue reset-admin-password EMAIL
sudo docker compose run --rm backend fuze rescue promote-user EMAIL
sudo docker compose exec backend fuze rescue doctor
```

## License

[MIT](LICENSE)
