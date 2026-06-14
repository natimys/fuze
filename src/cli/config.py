from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
CLI_DIR = ROOT / "src" / "cli"
BACKEND_MODULES_DIR = ROOT / "src" / "backend" / "modules"
TEMPLATE_DIR = ROOT / "src" / "cli" / "templates"
COMPOSE_FILE = ROOT / "docker-compose.yml"
BACKEND_DIR = ROOT / "src" / "backend"
