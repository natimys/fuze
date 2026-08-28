import asyncio
import json
import hashlib
import secrets
import socket
import sys
import tomllib
from getpass import getpass
from pathlib import Path
from typing import Any
from uuid import uuid4

import typer
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import create_engine, text
from alembic.config import Config
from alembic.script import ScriptDirectory
from redis import Redis

from core.instance_config import FuzeConfig
from core.settings import get_settings
from modules.admin.service import ConfigCipher, SECRET_NAMES

app = typer.Typer(help="Recover and diagnose an installed Fuze instance.")
_email = TypeAdapter(EmailStr)


class Output:
    def __init__(self, json_mode: bool = False):
        self.json_mode = json_mode

    def emit(self, data: dict[str, Any], message: str) -> None:
        typer.echo(json.dumps(data, ensure_ascii=True, default=str) if self.json_mode else message)

    def fail(self, code: str, message: str, exit_code: int = 1) -> None:
        self.emit({"status": "error", "code": code, "message": message}, f"Error: {message}")
        raise typer.Exit(exit_code)


def _engine():
    settings = get_settings()
    return create_engine(settings.ALEMBIC_DATABASE_URL, pool_pre_ping=True, connect_args={"connect_timeout": 5})


def _migration_head() -> str:
    config = Config(str(Path(get_settings().model_config["env_file"]).parent / "src" / "backend" / "alembic.ini"))
    if not Path(config.config_file_name or "").is_file():
        config = Config("alembic.ini")
    return ScriptDirectory.from_config(config).get_current_head()


def _password(stdin: bool) -> str:
    if stdin:
        value = sys.stdin.readline().rstrip("\r\n")
    else:
        value = getpass("Password: ")
        if value != getpass("Confirm password: "):
            raise ValueError("Passwords do not match")
    if not 8 <= len(value) <= 128:
        raise ValueError("Password must contain between 8 and 128 characters")
    return value


def _hash_password(value: str) -> str:
    from core.security import hash_password

    return hash_password(value)


def _new_access_key() -> tuple[str, str]:
    secret = f"fuze_{secrets.token_urlsafe(32)}"
    return secret, hashlib.sha256(secret.encode("utf-8")).hexdigest()


@app.command("provider-key")
def provider_key(
    provider: str = typer.Argument(..., help="Provider to authorize (currently: yandex)"),
):
    """Authorize a provider and print a key for manual entry in admin settings."""
    if provider.lower() != "yandex":
        typer.echo(f"Error: unsupported provider: {provider}", err=True)
        raise typer.Exit(2)

    from yandex_music import ClientAsync

    typer.echo("Yandex Music device authorization")
    typer.echo("This command only generates a key; it does not save or apply it.")

    def show_code(code) -> None:
        typer.echo(f"Open: {code.verification_url}")
        typer.echo(f"Enter code: {code.user_code}")
        typer.echo("Waiting for authorization...")

    try:
        result = asyncio.run(ClientAsync().device_auth(on_code=show_code))
    except Exception as exc:
        typer.echo(f"Error: Yandex authorization failed ({type(exc).__name__})", err=True)
        raise typer.Exit(4) from exc

    key = getattr(result, "access_token", result)
    if not isinstance(key, str) or not key:
        typer.echo("Error: Yandex authorization returned no provider key", err=True)
        raise typer.Exit(4)

    typer.echo("Authorization successful.")
    typer.echo("Copy this key and paste it into Admin settings -> yandex token:")
    typer.echo(key)
    typer.echo("The key was not saved or applied automatically.")


