import os
import hashlib
import secrets
import sys
from uuid import UUID, uuid4

import typer
from argon2 import PasswordHasher
from rich.console import Console
from rich.prompt import Prompt
from rich.table import Table
from sqlalchemy import create_engine, text

app = typer.Typer(help="Manage project users")
console = Console()
_ph = PasswordHasher()


def _new_access_key() -> tuple[str, str]:
    secret = f"fuze_{secrets.token_urlsafe(32)}"
    return secret, hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _load_env() -> dict[str, str]:
    from cli.config import ROOT

    env_path = ROOT / ".env"
    env: dict[str, str] = {}
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip().strip("\"'")
    return env


def _get_db_url(host_override: str | None = None) -> str:
    env = _load_env()
    user = env.get("DB_USER", "postgres")
    password = env.get("DB_PASSWORD", "postgres")
    host = host_override or "localhost"
    port = env.get("DB_PORT", "5432")
    name = env.get("DB_NAME", "database")
    return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{name}"


def _get_password(prompt: str = "Password: ") -> str:
    print(prompt, end="", flush=True)

    if os.name == "nt":
        import msvcrt

        password = []
        while True:
            ch = msvcrt.getwch()
            if ch in ("\r", "\n"):
                print()
                break
            elif ch == "\b":
                if password:
                    password.pop()
                    print("\b \b", end="", flush=True)
            elif ch == "\x03":
                raise KeyboardInterrupt
            else:
                password.append(ch)
                print("*", end="", flush=True)
        return "".join(password)
    else:
        import termios
        import tty

        fd = sys.stdin.fileno()
        old_settings = termios.tcgetattr(fd)
        try:
            tty.setraw(fd)
            password = []
            while True:
                ch = sys.stdin.read(1)
                if ch in ("\r", "\n"):
                    print()
                    break
                elif ch == "\x7f":
                    if password:
                        password.pop()
                        sys.stdout.write("\b \b")
                        sys.stdout.flush()
                elif ch == "\x03":
                    raise KeyboardInterrupt
                else:
                    password.append(ch)
                    sys.stdout.write("*")
                    sys.stdout.flush()
            return "".join(password)
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)


@app.command()
def create(
    email: str = typer.Argument(..., help="User email"),
    role: str = typer.Option("user", help="User role (admin/user)"),
    host: str | None = typer.Option(None, "--host", help="Database host override"),
):
    """Create a new user."""
    if role not in ("admin", "user"):
        console.print("[red]Role must be 'admin' or 'user'[/red]")
        raise typer.Exit(1)

    name = Prompt.ask("Display name")
    password = _get_password("Password: ")
    password_confirm = _get_password("Confirm password: ")

    if password != password_confirm:
        console.print("[red]Passwords do not match[/red]")
        raise typer.Exit(1)

    if len(password) < 6:
        console.print("[red]Password must be at least 6 characters[/red]")
        raise typer.Exit(1)

    url = _get_db_url(host_override=host)
    engine = create_engine(url)

    with engine.connect() as conn:
        existing = conn.execute(
            text("SELECT id FROM users WHERE email = :email"), {"email": email}
        ).fetchone()
        if existing:
            console.print(f"[red]User with email '{email}' already exists[/red]")
            raise typer.Exit(1)

        hashed = _ph.hash(password)
        conn.execute(
            text(
                "INSERT INTO users (email, name, password, role, is_active) "
                "VALUES (:email, :name, :password, :role, true)"
            ),
            {"email": email, "name": name, "password": hashed, "role": role.upper()},
        )
        conn.commit()

    engine.dispose()
    console.print(f"[green]User '{email}' created with role '{role}'[/green]")


