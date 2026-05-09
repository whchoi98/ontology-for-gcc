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
    allow_origins=["https://gcc-ontology.whchoi.net", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(CognitoBearerAuth, exempt_paths=["/healthz", "/docs", "/openapi.json"])


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


# Routers registered in Tasks 16-25 — placeholder import here, fail-soft if not yet present.
# `objects` is excluded from this loop because Plan 2 Task 2.6.1 router carries its own
# `/api/objects` prefix (registered explicitly below).
def _try_register():
    for module_name in [
        "auth",
        "search", "chat", "insights", "spec_match", "compliance",
        "substitute", "price", "scm_lane", "supplier_rfm", "eight_d",
        "esg_cbam", "pdm", "ops",
    ]:
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
