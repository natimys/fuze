import os
import sys

import typer
from argon2 import PasswordHasher
from rich.console import Console
from rich.prompt import Prompt
from sqlalchemy import create_engine, text

app = typer.Typer(help="Manage project users")
console = Console()
_ph = PasswordHasher()


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
