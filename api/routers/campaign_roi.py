# api/routers/campaign_roi.py — 시나리오 G: 캠페인 ROI 시뮬레이터
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import sse_event, stream_phases
from api.services.persona import get as get_persona

router = APIRouter(prefix='/api/campaign-roi', tags=['campaign_roi'])


class CampaignRoiRequest(BaseModel):
    persona_id: Optional[str] = 'marketing'


@router.post('')
def campaign_roi_sync(req: CampaignRoiRequest):
    return {'persona': get_persona(req.persona_id)['name_kr'], 'placeholder': 'task 4.x에서 구현'}


@router.post('/stream')
async def campaign_roi_streaming(req: CampaignRoiRequest):
    async def gen():
        yield ('phase', {'name': 'campaign_roi_start'})
        yield ('result', {'placeholder': True})
    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
