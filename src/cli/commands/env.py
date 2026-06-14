import typer
from rich.console import Console

from cli.config import ROOT

app = typer.Typer(help="Manage project environment")
console = Console()

@app.command()
def init(
    env: bool = typer.Option(True, help="Create .env from .env.example if missing"),
):
    if env:
        env_file = ROOT / ".env"
        env_example = ROOT / ".env.example"
        if not env_file.exists() and env_example.exists():
            env_file.write_text(env_example.read_text(encoding="utf-8"), encoding="utf-8")
            console.print("[green].env created from .env.example[/green]")
        else:
            console.print("[yellow].env already exists or .env.example missing[/yellow]")