"""12 시나리오의 라우터·페이지 stub 일괄 생성. 작성 후엔 각 task에서 본문 채움."""
from __future__ import annotations
from pathlib import Path

SCENARIOS = [
    ('C', 'insights', 'MD 인사이트', '인사이트'),
    ('D', 'persona_match', '페르소나 매칭', '매칭'),
    ('E', 'cluster', '고객 클러스터링', '클러스터'),
    ('F', 'lookalike', '룩어라이크 익스팬션', '룩어라이크'),
    ('G', 'campaign_roi', '캠페인 ROI 시뮬레이터', 'ROI'),
    ('H', 'network_map', '주유소 네트워크 지도', '지도'),
    ('I', 'compliance', '약관·규제 가드레일', '컴플라이언스'),
    ('J', 'external_signal', '외부 시그널 통합', '외부 시그널'),
    ('K', 'outlier', 'Outlier · 행동 변화', 'Outlier'),
    ('L', 'payment', '결제·가격·채널 분석', '결제'),
    ('M', 'journey', '고객 통합 여정', '여정'),
    ('N', 'weather', '날씨 × 주유 패턴', '날씨'),
]

ROUTER_TEMPLATE = """\
# api/routers/{snake}.py — 시나리오 {code}: {label}
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import sse_event, stream_phases
from api.services.persona import get as get_persona

router = APIRouter(prefix='/api/{slug}', tags=['{snake}'])


class {pascal}Request(BaseModel):
    persona_id: Optional[str] = 'marketing'


@router.post('')
def {snake}_sync(req: {pascal}Request):
    return {{'persona': get_persona(req.persona_id)['name_kr'], 'placeholder': 'task 4.x에서 구현'}}


@router.post('/stream')
async def {snake}_streaming(req: {pascal}Request):
    async def gen():
        yield ('phase', {{'name': '{snake}_start'}})
        yield ('result', {{'placeholder': True}})
    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
"""

PAGE_TEMPLATE = """\
// web/app/{slug}/page.tsx — 시나리오 {code}: {label}
'use client';
import {{ useState }} from 'react';
import DataSourceBadge from '../../components/DataSourceBadge';
import PersonaSwitchGcc from '../../components/PersonaSwitchGcc';

export default function {pascal}Page() {{
  const [persona, setPersona] = useState('marketing');
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>{code}. {label}</h1>
      <div className='flex items-center gap-3 mb-4'>
        <PersonaSwitchGcc value={{persona}} onChange={{setPersona}}/>
        <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/>
      </div>
      <div className='border rounded p-4 bg-slate-50'>본 시나리오는 task 4.x에서 본격 구현됩니다.</div>
    </div>
  );
}}
"""


def to_pascal(s: str) -> str:
    return ''.join(p.capitalize() for p in s.split('_'))


def main() -> None:
    repo = Path(__file__).resolve().parent.parent
    for code, snake, label, _ in SCENARIOS:
        slug = snake.replace('_', '-')
        pascal = to_pascal(snake)
        router_path = repo / 'api' / 'routers' / f'{snake}.py'
        router_path.write_text(
            ROUTER_TEMPLATE.format(
                snake=snake, code=code, label=label, slug=slug, pascal=pascal,
            ),
            encoding='utf-8',
        )
        page_dir = repo / 'web' / 'app' / slug
        page_dir.mkdir(parents=True, exist_ok=True)
        (page_dir / 'page.tsx').write_text(
            PAGE_TEMPLATE.format(slug=slug, code=code, label=label, pascal=pascal),
            encoding='utf-8',
        )
    print(f'wrote {len(SCENARIOS)} router stubs + {len(SCENARIOS)} page stubs')


if __name__ == '__main__':
    main()
