# api/routers/payment.py — 시나리오 L: 결제·가격·채널 분석
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import sse_event, stream_phases
from api.services.persona import get as get_persona

router = APIRouter(prefix='/api/payment', tags=['payment'])


class PaymentRequest(BaseModel):
    persona_id: Optional[str] = 'marketing'


@router.post('')
def payment_sync(req: PaymentRequest):
    return {'persona': get_persona(req.persona_id)['name_kr'], 'placeholder': 'task 4.x에서 구현'}


@router.post('/stream')
async def payment_streaming(req: PaymentRequest):
    async def gen():
        yield ('phase', {'name': 'payment_start'})
        yield ('result', {'placeholder': True})
    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