@app.command("bootstrap-admin")
def bootstrap_admin(
    email: str | None = typer.Option(None, "--email"),
    name: str | None = typer.Option(None, "--name"),
    password_stdin: bool = typer.Option(False, "--password-stdin"),
    json_mode: bool = typer.Option(False, "--json"),
    no_color: bool = typer.Option(False, "--no-color"),
):
    """Create the first administrator under a PostgreSQL advisory lock."""
    out = Output(json_mode)
    try:
        normalized_email = str(_email.validate_python(email or typer.prompt("Email"))).lower()
        display_name = (name or typer.prompt("Display name")).strip()
        if not display_name or len(display_name) > 100:
            raise ValueError("Display name must contain between 1 and 100 characters")
        password = _password(password_stdin)
    except (ValidationError, ValueError) as exc:
        out.fail("invalid_input", str(exc), 2)
    engine = _engine()
    try:
        with engine.begin() as connection:
            connection.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": 0x46555A45})
            count = connection.scalar(text("SELECT count(*) FROM users WHERE role = 'ADMIN' AND is_active"))
            if count:
                out.fail("admin_exists", "An active administrator already exists", 3)
            user_id = connection.scalar(
                text("INSERT INTO users (email, name, password, role, is_active) VALUES (:email, :name, :password, 'ADMIN', true) RETURNING id"),
                {"email": normalized_email, "name": display_name, "password": _hash_password(password)},
            )
        out.emit({"status": "ok", "user_id": user_id, "email": normalized_email}, f"Administrator {normalized_email} created")
    finally:
        engine.dispose()


@app.command("reset-admin-password")
def reset_admin_password(
    email: str,
    password_stdin: bool = typer.Option(False, "--password-stdin"),
    json_mode: bool = typer.Option(False, "--json"),
    no_color: bool = typer.Option(False, "--no-color"),
):
    out = Output(json_mode)
    try:
        normalized_email = str(_email.validate_python(email)).lower()
        password = _password(password_stdin)
    except (ValidationError, ValueError) as exc:
        out.fail("invalid_input", str(exc), 2)
    engine = _engine()
    try:
        with engine.begin() as connection:
            user_id = connection.scalar(text("UPDATE users SET password=:password WHERE email=:email AND role='ADMIN' AND is_active RETURNING id"), {"email": normalized_email, "password": _hash_password(password)})
            if user_id is None:
                out.fail("admin_not_found", "Active administrator not found", 3)
            connection.execute(text("UPDATE auth_sessions SET revoked_at=now() WHERE user_id=:user_id AND revoked_at IS NULL"), {"user_id": user_id})
        out.emit({"status": "ok", "sessions_revoked": True}, "Password reset and active sessions revoked")
    finally:
        engine.dispose()


@app.command("reset-access-key")
def reset_access_key(
    user_id: int = typer.Argument(..., min=1, help="User ID"),
    label: str = typer.Option("recovery", help="Replacement key label"),
    yes: bool = typer.Option(False, "--yes", help="Skip confirmation"),
    json_mode: bool = typer.Option(False, "--json"),
    no_color: bool = typer.Option(False, "--no-color"),
):
    """Revoke a user's keys and sessions, then issue a replacement key."""
    out = Output(json_mode)
    label = label.strip()
    if not label or len(label) > 100:
        out.fail("invalid_input", "Label must contain between 1 and 100 characters", 2)
    if not yes and not typer.confirm(
        f"Revoke all access keys and active sessions for user {user_id}?"
    ):
        out.fail("cancelled", "Access key recovery cancelled", 2)
    secret, key_hash = _new_access_key()
    key_id = uuid4()
    engine = _engine()
    try:
        with engine.begin() as connection:
            user = connection.execute(
                text("SELECT id, is_active FROM users WHERE id=:user_id FOR UPDATE"),
                {"user_id": user_id},
            ).mappings().one_or_none()
            if user is None:
                out.fail("user_not_found", "User not found", 3)
            if not user["is_active"]:
                out.fail("user_inactive", "User is inactive", 3)
            connection.execute(
                text("UPDATE access_keys SET revoked_at=now() WHERE user_id=:user_id AND revoked_at IS NULL"),
                {"user_id": user_id},
            )
            connection.execute(
                text("UPDATE auth_sessions SET revoked_at=now() WHERE user_id=:user_id AND revoked_at IS NULL"),
                {"user_id": user_id},
            )
            connection.execute(
                text("INSERT INTO access_keys (id, user_id, label, key_hash) VALUES (:id, :user_id, :label, :key_hash)"),
                {"id": key_id, "user_id": user_id, "label": label, "key_hash": key_hash},
            )
        out.emit(
            {"status": "ok", "user_id": user_id, "key_id": key_id, "access_key": secret, "sessions_revoked": True},
            f"Access key reset for user {user_id}; all previous keys and sessions were revoked.\nStore this key now; it will not be shown again:\n{secret}",
        )
    finally:
        engine.dispose()


