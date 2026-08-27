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


def load_module_definition(module_name: str) -> ModuleDefinition:
    try:
        module_package = importlib.import_module(f"modules.{module_name}.module")
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            f"Module <{module_name}> metadata cannot be imported"
        ) from exc
    module = getattr(module_package, "module", None)
    if not isinstance(module, ModuleDefinition):
        raise RuntimeError(f"Module <{module_name}> has invalid metadata")
    return module


def load_router(module_name: str) -> APIRouter:
    try:
        router_module = importlib.import_module(f"modules.{module_name}.router")
    except ModuleNotFoundError as exc:
        raise RuntimeError(f"Module <{module_name}> router cannot be imported") from exc
    router = getattr(router_module, "router", None)
    if not isinstance(router, APIRouter):
        raise RuntimeError(f"Module <{module_name}> has invalid router")
    return router


def register_modules(app: FastAPI, *, prefix: str = "") -> None:
    """
    Регистрация модулей из ./modules
    :param app: FastAPI
    :return: None
    """
    for module_name in iter_module_names():
        module = load_module_definition(module_name)

        if not module.active:
            logger.warning(f"⛔ <{module_name}> is inactive")
            continue

        router = load_router(module_name)

        app.include_router(router, prefix=prefix)
        logger.info(f"✅ Module <{module_name}> router loaded successfully")
