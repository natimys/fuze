# Supply chain / operations gate

The `supply-chain` workflow is the reproducible release gate for both production
images. Tool versions are fixed in `.github/workflows/supply-chain.yml`.

It performs the following checks:

1. Builds the backend and frontend images from their Dockerfiles.
2. Verifies the image-baked `yt-dlp`, FFmpeg, and Node.js executables.
3. Produces CycloneDX JSON SBOMs for both images and uploads them as one artifact.
4. Uses Grype to reject any Critical vulnerability for which a fix is available.
   Unfixed findings remain visible in the scan output but do not fail this gate.
5. Scans the complete Git history with Gitleaks.
6. Runs an isolated PostgreSQL custom-format dump, restores it into a fresh
   database, and asserts the restored data.

Run the backup/restore check locally from the repository root:

```shell
uv run python deploy/operations/verify_backup_restore.py
```

The test creates containers and a volume with unique `fuze-backup-*` names and
removes them in a `finally` block. It never reads or writes the application
database or the `pg_data` volume.
