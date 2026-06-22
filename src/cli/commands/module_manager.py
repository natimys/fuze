import re
from pathlib import Path

import typer
import jinja2
from rich.console import Console
from rich.table import Table

from cli.config import BACKEND_MODULES_DIR, TEMPLATE_DIR

app = typer.Typer(help="Manage backend modules")
console = Console()


def _normalize(name: str) -> dict[str, str]:
    return {
        "module_name": name,
        "ModuleName": name.capitalize(),
        "module_name_singular": name,
        "ModuleName_singular": name.capitalize(),
    }


def _module_path(name: str) -> Path:
    return BACKEND_MODULES_DIR / name


def _module_py_path(name: str) -> Path:
    return _module_path(name) / "module.py"


@app.command()
def create(
    module_name: str = typer.Argument(
        ..., help="Module name (e.g. 'posts', 'products')"
    ),
):
    dest = _module_path(module_name)
    if dest.exists():
        console.print(f"[red]Module '{module_name}' already exists[/red]")
        raise typer.Exit(1)

    vars = _normalize(module_name)
    dest.mkdir(parents=True)

    env = jinja2.Environment(loader=jinja2.FileSystemLoader(TEMPLATE_DIR / "backend"))
    template_files = [
        "__init__.py.jinja",
        "models.py.jinja",
        "router.py.jinja",
    ]

    for tpl in template_files:
        try:
            template = env.get_template(tpl)
        except jinja2.TemplateNotFound:
            continue
        out_name = tpl.removesuffix(".jinja")
        content = template.render(**vars)
        (dest / out_name).write_text(content, encoding="utf-8")

    module_py = f"""from core.modules import ModuleDefinition

module = ModuleDefinition(
    active=True,
    name="{vars['module_name']}",
    router_prefix="/{vars['module_name']}",
    router_tags=["{vars['module_name']}"],
)
"""
    (dest / "module.py").write_text(module_py.strip() + "\n")

    console.print(f"[green]Module '{module_name}' created at {dest}[/green]")


@app.command()
def toggle(module_name: str = typer.Argument(..., help="Module name to toggle")):
    module_py = _module_py_path(module_name)
    if not module_py.exists():
        console.print(f"[red]Module '{module_name}' not found[/red]")
        raise typer.Exit(1)

    content = module_py.read_text(encoding="utf-8")

    if "active=True" in content:
        content = content.replace("active=True", "active=False")
        new_active = False
    elif "active=False" in content:
        content = content.replace("active=False", "active=True")
        new_active = True
    else:
        console.print(f"[red]Cannot find 'active' flag in {module_py}[/red]")
        raise typer.Exit(1)

    module_py.write_text(content, encoding="utf-8")
    status = "enabled" if new_active else "disabled"
    console.print(f"[green]Module '{module_name}' is now {status} ({'active=True' if new_active else 'active=False'})[/green]")


@app.command()
def rename(
    current_name: str = typer.Argument(..., help="Current module name"),
    new_name: str = typer.Argument(..., help="New module name"),
):
    old_path = _module_path(current_name)
    new_path = _module_path(new_name)
    if not old_path.exists():
        console.print(f"[red]Module '{current_name}' not found[/red]")
        raise typer.Exit(1)
    if new_path.exists():
        console.print(f"[red]Module '{new_name}' already exists[/red]")
        raise typer.Exit(1)

    old_path.rename(new_path)

    module_py_path = new_path / "module.py"
    if module_py_path.exists():
        content = module_py_path.read_text(encoding="utf-8")
        content = re.sub(
            r'name\s*=\s*"' + re.escape(current_name) + r'"',
            f'name="{new_name}"',
            content,
        )
        content = re.sub(
            r'router_prefix\s*=\s*"/' + re.escape(current_name) + r'"',
            f'router_prefix="/{new_name}"',
            content,
        )
        content = re.sub(
            r'router_tags\s*=\s*\["' + re.escape(current_name) + r'"\]',
            f'router_tags=["{new_name}"]',
            content,
        )
        module_py_path.write_text(content, encoding="utf-8")

    console.print(
        f"[green]Module '{current_name}' renamed to '{new_name}' at {new_path}[/green]"
    )


@app.command()
def list_modules():
    if not BACKEND_MODULES_DIR.exists():
        console.print("[red]No modules directory found[/red]")
        raise typer.Exit(1)

    table = Table("Module", "Active", "Prefix")
    for entry in sorted(BACKEND_MODULES_DIR.iterdir()):
        if not entry.is_dir() or entry.name.startswith("_"):
            continue
        module_py = entry / "module.py"
        if not module_py.exists():
            continue
        content = module_py.read_text(encoding="utf-8")
        is_active = "active=True" in content
        prefix = f"/{entry.name}"
        for line in content.splitlines():
            if "router_prefix" in line:
                prefix = line.split("=", 1)[1].strip().strip("\"',")
                break
        status = "[green]YES[/green]" if is_active else "[red]NO[/red]"
        table.add_row(entry.name, status, prefix)

    console.print(table)
