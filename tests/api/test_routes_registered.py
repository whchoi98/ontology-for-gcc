from fastapi.testclient import TestClient
from api.main import app


def test_all_scenario_routes_present():
    """Plan 4 — A/B (search/chat) + C~N (12 시나리오 router prefixes) registered."""
    client = TestClient(app)
    r = client.get("/openapi.json")
    paths = set(r.json()["paths"].keys())
    # Plan 3 — 시나리오 A/B
    base_prefixes = [
        "/api/search", "/api/chat",
    ]
    # Plan 4 — 시나리오 C~N (each router carries its own prefix; specific
    # endpoint shapes evolve task-by-task, so we only assert the prefix exists).
    plan4_prefixes = [
        "/api/insights",
        "/api/persona-match",
        "/api/cluster",
        "/api/lookalike",
        "/api/campaign-roi",
        "/api/network-map",
        "/api/compliance",
        "/api/external-signal",
        "/api/outlier",
        "/api/payment",
        "/api/journey",
        "/api/weather",
    ]
    expected = base_prefixes + plan4_prefixes
    missing = [
        e for e in expected
        if not any(p == e or p.startswith(e + "/") for p in paths)
    ]
    assert not missing, f"missing scenario prefixes: {missing}\nfound: {sorted(paths)}"
