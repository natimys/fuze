import importlib
import pkgutil
from dataclasses import dataclass

from fastapi import APIRouter, FastAPI
from loguru import logger

import modules


@dataclass(slots=True, frozen=True)
class ModuleDefinition:
    name: str
    active: bool = True

    router_prefix: str | None = None
    router_tags: list[str] | None = None


def iter_module_names():
    for _, module_name, ispkg in pkgutil.iter_modules(modules.__path__):
        if ispkg:
            yield module_name


def load_module_definition(module_name: str) -> ModuleDefinition | None:
    try:
        module_package = importlib.import_module(f"modules.{module_name}.module")
        module = getattr(module_package, "module", None)
        if isinstance(module, ModuleDefinition):
            return module
    except ModuleNotFoundError as e:
        logger.error(e)
        return None


def load_router(module_name: str) -> APIRouter | None:
    try:
        router_module = importlib.import_module(f"modules.{module_name}.router")
        return getattr(router_module, "router", None)
    except ModuleNotFoundError:
        return None


def register_modules(app: FastAPI):
    """
    Регистрация модулей из ./modules
    :param app: FastAPI
    :return: None
    """
    for module_name in iter_module_names():
        module = load_module_definition(module_name)

        if module is None:
            logger.warning(f"❌ <{module_name}> metadata not found")
            continue

        if not module.active:
            logger.warning(f"⛔ <{module_name}> is inactive")
            continue

        router = load_router(module_name)

        if router is None:
            logger.warning(f"⚠️ <{module_name}> router not found")
            continue

        app.include_router(router)
        logger.info(f"✅ Module <{module_name}> router loaded successfully")
