"""Destructive only to uniquely named disposable Docker resources."""

from __future__ import annotations

import subprocess
import sys
import uuid


POSTGRES_IMAGE = "postgres:18-alpine"
PASSWORD = "backup-restore-test"


def run(*args: str, capture: bool = False) -> str:
    result = subprocess.run(
        args,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
    )
    return result.stdout.strip() if capture else ""


def wait_for_database(container: str) -> None:
    for _ in range(30):
        result = subprocess.run(
            ["docker", "exec", container, "pg_isready", "-U", "postgres"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if result.returncode == 0:
            return
        import time

        time.sleep(1)
    raise RuntimeError(f"PostgreSQL did not become ready: {container}")


def main() -> None:
    suffix = uuid.uuid4().hex[:12]
    source = f"fuze-backup-source-{suffix}"
    restored = f"fuze-backup-restored-{suffix}"
    volume = f"fuze-backup-test-{suffix}"
    containers = (source, restored)
    try:
        run("docker", "volume", "create", volume)
        run(
            "docker",
            "run",
            "--detach",
            "--name",
            source,
            "--env",
            f"POSTGRES_PASSWORD={PASSWORD}",
            "--env",
            "POSTGRES_DB=fuze",
            "--volume",
            f"{volume}:/backup",
            POSTGRES_IMAGE,
        )
        wait_for_database(source)
        run(
            "docker",
            "exec",
            source,
            "psql",
            "-U",
            "postgres",
            "-d",
            "fuze",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            "CREATE TABLE backup_probe(id integer PRIMARY KEY, value text NOT NULL); "
            "INSERT INTO backup_probe VALUES (42, 'fuze-backup-ok');",
        )
        run(
            "docker",
            "exec",
            source,
            "pg_dump",
            "-U",
            "postgres",
            "-d",
            "fuze",
            "--format=custom",
            "--file=/backup/fuze.dump",
        )
        run(
            "docker",
            "run",
            "--detach",
            "--name",
            restored,
            "--env",
            f"POSTGRES_PASSWORD={PASSWORD}",
            "--env",
            "POSTGRES_DB=fuze_restored",
            "--volume",
            f"{volume}:/backup:ro",
            POSTGRES_IMAGE,
        )
        wait_for_database(restored)
        run(
            "docker",
            "exec",
            restored,
            "pg_restore",
            "-U",
            "postgres",
            "-d",
            "fuze_restored",
            "--exit-on-error",
            "/backup/fuze.dump",
        )
        value = run(
            "docker",
            "exec",
            restored,
            "psql",
            "-U",
            "postgres",
            "-d",
            "fuze_restored",
            "--tuples-only",
            "--no-align",
            "-c",
            "SELECT value FROM backup_probe WHERE id = 42;",
            capture=True,
        )
        if value != "fuze-backup-ok":
            raise RuntimeError(f"Restored probe mismatch: {value!r}")
        print("Backup/restore verification passed")
    finally:
        for container in containers:
            subprocess.run(
                ["docker", "rm", "--force", container],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        subprocess.run(
            ["docker", "volume", "rm", volume],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


if __name__ == "__main__":
    try:
        main()
    except (OSError, subprocess.CalledProcessError, RuntimeError) as exc:
        print(f"Backup/restore verification failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
