import subprocess
from io import StringIO

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from cli.commands.db import app as db_app
from cli.commands.docker import app as docker_app
from cli.commands.env import app as env_app
from cli.commands.module_manager import app as module_app
from cli.commands.users import app as users_app
from cli.config import BACKEND_MODULES_DIR, ROOT

app = typer.Typer(help="Fullstack Template CLI", no_args_is_help=True)
console = Console()


def _read_pyproject() -> dict[str, str]:
    pyproject = ROOT / "pyproject.toml"
    if not pyproject.exists():
        return {}
    result: dict[str, str] = {}
    for line in pyproject.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("name") and "=" in line:
            result["name"] = line.split("=", 1)[1].strip().strip('"')
        elif line.startswith("version") and "=" in line:
            result["version"] = line.split("=", 1)[1].strip().strip('"')
        elif line.startswith("description") and "=" in line:
            result["description"] = line.split("=", 1)[1].strip().strip('"')
    return result


def _get_container_status() -> dict[str, str]:
    result = subprocess.run(
        ["docker", "compose", "ps", "--format", "{{.Name}} {{.State}}"],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    status: dict[str, str] = {}
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            status[parts[0]] = parts[1]
    return status


def _get_modules() -> list[tuple[str, bool]]:
    if not BACKEND_MODULES_DIR.exists():
        return []
    modules = []
    for entry in sorted(BACKEND_MODULES_DIR.iterdir()):
        if not entry.is_dir() or entry.name.startswith("_"):
            continue
        module_py = entry / "module.py"
        if not module_py.exists():
            continue
        content = module_py.read_text(encoding="utf-8")
        modules.append((entry.name, "active=True" in content))
    return modules


@app.command()
def info(verbose: bool = typer.Option(False, "--verbose", "-v", help="Show inactive modules too")):
    pyproject = _read_pyproject()
    if pyproject:
        proj = Text()
        proj.append("Name: ", style="bold")
        proj.append(pyproject.get("name", "") + "\n")
        proj.append("Version: ", style="bold")
        proj.append(pyproject.get("version", "") + "\n")
        proj.append("Description: ", style="bold")
        proj.append(pyproject.get("description", ""))
        console.print(Panel(proj, title="Project", title_align="left", border_style="dim"))
        console.print()

    containers = _get_container_status()
    backend_running = any(
        s == "running" for name, s in containers.items() if "backend" in name
    )

    content = Text()
    if backend_running:
        content.append("Local:         http://localhost:8000/\n", style="cyan")
        content.append("OpenAPI Docs:  http://localhost:8000/docs/", style="cyan")
    else:
        content.append("Endpoints unavailable (backend is not running)", style="dim")

    ctable = Table(title="Containers", show_header=True, header_style="bold", pad_edge=False)
    ctable.add_column("Service", style="cyan", no_wrap=True)
    ctable.add_column("State")
    if containers:
        for name, state in sorted(containers.items()):
            style = "green" if state == "running" else "red"
            ctable.add_row(name, f"[{style}]{state}[/{style}]")
    else:
        ctable.add_row("[dim]No containers found[/dim]", "")

    all_modules = _get_modules()
    show = all_modules if verbose else [(n, a) for n, a in all_modules if a]
    mtitle = "Modules" if verbose else "Active Modules"
    mtable = Table(title=mtitle, show_header=True, header_style="bold", pad_edge=False)
    mtable.add_column("Module", style="cyan", no_wrap=True)
    mtable.add_column("State")
    if show:
        for name, active in show:
            style = "green" if active else "red"
            state = "active" if active else "inactive"
            mtable.add_row(name, f"[{style}]{state}[/{style}]")
    else:
        mtable.add_row("[dim]No modules found[/dim]", "")

    buf = StringIO()
    inner = Console(file=buf, width=console.width)
    inner.print(content)
    inner.print()
    inner.print(ctable)
    inner.print()
    inner.print(mtable)

    console.print(Panel(buf.getvalue(), title="Debug", title_align="left", border_style="green"))


app.add_typer(module_app, name="module", no_args_is_help=True)
app.add_typer(docker_app, name="docker", no_args_is_help=True)
app.add_typer(env_app, name="env", no_args_is_help=True)
app.add_typer(db_app, name="db", no_args_is_help=True)
app.add_typer(users_app, name="users", no_args_is_help=True)

if __name__ == "__main__":
    app()
