from fastapi import Request


async def get_db(request: Request):
    session_maker = request.app.state.session_maker
    async with session_maker() as session:
        yield session
