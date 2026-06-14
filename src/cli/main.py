import typer

from cli.commands.module_manager import app as module_app
from cli.commands.docker import app as docker_app
from cli.commands.env import app as env_app
from cli.commands.db import app as db_app
from rich.panel import Panel
from rich import print, box
from rich.table import Table

app = typer.Typer(help="Fullstack Template CLI", no_args_is_help=True)
app.add_typer(module_app, name="module", no_args_is_help=True)
app.add_typer(docker_app, name="docker", no_args_is_help=True)
app.add_typer(env_app, name="env", no_args_is_help=True)
app.add_typer(db_app, name="db", no_args_is_help=True)

@app.command()
def debug():
    text = (
        f"[bold cyan]Local:[/bold cyan]         http://localhost:8000/ \n"
        f"[bold cyan]OpenAPI Docs:[/bold cyan]  http://localhost:8000/docs/"
    )
    panel = Panel(
        text,
        title="Development",
        title_align="left",
        border_style="green",
    )
    print(panel)


if __name__ == "__main__":
    app()
