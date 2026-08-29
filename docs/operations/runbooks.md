# Fuze operations runbooks

Commands below assume `/opt/fuze`. Run Compose as root or through an account allowed to access Docker.

## Lost administrator access

Check the instance first, then reset an existing active administrator:

```bash
cd /opt/fuze
docker compose exec backend fuze rescue doctor
docker compose run --rm backend fuze rescue reset-admin-password admin@example.com
```

If the user exists but is not an administrator, use `promote-user EMAIL`. `bootstrap-admin` intentionally refuses to run while any active administrator exists.

For a key-only account, rotate the access key by numeric user ID. The command
prints the replacement exactly once and revokes sessions tied to the old key:

```bash
docker compose run --rm backend fuze rescue reset-access-key USER_ID --yes
```

Transfer the replacement through a protected channel; it cannot be recovered
from PostgreSQL because only its hash is stored.

## Failed update

Do not rerun migrations manually and never downgrade the schema. Read `/opt/fuze/deploy/failed-VERSION.log`, verify the current bundle with `docker compose config`, and run `fuze rescue db-status`. The installer restores the previous bundle after a readiness failure. If the old image cannot run against the migrated schema, stop write services and restore the pre-update archive instead.

## Lost or damaged config encryption key

Provider credentials cannot be recovered without `/opt/fuze/secrets/config_encryption_key`. Restore the key from a protected backup made before the damage. If no key copy exists, disable the affected providers, remove their encrypted credentials in the settings page and enter new credentials. JWT keys and config encryption keys are intentionally independent.

## Move to a new server

Install the same Fuze version on the destination, copy a verified backup and its checksum over a protected channel, then run installer `--restore`. Update DNS only after the destination reports healthy. MinIO media is not in the standard archive; copy the MinIO volume separately only if retaining cached objects matters.

## Change domains

Stop Caddy, edit only `APP_DOMAIN`, `STORAGE_DOMAIN`, `ACME_EMAIL`, `CORS_ORIGINS` and the browser-facing MinIO endpoint in `.env`, validate both Compose files, then restart. Ensure both DNS records resolve to the server before Caddy requests certificates.

```bash
docker compose -f compose.yaml -f compose.https.yaml config
docker compose -f compose.yaml -f compose.https.yaml up -d
```

## External HTTPS reverse proxy

Use installer mode `external-https` when TLS is terminated by an independently
managed reverse proxy. The proxy container must use `network_mode: host`; a
container on an ordinary bridge network cannot reach host loopback. Fuze keeps
production settings, secure cookies, and public HTTPS URLs, but starts only
`compose.yaml`. Its default upstreams are `127.0.0.1:3000` and
`127.0.0.1:9000`.

Example external Caddy configuration:

```caddyfile
fuze.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}

storage.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:9000
}
```

For a new installation, pass `--mode external-https`, both domains, and
optionally `--bind-address IPv4`. To migrate from built-in HTTPS, first run the
installer update with `--mode external-https`; only after it succeeds should you
start or reload external Caddy. To move back to built-in `https`, stop the
external proxy first so ports 80 and 443 are free.

`0.0.0.0` is accepted as an explicit bind address, but Docker-published ports
must not be considered protected solely by UFW rules. Keep the safe
`127.0.0.1` default unless remote access to the upstream ports is intentional
and protected separately.

Verify the deployment and both local upstreams before testing public DNS/TLS:

```bash
cd /opt/fuze
docker compose ps
ss -ltn | grep -E '127\.0\.0\.1:(3000|9000)'
curl --fail http://127.0.0.1:3000/
curl --fail http://127.0.0.1:9000/minio/health/live
curl --fail https://fuze.example.com/
curl --fail https://storage.example.com/minio/health/live
```

## Off-host backups

Copy each archive together with its `.sha256` file to encrypted off-host storage. Periodically restore one into a clean isolated host. Backups contain database data and every key required to decrypt credentials; restrict access and retention accordingly.

## Uninstall

The installer can remove the entire deployment, including containers, networks,
PostgreSQL and MinIO volumes, secrets, and local backups. Copy anything that
must be retained off the server first.

```bash
curl -fsSL https://github.com/natimys/fuze/releases/latest/download/install.sh |
  sudo bash -s -- --uninstall
```

For unattended automation, add `--non-interactive`. Use `--install-dir PATH`
when Fuze was installed outside `/opt/fuze`.

## Provider diagnostics

Confirm the provider is enabled and credentials show `configured` in `/player/admin-settings`, then use **Test connection**. The response deliberately omits upstream bodies and tokens. `fuze rescue config-show` can confirm presence and decryptability without revealing values. Provider disablement blocks new search/acquire operations within five seconds.

## Manual Compose operations

```bash
docker compose ps
docker compose logs --since 30m backend worker beat
docker compose exec backend fuze rescue doctor --json
docker compose run --rm migrate
docker compose restart worker beat
```

Do not mount `/var/run/docker.sock`, expose PostgreSQL/Redis/MinIO Console publicly, or edit provider ciphertext directly. A manual migration downgrade is unsupported.