@app.command("promote-user")
def promote_user(
    email: str,
    yes: bool = typer.Option(False, "--yes"),
    json_mode: bool = typer.Option(False, "--json"),
    no_color: bool = typer.Option(False, "--no-color"),
):
    out = Output(json_mode)
    if not yes and not typer.confirm(f"Promote {email} to administrator?"):
        out.fail("cancelled", "Promotion cancelled", 2)
    engine = _engine()
    try:
        with engine.begin() as connection:
            user_id = connection.scalar(text("UPDATE users SET role='ADMIN' WHERE lower(email)=lower(:email) AND is_active RETURNING id"), {"email": email})
            if user_id is None:
                out.fail("user_not_found", "Active user not found", 3)
        out.emit({"status": "ok", "user_id": user_id}, f"{email} promoted to administrator")
    finally:
        engine.dispose()


@app.command("db-status")
def db_status(json_mode: bool = typer.Option(False, "--json"), no_color: bool = typer.Option(False, "--no-color")):
    out = Output(json_mode)
    engine = _engine()
    try:
        with engine.connect() as connection:
            current = connection.scalar(text("SELECT version_num FROM alembic_version LIMIT 1"))
        head = _migration_head()
        status_value = "ok" if current == head else "drift"
        out.emit({"status": status_value, "current_revision": current, "head_revision": head, "drift": current != head}, f"Database reachable; current={current}; head={head}; drift={current != head}")
        if current != head:
            raise typer.Exit(5)
    except Exception as exc:
        out.fail("database_unavailable", f"Database check failed ({type(exc).__name__})", 4)
    finally:
        engine.dispose()


@app.command("config-show")
def config_show(json_mode: bool = typer.Option(False, "--json"), no_color: bool = typer.Option(False, "--no-color")):
    out = Output(json_mode)
    settings = get_settings()
    engine = _engine()
    try:
        with engine.connect() as connection:
            row = connection.execute(text("SELECT version, settings FROM instance_settings WHERE id=1")).mappings().one()
            names = set(connection.scalars(text("SELECT name FROM instance_secrets")))
        data = {"status": "ok", "config_version": row["version"], "settings": row["settings"], "credentials": {name: {"configured": name in names} for name in SECRET_NAMES}, "infrastructure": {"environment": settings.ENVIRONMENT, "database": {"host": settings.DB_HOST, "port": settings.DB_PORT, "name": settings.DB_NAME, "password": "[REDACTED]"}, "redis": "[REDACTED]", "minio": {"endpoint": settings.MINIO_ENDPOINT, "credentials": "[REDACTED]"}}}
        out.emit(data, json.dumps(data, ensure_ascii=True, indent=2, default=str))
    except Exception as exc:
        out.fail("config_unavailable", f"Configuration cannot be read ({type(exc).__name__})", 4)
    finally:
        engine.dispose()


