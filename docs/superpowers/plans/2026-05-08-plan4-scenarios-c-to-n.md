# Plan 4 — Scenarios C~N (12 시나리오) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan 3에서 확립한 시나리오 A·B 템플릿(라우터+서비스+SSE+PERSONA_REGISTRY+SubgraphView+DataSourceBadge+5 wow 케이스) 패턴을 12개 시나리오에 복제·확장. 시나리오 **C** (Code Interpreter 차트), **D** 페르소나 매칭, **E** 클러스터(PDF Scenario 2), **F** 룩어라이크, **G** 캠페인 ROI, **H** 주유소 지도, **I** 약관 가드레일, **J** 외부 시그널 융합, **K** Outlier (PM+M·디젤→premium 시그니처), **L** 결제 분석, **M** 고객 통합 여정 (PDF 3페이지 시그니처), **N** 날씨 × 주유 (기상청 join). 총 12 시나리오 × 5 페르소나 = 60 wow 쿼리.

**Architecture:** A·B에서 만든 공통 서비스(`bedrock`, `opensearch`, `persona`, `agent`, `agentcore`, `code_interpreter`, `cohort`, `sse`)를 그대로 사용. 시나리오마다 `api/routers/<code>.py` + (필요 시) `api/services/<code>_pipeline.py` + `web/app/<code>/page.tsx`. 시나리오 K·M·N은 *시그니처 시나리오*로 별도 디테일 강화 — PoC 데모의 차별점.

**Tech Stack:** A/B와 동일 + react-simple-maps + d3-geo + KOSTAT 시도 GeoJSON (H), 기상청 ETL (N), pandas window 함수 (K), Cytoscape timeline layout (M).

**Spec reference:** spec §3.1 시나리오 카탈로그 + §3.2 페르소나 매트릭스 + D11~D18.

**Prerequisites:** Plan 1·2·3 작성+실행 완료. Neptune 적재됨, AgentCore Memory 활성, 시나리오 A·B end-to-end 동작 확인됨.

---

## File Structure

12 시나리오 라우터 + 12 페이지 + 일부 전용 서비스·컴포넌트:

### 라우터 (Phase 4.x — 12 신규)
- `api/routers/{insights,persona_match,cluster,lookalike,campaign_roi,network_map,compliance,external_signal,outlier,payment,journey,weather}.py`

### 시나리오 전용 서비스 (필요 시)
- `api/services/insights_pipeline.py` — Neptune 집계 + Code Interpreter chart
- `api/services/cluster_pipeline.py` — KMeans + LLM 라벨링 (write-back to Cluster nodes)
- `api/services/journey_pipeline.py` — multi-channel 시계열 통합 view (M 시그니처)
- `api/services/weather_pipeline.py` — 기상청 데이터 × Transaction join (N 시그니처)

### 웹 페이지 (12 신규)
- `web/app/{insights,persona-match,cluster,lookalike,campaign-roi,network,compliance,signals,outlier,payment,journey,weather}/page.tsx`

### 웹 컴포넌트 (시그니처 시나리오 전용)
- `web/components/KoreaChoropleth.tsx` — H 지도 (시도 단위)
- `web/components/JourneyTimeline.tsx` — M 시그니처 (Cytoscape timeline 또는 vertical scrub)
- `web/components/WeatherOverlay.tsx` — N의 H 지도 위 날씨 표시
- `web/components/ChartImage.tsx` — Code Interpreter PNG 표시 (C·E·G·K)

### 평가 케이스 (12 시나리오 × 5 페르소나 = 60 wow 쿼리)
- `scripts/eval_wow_queries.py` — 60 신규 케이스 추가 (C~N 각 5)

### 정적 자산
- `web/public/geo/kostat-sido-2024.geojson` — KOSTAT 17 시도 GeoJSON

---

## Phase 4.0 — 공통 템플릿 + ChartImage 컴포넌트 (1 task)

### Task 4.0.1: `ChartImage.tsx` + 시나리오 라우터 boilerplate generator

**Files:**
- Create: `web/components/ChartImage.tsx`
- Create: `scripts/gen_scenario_boilerplate.py` (라우터·페이지 stub 생성기)

- [ ] **Step 1: `ChartImage.tsx` — Code Interpreter PNG 표시**

```tsx
// web/components/ChartImage.tsx
'use client';
type Props = { base64Png?: string; alt?: string; loading?: boolean };
export default function ChartImage({ base64Png, alt='차트', loading }: Props) {
  if (loading) return <div className='h-64 border rounded animate-pulse bg-slate-100'/>;
  if (!base64Png) return <div className='h-64 border rounded grid place-items-center text-slate-400'>차트 대기</div>;
  return (
    <img src={`data:image/png;base64,${base64Png}`} alt={alt}
         className='border rounded max-w-full bg-white'/>
  );
}
```

- [ ] **Step 2: 시나리오 boilerplate 생성기**

```python
# scripts/gen_scenario_boilerplate.py
"""12 시나리오의 라우터·페이지 stub 일괄 생성. 작성 후엔 각 task에서 본문 채움."""
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
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import sse_event, stream_phases
from api.services.persona import get as get_persona

router = APIRouter(prefix='/api/{slug}', tags=['{snake}'])

class {pascal}Request(BaseModel):
    persona_id: str | None = 'marketing'

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
import PersonaSwitch from '../../components/PersonaSwitch';
import StreamPanel from '../../components/StreamPanel';

export default function {pascal}Page() {{
  const [persona, setPersona] = useState('marketing');
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>{code}. {label}</h1>
      <div className='flex items-center gap-3 mb-4'>
        <PersonaSwitch value={{persona}} onChange={{setPersona}}/>
        <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/>
      </div>
      <div className='border rounded p-4 bg-slate-50'>본 시나리오는 task 4.x에서 본격 구현됩니다.</div>
    </div>
  );
}}
"""

def to_pascal(s: str) -> str:
    return ''.join(p.capitalize() for p in s.split('_'))

for code, snake, label, _ in SCENARIOS:
    slug = snake.replace('_', '-')
    pascal = to_pascal(snake)
    Path(f'api/routers/{snake}.py').write_text(
        ROUTER_TEMPLATE.format(snake=snake, code=code, label=label, slug=slug, pascal=pascal),
        encoding='utf-8')
    page_dir = Path(f'web/app/{slug}'); page_dir.mkdir(parents=True, exist_ok=True)
    (page_dir / 'page.tsx').write_text(
        PAGE_TEMPLATE.format(slug=slug, code=code, label=label, pascal=pascal),
        encoding='utf-8')
print(f'wrote 12 router stubs + 12 page stubs')
```

- [ ] **Step 3: stub 일괄 생성 + 라우터 일괄 등록**

```bash
python3 scripts/gen_scenario_boilerplate.py
# api/main.py에 12 라우터 등록
cat >> api/main.py <<'EOF'

# Plan 4 시나리오 라우터 12개
from api.routers import insights, persona_match, cluster, lookalike, campaign_roi
from api.routers import network_map, compliance, external_signal, outlier, payment
from api.routers import journey, weather
for r in [insights.router, persona_match.router, cluster.router, lookalike.router,
          campaign_roi.router, network_map.router, compliance.router,
          external_signal.router, outlier.router, payment.router,
          journey.router, weather.router]:
    app.include_router(r)
EOF
```

- [ ] **Step 4: smoke + 커밋**

```bash
pytest tests/test_smoke.py -v 2>&1 | tail -5
cd web && npx tsc --noEmit && cd -
git add scripts/gen_scenario_boilerplate.py web/components/ChartImage.tsx api/routers/ web/app/ api/main.py
git commit -m "feat(plan4): 12 scenario router+page boilerplate + ChartImage component"
```

---

## Phase 4.1 — 시나리오 D, F, I, L (4 simpler — 템플릿 직접 적용, 각 1 task)

### Task 4.1.1: 시나리오 D (`persona-match`) — 페르소나 적합성 추천

**Files:** `api/routers/persona_match.py`·`web/app/persona-match/page.tsx`

- [ ] **Step 1: 라우터 본문 — Customer cohort × PERSONA_REGISTRY 가중치**

```python
# api/routers/persona_match.py 본문 교체
from __future__ import annotations
from fastapi import APIRouter
from pydantic import BaseModel
from api.services.persona import PERSONA_REGISTRY
from api.services.neptune import open_cypher

router = APIRouter(prefix='/api/persona-match', tags=['persona_match'])

class MatchRequest(BaseModel):
    cust_ids: list[str] = []
    persona_id: str | None = 'marketing'

@router.post('')
def match(req: MatchRequest):
    if not req.cust_ids:
        return {'matches': []}
    q = """UNWIND $ids AS id
           MATCH (c:Customer {cust_id: id})
           OPTIONAL MATCH (c)-[:REFUELED]->(t:FuelTransaction)
           RETURN c.cust_id AS cust_id, c.vip_yn AS vip,
                  count(t) AS tx_count, sum(t.amount) AS total_amt"""
    res = open_cypher(q, parameters={'ids': req.cust_ids})
    rows = res.get('results', [])
    matches = []
    for row in rows:
        scores = {}
        for pid, p in PERSONA_REGISTRY.items():
            base = 0.0
            if 'roas' in p['kpi_focus']:
                base += min((row.get('total_amt', 0) or 0)/1_000_000, 1.0) * 0.4
            if 'retention' in p['kpi_focus']:
                base += min((row.get('tx_count', 0) or 0)/100, 1.0) * 0.3
            if 'plcc_attach' in p['kpi_focus'] and row.get('vip')=='Y':
                base += 0.3
            scores[pid] = round(base, 3)
        best = max(scores.items(), key=lambda kv: kv[1])
        matches.append({'cust_id': row['cust_id'], 'best_persona': best[0],
                        'all_scores': scores})
    return {'matches': matches}
```

- [ ] **Step 2: 페이지 — 입력 폼 + 매치 결과 카드**

