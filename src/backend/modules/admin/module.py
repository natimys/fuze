from core.modules import ModuleDefinition

module = ModuleDefinition(
    name="admin",
    active=True,
    router_prefix="/admin",
    router_tags=["admin"],
)
