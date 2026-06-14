from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker


def create_engine_and_sessionmaker(url: str, echo: bool = False):
    engine = create_async_engine(
        url,
        echo=echo,
        pool_size=20,
        max_overflow=10,
        pool_pre_ping=True,
    )
    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    return engine, session_maker
