"""Per-router import smoke + sanity that the app collects them."""
from importlib import import_module

import pytest

ACTIVE_ROUTERS = [
    "api.routers.auth",
    "api.routers.campaign_roi",
    "api.routers.chat",
    "api.routers.cluster",
    "api.routers.compliance",
    "api.routers.external_signal",
    "api.routers.insights",
    "api.routers.journey",
    "api.routers.lookalike",
    "api.routers.network_map",
    "api.routers.objects",
    "api.routers.ontology",
    "api.routers.ops",
    "api.routers.ops_resources",
    "api.routers.outlier",
    "api.routers.payment",
    "api.routers.persona_match",
    "api.routers.personas",
    "api.routers.search",
    "api.routers.weather",
]

@pytest.mark.parametrize("module_name", ACTIVE_ROUTERS)
def test_active_router_imports(module_name):
    mod = import_module(module_name)
    assert hasattr(mod, "router"), f"{module_name} must export `router`"


def test_main_imports():
    from api import main
    assert main.app is not None


def test_app_includes_active_routes():
    from api import main
    routes_count = len(main.app.routes)
    assert routes_count >= len(ACTIVE_ROUTERS), (
        f"Expected ≥ {len(ACTIVE_ROUTERS)} routes, got {routes_count}"
    )
