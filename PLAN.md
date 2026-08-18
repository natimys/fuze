# Fuze Public Beta

## Completed

- [x] Application stabilization
- [x] Auth / CSRF / RBAC
- [x] Durable acquisition pipeline
- [x] Private playlists
- [x] CI / Docker
- [x] Migration verification
- [x] Browser E2E

## Release gates

### Media delivery

- [x] Production-like HTTPS proxy
- [x] Live Range request test
- [x] Least-privilege MinIO account

### Concurrency

- [x] 20 simultaneous acquire requests
- [x] Exactly one underlying acquisition
- [x] Measure p95 search/acquire

### Supply chain / operations

- [x] Pin media binaries
- [x] Image scan
- [x] SBOM
- [x] Secret scan
- [x] Backup/restore test

### Legal

- [x] YouTube-derived audio — source-only distribution risk accepted
  ([decision](docs/legal/youtube-derived-audio.md))
- [x] Yandex metadata — source-only distribution risk accepted
  ([decision](docs/legal/yandex-metadata.md))
- [x] Spotify metadata - optional operator-compliant integration
  ([decision](docs/legal/spotify-metadata.md))

## Public-beta gate

Release when all technical gates above are green
and legal requirements are understood.