@app.command("doctor")
def doctor(json_mode: bool = typer.Option(False, "--json"), no_color: bool = typer.Option(False, "--no-color")):
    out = Output(json_mode)
    checks: dict[str, str] = {}
    engine = _engine()
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            checks["database"] = "ok"
            secrets = connection.execute(text("SELECT ciphertext FROM instance_secrets")).scalars().all()
            cipher = ConfigCipher()
            for ciphertext in secrets:
                cipher.decrypt(ciphertext)
            checks["config"] = "ok"
    except Exception:
        checks.setdefault("database", "unavailable")
        checks.setdefault("config", "unavailable")
    finally:
        engine.dispose()
    settings = get_settings()
    try:
        Redis.from_url(settings.REDIS_URL, socket_connect_timeout=2, socket_timeout=2).ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "unavailable"
    try:
        endpoint = settings.MINIO_ENDPOINT.removeprefix("http://").removeprefix("https://")
        host, _, port = endpoint.partition(":")
        with socket.create_connection((host, int(port or 9000)), timeout=2):
            checks["minio"] = "ok"
    except Exception:
        checks["minio"] = "unavailable"
    try:
        from worker.celery_app import celery_app

        replies = celery_app.control.inspect(timeout=2).ping() or {}
        checks["worker"] = "ok" if replies else "unavailable"
    except Exception:
        checks["worker"] = "unavailable"
    status_value = "healthy" if all(value == "ok" for value in checks.values()) else ("unavailable" if checks.get("database") != "ok" else "degraded")
    out.emit({"status": status_value, "checks": checks}, f"Fuze doctor: {status_value}; " + ", ".join(f"{k}={v}" for k, v in checks.items()))
    if status_value != "healthy":
        raise typer.Exit(4 if status_value == "unavailable" else 5)


def _read_env(path: Path | None) -> dict[str, str]:
    if path is None:
        return {}
    result: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            result[key.strip()] = value.strip().strip("\"'")
    return result


@app.command("import-legacy-config")
def import_legacy_config(
    toml_path: Path = typer.Argument(..., exists=True, readable=True),
    env_file: Path | None = typer.Option(None, "--env-file", exists=True, readable=True),
    replace: bool = typer.Option(False, "--replace"),
    yes: bool = typer.Option(False, "--yes"),
    json_mode: bool = typer.Option(False, "--json"),
    no_color: bool = typer.Option(False, "--no-color"),
):
    out = Output(json_mode)
    if replace and not yes and not typer.confirm("Replace current application configuration?"):
        out.fail("cancelled", "Import cancelled", 2)
    try:
        config = FuzeConfig.model_validate(tomllib.loads(toml_path.read_text(encoding="utf-8")))
        legacy_env = _read_env(env_file)
    except (OSError, tomllib.TOMLDecodeError, ValidationError) as exc:
        out.fail("invalid_legacy_config", str(exc), 2)
    credentials = {"yandex_token": legacy_env.get("YANDEX_ACCESS_TOKEN"), "spotify_client_id": legacy_env.get("SPOTIFY_CLIENT_ID"), "spotify_client_secret": legacy_env.get("SPOTIFY_CLIENT_SECRET")}
    engine = _engine()
    cipher = ConfigCipher()
    try:
        with engine.begin() as connection:
            current_version = connection.scalar(text("SELECT version FROM instance_settings WHERE id=1"))
            audit_count = connection.scalar(text("SELECT count(*) FROM instance_settings_audit"))
            if audit_count and not replace:
                out.fail("already_configured", "Configuration was already imported or edited; use --replace", 3)
            next_version = int(current_version) + 1
            connection.execute(text("UPDATE instance_settings SET version=:version, settings=CAST(:settings AS jsonb), updated_at=now() WHERE id=1"), {"version": next_version, "settings": json.dumps(config.model_dump(mode="json"))})
            imported: list[str] = []
            for name, value in credentials.items():
                if value:
                    connection.execute(text("INSERT INTO instance_secrets (name, ciphertext) VALUES (:name, :ciphertext) ON CONFLICT (name) DO UPDATE SET ciphertext=excluded.ciphertext, updated_at=now()"), {"name": name, "ciphertext": cipher.encrypt(value)})
                    imported.append(name)
            connection.execute(text("INSERT INTO instance_settings_audit (config_version, diff) VALUES (:version, CAST(:diff AS jsonb))"), {"version": next_version, "diff": json.dumps({"legacy_import": True, **{name: "credential_added" for name in imported}})})
        out.emit({"status": "ok", "config_version": next_version, "credentials_imported": imported}, "Legacy configuration imported; credentials: " + (", ".join(imported) or "none"))
    finally:
        engine.dispose()
