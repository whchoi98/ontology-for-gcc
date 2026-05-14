"""FastAPI entry — registers all 12 scenario routers + auth middleware + CORS."""
from __future__ import annotations
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.config import settings
from api.middleware_auth import CognitoBearerAuth

logging.basicConfig(level=settings.log_level)
log = logging.getLogger("gcc.api")

app = FastAPI(title="ontology-gcc api", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://gcc.whchoi.net",
        "https://gcc-ontology.whchoi.net",  # legacy alias (deprecated)
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(CognitoBearerAuth, exempt_paths=["/healthz", "/docs", "/openapi.json"])


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


# 인프라 자원 가시성 — ops 라우터의 catch-all /{area}보다 먼저 등록되어야
# /api/ops/resources가 정확한 경로로 매칭된다 (FastAPI는 등록 순서대로 시도).
try:
    from api.routers import ops_resources
    app.include_router(ops_resources.router)
except Exception as e:
    log.warning("ops_resources router not registered: %s", e)


# Plan 3 — only auth + ops routers retained from the legacy loop.
def _try_register():
    for module_name in ["auth", "ops"]:
        try:
            mod = __import__(f"api.routers.{module_name}", fromlist=["router"])
            app.include_router(mod.router, prefix="/api")
        except Exception as e:
            log.warning("router %s not yet registered: %s", module_name, e)


_try_register()

# Plan 2 Task 2.6.1 — 25-class GCC objects router (carries own `/api/objects` prefix)
try:
    from api.routers import objects
    app.include_router(objects.router)
except Exception as e:
    log.warning("objects router not registered: %s", e)

# Plan 3 Task 3.1.3 — 5 부서 personas SSOT endpoint (own /api/personas prefix)
try:
    from api.routers import personas
    app.include_router(personas.router)
except Exception as e:
    log.warning("personas router not registered: %s", e)

# Plan 3 Task 3.2.2 — /api/search + /api/search/stream (SSE phases)
try:
    from api.routers import search as search_router
    app.include_router(search_router.router)
except Exception as e:
    log.warning("search router not registered: %s", e)

# Plan 3 Task 3.4.3 — /api/chat — Converse 다회차 + 10 도구 + Memory + Guardrail
try:
    from api.routers import chat as chat_router
    app.include_router(chat_router.router)
except Exception as e:
    log.warning("chat router not registered: %s", e)

# Plan 4 — 12 시나리오 라우터 (C~N) — 각 라우터가 own prefix 보유.
for module_name in [
    "insights", "persona_match", "cluster", "lookalike", "campaign_roi",
    "network_map", "compliance", "external_signal", "outlier", "payment",
    "journey", "weather",
]:
    try:
        mod = __import__(f"api.routers.{module_name}", fromlist=["router"])
        app.include_router(mod.router)
    except Exception as e:
        log.warning("plan4 router %s not registered: %s", module_name, e)

# Plan 5 Task 5.2.1 — /api/ontology/{schema,standards,validation}
try:
    from api.routers import ontology as ontology_router
    app.include_router(ontology_router.router)
except Exception as e:
    log.warning("ontology router not registered: %s", e)

# Note: 인프라 자원 가시성 라우터는 main.py 상단의 ops 라우터 (catch-all /{area})
# 보다 먼저 등록되어야 FastAPI가 정확한 /api/ops/resources 경로를 우선 매칭한다.
# 등록 순서가 빠른 라우트가 먼저 시도되므로 위쪽으로 이동.
