import importlib
from importlib.util import find_spec

from core.modules import iter_module_names, load_module_definition
from loguru import logger

def bootstrap_models():
    for module_name in iter_module_names():
        module = load_module_definition(module_name)
        if module is None:
            logger.warning(f"🔁 Skipping <{module_name}>. Module definition not found",)
            continue

        if not module.active:
            logger.info(f"🔁 Skipping <{module_name}>. Module is inactive")
            continue

        module_path = f"modules.{module_name}.models"
        if find_spec(module_path):
            importlib.import_module(module_path)
            logger.debug(f"✅ Successfully bootstrapped models for <{module_name}>")