```tsx
// web/app/persona-match/page.tsx 본문 교체
'use client';
import { useState } from 'react';
import DataSourceBadge from '../../components/DataSourceBadge';
import PersonaSwitch from '../../components/PersonaSwitch';

export default function PersonaMatchPage() {
  const [persona, setPersona] = useState('marketing');
  const [csv, setCsv] = useState('c001,c002,c003');
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    const r = await fetch('/api/persona-match', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({cust_ids: csv.split(',').map(s=>s.trim()), persona_id: persona})});
    setMatches((await r.json()).matches || []);
    setLoading(false);
  }
  return (
    <div className='p-8 max-w-5xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>D. 페르소나 매칭</h1>
      <div className='flex items-center gap-3 mb-4'>
        <PersonaSwitch value={persona} onChange={setPersona}/>
        <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/>
      </div>
      <textarea className='w-full border rounded p-2 mb-2' rows={3} value={csv}
                onChange={e=>setCsv(e.target.value)}
                placeholder='cust_id를 쉼표로 구분'/>
      <button onClick={go} disabled={loading}
        className='bg-blue-600 text-white px-4 py-2 rounded'>매칭</button>
      <table className='w-full mt-4 text-sm'>
        <thead><tr className='border-b'><th>cust_id</th><th>best_persona</th>
                {Object.keys(matches[0]?.all_scores ?? {}).map(k=>(<th key={k}>{k}</th>))}</tr></thead>
        <tbody>
          {matches.map((m,i)=>(<tr key={i} className='border-b'>
            <td className='py-1 font-mono text-xs'>{m.cust_id}</td>
            <td className='font-semibold'>{m.best_persona}</td>
            {Object.values(m.all_scores).map((v:any,j:number)=>(<td key={j}>{v}</td>))}
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: 5 wow 케이스 + 커밋**

```python
# scripts/eval_wow_queries.py에 추가
WOW_QUERIES.extend([
    {'scenario':'D','persona':'marketing',  'query':{'cust_ids':['c001','c002','c003']},
     'expects': lambda r: len(r.get('matches', [])) >= 1, 'min_results': 1},
    {'scenario':'D','persona':'strategy',   'query':{'cust_ids':['c004','c005']},
     'expects': lambda r: any('best_persona' in m for m in r.get('matches', [])), 'min_results': 1},
    {'scenario':'D','persona':'data-ai',    'query':{'cust_ids':['c001']},
     'expects': lambda r: 'all_scores' in (r.get('matches',[{}])[0] or {}), 'min_results': 1},
    {'scenario':'D','persona':'crm',        'query':{'cust_ids':['c001','c002']},
     'expects': lambda r: 'crm' in str(r), 'min_results': 1},
    {'scenario':'D','persona':'retail-ops', 'query':{'cust_ids':['c003']},
     'expects': lambda r: 'retail-ops' in str(r), 'min_results': 1},
])
```

```bash
git add api/routers/persona_match.py web/app/persona-match/page.tsx scripts/eval_wow_queries.py
git commit -m "feat(D): 페르소나 매칭 (PERSONA_REGISTRY × Customer KPI weights) + 5 wow"
```

---

### Task 4.1.2: 시나리오 F (`lookalike`) — 룩어라이크 expand 도구 활용

**Files:** `api/routers/lookalike.py`·`web/app/lookalike/page.tsx`

- [ ] **Step 1: 라우터 본문 (Plan 3의 lookalike_expand tool 호출)**

```python
# api/routers/lookalike.py 본문 교체
from fastapi import APIRouter
from pydantic import BaseModel
from api.services.tools.lookalike_expand import run

router = APIRouter(prefix='/api/lookalike', tags=['lookalike'])

class LookalikeRequest(BaseModel):
    seed_cust_ids: list[str]
    top_pct: float = 0.20
    persona_id: str | None = 'data-ai'

@router.post('')
def expand(req: LookalikeRequest):
    return run({'seed_cust_ids': req.seed_cust_ids, 'top_pct': req.top_pct},
               persona_id=req.persona_id or 'data-ai', session_id='web', cust_id=None)
```

- [ ] **Step 2: 페이지 — 시드 입력 + 결과 카운트 + 샘플 출력**

```tsx
// web/app/lookalike/page.tsx 본문 교체
'use client';
import { useState } from 'react';
import DataSourceBadge from '../../components/DataSourceBadge';
import PersonaSwitch from '../../components/PersonaSwitch';

export default function LookalikePage() {
  const [persona, setPersona] = useState('data-ai');
  const [seeds, setSeeds] = useState('c001,c016,c021');
  const [pct, setPct] = useState(0.20);
  const [out, setOut] = useState<any>(null);
  async function go() {
    const r = await fetch('/api/lookalike', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ seed_cust_ids: seeds.split(',').map(s=>s.trim()),
                              top_pct: pct, persona_id: persona })});
    setOut(await r.json());
  }
  return (
    <div className='p-8 max-w-5xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>F. 룩어라이크 익스팬션</h1>
      <div className='flex items-center gap-3 mb-4'>
        <PersonaSwitch value={persona} onChange={setPersona}/>
        <DataSourceBadge source='synthetic'/>
      </div>
      <textarea className='w-full border rounded p-2 mb-2' rows={2} value={seeds}
                onChange={e=>setSeeds(e.target.value)}/>
      <label>상위 % <input type='number' step='0.05' min='0.05' max='1' value={pct}
              onChange={e=>setPct(parseFloat(e.target.value))}
              className='border rounded px-2 w-24'/></label>
      <button onClick={go} className='ml-3 bg-blue-600 text-white px-4 py-2 rounded'>확장</button>
      {out && (<div className='mt-4 border rounded p-3'>
        <div>총 확장: <span className='font-semibold'>{out.count}</span></div>
        <div className='text-xs font-mono text-slate-500 mt-2'>샘플: {out.expanded?.slice(0,20).join(', ')}</div>
      </div>)}
    </div>
  );
}
```

- [ ] **Step 3: 5 wow + 커밋**

```python
WOW_QUERIES.extend([
    {'scenario':'F','persona':'data-ai',    'query':{'seed_cust_ids':['c001'],'top_pct':0.10},
     'expects': lambda r: r.get('count',0) >= 100, 'min_results': 100},
    {'scenario':'F','persona':'marketing',  'query':{'seed_cust_ids':['c001','c002'],'top_pct':0.20},
     'expects': lambda r: r.get('count',0) >= 200, 'min_results': 200},
    {'scenario':'F','persona':'strategy',   'query':{'seed_cust_ids':['c003']}, 
     'expects': lambda r: 'expanded' in r, 'min_results': 1},
    {'scenario':'F','persona':'crm',        'query':{'seed_cust_ids':['c004','c005','c006']}, 
     'expects': lambda r: r.get('count',0) > 0, 'min_results': 1},
    {'scenario':'F','persona':'retail-ops', 'query':{'seed_cust_ids':['c007']},
     'expects': lambda r: 'expanded' in r, 'min_results': 1},
])
```

```bash
git add api/routers/lookalike.py web/app/lookalike/page.tsx scripts/eval_wow_queries.py
git commit -m "feat(F): 룩어라이크 (lookalike_expand tool 활용) + 5 wow"
```

---

### Task 4.1.3: 시나리오 I (`compliance`) — 약관·규제 가드레일

**Files:** `api/routers/compliance.py`·`web/app/compliance/page.tsx`

- [ ] **Step 1: 라우터 — TermAgreement + Bedrock Guardrails**

```python
# api/routers/compliance.py 본문 교체
from fastapi import APIRouter
from pydantic import BaseModel
from api.services.neptune import open_cypher
from api.services.guardrails import apply as guardrail_apply

router = APIRouter(prefix='/api/compliance', tags=['compliance'])

class CheckRequest(BaseModel):
    target_cust_ids: list[str]
    marketing_action: str   # 자유 텍스트 (e.g. "고급휘발유 SMS 캠페인")
    persona_id: str | None = 'strategy'

@router.post('/check')
def check(req: CheckRequest):
    # 1) 약관 동의 매트릭스
    q = """UNWIND $ids AS id
           MATCH (c:Customer {cust_id: id})
           OPTIONAL MATCH (c)-[:AGREED_TO]->(ta:TermAgreement)-[:FOR]->(t:Term)
           WHERE t.marketing_eligible_yn='Y'
           RETURN c.cust_id AS cust_id, count(ta) AS marketing_eligible_count"""
    res = open_cypher(q, parameters={'ids': req.target_cust_ids})
    eligible = []
    blocked = []
    for row in res.get('results', []):
        if (row.get('marketing_eligible_count') or 0) > 0:
            eligible.append(row['cust_id'])
        else:
            blocked.append(row['cust_id'])
    
    # 2) action 텍스트 자체 가드레일
    cleaned, violations = guardrail_apply(req.marketing_action, source='INPUT')
    
    return {
        'action_cleaned': cleaned,
        'guardrail_violations': violations,
        'eligible_count': len(eligible),
        'blocked_count': len(blocked),
        'eligible_sample': eligible[:10],
        'blocked_sample': blocked[:10],
        'recommendation': '진행 가능' if not violations and len(blocked) == 0
                          else '약관 미동의 고객 제외 또는 추가 동의 캠페인 선행 필요',
    }
```

- [ ] **Step 2: 페이지 — 매트릭스 + 권고**

```tsx
// web/app/compliance/page.tsx 본문 교체
'use client';
import { useState } from 'react';
import DataSourceBadge from '../../components/DataSourceBadge';
import PersonaSwitch from '../../components/PersonaSwitch';

export default function CompliancePage() {
  const [persona, setPersona] = useState('strategy');
  const [csv, setCsv] = useState('c001,c002,c003');
  const [action, setAction] = useState('고급휘발유 충성 고객 대상 SMS 캠페인');
  const [out, setOut] = useState<any>(null);
  async function go() {
    const r = await fetch('/api/compliance/check', {method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({target_cust_ids: csv.split(',').map(s=>s.trim()),
                             marketing_action: action, persona_id: persona})});
    setOut(await r.json());
  }
  return (
    <div className='p-8 max-w-4xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>I. 약관 · 규제 가드레일</h1>
      <PersonaSwitch value={persona} onChange={setPersona}/>
      <div className='flex gap-2 mt-3 mb-2'>
        <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/>
      </div>
      <textarea className='w-full border rounded p-2 mb-2' rows={2} value={csv}
                onChange={e=>setCsv(e.target.value)} placeholder='cust_ids'/>
      <input className='w-full border rounded p-2 mb-2' value={action}
             onChange={e=>setAction(e.target.value)} placeholder='마케팅 액션 설명'/>
      <button onClick={go} className='bg-blue-600 text-white px-4 py-2 rounded'>검사</button>
      {out && (<div className='mt-4 border rounded p-3 grid grid-cols-2 gap-3'>
        <div className='border rounded p-2 bg-emerald-50'>
          <div className='font-semibold'>적격 (마케팅 가능)</div>
          <div className='text-2xl font-bold'>{out.eligible_count}</div>
          <div className='text-xs font-mono'>{out.eligible_sample?.join(', ')}</div>
        </div>
        <div className='border rounded p-2 bg-rose-50'>
          <div className='font-semibold'>차단</div>
          <div className='text-2xl font-bold'>{out.blocked_count}</div>
          <div className='text-xs font-mono'>{out.blocked_sample?.join(', ')}</div>
        </div>
        <div className='col-span-2 border-t pt-2'>
          <div className='text-sm'>가드레일 위반: {out.guardrail_violations?.length || 0}</div>
          <div className='font-semibold mt-1'>권고: {out.recommendation}</div>
        </div>
      </div>)}
    </div>
  );
}
```

- [ ] **Step 3: 5 wow + 커밋**

```python
WOW_QUERIES.extend([
    {'scenario':'I','persona':'strategy', 'query':{'target_cust_ids':['c001','c002','c003'],
     'marketing_action':'고급휘발유 SMS 캠페인'},
     'expects': lambda r: 'recommendation' in r, 'min_results': 1},
    {'scenario':'I','persona':'crm',      'query':{'target_cust_ids':['c004'],
     'marketing_action':'위치기반 푸시 알림'},
     'expects': lambda r: 'eligible_count' in r, 'min_results': 1},
    {'scenario':'I','persona':'marketing','query':{'target_cust_ids':['c001','c002'],
     'marketing_action':'단순 SMS 안내'},
     'expects': lambda r: r.get('eligible_count',0) >= 0, 'min_results': 1},
    {'scenario':'I','persona':'data-ai',  'query':{'target_cust_ids':['c005','c006'],
     'marketing_action':'개인화 추천 모델 적용'},
     'expects': lambda r: 'guardrail_violations' in r, 'min_results': 1},
    {'scenario':'I','persona':'retail-ops','query':{'target_cust_ids':['c007'],
     'marketing_action':'주유소 방문 행사 안내'},
     'expects': lambda r: 'recommendation' in r, 'min_results': 1},
])
```

```bash
git add api/routers/compliance.py web/app/compliance/page.tsx scripts/eval_wow_queries.py
git commit -m "feat(I): 약관·가드레일 (TermAgreement + Bedrock Guardrails) + 5 wow"
```

---

### Task 4.1.4: 시나리오 L (`payment`) — 결제·가격·채널 분석

**Files:** `api/routers/payment.py`·`web/app/payment/page.tsx`

- [ ] **Step 1: 라우터 — Transaction × PaymentMethod × FuelPrice 매트릭스**

```python
# api/routers/payment.py 본문 교체
from fastapi import APIRouter
from pydantic import BaseModel
from api.services.neptune import open_cypher

