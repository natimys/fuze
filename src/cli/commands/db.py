import os  # Добавлен импорт os
import subprocess

import typer
from rich.console import Console

from cli.config import BACKEND_DIR

app = typer.Typer(help="Database migrations")
console = Console()


def _alembic(*args: str) -> int:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(BACKEND_DIR.parent)

    return subprocess.call(
        ["alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
    )


@app.command()
def migrate():
    """Run all unpaid migrations to head."""
    _alembic("upgrade", "head")


@app.command()
def rollback(
        steps: int = typer.Argument(1, help="Number of revisions to roll back"),
):
    """Rollback migrations by a specific number of steps."""
    _alembic("downgrade", "--", f"-{steps}")


@app.command()
def revision(
        message: str = typer.Argument(..., help="Revision message"),
        autogenerate: bool = typer.Option(
            True, "--autogenerate/--blank", help="Auto-detect changes"
        ),
):
    """Create a new migration revision."""
    cmd = ["revision"]
    if autogenerate:
        cmd.append("--autogenerate")
    cmd.extend(["-m", message])
    _alembic(*cmd)
