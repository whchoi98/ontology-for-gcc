# api/routers/weather.py — 시나리오 N: 날씨 × 주유 패턴
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import sse_event, stream_phases
from api.services.persona import get as get_persona

router = APIRouter(prefix='/api/weather', tags=['weather'])


class WeatherRequest(BaseModel):
    persona_id: Optional[str] = 'marketing'


@router.post('')
def weather_sync(req: WeatherRequest):
    return {'persona': get_persona(req.persona_id)['name_kr'], 'placeholder': 'task 4.x에서 구현'}


@router.post('/stream')
async def weather_streaming(req: WeatherRequest):
    async def gen():
        yield ('phase', {'name': 'weather_start'})
        yield ('result', {'placeholder': True})
    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
