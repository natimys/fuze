from core.modules import ModuleDefinition

module = ModuleDefinition(
    active=True,
    name="auth",
    router_prefix="/auth",
    router_tags=["auth"],
)