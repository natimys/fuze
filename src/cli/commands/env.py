import asyncio

import typer
from rich.console import Console
from rich.panel import Panel
from rich.text import Text

from cli.config import ROOT

app = typer.Typer(help="Manage project environment")
setup_app = typer.Typer(help="Setup integrations with third-party services")
console = Console()


@app.command()
def init(
    env: bool = typer.Option(True, help="Create .env from .env.example if missing"),
    docker_compose: bool = typer.Option(True, help="Create docker-compose.yml from docker-compose.yml.example if missing")
):
    if env:
        env_file = ROOT / ".env"
        env_example = ROOT / ".env.example"
        if not env_file.exists() and env_example.exists():
            env_file.write_text(env_example.read_text(encoding="utf-8"), encoding="utf-8")
            console.print("[green].env created from .env.example[/green]")
        else:
            console.print("[yellow].env already exists or .env.example missing[/yellow]")
    if docker_compose:
        docker_compose_file = ROOT / "docker-compose.yml"
        docker_compose_example = ROOT / "docker-compose.yml.example"
        if not docker_compose_file.exists() and docker_compose_example.exists():
            docker_compose_file.write_text(docker_compose_example.read_text(encoding="utf-8"), encoding="utf-8")
            console.print("[green]docker-compose.yml created from docker-compose.yml.example[/green]")
        else:
            console.print("[yellow]docker-compose.yml already exists or docker-compose.yml.example missing[/yellow]")

@setup_app.command()
def yandex():
    from yandex_music import ClientAsync

    console.print()
    console.print(
        Panel(
            "[bold]Yandex Music — Device Authorization[/bold]\n\n"
            "A device code will be displayed below.\n"
            "Follow the link and enter the code to obtain an access token.",
            border_style="blue",
        )
    )
    console.print()

    def on_code(code):
        text = Text()
        text.append("  1. Open ", style="dim")
        text.append(code.verification_url, style="bold cyan underline")
        text.append("\n")
        text.append("  2. Enter code: ", style="dim")
        text.append(code.user_code, style="bold yellow")
        console.print(Panel(text, title="Confirmation", border_style="yellow"))

    client = ClientAsync()
    token = asyncio.run(client.device_auth(on_code=on_code))

    console.print()
    console.print(
        Panel(
            "[bold green]Authorization successful![/bold green]\n\n"
            "Add the token to your [bold].env[/bold] file:\n\n"
            f"  [cyan]YANDEX_ACCESS_TOKEN={token}[/cyan]\n\n"
            "[dim]If .env doesn't exist yet, run:[/dim]\n"
            "  [dim]project env init[/dim]",
            title="Token received",
            border_style="green",
        )
    )


app.add_typer(setup_app, name="setup", no_args_is_help=True)