@app.command("create-key-user")
def create_key_user(
    name: str = typer.Argument(..., help="Display name"),
    label: str = typer.Option("initial", help="Access key label"),
    role: str = typer.Option("user", help="User role (admin/user)"),
    host: str | None = typer.Option(None, "--host", help="Database host override"),
):
    """Create a key-only user and print the first key once."""
    if role not in ("admin", "user"):
        raise typer.BadParameter("Role must be 'admin' or 'user'")
    secret, key_hash = _new_access_key()
    engine = create_engine(_get_db_url(host_override=host))
    with engine.begin() as conn:
        user_id = conn.execute(
            text(
                "INSERT INTO users (email, name, password, role, is_active) "
                "VALUES (NULL, :name, NULL, :role, true) RETURNING id"
            ),
            {"name": name.strip(), "role": role.upper()},
        ).scalar_one()
        key_id = uuid4()
        conn.execute(
            text(
                "INSERT INTO access_keys (id, user_id, label, key_hash) "
                "VALUES (:id, :user_id, :label, :key_hash)"
            ),
            {"id": key_id, "user_id": user_id, "label": label.strip(), "key_hash": key_hash},
        )
    engine.dispose()
    console.print(f"[green]Key-only user {user_id} created; key id {key_id}[/green]")
    console.print("[bold yellow]Store this key now; it will not be shown again:[/bold yellow]")
    console.print(secret)


@app.command("issue-key")
def issue_key(
    user_id: int = typer.Argument(..., help="User ID"),
    label: str = typer.Option(..., help="Access key label"),
    host: str | None = typer.Option(None, "--host", help="Database host override"),
):
    """Issue an additional access key and print it once."""
    secret, key_hash = _new_access_key()
    key_id = uuid4()
    engine = create_engine(_get_db_url(host_override=host))
    with engine.begin() as conn:
        if conn.execute(text("SELECT id FROM users WHERE id = :id"), {"id": user_id}).first() is None:
            raise typer.BadParameter(f"User {user_id} does not exist")
        conn.execute(
            text("INSERT INTO access_keys (id, user_id, label, key_hash) VALUES (:id, :user_id, :label, :key_hash)"),
            {"id": key_id, "user_id": user_id, "label": label.strip(), "key_hash": key_hash},
        )
    engine.dispose()
    console.print(f"[green]Access key {key_id} issued[/green]")
    console.print("[bold yellow]Store this key now; it will not be shown again:[/bold yellow]")
    console.print(secret)


@app.command("list-keys")
def list_keys(
    user_id: int = typer.Argument(..., help="User ID"),
    host: str | None = typer.Option(None, "--host", help="Database host override"),
):
    """List access-key metadata without secrets."""
    engine = create_engine(_get_db_url(host_override=host))
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, label, created_at, last_used_at, revoked_at FROM access_keys WHERE user_id = :user_id ORDER BY created_at"),
            {"user_id": user_id},
        ).mappings().all()
    engine.dispose()
    table = Table("ID", "Label", "Created", "Last used", "Revoked")
    for row in rows:
        table.add_row(*(str(row[name] or "-") for name in ("id", "label", "created_at", "last_used_at", "revoked_at")))
    console.print(table)


@app.command("revoke-key")
def revoke_key(
    key_id: UUID = typer.Argument(..., help="Access key ID"),
    host: str | None = typer.Option(None, "--host", help="Database host override"),
):
    """Revoke a key and all sessions created with it atomically."""
    engine = create_engine(_get_db_url(host_override=host))
    with engine.begin() as conn:
        changed = conn.execute(
            text("UPDATE access_keys SET revoked_at = now() WHERE id = :id AND revoked_at IS NULL RETURNING id"),
            {"id": key_id},
        ).first()
        if changed is None:
            raise typer.BadParameter("Active access key not found")
        conn.execute(
            text("UPDATE auth_sessions SET revoked_at = now() WHERE access_key_id = :id AND revoked_at IS NULL"),
            {"id": key_id},
        )
    engine.dispose()
    console.print(f"[green]Access key {key_id} and its sessions revoked[/green]")
