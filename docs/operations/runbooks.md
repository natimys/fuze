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

## Off-host backups

Copy each archive together with its `.sha256` file to encrypted off-host storage. Periodically restore one into a clean isolated host. Backups contain database data and every key required to decrypt credentials; restrict access and retention accordingly.

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
