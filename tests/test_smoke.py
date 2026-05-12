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
    "api.routers.spec_match",
    "api.routers.weather",
]

# mfg PoC 잔재 stub — neptune.get_neptune 미존재로 main.py 가 try/except silent skip.
# GCC 도메인 재작성 또는 제거 필요 (별도 cleanup PR).
LEGACY_ROUTERS_NEEDING_MIGRATION = [
    "api.routers.eight_d",
    "api.routers.esg_cbam",
    "api.routers.pdm",
    "api.routers.price",
    "api.routers.scm_lane",
    "api.routers.substitute",
    "api.routers.supplier_rfm",
]


@pytest.mark.parametrize("module_name", ACTIVE_ROUTERS)
def test_active_router_imports(module_name):
    mod = import_module(module_name)
    assert hasattr(mod, "router"), f"{module_name} must export `router`"


@pytest.mark.parametrize("module_name", LEGACY_ROUTERS_NEEDING_MIGRATION)
@pytest.mark.xfail(
    strict=True,
    reason="mfg-carryover stub, missing neptune.get_neptune; tracked for migration",
)
def test_legacy_router_imports(module_name):
    mod = import_module(module_name)
    assert hasattr(mod, "router")


def test_main_imports():
    from api import main
    assert main.app is not None


def test_app_includes_active_routes():
    from api import main
    routes_count = len(main.app.routes)
    assert routes_count >= len(ACTIVE_ROUTERS), (
        f"Expected ≥ {len(ACTIVE_ROUTERS)} routes, got {routes_count}"
    )
