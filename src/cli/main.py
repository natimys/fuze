import typer

from cli.commands.rescue import app as rescue_app

app = typer.Typer(name="fuze", help="Fuze container rescue utilities.", no_args_is_help=True, pretty_exceptions_enable=False)
app.add_typer(rescue_app, name="rescue", no_args_is_help=True)

if __name__ == "__main__":
    app()
