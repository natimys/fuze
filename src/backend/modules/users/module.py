from core.modules import ModuleDefinition

module = ModuleDefinition(
    active=True,
    name="users",
    router_prefix="/users",
    router_tags=["users"],
)