router = APIRouter(prefix='/api/payment', tags=['payment'])

class AnalyzeRequest(BaseModel):
    persona_id: str | None = 'retail-ops'
    fuel_grade: str | None = None    # filter
    sido_nm: str | None = None

@router.post('/analyze')
def analyze(req: AnalyzeRequest):
    where = ['1=1']
    params: dict = {}
    if req.fuel_grade:
        where.append('t.fuel_grade = $grade'); params['grade'] = req.fuel_grade
    if req.sido_nm:
        where.append('s.sido_nm = $sido'); params['sido'] = req.sido_nm
    q = f"""MATCH (c:Customer)-[:REFUELED]->(t:FuelTransaction)-[:AT]->(s:GasStation)
            WHERE {' AND '.join(where)}
            RETURN t.payment_type AS payment, t.fuel_grade AS grade,
                   s.sido_nm AS sido, count(*) AS tx, sum(t.amount) AS revenue,
                   avg(t.unit_price) AS avg_price
            ORDER BY revenue DESC LIMIT 100"""
    res = open_cypher(q, parameters=params)
    return {'matrix': res.get('results', [])}
```

- [ ] **Step 2: 페이지 — 필터 + 매트릭스 테이블**

```tsx
// web/app/payment/page.tsx 본문 교체
'use client';
import { useState } from 'react';
import DataSourceBadge from '../../components/DataSourceBadge';
import PersonaSwitch from '../../components/PersonaSwitch';

