from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database.dependencies import get_db
from .service import ConfigService


def get_config_service(db: AsyncSession = Depends(get_db)) -> ConfigService:
    return ConfigService(db)
