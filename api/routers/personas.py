"""GET /api/personas — list 5 부서 personas (frontend SSOT consumer)."""
from __future__ import annotations
from fastapi import APIRouter
from api.services.persona import PERSONA_REGISTRY

router = APIRouter(prefix='/api/personas', tags=['personas'])


@router.get('')
def list_personas() -> list[dict]:
    """Return all 5 personas with full registry contents."""
    return [
        {'persona_id': pid, **entry}
        for pid, entry in PERSONA_REGISTRY.items()
    ]