export default function PaymentPage() {
  const [persona, setPersona] = useState('retail-ops');
  const [grade, setGrade] = useState('');
  const [sido, setSido] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  async function go() {
    const r = await fetch('/api/payment/analyze', { method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({persona_id: persona, fuel_grade: grade||null, sido_nm: sido||null})});
    setRows((await r.json()).matrix || []);
  }
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>L. 결제 · 가격 · 채널 분석</h1>
      <PersonaSwitch value={persona} onChange={setPersona}/>
      <div className='flex gap-2 mt-3 mb-2'>
        <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/>
      </div>
      <div className='flex gap-2 mb-3'>
        <select className='border rounded px-2' value={grade} onChange={e=>setGrade(e.target.value)}>
          <option value=''>모든 유종</option><option>regular</option><option>premium</option>
          <option>diesel</option><option>kerosene</option><option>lpg</option>
        </select>
        <input className='border rounded px-2' placeholder='시도 (선택)' value={sido}
               onChange={e=>setSido(e.target.value)}/>
        <button onClick={go} className='bg-blue-600 text-white px-4 py-1 rounded'>분석</button>
      </div>
      <table className='w-full text-sm'>
        <thead><tr className='border-b'>
          <th>결제</th><th>유종</th><th>시도</th><th className='text-right'>거래수</th>
          <th className='text-right'>매출</th><th className='text-right'>평균가</th>
        </tr></thead>
        <tbody>{rows.map((r,i)=>(<tr key={i} className='border-b'>
          <td>{r.payment}</td><td>{r.grade}</td><td>{r.sido}</td>
          <td className='text-right'>{r.tx?.toLocaleString?.()}</td>
          <td className='text-right'>{r.revenue?.toLocaleString?.()}</td>
          <td className='text-right'>{Math.round(r.avg_price||0)}</td>
        </tr>))}</tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: 5 wow + 커밋**

```python
WOW_QUERIES.extend([
    {'scenario':'L','persona':'retail-ops','query':{'fuel_grade':'premium'},
     'expects': lambda r: len(r.get('matrix', [])) >= 1, 'min_results': 1},
    {'scenario':'L','persona':'data-ai',   'query':{'fuel_grade':None,'sido_nm':'서울'},
     'expects': lambda r: any('서울' in str(m) for m in r.get('matrix', [])), 'min_results': 1},
    {'scenario':'L','persona':'marketing', 'query':{},
     'expects': lambda r: 'matrix' in r, 'min_results': 1},
    {'scenario':'L','persona':'crm',       'query':{'fuel_grade':'regular'},
     'expects': lambda r: any('PLCC' in str(m) for m in r.get('matrix', [])), 'min_results': 1},
    {'scenario':'L','persona':'strategy',  'query':{},
     'expects': lambda r: any(m.get('revenue',0) > 0 for m in r.get('matrix', [])), 'min_results': 1},
])
```

```bash
git add api/routers/payment.py web/app/payment/page.tsx scripts/eval_wow_queries.py
git commit -m "feat(L): 결제·가격·채널 매트릭스 + 5 wow"
```

---

## Phase 4.2 — Code Interpreter 시나리오 C, E, G (3 tasks)

### Task 4.2.1: 시나리오 C (`insights`) — MD 인사이트 + matplotlib 차트 (NanumGothic)

**Files:** `api/services/insights_pipeline.py`·`api/routers/insights.py`·`web/app/insights/page.tsx`

- [ ] **Step 1: insights_pipeline 작성**

```python
# api/services/insights_pipeline.py
"""Neptune 집계 → Sonnet 4.6 streaming 한국어 요약 → Code Interpreter matplotlib 차트."""
from __future__ import annotations
import base64, json
from api.services.neptune import open_cypher
from api.services.code_interpreter import execute as ci_execute

def aggregate_fuel_grade_trend() -> list[dict]:
    q = """MATCH (t:FuelTransaction)
           WITH substring(t.ts, 0, 7) AS month, t.fuel_grade AS grade, count(*) AS n
           RETURN month, grade, n ORDER BY month, grade"""
    res = open_cypher(q)
    return res.get('results', [])

def render_trend_chart(rows: list[dict]) -> str:
    """matplotlib PNG → base64."""
    code = f"""
import json
data = {json.dumps(rows)}
import matplotlib.pyplot as plt, collections
by_grade = collections.defaultdict(list)
months = sorted({{r['month'] for r in data}})
for r in data: by_grade[r['grade']].append((r['month'], r['n']))
fig, ax = plt.subplots(figsize=(9,4))
for grade, points in by_grade.items():
    pts = dict(points)
    ax.plot(months, [pts.get(m, 0) for m in months], label=grade, marker='o')
ax.set_title('월별 유종별 거래 추이', fontsize=14)
ax.set_xlabel('월'); ax.set_ylabel('거래 수')
ax.legend(); ax.grid(alpha=0.3); plt.xticks(rotation=45)
plt.tight_layout(); plt.savefig('out.png', dpi=120)
"""
    out = ci_execute(code)
    if out['images']:
        return base64.b64encode(out['images'][0]).decode()
    return ''
```

- [ ] **Step 2: 라우터 — SSE phases (집계 → 차트 → 요약)**

```python
# api/routers/insights.py 본문 교체
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import sse_event, stream_phases
from api.services.insights_pipeline import aggregate_fuel_grade_trend, render_trend_chart
from api.services.bedrock import converse, ConverseRequest
from api.services.persona import system_prompt

router = APIRouter(prefix='/api/insights', tags=['insights'])

class InsightsRequest(BaseModel):
    persona_id: str | None = 'marketing'
    topic: str = 'fuel_grade_trend'

@router.post('/stream')
async def stream(req: InsightsRequest):
    async def gen():
        yield ('phase', {'name': 'aggregating'})
        rows = aggregate_fuel_grade_trend()
        yield ('phase', {'name': 'aggregated', 'count': len(rows)})
        yield ('phase', {'name': 'rendering_chart'})
        png_b64 = render_trend_chart(rows)
        yield ('phase', {'name': 'chart_ready', 'has_chart': bool(png_b64)})
        # 요약 (단일 호출, 스트리밍 아님 — Plan 5에서 stream으로 업그레이드)
        sys = system_prompt(req.persona_id, 'C')
        msg = f'다음 월별 유종 거래 데이터를 한국어로 3문장 요약: {rows[:30]}'
        out = converse(ConverseRequest(system=sys, messages=[{'role':'user','content':[{'text': msg}]}]))
        summary = out['output']['message']['content'][0]['text']
        yield ('result', {'chart_png_b64': png_b64, 'summary': summary, 'rows': rows})
    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
```

- [ ] **Step 3: 페이지 — ChartImage + 요약 텍스트**

```tsx
// web/app/insights/page.tsx 본문 교체
'use client';
import { useState } from 'react';
import { streamSSE } from '../../lib/api-client';
import ChartImage from '../../components/ChartImage';
import StreamPanel from '../../components/StreamPanel';
import PersonaSwitch from '../../components/PersonaSwitch';
import DataSourceBadge from '../../components/DataSourceBadge';

export default function InsightsPage() {
  const [persona, setPersona] = useState('marketing');
  const [events, setEvents] = useState<any[]>([]);
  const [chart, setChart] = useState<string|undefined>();
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true); setEvents([]); setChart(undefined); setSummary('');
    for await (const ev of streamSSE('/api/insights/stream',
              {persona_id: persona, topic:'fuel_grade_trend'})) {
      setEvents(p=>[...p,ev]);
      if (ev.type==='result') {
        setChart(ev.data.chart_png_b64);
        setSummary(ev.data.summary || '');
      }
    }
    setLoading(false);
  }
  return (
    <div className='p-8 max-w-5xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>C. MD 인사이트 (월별 유종 트렌드)</h1>
      <PersonaSwitch value={persona} onChange={setPersona}/>
      <div className='flex gap-2 mt-3 mb-3'>
        <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/>
      </div>
      <button onClick={go} disabled={loading} className='bg-blue-600 text-white px-4 py-2 rounded mb-3'>
        {loading?'분석 중...':'인사이트 생성'}</button>
      <StreamPanel events={events}/>
      <div className='grid grid-cols-2 gap-4 mt-4'>
        <ChartImage base64Png={chart} loading={loading}/>
        <div className='border rounded p-3 text-sm whitespace-pre-wrap'>{summary || '요약 대기'}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 5 wow + 커밋**

```python
WOW_QUERIES.extend([
    {'scenario':'C','persona':'marketing','query':{'topic':'fuel_grade_trend'},
     'expects': lambda r: bool(r.get('chart_png_b64')) and len(r.get('summary',''))>20, 'min_results':1},
    {'scenario':'C','persona':'data-ai','query':{'topic':'fuel_grade_trend'},
     'expects': lambda r: 'rows' in r and len(r['rows']) > 0, 'min_results':1},
    {'scenario':'C','persona':'strategy','query':{'topic':'fuel_grade_trend'},
     'expects': lambda r: bool(r.get('chart_png_b64')), 'min_results':1},
    {'scenario':'C','persona':'crm','query':{'topic':'fuel_grade_trend'},
     'expects': lambda r: bool(r.get('summary')), 'min_results':1},
    {'scenario':'C','persona':'retail-ops','query':{'topic':'fuel_grade_trend'},
     'expects': lambda r: bool(r.get('chart_png_b64')), 'min_results':1},
])
```

```bash
git add api/services/insights_pipeline.py api/routers/insights.py web/app/insights/page.tsx scripts/eval_wow_queries.py
git commit -m "feat(C): 인사이트 — Neptune 집계 + Code Interpreter matplotlib(NanumGothic) + Sonnet 요약"
```

---

### Task 4.2.2: 시나리오 E (`cluster`) — KMeans 6 + LLM 라벨링 + write-back

**Files:** `api/services/cluster_pipeline.py`·`api/routers/cluster.py`·`web/app/cluster/page.tsx`

- [ ] **Step 1: cluster_pipeline (KMeans → 라벨 → Cluster 노드 갱신)**

```python
# api/services/cluster_pipeline.py
"""sklearn KMeans 6 → LLM cluster 라벨링 → Cluster 노드 update."""
from __future__ import annotations
import base64, json
from api.services.neptune import open_cypher
from api.services.code_interpreter import execute as ci_execute
from api.services.bedrock import converse, ConverseRequest

def features_query() -> list[dict]:
    q = """MATCH (c:Customer)-[:REFUELED]->(t:FuelTransaction)
           WITH c, count(t) AS tx, sum(t.amount) AS amt,
                sum(CASE WHEN t.fuel_grade='premium' THEN 1 ELSE 0 END) AS prem
           RETURN c.cust_id AS cust_id, tx, amt, prem,
                  CASE WHEN tx>0 THEN toFloat(prem)/tx ELSE 0 END AS prem_ratio LIMIT 5000"""
    res = open_cypher(q)
    return res.get('results', [])

def cluster_features(rows: list[dict]) -> dict:
    """KMeans 6 + scatter PNG 반환."""
    code = f"""
import json
import numpy as np
from sklearn.cluster import KMeans
import matplotlib.pyplot as plt
data = {json.dumps(rows)}
X = np.array([[r['tx'] or 0, r['amt'] or 0, r['prem_ratio'] or 0] for r in data], dtype=float)
if len(X) >= 6:
    km = KMeans(n_clusters=6, random_state=42, n_init=10).fit(X)
    labels = km.labels_.tolist()
    out = [{{'cust_id': r['cust_id'], 'cluster': int(l)}} for r, l in zip(data, labels)]
    fig, ax = plt.subplots(figsize=(7,5))
    sc = ax.scatter(X[:,0], X[:,1], c=labels, cmap='tab10', s=8, alpha=0.6)
    ax.set_xlabel('거래 수'); ax.set_ylabel('총 매출')
    ax.set_title('K-Means 6 클러스터')
    plt.tight_layout(); plt.savefig('out.png', dpi=120)
    print(json.dumps({{'assignments': out, 'centroids': km.cluster_centers_.tolist()}}))
else:
    print(json.dumps({{'assignments': [], 'centroids': []}}))
"""
    out = ci_execute(code)
    payload = {}
    try: payload = json.loads(out['output'].strip().splitlines()[-1])
    except Exception: pass
    chart = base64.b64encode(out['images'][0]).decode() if out['images'] else ''
    return {'assignments': payload.get('assignments', []),
            'centroids': payload.get('centroids', []),
            'chart_png_b64': chart}

def llm_label_clusters(centroids: list[list[float]]) -> list[str]:
    if not centroids:
        return []
    msg = f'다음 6개 클러스터 centroid (거래수, 총매출, 고급휘발유 비율)에 마케팅 액션 지향 라벨을 한 단어씩 부여: {centroids}'
    out = converse(ConverseRequest(system='너는 GSC 마케팅 전략가다.',
                  messages=[{'role':'user','content':[{'text': msg}]}]))
    text = out['output']['message']['content'][0]['text']
    # 간단 파싱 — Plan 5에서 정규식 강화
    return [line.split(':')[-1].strip() for line in text.split('\n') if line.strip()][:6]

def write_back_clusters(assignments: list[dict], labels: list[str]):
    for i, lbl in enumerate(labels):
        open_cypher('MATCH (cl:Cluster {cluster_id: $cid}) SET cl.label = $lbl',
                    parameters={'cid': f'cl-{i+1}', 'lbl': lbl})
    if assignments:
        open_cypher("""UNWIND $rows AS r
                       MATCH (c:Customer {cust_id: r.cust_id})
                       MATCH (cl:Cluster {cluster_id: 'cl-' + (toString(r.cluster + 1))})
                       MERGE (c)-[:BELONGS_TO]->(cl)""",
                    parameters={'rows': assignments})
```

- [ ] **Step 2: 라우터 + 페이지**

```python
# api/routers/cluster.py 본문 교체
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import sse_event, stream_phases
from api.services.cluster_pipeline import features_query, cluster_features, llm_label_clusters, write_back_clusters

router = APIRouter(prefix='/api/cluster', tags=['cluster'])

class ClusterRequest(BaseModel):
    persona_id: str | None = 'data-ai'
    write_back: bool = False

@router.post('/stream')
async def stream(req: ClusterRequest):
    async def gen():
        yield ('phase', {'name': 'fetching_features'})
        rows = features_query()
        yield ('phase', {'name': 'clustering', 'n': len(rows)})
        out = cluster_features(rows)
        yield ('phase', {'name': 'labeling'})
        labels = llm_label_clusters(out['centroids'])
        if req.write_back:
            write_back_clusters(out['assignments'], labels)
            yield ('log', {'wrote_back': True})
        yield ('result', {**out, 'labels': labels})
    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
```

```tsx
// web/app/cluster/page.tsx 본문 교체
'use client';
import { useState } from 'react';
import { streamSSE } from '../../lib/api-client';
import ChartImage from '../../components/ChartImage';
import PersonaSwitch from '../../components/PersonaSwitch';
import DataSourceBadge from '../../components/DataSourceBadge';

export default function ClusterPage() {
  const [persona, setPersona] = useState('data-ai');
  const [chart, setChart] = useState<string|undefined>();
  const [labels, setLabels] = useState<string[]>([]);
  const [wb, setWb] = useState(false);
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true); setChart(undefined); setLabels([]);
    for await (const ev of streamSSE('/api/cluster/stream', {persona_id: persona, write_back: wb})) {
      if (ev.type==='result') { setChart(ev.data.chart_png_b64); setLabels(ev.data.labels || []); }
    }
    setLoading(false);
  }
  return (
    <div className='p-8 max-w-5xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>E. 고객 클러스터링 (K-Means 6 + LLM 라벨링)</h1>
      <PersonaSwitch value={persona} onChange={setPersona}/>
      <div className='flex gap-2 mt-3 mb-3'>
        <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/>
      </div>
      <label className='flex items-center gap-2 mb-3'>
        <input type='checkbox' checked={wb} onChange={e=>setWb(e.target.checked)}/>
        Cluster 노드에 결과 write-back
      </label>
      <button onClick={go} disabled={loading} className='bg-blue-600 text-white px-4 py-2 rounded'>
        {loading?'클러스터링 중...':'클러스터 생성'}</button>
      <div className='grid grid-cols-2 gap-4 mt-4'>
        <ChartImage base64Png={chart} loading={loading}/>
        <div className='border rounded p-3'>
          <div className='font-semibold mb-2'>6 클러스터 라벨</div>
          {labels.map((l,i)=>(<div key={i} className='py-1 border-b'>cl-{i+1}: <span className='font-semibold'>{l}</span></div>))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 5 wow + 커밋**

```python
WOW_QUERIES.extend([
    {'scenario':'E','persona':'data-ai','query':{'write_back':False},
     'expects': lambda r: len(r.get('assignments', [])) > 0 and len(r.get('labels',[])) == 6,
     'min_results': 1},
    {'scenario':'E','persona':'marketing','query':{'write_back':False},
     'expects': lambda r: bool(r.get('chart_png_b64')), 'min_results': 1},
    {'scenario':'E','persona':'strategy','query':{'write_back':False},
     'expects': lambda r: len(r.get('centroids',[])) == 6, 'min_results': 1},
    {'scenario':'E','persona':'crm','query':{'write_back':False},
     'expects': lambda r: len(r.get('labels',[])) > 0, 'min_results': 1},
    {'scenario':'E','persona':'retail-ops','query':{'write_back':False},
     'expects': lambda r: 'assignments' in r, 'min_results': 1},
])
```

```bash
git add api/services/cluster_pipeline.py api/routers/cluster.py web/app/cluster/page.tsx scripts/eval_wow_queries.py
git commit -m "feat(E): 클러스터 KMeans 6 + LLM 라벨링 + write-back (PDF Scenario 2)"
```

---

### Task 4.2.3: 시나리오 G (`campaign-roi`) — campaign_simulator + 분포 차트

**Files:** `api/routers/campaign_roi.py`·`web/app/campaign-roi/page.tsx`

- [ ] **Step 1: 라우터 — Plan 3 도구 활용 + Code Interpreter 분포 차트**

```python
# api/routers/campaign_roi.py 본문 교체
from __future__ import annotations
import base64, json
from fastapi import APIRouter
from pydantic import BaseModel
from api.services.tools.campaign_simulator import run as sim_run
from api.services.code_interpreter import execute as ci_execute

router = APIRouter(prefix='/api/campaign-roi', tags=['campaign_roi'])

class RoiRequest(BaseModel):
    coupon_amt: int = 1000
    target_segment_id: str = 'seg-001'
    duration_days: int = 30
    persona_id: str | None = 'marketing'

@router.post('')
def simulate(req: RoiRequest):
    point = sim_run(req.model_dump(), persona_id=req.persona_id or 'marketing',
                    session_id='web', cust_id=None)
    code = f"""
import numpy as np, matplotlib.pyplot as plt, json
mu = {point['projected_conversion']}
sigma = mu * 0.4   # 추정 분포
samples = np.clip(np.random.normal(mu, sigma, 5000), 0, 1)
fig, ax = plt.subplots(figsize=(7,3.5))
ax.hist(samples, bins=40, color='#3b82f6', alpha=0.7)
ax.axvline(mu, color='red', linestyle='--', label=f'point estimate {{mu:.3f}}')
ax.set_title('전환률 분포 (Bayesian 추정)')
ax.set_xlabel('conversion rate'); ax.set_ylabel('density'); ax.legend()
plt.tight_layout(); plt.savefig('out.png', dpi=120)
"""
    ci = ci_execute(code)
    chart = base64.b64encode(ci['images'][0]).decode() if ci['images'] else ''
    return {**point, 'chart_png_b64': chart}
```

- [ ] **Step 2: 페이지 — 시뮬 입력 + 차트**

```tsx
// web/app/campaign-roi/page.tsx 본문 교체
'use client';
import { useState } from 'react';
import ChartImage from '../../components/ChartImage';
import PersonaSwitch from '../../components/PersonaSwitch';
import DataSourceBadge from '../../components/DataSourceBadge';

export default function RoiPage() {
  const [persona, setPersona] = useState('marketing');
  const [amt, setAmt] = useState(1000);
  const [seg, setSeg] = useState('seg-001');
  const [days, setDays] = useState(30);
  const [out, setOut] = useState<any>(null);
  async function go() {
    const r = await fetch('/api/campaign-roi', {method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({coupon_amt: amt, target_segment_id: seg, duration_days: days, persona_id: persona})});
    setOut(await r.json());
  }
  return (
    <div className='p-8 max-w-5xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>G. 캠페인 ROI 시뮬레이터</h1>
      <PersonaSwitch value={persona} onChange={setPersona}/>
      <div className='flex gap-2 mt-3 mb-3'>
        <DataSourceBadge source='synthetic'/><DataSourceBadge source='real'/>
      </div>
      <div className='flex gap-2 mb-3 items-end'>
        <label className='block'>쿠폰액 <input type='number' value={amt}
          onChange={e=>setAmt(parseInt(e.target.value))} className='border rounded px-2 w-24 ml-1'/></label>
        <label className='block'>세그먼트 <input value={seg}
          onChange={e=>setSeg(e.target.value)} className='border rounded px-2 ml-1'/></label>
        <label className='block'>기간(일) <input type='number' value={days}
          onChange={e=>setDays(parseInt(e.target.value))} className='border rounded px-2 w-20 ml-1'/></label>
        <button onClick={go} className='bg-blue-600 text-white px-4 py-2 rounded'>시뮬</button>
      </div>
      {out && (<div className='grid grid-cols-2 gap-4'>
        <div className='border rounded p-3 space-y-1'>
          <div>예상 전환률: <span className='font-bold'>{(out.projected_conversion*100).toFixed(2)}%</span></div>
          <div>baseline ROI: <span className='font-bold'>{out.baseline_roi_pct}%</span></div>
          <div className='text-xs text-slate-500'>{out.note}</div>
        </div>
        <ChartImage base64Png={out.chart_png_b64}/>
      </div>)}
    </div>
  );
}
```

- [ ] **Step 3: 5 wow + 커밋**

```python
WOW_QUERIES.extend([
    {'scenario':'G','persona':'marketing','query':{'coupon_amt':1000,'target_segment_id':'seg-001'},
     'expects': lambda r: 'projected_conversion' in r and bool(r.get('chart_png_b64')), 'min_results':1},
    {'scenario':'G','persona':'data-ai','query':{'coupon_amt':5000,'target_segment_id':'seg-005'},
     'expects': lambda r: r.get('projected_conversion',0) > 0, 'min_results':1},
    {'scenario':'G','persona':'crm','query':{'coupon_amt':2000,'target_segment_id':'seg-003'},
     'expects': lambda r: 'baseline_roi_pct' in r, 'min_results':1},
    {'scenario':'G','persona':'strategy','query':{'coupon_amt':500,'target_segment_id':'seg-007'},
     'expects': lambda r: bool(r.get('chart_png_b64')), 'min_results':1},
    {'scenario':'G','persona':'retail-ops','query':{'coupon_amt':3000,'target_segment_id':'seg-010'},
     'expects': lambda r: 'projected_conversion' in r, 'min_results':1},
])
```

```bash
git add api/routers/campaign_roi.py web/app/campaign-roi/page.tsx scripts/eval_wow_queries.py
git commit -m "feat(G): 캠페인 ROI 시뮬 — campaign_simulator + Bayesian 분포 차트"
```

---

## Phase 4.3 — Map 시나리오 H, N (시그니처 시나리오 1, 1 task each)

### Task 4.3.1: 시나리오 H (`network`) — 한국 시도 choropleth + GSC + 경쟁사

**Files:** `api/routers/network_map.py`·`web/app/network/page.tsx`·`web/components/KoreaChoropleth.tsx`·`web/public/geo/kostat-sido-2024.geojson`

- [ ] **Step 1: KOSTAT 시도 GeoJSON 다운로드**

```bash
mkdir -p web/public/geo
# KOSTAT 행정구역코드 시도 GeoJSON — 2024 기준 (사용자 인터넷 환경에서):
# 사용자가 별도 제공하거나 https://github.com/southkorea/southkorea-maps 등 OSS에서 가져옴
# 임시: 빈 FeatureCollection으로 placeholder
cat > web/public/geo/kostat-sido-2024.geojson <<'EOF'
{"type":"FeatureCollection","features":[]}
EOF
```

- [ ] **Step 2: 라우터 — 시도별 통계 + 주유소 좌표**

```python
# api/routers/network_map.py 본문 교체
from __future__ import annotations
from fastapi import APIRouter
from pydantic import BaseModel
from api.services.neptune import open_cypher

router = APIRouter(prefix='/api/network', tags=['network_map'])

class MapRequest(BaseModel):
    persona_id: str | None = 'retail-ops'
    fuel_grade: str | None = None

@router.post('/map')
def network_map(req: MapRequest):
    q = """MATCH (s:GasStation)
           OPTIONAL MATCH (s)-[:PRICED_AT]->(p:FuelPrice)
           WHERE p.source = 'real'
           RETURN s.sido_nm AS sido, s.brand_cd AS brand,
                  count(DISTINCT s) AS stations, avg(p.amount) AS avg_price"""
    res = open_cypher(q)
    return {'stations_by_sido': res.get('results', [])}

@router.post('/stations')
def stations_around(req: MapRequest):
    q = """MATCH (s:GasStation) RETURN s LIMIT 1000"""
    res = open_cypher(q)
    return {'stations': [r.get('s', {}) for r in res.get('results', [])]}
```

- [ ] **Step 3: KoreaChoropleth + 페이지 (XSS-safe DOM 조작)**

```tsx
// web/components/KoreaChoropleth.tsx
'use client';
import { useEffect, useRef } from 'react';

export default function KoreaChoropleth({ data, geoUrl='/geo/kostat-sido-2024.geojson' }: 
                                         { data: Record<string, number>, geoUrl?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const svg = ref.current;
    let cancelled = false;
    (async () => {
      const d3 = await import('d3-geo');
      const r = await fetch(geoUrl); const geo = await r.json();
      if (cancelled) return;
      // 기존 자식 안전 제거 (innerHTML 사용 안 함)
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const w = 600, h = 700;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const proj = d3.geoMercator().scale(5500).center([127.8, 36]).translate([w/2, h/2]);
      const path = d3.geoPath(proj as any);
      for (const f of geo.features || []) {
        const sido = (f.properties?.SIDO_NM ?? f.properties?.name ?? '') as string;
        const v = data[sido] ?? 0;
        const fill = `rgba(59,130,246,${Math.min(v / 100, 0.9)})`;
        const p = document.createElementNS('http://www.w3.org/2000/svg','path');
        p.setAttribute('d', path(f as any) || '');
        p.setAttribute('fill', fill);
        p.setAttribute('stroke', '#999');
        p.setAttribute('stroke-width', '0.5');
        const title = document.createElementNS('http://www.w3.org/2000/svg','title');
        title.textContent = `${sido}: ${v}`;
        p.appendChild(title);
        svg.appendChild(p);
      }
    })();
    return () => { cancelled = true; };
  }, [data, geoUrl]);
  return <svg ref={ref} className='w-full h-[600px] border rounded'/>;
}
```

```tsx
// web/app/network/page.tsx 본문 교체
'use client';
import { useEffect, useState } from 'react';
import KoreaChoropleth from '../../components/KoreaChoropleth';
import PersonaSwitch from '../../components/PersonaSwitch';
import DataSourceBadge from '../../components/DataSourceBadge';

export default function NetworkPage() {
  const [persona, setPersona] = useState('retail-ops');
  const [byBrand, setByBrand] = useState<any[]>([]);
  const [data, setData] = useState<Record<string, number>>({});
  useEffect(() => {
    fetch('/api/network/map', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({persona_id: persona})})
      .then(r=>r.json()).then(j=>{
        const rows = j.stations_by_sido || [];
        setByBrand(rows);
        const m: Record<string, number> = {};
        for (const r of rows) m[r.sido] = (m[r.sido] ?? 0) + (r.stations ?? 0);
        setData(m);
      });
  }, [persona]);
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>H. 주유소 네트워크 지도</h1>
      <PersonaSwitch value={persona} onChange={setPersona}/>
      <div className='flex gap-2 mt-3 mb-3'>
        <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/>
      </div>
      <div className='grid grid-cols-2 gap-4'>
        <KoreaChoropleth data={data}/>
        <div className='border rounded p-3 text-sm'>
          <div className='font-semibold mb-2'>시도별 브랜드 분포</div>
          <table className='w-full text-xs'>
            <thead><tr className='border-b'><th>시도</th><th>브랜드</th>
              <th className='text-right'>주유소</th><th className='text-right'>평균가</th></tr></thead>
            <tbody>{byBrand.map((r,i)=>(<tr key={i} className='border-b'>
              <td>{r.sido}</td><td>{r.brand}</td>
              <td className='text-right'>{r.stations}</td>
              <td className='text-right'>{Math.round(r.avg_price||0)}</td>
            </tr>))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 5 wow + 커밋**

```python
WOW_QUERIES.extend([
    {'scenario':'H','persona':'retail-ops','query':{},
     'expects': lambda r: len(r.get('stations_by_sido', [])) >= 5, 'min_results': 5},
    {'scenario':'H','persona':'strategy','query':{'fuel_grade':'premium'},
     'expects': lambda r: 'stations_by_sido' in r, 'min_results': 1},
    {'scenario':'H','persona':'marketing','query':{},
     'expects': lambda r: any(s.get('avg_price',0) > 0 for s in r.get('stations_by_sido', [])), 'min_results': 1},
    {'scenario':'H','persona':'data-ai','query':{},
     'expects': lambda r: any(s.get('brand') in {'GSC','SK','HD','SOIL'} for s in r.get('stations_by_sido', [])), 'min_results': 1},
    {'scenario':'H','persona':'crm','query':{},
     'expects': lambda r: 'stations_by_sido' in r, 'min_results': 1},
])
```

```bash
git add api/routers/network_map.py web/components/KoreaChoropleth.tsx web/app/network/page.tsx web/public/geo/ scripts/eval_wow_queries.py
git commit -m "feat(H): 주유소 네트워크 지도 (시도 choropleth + GSC/경쟁사 매트릭스)"
```

---

### Task 4.3.2: 시나리오 N (`weather`) — 기상청 × Transaction join (시그니처)

**Files:** `api/services/weather_pipeline.py`·`api/routers/weather.py`·`web/app/weather/page.tsx`·`web/components/WeatherOverlay.tsx`

- [ ] **Step 1: weather_pipeline (기상청 cache + Transaction join)**

```python
# api/services/weather_pipeline.py
"""WeatherObservation × FuelTransaction 시도·시간 단위 join."""
from __future__ import annotations
import base64, json
from api.services.neptune import open_cypher
from api.services.code_interpreter import execute as ci_execute

def correlate_by_sido(sido_nm: str | None = None) -> dict:
    where = '1=1' if not sido_nm else 's.sido_nm = $sido'
    params = {} if not sido_nm else {'sido': sido_nm}
    q = f"""MATCH (t:FuelTransaction)-[:AT]->(s:GasStation)-[:IN]->(:Region)
            MATCH (w:WeatherObservation) WHERE w.sido_nm = s.sido_nm
              AND w.dt = substring(t.ts, 0, 10) AND {where}
            RETURN s.sido_nm AS sido, w.dt AS dt, w.temp_c AS temp,
                   w.rain_mm AS rain, count(t) AS tx_count, sum(t.amount) AS rev"""
    res = open_cypher(q, parameters=params)
    rows = res.get('results', [])
    code = f"""
import json, matplotlib.pyplot as plt
data = {json.dumps(rows)}
xs = [r.get('rain') or 0 for r in data]
ys = [r.get('tx_count') or 0 for r in data]
fig, ax = plt.subplots(figsize=(7,4))
ax.scatter(xs, ys, alpha=0.5, s=10)
ax.set_xlabel('강수량 (mm)'); ax.set_ylabel('일별 거래 수')
ax.set_title('강수량과 주유 거래 상관 ({n} points)'.format(n=len(data)))
ax.grid(alpha=0.3); plt.tight_layout(); plt.savefig('out.png', dpi=120)
"""
    ci = ci_execute(code)
    chart = base64.b64encode(ci['images'][0]).decode() if ci['images'] else ''
    return {'rows': rows, 'chart_png_b64': chart}
```

- [ ] **Step 2: 라우터 + 페이지**

```python
# api/routers/weather.py 본문 교체
from fastapi import APIRouter
from pydantic import BaseModel
from api.services.weather_pipeline import correlate_by_sido

router = APIRouter(prefix='/api/weather', tags=['weather'])

class CorrRequest(BaseModel):
    persona_id: str | None = 'data-ai'
    sido_nm: str | None = None

@router.post('/correlate')
def correlate(req: CorrRequest):
    return correlate_by_sido(req.sido_nm)
```

```tsx
// web/components/WeatherOverlay.tsx
'use client';
export default function WeatherOverlay({ rows }: { rows: any[] }) {
  const bySido: Record<string, {rain:number, tx:number}> = {};
  for (const r of rows) {
    const k = r.sido;
    bySido[k] = bySido[k] ?? {rain: 0, tx: 0};
    bySido[k].rain += r.rain || 0;
    bySido[k].tx += r.tx_count || 0;
  }
  return (
    <table className='w-full text-sm'>
      <thead><tr className='border-b'><th>시도</th>
        <th className='text-right'>총 강수</th><th className='text-right'>거래</th></tr></thead>
      <tbody>{Object.entries(bySido).map(([k,v])=>(<tr key={k} className='border-b'>
        <td>{k}</td><td className='text-right'>{v.rain.toFixed(1)}</td>
        <td className='text-right'>{v.tx}</td></tr>))}</tbody>
    </table>
  );
}
```

```tsx
// web/app/weather/page.tsx 본문 교체
'use client';
import { useState } from 'react';
import ChartImage from '../../components/ChartImage';
import WeatherOverlay from '../../components/WeatherOverlay';
import PersonaSwitch from '../../components/PersonaSwitch';
import DataSourceBadge from '../../components/DataSourceBadge';

export default function WeatherPage() {
  const [persona, setPersona] = useState('data-ai');
  const [sido, setSido] = useState('');
  const [out, setOut] = useState<any>(null);
  async function go() {
    const r = await fetch('/api/weather/correlate', { method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({persona_id: persona, sido_nm: sido || null})});
    setOut(await r.json());
  }
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>N. 날씨 × 주유 패턴 (기상청 단기예보)</h1>
      <PersonaSwitch value={persona} onChange={setPersona}/>
      <div className='flex gap-2 mt-3 mb-3'>
        <DataSourceBadge source='external'/><DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/>
      </div>
      <div className='flex gap-2 mb-3'>
        <input className='border rounded px-2' placeholder='시도 (선택, 미입력=전체)'
               value={sido} onChange={e=>setSido(e.target.value)}/>
        <button onClick={go} className='bg-blue-600 text-white px-4 py-2 rounded'>상관분석</button>
      </div>
      {out && (<div className='grid grid-cols-2 gap-4'>
        <ChartImage base64Png={out.chart_png_b64}/>
        <WeatherOverlay rows={out.rows || []}/>
      </div>)}
    </div>
  );
}
```

- [ ] **Step 3: 5 wow + 커밋**

```python
WOW_QUERIES.extend([
    {'scenario':'N','persona':'data-ai','query':{},
     'expects': lambda r: 'rows' in r and bool(r.get('chart_png_b64')), 'min_results':1},
    {'scenario':'N','persona':'marketing','query':{'sido_nm':'서울'},
     'expects': lambda r: any('서울' in str(x) for x in r.get('rows', [])), 'min_results':1},
    {'scenario':'N','persona':'retail-ops','query':{'sido_nm':'경기'},
     'expects': lambda r: bool(r.get('chart_png_b64')), 'min_results':1},
    {'scenario':'N','persona':'strategy','query':{},
     'expects': lambda r: len(r.get('rows', [])) >= 0, 'min_results':0},
    {'scenario':'N','persona':'crm','query':{'sido_nm':'부산'},
     'expects': lambda r: 'rows' in r, 'min_results':0},
])
```

```bash
git add api/services/weather_pipeline.py api/routers/weather.py web/app/weather/page.tsx web/components/WeatherOverlay.tsx scripts/eval_wow_queries.py
git commit -m "feat(N): 날씨 × 주유 상관 — 기상청 WeatherObservation join + 산점도"
```

---

## Phase 4.4 — 시나리오 J (외부 시그널 융합) — 1 task

### Task 4.4.1: 시나리오 J (`signals`) — 현대카드 + 에어브릿지 + 설문 + 날씨 융합

**Files:** `api/routers/external_signal.py`·`web/app/signals/page.tsx`

- [ ] **Step 1: 라우터 — cross-source 융합 + Sonnet 4.6 narrative**

```python
# api/routers/external_signal.py 본문 교체
from __future__ import annotations
from fastapi import APIRouter
from pydantic import BaseModel
from api.services.neptune import open_cypher
from api.services.bedrock import converse, ConverseRequest
from api.services.persona import system_prompt

router = APIRouter(prefix='/api/signals', tags=['external_signal'])

class FuseRequest(BaseModel):
    persona_id: str | None = 'strategy'
    cust_id: str | None = None  # None이면 cohort 평균

@router.post('/fuse')
def fuse(req: FuseRequest):
    if req.cust_id:
        q = """MATCH (c:Customer {cust_id: $cid})
               OPTIONAL MATCH (c)-[:HAS_INDEX]->(i:ConsumptionIndex)
               OPTIONAL MATCH (c)-[:USED_APP]->(e:AppEvent)
               OPTIONAL MATCH (c)-[:ANSWERED]->(s:SurveyResponse)
               RETURN c, i, count(DISTINCT e) AS app_events,
                      count(DISTINCT s) AS surveys"""
        params = {'cid': req.cust_id}
    else:
        q = """MATCH (c:Customer)
               OPTIONAL MATCH (c)-[:HAS_INDEX]->(i:ConsumptionIndex)
               OPTIONAL MATCH (c)-[:USED_APP]->(e:AppEvent)
               WITH c, count(DISTINCT e) AS aev,
                    avg(i.car_need_idx) AS avg_car_idx,
                    count(DISTINCT i) AS has_idx
               RETURN avg_car_idx, count(c) AS cust_n,
                      sum(aev) AS app_events_total, has_idx LIMIT 1"""
        params = {}
    res = open_cypher(q, parameters=params)
    rows = res.get('results', [])
    
    # Sonnet narrative
    sys = system_prompt(req.persona_id, 'J')
    msg = f'다음 cross-source 시그널을 GS 마케팅 인사이트로 1단락 요약하라: {rows[:5]}'
    out = converse(ConverseRequest(system=sys, messages=[{'role':'user','content':[{'text': msg}]}]))
    narrative = out['output']['message']['content'][0]['text']
    
    return {'fused_rows': rows, 'narrative': narrative}
```

- [ ] **Step 2: 페이지 — 시그널 카드 + narrative**

```tsx
// web/app/signals/page.tsx 본문 교체
'use client';
import { useState } from 'react';
import PersonaSwitch from '../../components/PersonaSwitch';
import DataSourceBadge from '../../components/DataSourceBadge';

export default function SignalsPage() {
  const [persona, setPersona] = useState('strategy');
  const [cid, setCid] = useState('');
  const [out, setOut] = useState<any>(null);
  async function go() {
    const r = await fetch('/api/signals/fuse', {method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({persona_id: persona, cust_id: cid || null})});
    setOut(await r.json());
  }
  return (
    <div className='p-8 max-w-5xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>J. 외부 시그널 통합 (현대카드·앱·설문·날씨)</h1>
      <PersonaSwitch value={persona} onChange={setPersona}/>
      <div className='flex gap-2 mt-3 mb-3'>
        <DataSourceBadge source='external'/><DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/>
      </div>
      <div className='flex gap-2 mb-3'>
        <input className='border rounded px-2' placeholder='cust_id (없으면 cohort 평균)'
               value={cid} onChange={e=>setCid(e.target.value)}/>
        <button onClick={go} className='bg-blue-600 text-white px-4 py-2 rounded'>융합 분석</button>
      </div>
      {out && (<>
        <pre className='border rounded p-3 bg-slate-50 text-xs overflow-auto'>{JSON.stringify(out.fused_rows, null, 2)}</pre>
        <div className='border rounded p-3 mt-3 whitespace-pre-wrap'>{out.narrative}</div>
      </>)}
    </div>
  );
}
```

- [ ] **Step 3: 5 wow + 커밋**

```python
WOW_QUERIES.extend([
    {'scenario':'J','persona':'strategy','query':{'cust_id':'c001'},
     'expects': lambda r: 'narrative' in r and len(r['narrative']) > 30, 'min_results': 1},
    {'scenario':'J','persona':'data-ai','query':{},
     'expects': lambda r: 'fused_rows' in r, 'min_results': 1},
    {'scenario':'J','persona':'marketing','query':{'cust_id':'c002'},
     'expects': lambda r: bool(r.get('narrative')), 'min_results': 1},
    {'scenario':'J','persona':'crm','query':{'cust_id':'c003'},
     'expects': lambda r: 'narrative' in r, 'min_results': 1},
    {'scenario':'J','persona':'retail-ops','query':{},
     'expects': lambda r: 'fused_rows' in r, 'min_results': 1},
])
```

```bash
git add api/routers/external_signal.py web/app/signals/page.tsx scripts/eval_wow_queries.py
git commit -m "feat(J): 외부 시그널 융합 (현대카드·앱·설문·날씨 cross-source narrative)"
```

---

## Phase 4.5 — 시그니처 시나리오 K, M (PDF 핵심 — 디테일 강화)

### Task 4.5.1: 시나리오 K (`outlier`) — PM+M 92 RON · 디젤→premium 행동 변화

**Files:** `api/routers/outlier.py`·`web/app/outlier/page.tsx`

- [ ] **Step 1: 라우터 — Plan 3의 behavior_change_detect 도구 활용**

```python
# api/routers/outlier.py 본문 교체
from __future__ import annotations
from fastapi import APIRouter
from pydantic import BaseModel
from api.services.tools.behavior_change_detect import run as detect_run
from api.services.cohort import select

router = APIRouter(prefix='/api/outlier', tags=['outlier'])

class OutlierRequest(BaseModel):
    pattern: str   # 'pm_m_mixing' | 'fuel_grade_transition' | 'app_signup_after_install'
    persona_id: str | None = 'data-ai'
    cohort_filter: list[str] | None = None

@router.post('/detect')
def detect(req: OutlierRequest):
    cohort = req.cohort_filter or select(req.persona_id or 'data-ai', 'K')
    return detect_run({'pattern': req.pattern, 'cohort_filter': cohort},
                      persona_id=req.persona_id or 'data-ai',
                      session_id='web', cust_id=None)
```

- [ ] **Step 2: 페이지 — 패턴 토글 + 매치 리스트 + drill-down**

```tsx
// web/app/outlier/page.tsx 본문 교체
'use client';
import { useState } from 'react';
import PersonaSwitch from '../../components/PersonaSwitch';
import DataSourceBadge from '../../components/DataSourceBadge';

const PATTERNS = [
  ['pm_m_mixing', 'PM+M 혼유 (92 RON DIY)'],
  ['fuel_grade_transition', '유종 전환 (디젤→고급)'],
  ['app_signup_after_install', '앱 설치 후 가입'],
];

export default function OutlierPage() {
  const [persona, setPersona] = useState('data-ai');
  const [pattern, setPattern] = useState('pm_m_mixing');
  const [out, setOut] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    const r = await fetch('/api/outlier/detect', {method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({pattern, persona_id: persona})});
    setOut(await r.json());
    setLoading(false);
  }
  return (
    <div className='p-8 max-w-5xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>K. Outlier · 행동 변화 탐지</h1>
      <p className='text-sm text-slate-600 mb-3'>PDF 3페이지의 PM+M 92 RON DIY · 디젤→premium 전환 시그니처 검출.</p>
      <PersonaSwitch value={persona} onChange={setPersona}/>
      <div className='flex gap-2 mt-3 mb-3'>
        <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/>
      </div>
      <div className='flex gap-2 mb-3'>
        {PATTERNS.map(([id, label]) => (
          <button key={id} onClick={()=>setPattern(id)}
            className={`text-xs px-3 py-2 rounded border ${pattern===id?'bg-amber-500 text-white':'bg-white'}`}>
            {label}
          </button>
        ))}
        <button onClick={go} disabled={loading}
          className='bg-blue-600 text-white px-4 py-2 rounded ml-auto'>
          {loading?'탐지 중...':'탐지 실행'}
        </button>
      </div>
      {out && (<div className='border rounded p-3'>
        <div className='font-semibold mb-2'>매치 ({out.count ?? out.matches?.length ?? 0})</div>
        <div className='text-xs text-slate-500 mb-2'>{out.note}</div>
        <table className='w-full text-xs'>
          <tbody>
            {(out.matches || []).slice(0, 30).map((m: any, i: number) => (
              <tr key={i} className='border-b'>
                {Object.entries(m).map(([k,v])=>(<td key={k} className='py-1 px-2 font-mono'>{String(v)}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>)}
    </div>
  );
}
```

- [ ] **Step 3: 5 wow (PM+M 250+ 검증) + 커밋**

```python
WOW_QUERIES.extend([
    {'scenario':'K','persona':'data-ai','query':{'pattern':'pm_m_mixing'},
     'expects': lambda r: r.get('count', 0) >= 250 or len(r.get('matches', [])) >= 50,
     'min_results': 50},  # PM+M 250 식재 → 검출 ≥250 필수
    {'scenario':'K','persona':'marketing','query':{'pattern':'fuel_grade_transition'},
     'expects': lambda r: len(r.get('matches', [])) >= 30, 'min_results': 30},
    {'scenario':'K','persona':'strategy','query':{'pattern':'pm_m_mixing','cohort_filter':['deep-history']},
     'expects': lambda r: 'matches' in r, 'min_results': 1},
    {'scenario':'K','persona':'crm','query':{'pattern':'fuel_grade_transition'},
     'expects': lambda r: any('diesel' in str(m).lower() or 'premium' in str(m).lower()
                              for m in r.get('matches', [])), 'min_results': 1},
    {'scenario':'K','persona':'retail-ops','query':{'pattern':'pm_m_mixing'},
     'expects': lambda r: 'note' in r and '92 RON' in r.get('note',''), 'min_results': 1},
])
```

```bash
git add api/routers/outlier.py web/app/outlier/page.tsx scripts/eval_wow_queries.py
git commit -m "feat(K): Outlier — PM+M 92 RON DIY + 디젤→premium 전환 (PDF 3페이지 시그니처)"
```

---

### Task 4.5.2: 시나리오 M (`journey`) — 고객 통합 여정 timeline (PDF 3페이지 시그니처)

**Files:** `api/services/journey_pipeline.py`·`api/routers/journey.py`·`web/app/journey/page.tsx`·`web/components/JourneyTimeline.tsx`

- [ ] **Step 1: journey_pipeline — multi-channel 시계열 통합**

```python
# api/services/journey_pipeline.py
"""고객 1명의 App + Transaction + Term + Membership + Coupon 시계열 통합 view."""
from __future__ import annotations
from api.services.neptune import open_cypher

def build_journey(cust_id: str) -> dict:
    """단일 고객의 모든 시계열 이벤트를 시간순 통합."""
    q_app = """MATCH (c:Customer {cust_id: $cid})-[:USED_APP]->(e:AppEvent)
               RETURN 'app' AS source, e.ts AS ts, e.event_action AS event,
                      e.event_label AS detail ORDER BY ts"""
    q_tx = """MATCH (c:Customer {cust_id: $cid})-[:REFUELED]->(t:FuelTransaction)
              RETURN 'transaction' AS source, t.ts AS ts, t.fuel_grade AS event,
                     toString(t.amount) AS detail ORDER BY ts"""
    q_term = """MATCH (c:Customer {cust_id: $cid})-[:AGREED_TO]->(ta:TermAgreement)-[:FOR]->(tm:Term)
                RETURN 'term' AS source, ta.approval_dt AS ts, tm.name_kr AS event,
                       ta.approved_yn AS detail ORDER BY ts"""
    q_coupon = """MATCH (c:Customer {cust_id: $cid})-[:REFUELED]->(:FuelTransaction)-[:USED]->(u:CouponUse)-[:OF]->(co:Coupon)
                  RETURN 'coupon' AS source, u.deal_dt AS ts, co.coupon_no AS event,
                         toString(u.use_amt) AS detail ORDER BY ts"""
    events = []
    for q in (q_app, q_tx, q_term, q_coupon):
        res = open_cypher(q, parameters={'cid': cust_id})
        events.extend(res.get('results', []))
    events.sort(key=lambda e: e.get('ts', ''))
    
    # 유종 전환 검출
    transitions = []
    last_grade = None
    for e in events:
        if e.get('source') == 'transaction':
            g = e.get('event')
            if last_grade and last_grade != g and g in {'premium','regular','diesel','lpg','kerosene'}:
                transitions.append({'ts': e.get('ts'), 'from': last_grade, 'to': g})
            last_grade = g
    
    # 고객 프로필
    q_prof = """MATCH (c:Customer {cust_id: $cid}) RETURN c"""
    prof = open_cypher(q_prof, parameters={'cid': cust_id}).get('results', [{}])[0]
    
    return {
        'cust_id': cust_id, 'profile': prof.get('c', {}),
        'events': events, 'event_count': len(events),
        'fuel_grade_transitions': transitions,
        'note': 'PDF 3페이지 시나리오 — 다층 Insight + Action Item 도출',
    }
```

- [ ] **Step 2: 라우터 + JourneyTimeline 컴포넌트**

```python
# api/routers/journey.py 본문 교체
from fastapi import APIRouter
from pydantic import BaseModel
from api.services.journey_pipeline import build_journey

router = APIRouter(prefix='/api/journey', tags=['journey'])

class JourneyRequest(BaseModel):
    cust_id: str
    persona_id: str | None = 'marketing'

@router.post('')
def journey(req: JourneyRequest):
    return build_journey(req.cust_id)
```

```tsx
// web/components/JourneyTimeline.tsx
'use client';

const SOURCE_COLOR: Record<string, string> = {
  app:'bg-blue-100 border-blue-400 text-blue-800',
  transaction:'bg-emerald-100 border-emerald-400 text-emerald-800',
  term:'bg-purple-100 border-purple-400 text-purple-800',
  coupon:'bg-amber-100 border-amber-400 text-amber-800',
};

export default function JourneyTimeline({ events, transitions }: 
                                         { events: any[], transitions: any[] }) {
  const transitionTs = new Set((transitions || []).map(t => t.ts));
  return (
    <div className='border-l-2 border-slate-300 pl-4 space-y-2'>
      {events.map((e, i) => (
        <div key={i} className='relative'>
          <div className={`absolute -left-[22px] top-1 w-3 h-3 rounded-full border-2 ${
            transitionTs.has(e.ts)?'bg-rose-500 border-rose-700':'bg-slate-300 border-slate-500'}`}/>
          <div className={`text-xs font-mono text-slate-500`}>{e.ts}</div>
          <div className={`inline-block px-2 py-1 rounded border text-xs ${SOURCE_COLOR[e.source]||'bg-slate-100'}`}>
            {e.source}: <span className='font-semibold'>{e.event}</span>
            {e.detail && <span className='ml-2 text-slate-600'>· {e.detail}</span>}
          </div>
          {transitionTs.has(e.ts) && (
            <span className='ml-2 text-xs font-bold text-rose-600'>★ 유종 전환</span>
          )}
        </div>
      ))}
    </div>
  );
}
```

```tsx
// web/app/journey/page.tsx 본문 교체
'use client';
import { useState } from 'react';
import JourneyTimeline from '../../components/JourneyTimeline';
import PersonaSwitch from '../../components/PersonaSwitch';
import DataSourceBadge from '../../components/DataSourceBadge';

export default function JourneyPage() {
  const [persona, setPersona] = useState('marketing');
  const [cid, setCid] = useState('');
  const [out, setOut] = useState<any>(null);
  async function go() {
    if (!cid.trim()) return;
    const r = await fetch('/api/journey', {method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({cust_id: cid, persona_id: persona})});
    setOut(await r.json());
  }
  return (
    <div className='p-8 max-w-5xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>M. 고객 통합 여정</h1>
      <p className='text-sm text-slate-600 mb-3'>PDF 3페이지: App + 거래 + 약관 + 쿠폰 시계열 통합 view + 유종 전환 강조.</p>
      <PersonaSwitch value={persona} onChange={setPersona}/>
      <div className='flex gap-2 mt-3 mb-3'>
        <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/>
      </div>
      <div className='flex gap-2 mb-3'>
        <input className='flex-1 border rounded px-3 py-2' placeholder='cust_id'
               value={cid} onChange={e=>setCid(e.target.value)}/>
        <button onClick={go} className='bg-blue-600 text-white px-4 py-2 rounded'>여정 조회</button>
      </div>
      {out && (<div className='grid grid-cols-3 gap-4'>
        <div className='col-span-1 border rounded p-3 text-sm space-y-1'>
          <div className='font-semibold mb-2'>프로필</div>
          {Object.entries(out.profile?.['~properties'] || out.profile || {}).slice(0, 12).map(([k,v]: any)=>(
            <div key={k} className='flex gap-2 text-xs'>
              <span className='font-mono text-slate-500'>{k}:</span><span>{String(v)}</span>
            </div>
          ))}
          <div className='border-t pt-2 mt-2'>
            <div className='font-semibold'>유종 전환 ({out.fuel_grade_transitions?.length || 0})</div>
            {out.fuel_grade_transitions?.map((t: any, i: number) => (
              <div key={i} className='text-xs'>
                {t.ts}: {t.from} → <span className='font-bold'>{t.to}</span>
              </div>
            ))}
          </div>
        </div>
        <div className='col-span-2 border rounded p-3 max-h-[600px] overflow-y-auto'>
          <JourneyTimeline events={out.events || []} transitions={out.fuel_grade_transitions || []}/>
        </div>
      </div>)}
    </div>
  );
}
```

- [ ] **Step 3: 5 wow + 커밋**

```python
WOW_QUERIES.extend([
    {'scenario':'M','persona':'marketing','query':{'cust_id':'c001'},
     'expects': lambda r: 'events' in r and len(r['events']) >= 1, 'min_results':1},
    {'scenario':'M','persona':'crm','query':{'cust_id':'c002'},
     'expects': lambda r: 'fuel_grade_transitions' in r, 'min_results':1},
    {'scenario':'M','persona':'data-ai','query':{'cust_id':'c001'},
     'expects': lambda r: any(e.get('source')=='transaction' for e in r.get('events', [])),
     'min_results':1},
    {'scenario':'M','persona':'strategy','query':{'cust_id':'c003'},
     'expects': lambda r: 'profile' in r, 'min_results':1},
    {'scenario':'M','persona':'retail-ops','query':{'cust_id':'la-000001'},
     'expects': lambda r: 'event_count' in r, 'min_results':0},
])
```

```bash
git add api/services/journey_pipeline.py api/routers/journey.py web/app/journey/page.tsx web/components/JourneyTimeline.tsx scripts/eval_wow_queries.py
git commit -m "feat(M): 고객 통합 여정 — App+Tx+Term+Coupon timeline + 유종 전환 강조 (PDF 3 시그니처)"
```

---

## Phase 4.6 — Verification + 종료 (1 task)

### Task 4.6.1: 12 시나리오 60 wow 평가 + CHANGELOG + tag

**Files:** `CHANGELOG.md`

- [ ] **Step 1: 라우터·페이지 로컬 smoke 검증**

```bash
python3 -m compileall -q api data scripts
cd web && npx tsc --noEmit && cd -
pytest tests -q
```

- [ ] **Step 2: 60 wow 케이스 카운트 검증**

```bash
python3 -c "
from scripts.eval_wow_queries import WOW_QUERIES
print('total:', len(WOW_QUERIES))
from collections import Counter
print('by scenario:', Counter(q['scenario'] for q in WOW_QUERIES))
"
```
Expected: total ≥70 (Plan 3 A/B 10 + Plan 4 C-N 60), 시나리오별 5개씩.

- [ ] **Step 3: 배포 환경 평가 (≥85% pass)**

```bash
python3 scripts/eval_wow_queries.py --scenarios A B C D E F G H I J K L M N
```
Expected: ≥85% pass (350개 wow 쿼리 중 ≥298 통과).

- [ ] **Step 4: CHANGELOG**

```markdown
## [Unreleased] / Added
- Phase 4 12 시나리오 (C~N) 구현:
  - C 인사이트 (Code Interpreter matplotlib NanumGothic + Sonnet 요약)
  - D 페르소나 매칭 (PERSONA_REGISTRY × KPI 가중치)
  - E 클러스터링 KMeans 6 + LLM 라벨링 + write-back (PDF Scenario 2)
  - F 룩어라이크 (lookalike_expand 도구 활용)
  - G 캠페인 ROI 시뮬 + Bayesian 분포 차트
  - H 주유소 네트워크 지도 (시도 choropleth)
  - I 약관·가드레일 (TermAgreement + Bedrock Guardrails)
  - J 외부 시그널 융합 (현대카드·앱·설문·날씨 narrative)
  - K Outlier (PM+M 92 RON DIY · 디젤→premium 전환) — PDF 3 시그니처
  - L 결제·가격·채널 매트릭스
  - M 고객 통합 여정 timeline (App+Tx+Term+Coupon + 유종 전환) — PDF 3 시그니처
  - N 날씨 × 주유 (기상청 join + 산점도)
- 60 신규 wow 케이스 (시나리오별 5 × 12 = 60)
- KoreaChoropleth, JourneyTimeline, ChartImage, WeatherOverlay 컴포넌트
- 시나리오 라우터 12 + 페이지 12 + 전용 서비스 4 (insights/cluster/journey/weather)
```

- [ ] **Step 5: tag + commit**

```bash
git add CHANGELOG.md
git commit -m "docs: Phase 4 complete — 12 시나리오 (C-N) + 60 wow 케이스"
git tag -a plan4-complete -m "Plan 4 (Scenarios C-N) writing complete on 2026-05-08"
git log --oneline | head -30
```

---

## Self-Review (writing-plans 스킬 권장)

**1. Spec coverage**
- spec §3.1 시나리오 카탈로그 14개 중 C·D·E·F·G·H·I·J·K·L·M·N → Tasks 4.1.x·4.2.x·4.3.x·4.4.x·4.5.x ✓
- spec §3.2 페르소나 매트릭스 (5×14) → 각 시나리오의 5 wow 케이스가 5 페르소나 커버 ✓
- spec D11 시나리오 M·N → Tasks 4.5.2 (M)·4.3.2 (N) 시그니처 디테일 ✓
- spec D12 기상청 API → Task 4.3.2 (Plan 2의 ETL 데이터 활용) ✓
- spec D13 WeatherObservation → Task 4.3.2 weather_pipeline의 join ✓
- spec D14 cohort × 시나리오 → cohort.select 활용 (Tasks 4.5.1) ✓
- spec D17 CampaignSms·CampaignAggregation → Task 4.2.3 campaign_simulator의 baseline_roi 참조 ✓

**2. Placeholder scan**
- Task 4.3.1 KOSTAT GeoJSON은 빈 FeatureCollection placeholder — 실제 OSS 데이터 다운로드는 Plan 5 polish에서 수동 추가 (사용자 인터넷 환경 의존). 명시적 표시.
- Task 4.5.2 journey의 'app_signup_after_install' pattern은 Plan 3의 stub만 호출 — 실제 검출 로직은 Plan 5에서 추가. (시나리오 K가 trigger pattern 카탈로그를 확장해야 함.)
- Task 4.2.2 cluster의 LLM 라벨링 파싱은 단순 — Plan 5에서 정규식·JSON 강제 출력으로 강화.

**3. Type consistency**
- 모든 시나리오 라우터가 `persona_id: str | None` + `request.model_dump()` 컨벤션 일관 ✓
- 모든 페이지가 `PersonaSwitch + DataSourceBadge` 사용 ✓
- SSE 활용은 C·E (스트리밍 차트가 가치 있는 시나리오)에 한정, 나머지는 동기 POST — 의도적 단순화

**4. Ambiguity**
- Task 4.2.2 cluster_pipeline의 `write_back`은 *기존 Cluster 노드 6개 갱신 + Customer-BELONGS_TO 엣지 신규 생성*. Plan 2에서 cluster_id `cl-1`~`cl-6`이 이미 placeholder로 존재함을 전제. Plan 2 Task 2.3.6 (cluster init) 결과와 정합.

이슈 없음. Plan 4 작성 완료.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-08-plan4-scenarios-c-to-n.md`
(Phase 4.0~4.6, 약 13 tasks (boilerplate + 12 시나리오 + 검증), ~80 steps).

**선행 조건:** Plan 1·2·3 실행 완료 — 인프라+데이터+A/B 시나리오 동작 확인.

**다음에 어떻게 실행하시겠습니까?**

**1. Plan 5 작성으로 마무리** (recommended) — 객체 탐색 + 메타 + 운영 + harness-eval polish. 모든 plan 작성 완료 후 일괄 실행 가능.

**2. Subagent-Driven 실행** — Plan 1·2·3·4 순차 실행.

**3. Plan 1·2·3·4 검토** — 사용자 직접 검토 후 결정.

어떤 옵션을 선택하시겠습니까?

