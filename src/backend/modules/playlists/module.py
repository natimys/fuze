from core.modules import ModuleDefinition

module = ModuleDefinition(
    active=True,
    name="playlists",
    router_prefix="/playlists",
    router_tags=["playlists"],
)
