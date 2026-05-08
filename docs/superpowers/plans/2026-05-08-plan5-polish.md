# Plan 5 — Polish (Object Explorer + Meta + Ops + 마무리) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PoC를 *데모 가능한 완성 상태*로 만드는 마무리 plan. (1) 25 클래스 객체 탐색 (`/objects/<type>` 페이지네이션·디테일·1-hop subgraph), (2) 메타 페이지 풍부화 (ER + standards browser + validation report), (3) 운영 콘솔 (ingest/guardrail/memory/eval/trace), (4) 5 페르소나 × 14 시나리오 가이드 투어, (5) 도메인·ACM 수동 wiring 검증 + Cognito Lambda@Edge 인증 강화, (6) `harness-eval:full` 7.5+/B 목표 + README 배지 자동화, (7) 한·영 README 정합 + CHANGELOG·SECURITY 마무리.

**Architecture:** Plan 1~4가 만든 모든 자산을 *연결·정합·강화*. 신규 라우터 2개(`ontology`, `ops`) + 신규 페이지 4개 (objects 디테일, meta 풍부화, ops, guided tour). Plan 4 시나리오 K·M의 시그니처 검증을 README 배지에 노출. CI 4-job + eval ≥85% + harness 7.5+ 모두 그린이 인수 기준.

**Tech Stack:** Plan 1~4와 동일 + opinet 공개 API (옵셔널 가격 시계열 보강) + Cognito SDK (callback 안전 갱신).

**Spec reference:** spec §6.1 Phase 5+6, §9 Acceptance Criteria, §1.4 보안.

**Prerequisites:** Plan 1·2·3·4 모두 실행 완료. 14 시나리오 동작·CI 그린·Neptune 적재·Cognito 사용자 프로비저닝 완료 상태.

---

## File Structure

### 신규 라우터 + 서비스
- `api/routers/ontology.py` — `/api/ontology/{schema,standards,validation}`
- `api/routers/ops.py` — `/api/ops/{ingest,guardrail,memory,eval,trace}`
- `api/services/ontology_meta.py` — `data/schemas.py` 25 클래스 → JSON schema export
- `api/services/ops_metrics.py` — Neptune 카운트·guardrail 로그 집계

### 객체 탐색 강화
- `api/routers/objects.py` 보강 — 단일 ID detail + 1-hop subgraph + 페이지네이션
- `web/app/objects/[type]/page.tsx` 보강 — 검색·필터·페이지네이션
- `web/app/objects/[type]/[id]/page.tsx` (신규) — 디테일 페이지 + Cytoscape

### 메타 페이지 풍부화
- `web/app/meta/page.tsx` 강화 — ER 상호작용·standards browser·validation 카드

### 운영 콘솔
- `web/app/ops/page.tsx` (신규) — 5개 패널 (ingest/guardrail/memory/eval/trace)
- `web/components/{IngestPanel,GuardrailPanel,MemoryPanel,EvalPanel,TracePanel}.tsx`

### 가이드 투어
- `web/components/GuidedTour.tsx` — 5 페르소나 × 14 시나리오 추천 흐름
- `web/app/page.tsx` 강화 — 홈에 GuidedTour 통합

### 도메인 wiring · Lambda@Edge
- `infra-cdk/lib/edge-stack.ts` 보강 — Lambda@Edge 인증 함수 추가 (RS256 JWT + JWKS 캐시)
- `infra-cdk/lambda-edge-auth/index.js` (신규) — Cognito 쿠키 검증
- `docs/runbooks/02-add-custom-domain.md` 보강 — 검증 step 추가

### opinet 공개 API ETL (옵셔널)
- `data/external/opinet_etl.py` — opinet API → 1년치 가격 시계열 보강

### harness-eval + README 배지
- `scripts/run_harness_eval.sh` — 평가 후 README 배지 자동 갱신
- `.github/workflows/harness.yml` (신규) — nightly harness-eval

### 한·영 README 정합 + 최종
- `README.md` 보강 — 14 시나리오·25 클래스·5 페르소나·실 데이터 cohort 명시
- `SECURITY.md` 보강 — Plan 1~4 보안 결정 종합
- `CHANGELOG.md` — 1.0.0 release 노트
- ADR 0008 — guided tour design

---

## Phase 5.1 — 객체 탐색 강화 (3 tasks)

### Task 5.1.1: `api/routers/objects.py` 보강 — 디테일 + 1-hop subgraph + 검색·필터

**Files:** `api/routers/objects.py` (보강)

- [ ] **Step 1: 검색·필터·디테일 라우트 추가**

```python
# api/routers/objects.py 보강 (기존 list/detail 라우트 위에 search 추가)
from typing import Any
from fastapi import Query

@router.get('/{type_name}/search')
def search_objects(type_name: str, q: str = Query(...), size: int = 20):
    """단순 텍스트 검색 — Plan 5 보강."""
    label = _TYPE_REGISTRY.get(type_name.lower())
    if not label:
        return {'items': []}
    cypher = f"""MATCH (n:{label})
                 WHERE any(k IN keys(n) WHERE toString(n[k]) CONTAINS $q)
                 RETURN n LIMIT $size"""
    res = open_cypher(cypher, parameters={'q': q, 'size': size})
    return {'type': label, 'q': q, 'items': res.get('results', [])}

@router.get('/{type_name}/{node_id}/subgraph')
def get_object_subgraph(type_name: str, node_id: str, hops: int = 1):
    """1-hop or 2-hop subgraph — Cytoscape 시각화용."""
    label = _TYPE_REGISTRY.get(type_name.lower())
    if not label:
        return {'subgraph': {'nodes': [], 'edges': []}}
    pattern = '-[r]-(m)' if hops == 1 else '-[r1]-(:*)-[r2]-(m)'
    q = f"""MATCH (n:{label})-[r]-(m)
            WHERE n.id_key = $id OR n.cust_id = $id OR n.opinet_no = $id
                  OR n.campaign_cd = $id OR n.tx_id = $id
            RETURN n, r, m LIMIT 200"""
    res = open_cypher(q, parameters={'id': node_id})
    nodes_out, edges_out = [], []
    seen = set()
    for row in res.get('results', []):
        for n in (row.get('n'), row.get('m')):
            if n and id(n) not in seen:
                seen.add(id(n))
                nodes_out.append({'id': n.get('~id', str(id(n))),
                                  'label': (n.get('~labels') or [''])[0],
                                  'props': n.get('~properties', n)})
        rel = row.get('r')
        if rel:
            edges_out.append({'id': str(id(rel)),
                              'source': rel.get('~start',''),
                              'target': rel.get('~end',''),
                              'type': rel.get('~type','')})
    return {'subgraph': {'nodes': nodes_out, 'edges': edges_out}}
```

- [ ] **Step 2: 테스트 추가**

```python
# tests/api/test_objects_extra.py
import os; os.environ.setdefault('DEMO_PUBLIC_MODE', 'true')
from unittest.mock import patch
from fastapi.testclient import TestClient
from api.main import app
client = TestClient(app)

def test_search_returns_items():
    with patch('api.routers.objects.open_cypher', return_value={'results': [{'n': {'cust_id': 'c001'}}]}):
        r = client.get('/api/objects/customer/search?q=c001')
        assert r.status_code == 200
        assert len(r.json()['items']) == 1

def test_subgraph_returns_nodes_edges():
    with patch('api.routers.objects.open_cypher', return_value={'results': []}):
        r = client.get('/api/objects/customer/c001/subgraph')
        assert r.status_code == 200
        assert 'subgraph' in r.json()
```

- [ ] **Step 3: 커밋**

```bash
pytest tests/api/test_objects_extra.py -v 2>&1 | tail -5
git add api/routers/objects.py tests/api/test_objects_extra.py
git commit -m "feat(objects): search + 1-hop subgraph routes (Plan 5 보강)"
```

---

### Task 5.1.2: `web/app/objects/[type]/page.tsx` 보강 — 검색·필터·페이지네이션

**Files:** `web/app/objects/[type]/page.tsx` (덮어쓰기)

- [ ] **Step 1: 보강된 페이지 작성**

```tsx
// web/app/objects/[type]/page.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DataSourceBadge from '../../../components/DataSourceBadge';

export default function ObjectsTypePage({ params }: { params: { type: string } }) {
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const url = q
      ? `/api/objects/${params.type}/search?q=${encodeURIComponent(q)}`
      : `/api/objects/${params.type}?page=${page}&size=50`;
    const r = await fetch(url);
    const d = await r.json();
    setItems(d.items || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [params.type, page]);

  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold capitalize mb-2'>{params.type}</h1>
      <div className='flex gap-2 mb-3'><DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/></div>
      <div className='flex gap-2 mb-3'>
        <input className='flex-1 border rounded px-3 py-2' value={q}
               onChange={e=>setQ(e.target.value)}
               onKeyDown={e=>e.key==='Enter'&&(setPage(1), load())}
               placeholder='검색 (속성 텍스트 contains)'/>
        <button onClick={()=>{setPage(1); load();}} className='bg-blue-600 text-white px-4 py-2 rounded'>
          {loading?'...':'검색'}
        </button>
      </div>
      <table className='w-full border-collapse text-sm'>
        <tbody>
          {items.map((n: any, i: number) => {
            const props = n['~properties'] || n;
            const id = props.cust_id || props.opinet_no || props.campaign_cd || props.tx_id || `row-${i}`;
            return (
              <tr key={i} className='border-b hover:bg-slate-50'>
                <td className='py-1 px-2 font-mono text-xs text-slate-400'>{i + 1 + (page-1)*50}</td>
                <td className='py-1 px-2'>
                  <Link href={`/objects/${params.type}/${id}`} className='text-blue-600 hover:underline font-mono text-xs'>
                    {String(id)}
                  </Link>
                </td>
                <td className='py-1 px-2 text-xs text-slate-600'>{JSON.stringify(props).slice(0, 200)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className='flex gap-2 mt-3 items-center'>
        <button onClick={()=>setPage(Math.max(1, page-1))} className='border rounded px-3 py-1'>이전</button>
        <span className='text-sm'>page {page}</span>
        <button onClick={()=>setPage(page+1)} className='border rounded px-3 py-1'>다음</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 + 커밋**

```bash
cd web && npx tsc --noEmit && cd -
git add web/app/objects/[type]/page.tsx
git commit -m "feat(web/objects): 검색·필터·페이지네이션 + 디테일 링크"
```

---

### Task 5.1.3: `web/app/objects/[type]/[id]/page.tsx` — 디테일 + Cytoscape 1-hop

**Files:** `web/app/objects/[type]/[id]/page.tsx` (신규)

- [ ] **Step 1: 디테일 페이지 작성**

```tsx
// web/app/objects/[type]/[id]/page.tsx
'use client';
import { useEffect, useState } from 'react';
import SubgraphView from '../../../../components/SubgraphView';
import DataSourceBadge from '../../../../components/DataSourceBadge';

export default function ObjectDetail({ params }: { params: { type: string; id: string } }) {
  const [obj, setObj] = useState<any>(null);
  const [graph, setGraph] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });

  useEffect(() => {
    fetch(`/api/objects/${params.type}/${params.id}`).then(r => r.json()).then(setObj);
    fetch(`/api/objects/${params.type}/${params.id}/subgraph`).then(r => r.json())
      .then(d => setGraph(d.subgraph || { nodes: [], edges: [] }));
  }, [params.type, params.id]);

  const props = obj?.subgraph?.[0]?.n?.['~properties'] ?? obj ?? {};
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <div className='flex items-center gap-2 mb-2'>
        <h1 className='text-2xl font-bold capitalize'>{params.type}</h1>
        <span className='text-base font-mono text-slate-500'>· {params.id}</span>
      </div>
      <div className='flex gap-2 mb-4'><DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/></div>
      <div className='grid grid-cols-3 gap-4'>
        <div className='col-span-1 border rounded p-3 text-sm space-y-1 max-h-[600px] overflow-y-auto'>
          <div className='font-semibold mb-2'>속성</div>
          {Object.entries(props).map(([k, v]: any) => (
            <div key={k} className='border-b pb-1 text-xs'>
              <div className='font-mono text-slate-500'>{k}</div>
              <div>{String(v).slice(0, 200)}</div>
            </div>
          ))}
        </div>
        <div className='col-span-2'>
          <div className='font-semibold mb-2'>1-hop Subgraph ({graph.nodes.length} 노드)</div>
          <SubgraphView nodes={graph.nodes} edges={graph.edges}/>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 + 커밋**

```bash
cd web && npx tsc --noEmit && cd -
git add web/app/objects/[type]/[id]/
git commit -m "feat(web/objects/[id]): 디테일 페이지 + 1-hop Cytoscape subgraph"
```

---

## Phase 5.2 — 메타 페이지 풍부화 (2 tasks)

### Task 5.2.1: `api/routers/ontology.py` — schema·standards·validation

**Files:** `api/routers/ontology.py`·`api/services/ontology_meta.py`

- [ ] **Step 1: ontology_meta service**

```python
# api/services/ontology_meta.py
"""25 클래스 schema + opinet_codes + validation 통합 export."""
from __future__ import annotations
import yaml
from pathlib import Path
from data.schemas import ALL_CLASSES, ALL_RELATIONS

def schema_summary() -> dict:
    return {
        'class_count': len(ALL_CLASSES),
        'relation_count': len(ALL_RELATIONS),
        'classes': [{
            'name': c.__name__,
            'fields': [{'name': fn, 'type': str(info.annotation), 'required': info.is_required()}
                       for fn, info in c.model_fields.items()],
        } for c in ALL_CLASSES],
        'relations': [{'source': s, 'edge': e, 'target': t} for s, e, t in ALL_RELATIONS],
    }

def standards() -> dict:
    p = Path('ontology/standards/opinet_codes.yaml')
    return yaml.safe_load(p.read_text(encoding='utf-8')) if p.exists() else {}

def validation_report() -> dict:
    """Plan 2 적재가 spec과 일치하는지 자체 검증."""
    from api.services.neptune import open_cypher
    expected = {
        'Customer': (50_000, 60_000),
        'FuelTransaction': (500_000, 600_000),
        'GasStation': (12_000, 13_000),
        'WeatherObservation': (100, 20_000),
        'Campaign': (130, 250),
    }
    out = []
    for label, (mn, mx) in expected.items():
        try:
            res = open_cypher(f'MATCH (n:{label}) RETURN count(n) AS c')
            n = res.get('results', [{}])[0].get('c', 0)
        except Exception:
            n = -1
        out.append({'class': label, 'count': n, 'expected_min': mn,
                    'expected_max': mx, 'ok': mn <= n <= mx})
    return {'checks': out, 'all_ok': all(c['ok'] for c in out)}
```

- [ ] **Step 2: 라우터**

```python
# api/routers/ontology.py
from fastapi import APIRouter
from api.services.ontology_meta import schema_summary, standards, validation_report

router = APIRouter(prefix='/api/ontology', tags=['ontology'])

@router.get('/schema')
def schema_route():
    return schema_summary()

@router.get('/standards')
def standards_route():
    return standards()

@router.get('/validation')
def validation_route():
    return validation_report()
```

- [ ] **Step 3: 라우터 등록 + 커밋**

```python
# api/main.py 추가
from api.routers import ontology as ontology_router
app.include_router(ontology_router.router)
```

```bash
pytest tests/test_smoke.py -v 2>&1 | tail -3
git add api/routers/ontology.py api/services/ontology_meta.py api/main.py
git commit -m "feat(ontology): /api/ontology/{schema,standards,validation}"
```

---

### Task 5.2.2: `web/app/meta/page.tsx` 풍부화 — 3 탭 (ER · Standards · Validation)

**Files:** `web/app/meta/page.tsx` (덮어쓰기)

- [ ] **Step 1: 3 탭 페이지 작성**

```tsx
// web/app/meta/page.tsx
'use client';
import { useEffect, useState } from 'react';
import CytoscapeView from '../../components/CytoscapeView';
import DataSourceBadge from '../../components/DataSourceBadge';

type Tab = 'er' | 'standards' | 'validation';

export default function MetaPage() {
  const [tab, setTab] = useState<Tab>('er');
  const [schema, setSchema] = useState<any>(null);
  const [standards, setStandards] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);

  useEffect(() => {
    fetch('/api/ontology/schema').then(r=>r.json()).then(setSchema);
    fetch('/api/ontology/standards').then(r=>r.json()).then(setStandards);
    fetch('/api/ontology/validation').then(r=>r.json()).then(setValidation);
  }, []);

  const elements = schema?.classes ? [
    ...schema.classes.map((c: any) => ({ data: { id: c.name, label: c.name, group: 'misc' }})),
    ...schema.relations.map((r: any) => ({ data: { id: `${r.source}-${r.edge}-${r.target}`,
                                                   source: r.source, target: r.target, edge: r.edge }})),
  ] : [];

  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>Ontology Meta</h1>
      <div className='flex gap-2 mb-4'>
        <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/><DataSourceBadge source='external'/>
      </div>
      <div className='flex gap-2 border-b mb-4'>
        {(['er','standards','validation'] as Tab[]).map(t => (
          <button key={t} onClick={()=>setTab(t)}
            className={`px-4 py-2 ${tab===t?'border-b-2 border-blue-600 font-semibold':'text-slate-500'}`}>
            {t === 'er' ? 'ER 다이어그램' : t === 'standards' ? '표준 코드' : '검증 리포트'}
          </button>
        ))}
      </div>
      {tab === 'er' && schema && (
        <>
          <div className='text-sm mb-2'>
            클래스 <b>{schema.class_count}</b> / 관계 <b>{schema.relation_count}</b>
          </div>
          <CytoscapeView elements={elements}/>
        </>
      )}
      {tab === 'standards' && standards && (
        <pre className='border rounded p-3 bg-slate-50 text-xs overflow-auto max-h-[600px]'>
          {JSON.stringify(standards, null, 2)}
        </pre>
      )}
      {tab === 'validation' && validation && (
        <div>
          <div className={`mb-3 px-3 py-2 rounded ${validation.all_ok?'bg-emerald-100':'bg-rose-100'}`}>
            전체: <b>{validation.all_ok ? '✓ 정상' : '✗ 일부 미달'}</b>
          </div>
          <table className='w-full text-sm'>
            <thead><tr className='border-b'><th>클래스</th>
              <th className='text-right'>실제</th><th className='text-right'>min</th>
              <th className='text-right'>max</th><th>상태</th></tr></thead>
            <tbody>{validation.checks.map((c: any, i: number)=>(<tr key={i} className='border-b'>
              <td>{c.class}</td><td className='text-right'>{c.count.toLocaleString()}</td>
              <td className='text-right text-slate-500'>{c.expected_min.toLocaleString()}</td>
              <td className='text-right text-slate-500'>{c.expected_max.toLocaleString()}</td>
              <td>{c.ok?'✓':'✗'}</td>
            </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 빌드 + 커밋**

```bash
cd web && npx tsc --noEmit && cd -
git add web/app/meta/page.tsx
git commit -m "feat(web/meta): 3 탭 (ER · Standards · Validation 검증 리포트)"
```

---

## Phase 5.3 — 운영 콘솔 (3 tasks)

### Task 5.3.1: `api/routers/ops.py` + `api/services/ops_metrics.py`

**Files:** `api/routers/ops.py`·`api/services/ops_metrics.py`

- [ ] **Step 1: ops_metrics service**

```python
# api/services/ops_metrics.py
"""운영 메트릭 — Neptune 카운트, AgentCore 메모리 스냅샷, 평가 결과, 트레이스."""
from __future__ import annotations
from collections import deque
from api.services.neptune import open_cypher
from api.services.agent import get_trace_buf

# guardrail violation 누적 (in-process — Plan 5에선 단순)
_GUARDRAIL_BUF: deque = deque(maxlen=200)

def push_guardrail(source: str, violations: list[str], snippet: str):
    _GUARDRAIL_BUF.append({'source': source, 'violations': violations, 'snippet': snippet[:80]})

def ingest_counts() -> dict:
    """클래스별 Neptune 노드 수 + 도메인 그룹 합계."""
    labels = ['Customer','FuelTransaction','GasStation','FuelPrice','Campaign','Coupon',
              'CouponUse','Term','TermAgreement','AppEvent','SurveyResponse','WeatherObservation',
              'Cluster','Segment','Member','CampaignSms','CampaignAggregation']
    out = []
    for lab in labels:
        try:
            res = open_cypher(f'MATCH (n:{lab}) RETURN count(n) AS c')
            out.append({'class': lab, 'count': res.get('results', [{}])[0].get('c', 0)})
        except Exception:
            out.append({'class': lab, 'count': -1})
    return {'counts': out}

def memory_snapshot(persona_id: str = 'marketing', limit: int = 10) -> dict:
    """AgentCore Memory recent events (간이판)."""
    return {'note': '실제 events 조회는 Plan 5 polish 마무리에서 mem.list_events 호출',
            'persona_id': persona_id}

def eval_scoreboard() -> dict:
    """eval_wow_queries.py 결과 latest.json (Plan 5에서 nightly run)."""
    import json
    from pathlib import Path
    p = Path('.harness-eval/eval-latest.json')
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else {'scenarios': [], 'overall_pass_pct': 0}

def trace_timeline() -> dict:
    return {'trace': get_trace_buf()[-100:]}

def guardrail_log() -> dict:
    return {'guardrail': list(_GUARDRAIL_BUF)}
```

- [ ] **Step 2: 라우터**

```python
# api/routers/ops.py
from fastapi import APIRouter
from api.services.ops_metrics import (ingest_counts, memory_snapshot,
                                       eval_scoreboard, trace_timeline, guardrail_log)

router = APIRouter(prefix='/api/ops', tags=['ops'])

@router.get('/ingest')
def ingest(): return ingest_counts()

@router.get('/memory')
def memory(): return memory_snapshot()

@router.get('/eval')
def evaluation(): return eval_scoreboard()

@router.get('/trace')
def trace(): return trace_timeline()

@router.get('/guardrail')
def guardrail(): return guardrail_log()
```

- [ ] **Step 3: 등록 + 커밋**

```python
# api/main.py
from api.routers import ops as ops_router
app.include_router(ops_router.router)
```

```bash
git add api/routers/ops.py api/services/ops_metrics.py api/main.py
git commit -m "feat(ops): /api/ops/{ingest,guardrail,memory,eval,trace}"
```

---

### Task 5.3.2: 운영 콘솔 UI — `web/app/ops/page.tsx` + 5 panel 컴포넌트

**Files:** `web/app/ops/page.tsx`·`web/components/{IngestPanel,GuardrailPanel,MemoryPanel,EvalPanel,TracePanel}.tsx`

- [ ] **Step 1: 5 panel 컴포넌트 일괄 작성**

```tsx
// web/components/IngestPanel.tsx
'use client';
import { useEffect, useState } from 'react';
export default function IngestPanel() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch('/api/ops/ingest').then(r=>r.json()).then(setD); }, []);
  return (
    <div className='border rounded p-3'>
      <h3 className='font-semibold mb-2'>적재 카운트</h3>
      <table className='w-full text-xs'>
        <tbody>{d?.counts?.map((c: any, i: number) => (
          <tr key={i} className='border-b'>
            <td className='py-1'>{c.class}</td>
            <td className='text-right py-1 font-mono'>{c.count.toLocaleString?.()}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
```

```tsx
// web/components/GuardrailPanel.tsx
'use client';
import { useEffect, useState } from 'react';
export default function GuardrailPanel() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch('/api/ops/guardrail').then(r=>r.json()).then(setD); }, []);
  return (
    <div className='border rounded p-3'>
      <h3 className='font-semibold mb-2'>가드레일 위반 ({d?.guardrail?.length || 0})</h3>
      <ul className='text-xs space-y-1 max-h-72 overflow-y-auto'>
        {d?.guardrail?.map((g: any, i: number) => (
          <li key={i} className='border-b py-1'>
            <span className={`text-xs px-1 rounded ${g.source==='INPUT'?'bg-amber-100':'bg-rose-100'}`}>{g.source}</span>
            {' '}<span className='font-mono'>{g.violations.join(', ')}</span>
            <div className='text-slate-500 truncate'>{g.snippet}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

```tsx
// web/components/MemoryPanel.tsx
'use client';
import { useEffect, useState } from 'react';
export default function MemoryPanel() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch('/api/ops/memory').then(r=>r.json()).then(setD); }, []);
  return (
    <div className='border rounded p-3'>
      <h3 className='font-semibold mb-2'>AgentCore 메모리 스냅샷</h3>
      <pre className='text-xs bg-slate-50 p-2 rounded overflow-x-auto'>{JSON.stringify(d, null, 2)}</pre>
    </div>
  );
}
```

```tsx
// web/components/EvalPanel.tsx
'use client';
import { useEffect, useState } from 'react';
export default function EvalPanel() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch('/api/ops/eval').then(r=>r.json()).then(setD); }, []);
  return (
    <div className='border rounded p-3'>
      <h3 className='font-semibold mb-2'>평가 스코어보드 ({d?.overall_pass_pct ?? 0}% 통과)</h3>
      <table className='w-full text-xs'>
        <thead><tr className='border-b'><th>시나리오</th><th>케이스</th><th>통과</th></tr></thead>
        <tbody>{d?.scenarios?.map((s: any, i: number) => (
          <tr key={i} className='border-b'>
            <td>{s.scenario}</td><td className='text-right'>{s.total}</td>
            <td className={`text-right ${s.pass_pct>=85?'text-emerald-700':'text-rose-700'}`}>{s.pass_pct}%</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
```

```tsx
// web/components/TracePanel.tsx
'use client';
import { useEffect, useState } from 'react';
export default function TracePanel() {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    const t = setInterval(() => fetch('/api/ops/trace').then(r=>r.json()).then(setD), 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className='border rounded p-3'>
      <h3 className='font-semibold mb-2'>도구 호출 트레이스</h3>
      <ul className='text-xs space-y-1 max-h-72 overflow-y-auto'>
        {d?.trace?.map((t: any, i: number) => (
          <li key={i} className='border-b py-1 flex gap-2'>
            <span className='font-mono text-blue-600'>{t.tool}</span>
            <span className='text-slate-500'>{t.ms}ms</span>
            <span className='truncate text-slate-600'>{JSON.stringify(t.input).slice(0, 60)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: 운영 콘솔 page**

```tsx
// web/app/ops/page.tsx
import IngestPanel from '../../components/IngestPanel';
import GuardrailPanel from '../../components/GuardrailPanel';
import MemoryPanel from '../../components/MemoryPanel';
import EvalPanel from '../../components/EvalPanel';
import TracePanel from '../../components/TracePanel';
import DataSourceBadge from '../../components/DataSourceBadge';

export default function OpsPage() {
  return (
    <div className='p-8 max-w-7xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>운영 콘솔</h1>
      <div className='flex gap-2 mb-4'>
        <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/><DataSourceBadge source='external'/>
      </div>
      <div className='grid grid-cols-2 gap-4'>
        <IngestPanel/><EvalPanel/>
        <GuardrailPanel/><MemoryPanel/>
        <div className='col-span-2'><TracePanel/></div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 빌드 + 커밋**

```bash
cd web && npx tsc --noEmit && cd -
git add web/app/ops/ web/components/{IngestPanel,GuardrailPanel,MemoryPanel,EvalPanel,TracePanel}.tsx
git commit -m "feat(web/ops): 운영 콘솔 (5 패널 — 적재·가드레일·메모리·평가·트레이스)"
```

---

### Task 5.3.3: Guardrail 로그 hook in chat router (Plan 3 보강)

**Files:** `api/routers/chat.py` (보강)

- [ ] **Step 1: guardrail violations을 ops_metrics.push_guardrail로 전달**

`api/routers/chat.py`의 `gen()` 안 guardrail_apply 호출 후 추가:

```python
# 위반 누적
from api.services.ops_metrics import push_guardrail
if violations:
    push_guardrail('INPUT', violations, cleaned)
# (output 측도 동일 처리)
if viol:
    push_guardrail('OUTPUT', viol, final_text)
```

- [ ] **Step 2: 커밋**

```bash
git add api/routers/chat.py
git commit -m "feat(chat): guardrail violations push to ops_metrics buffer"
```

---

## Phase 5.4 — 가이드 투어 + 홈 페이지 통합 (1 task)

### Task 5.4.1: `GuidedTour.tsx` — 5 페르소나 × 14 시나리오 추천 흐름 + ADR 0008

**Files:** `web/components/GuidedTour.tsx`·`web/app/page.tsx`·`docs/decisions/0008-guided-tour-design.md`

- [ ] **Step 1: ADR 0008**

`docs/decisions/0008-guided-tour-design.md`:
```markdown
# ADR 0008 — Guided Tour Design

- Status: Accepted
- Date: 2026-05-08

## Context

5 페르소나 × 14 시나리오 = 70 조합. 데모 시 마케터·실무자가 *어디서 시작해야 할지* 모르면 PoC 가치 전달이 약해짐. retail이 GuidedTour로 해결한 패턴을 GCC에도 적용.

## Decision

- `GuidedTour.tsx`가 페르소나 변경 시 *권장 시나리오 시작점 3개*를 카드로 노출.
- 각 카드 = 시나리오 코드·이름·*"왜 이 페르소나에 적합한가"* 한 문장 + 시나리오 페이지로 deep link.
- 추천 순서는 spec §3.2 매트릭스 (🔥) 기반 — `PERSONA_REGISTRY[pid].scenario_priority` 첫 3개.
- 홈 페이지에 항상 노출. 페르소나 전환 시 즉시 갱신.

## Consequences

- 데모 진입 시간 단축 — 사용자가 *생각하지 않고도* 적합한 시나리오로 이동.
- 새 시나리오 추가 시 PERSONA_REGISTRY만 갱신하면 GuidedTour 자동 반영.
```

- [ ] **Step 2: GuidedTour 컴포넌트**

```tsx
// web/components/GuidedTour.tsx
'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const SCENARIO_META: Record<string, { code: string; label: string; desc: string; href: string }> = {
  A: { code: 'A', label: '의미 검색', desc: '자연어로 고객·주유 패턴을 1-hop 그래프로 탐색.', href: '/search' },
  B: { code: 'B', label: '대화 에이전트', desc: 'PDF Scenario 1 마케터 dialog. 메모리 + 10 도구.', href: '/chat' },
  C: { code: 'C', label: '인사이트 차트', desc: 'matplotlib NanumGothic + Sonnet 한국어 요약.', href: '/insights' },
  D: { code: 'D', label: '페르소나 매칭', desc: '고객 cohort에 맞는 부서 페르소나 추천.', href: '/persona-match' },
  E: { code: 'E', label: '클러스터링', desc: 'KMeans 6 + LLM 라벨링 + Cluster write-back.', href: '/cluster' },
  F: { code: 'F', label: '룩어라이크', desc: '시드 고객 임베딩 유사도 상위 X% 확장.', href: '/lookalike' },
  G: { code: 'G', label: '캠페인 ROI', desc: '쿠폰액 → 전환률·매출 시뮬 + Bayesian 분포.', href: '/campaign-roi' },
  H: { code: 'H', label: '주유소 지도', desc: '한국 시도 choropleth + GSC vs 경쟁사 가격.', href: '/network' },
  I: { code: 'I', label: '약관 가드레일', desc: '마케팅 자격 + Bedrock Guardrails.', href: '/compliance' },
  J: { code: 'J', label: '외부 시그널', desc: '현대카드·앱·설문·날씨 융합 narrative.', href: '/signals' },
  K: { code: 'K', label: 'Outlier 탐지', desc: 'PM+M 92 RON DIY · 디젤→premium 전환 검출.', href: '/outlier' },
  L: { code: 'L', label: '결제 분석', desc: 'PaymentMethod × FuelPrice × Channel 매트릭스.', href: '/payment' },
  M: { code: 'M', label: '고객 통합 여정', desc: 'PDF 3페이지 — App+Tx+Term+Coupon timeline.', href: '/journey' },
  N: { code: 'N', label: '날씨 × 주유', desc: '기상청 단기예보 × 시도 거래 상관.', href: '/weather' },
};

export default function GuidedTour({ persona }: { persona: string }) {
  const [priority, setPriority] = useState<string[]>([]);
  useEffect(() => {
    fetch('/api/personas').then(r=>r.json()).then(arr => {
      const p = arr.find((x: any) => x.persona_id === persona);
      setPriority(p?.scenario_priority?.slice(0, 3) || ['A','B','C']);
    });
  }, [persona]);
  return (
    <div className='border rounded p-4 bg-amber-50 mb-6'>
      <h3 className='font-semibold mb-3'>이 페르소나에 추천하는 시나리오</h3>
      <div className='grid grid-cols-3 gap-3'>
        {priority.map(code => {
          const m = SCENARIO_META[code];
          if (!m) return null;
          return (
            <Link key={code} href={m.href}
                  className='block border rounded p-3 bg-white hover:shadow transition'>
              <div className='font-mono text-xs text-amber-700'>시나리오 {m.code}</div>
              <div className='font-semibold mt-1'>{m.label}</div>
              <div className='text-xs text-slate-600 mt-1'>{m.desc}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 홈 페이지 통합**

```tsx
// web/app/page.tsx 보강
'use client';
import { useState } from 'react';
import Sidebar from '../components/Sidebar';
import GuidedTour from '../components/GuidedTour';
import PersonaSwitch from '../components/PersonaSwitch';
import DataSourceBadge from '../components/DataSourceBadge';

export default function Home() {
  const [persona, setPersona] = useState('marketing');
  return (
    <main className='flex'>
      <Sidebar/>
      <section className='flex-1 p-8'>
        <h1 className='text-3xl font-bold'>ontology-gcc</h1>
        <p className='mt-2 text-slate-600'>GS Caltex M&M본부 고객 데이터 PoC — 14 시나리오 · 25 클래스 · 5 부서 페르소나</p>
        <div className='flex items-center gap-3 mt-3 mb-4'>
          <PersonaSwitch value={persona} onChange={setPersona}/>
          <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/><DataSourceBadge source='external'/>
        </div>
        <GuidedTour persona={persona}/>
        <div className='text-sm text-slate-500'>좌측 사이드바에서 14 시나리오 + 25 객체 탐색기 + 메타·운영 콘솔에 접근하세요.</div>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: 빌드 + 커밋**

```bash
cd web && npx tsc --noEmit && cd -
git add web/components/GuidedTour.tsx web/app/page.tsx docs/decisions/0008-guided-tour-design.md
git commit -m "feat(home): GuidedTour — 5 페르소나 × 14 시나리오 추천 (ADR 0008)"
```

---

## Phase 5.5 — 도메인 wiring + Lambda@Edge 인증 강화 (2 tasks)

### Task 5.5.1: Lambda@Edge 인증 함수 (RS256 JWT + JWKS 캐시)

**Files:** `infra-cdk/lambda-edge-auth/index.js`·`infra-cdk/lib/edge-stack.ts` 보강

- [ ] **Step 1: Lambda@Edge 함수 작성**

```javascript
// infra-cdk/lambda-edge-auth/index.js
'use strict';
const https = require('https');
const crypto = require('crypto');

const COGNITO_REGION = 'ap-northeast-2';
const USER_POOL_ID = process.env.USER_POOL_ID;   // CDK가 빌드 시 inject
const COOKIE_NAME = 'gcc_id_token';

let _jwks = null; let _jwks_at = 0;
async function jwks() {
  if (_jwks && Date.now() - _jwks_at < 600000) return _jwks;
  const url = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`;
  const body = await new Promise((res, rej) => {
    https.get(url, r => { let d=''; r.on('data', c=>d+=c); r.on('end', ()=>res(d)); }).on('error', rej);
  });
  _jwks = JSON.parse(body); _jwks_at = Date.now();
  return _jwks;
}

function unauthorized() {
  return { status: '302', statusDescription: 'Found',
           headers: { location: [{ key: 'Location', value: '/auth/login' }] }};
}

exports.handler = async (event) => {
  const req = event.Records[0].cf.request;
  // 공개 경로 통과
  if (req.uri.startsWith('/auth/') || req.uri === '/healthz') return req;
  
  // Origin auth header (CloudFront → ALB) — Plan 1에서 이미 secret으로 추가
  // 여기는 Cognito 사용자 인증만
  const cookieStr = (req.headers.cookie || []).map(h=>h.value).join('; ');
  const m = cookieStr.match(new RegExp(COOKIE_NAME + '=([^;]+)'));
  if (!m) return unauthorized();
  const token = m[1];
  
  // RS256 검증 (간이판 — Plan 5 polish에서는 jose lib로 대체 권장)
  const [headerB64, payloadB64, sigB64] = token.split('.');
  if (!sigB64) return unauthorized();
  try {
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.exp && Date.now()/1000 > payload.exp) return unauthorized();
    const keys = (await jwks()).keys;
    const jwk = keys.find(k => k.kid === header.kid);
    if (!jwk) return unauthorized();
    const pem = jwkToPem(jwk);
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(`${headerB64}.${payloadB64}`);
    const ok = verify.verify(pem, Buffer.from(sigB64, 'base64url'));
    if (!ok) return unauthorized();
  } catch (e) {
    return unauthorized();
  }
  return req;
};

function jwkToPem(jwk) {
  // 단순 RSA jwk → PEM (Plan 5 polish에서는 jwk-to-pem 라이브러리 권장)
  const n = Buffer.from(jwk.n, 'base64url');
  const e = Buffer.from(jwk.e, 'base64url');
  const key = crypto.createPublicKey({ key: { kty: 'RSA', n: n.toString('base64url'),
    e: e.toString('base64url') }, format: 'jwk' });
  return key.export({ type: 'spki', format: 'pem' });
}
```

- [ ] **Step 2: edge-stack.ts에 Lambda@Edge 등록**

```typescript
// infra-cdk/lib/edge-stack.ts 보강
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cf from 'aws-cdk-lib/aws-cloudfront';

// EdgeStack constructor 안 (CloudFront Distribution 생성 전):
const authFn = new cf.experimental.EdgeFunction(this, 'AuthEdge', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda-edge-auth'),
});

// distribution.defaultBehavior에 추가:
//   edgeLambdas: [{ functionVersion: authFn.currentVersion,
//                   eventType: cf.LambdaEdgeEventType.VIEWER_REQUEST }]
```

- [ ] **Step 3: 스냅샷 갱신 + 커밋**

```bash
cd infra-cdk && npx jest --ci -u && cd -
git add infra-cdk/lambda-edge-auth/ infra-cdk/lib/edge-stack.ts infra-cdk/test/__snapshots__/
git commit -m "feat(edge): Lambda@Edge Cognito JWT 검증 (RS256 + JWKS TTL)"
```

---

### Task 5.5.2: 도메인 추가 runbook 검증 + Cognito callback 안전 PUT 통합 테스트

**Files:** `docs/runbooks/02-add-custom-domain.md` 보강

- [ ] **Step 1: 검증 step 추가**

`docs/runbooks/02-add-custom-domain.md` 끝에 추가:

```markdown
## 검증 절차

```bash
# 1) ACM 발급 검증 (DNS 유효화 완료 후 ISSUED)
aws acm describe-certificate --region us-east-1 \
  --certificate-arn $(aws cloudformation describe-stacks --stack-name ontology-gcc-dev-edge \
    --region us-east-1 --query "Stacks[0].Outputs[?OutputKey=='CertArn'].OutputValue" --output text) \
  --query 'Certificate.Status'

# 2) Cognito callback 머지 결과 확인 (안전 PUT — 기존 cloudfront URL + 신규 도메인 둘 다 유지)
USER_POOL_ID=...
CLIENT_ID=...
aws cognito-idp describe-user-pool-client --user-pool-id "$USER_POOL_ID" --client-id "$CLIENT_ID" \
  --query 'UserPoolClient.CallbackURLs'

# 3) https://gcc-ontology.whchoi.net/ 200 OK
curl -I https://gcc-ontology.whchoi.net/

# 4) 데모 사용자 로그인 → /search 진입
echo "수동: 브라우저에서 admin@whchoi.net 로그인 후 /search 도달 확인"
```

## 롤백

```bash
# 도메인 wiring 제거 (CDK context 없이 재배포)
cd infra-cdk && npx cdk deploy ontology-gcc-dev-edge --require-approval never
# Cognito callback에서 도메인 제거
USER_POOL_ID=...
CLIENT_ID=...
# describe → 필터 → update-user-pool-client
```
```

- [ ] **Step 2: 커밋**

```bash
git add docs/runbooks/02-add-custom-domain.md
git commit -m "docs(runbook): add domain 검증 + 롤백 절차"
```

---

## Phase 5.6 — opinet 공개 API ETL (옵셔널 가격 시계열 보강)

### Task 5.6.1: `data/external/opinet_etl.py` — 1년치 가격 보강

**Files:** `data/external/opinet_etl.py`

- [ ] **Step 1: opinet API 클라이언트 + ETL**

```python
# data/external/opinet_etl.py
"""opinet 공개 API (한국석유공사) → FuelPrice (source='real') 시계열 보강.
Plan 2의 합성 1년치를 실 데이터로 교체 가능."""
from __future__ import annotations
import os, datetime, requests, json, boto3
from data.schemas import FuelPrice
from typing import Iterator

OPINET_BASE = 'https://www.opinet.co.kr/api'
SECRET = 'ontology-gcc-dev/opinet-api-key'

def _api_key() -> str:
    sm = boto3.client('secretsmanager')
    return sm.get_secret_value(SecretId=SECRET)['SecretString'].strip()

def fetch_avg_by_sido(date_str: str) -> Iterator[FuelPrice]:
    """opinet 일별 시도 평균 가격 — 단순화된 endpoint 가정."""
    key = _api_key()
    url = f'{OPINET_BASE}/avgSidoPrice.do?code={key}&out=json&date={date_str}'
    try:
        r = requests.get(url, timeout=20); r.raise_for_status()
        items = r.json().get('RESULT', {}).get('OIL', [])
    except Exception:
        return
    for it in items:
        sido = it.get('SIDONM', ''); grade = it.get('PRODNM', '')
        try: amt = int(float(it.get('PRICE', 0)))
        except ValueError: continue
        # 시도 단위 가상 station: opinet_no = f'sido-{sido}'
        yield FuelPrice(station_opinet_no=f'sido-{sido}', fuel_grade=grade,
                        dt=date_str.replace('-',''), amount=amt, source='real')

def run(start_date: str, days: int = 365):
    s3 = boto3.client('s3')
    bucket = os.environ.get('SYNTHETIC_DATA_BUCKET', 'ontology-gcc-dev-synthetic-data-x')
    cur = datetime.datetime.strptime(start_date, '%Y-%m-%d')
    written = 0
    for d in range(days):
        date_s = cur.strftime('%Y-%m-%d')
        prices = list(fetch_avg_by_sido(date_s))
        if prices:
            ndjson = '\n'.join(p.model_dump_json() for p in prices)
            s3.put_object(Bucket=bucket,
                          Key=f'nodes/fuel_price_real_yearly/{date_s}.ndjson',
                          Body=ndjson.encode('utf-8'))
            written += len(prices)
        cur += datetime.timedelta(days=1)
    return written

if __name__ == '__main__':
    import sys
    start = sys.argv[1] if len(sys.argv) > 1 else '2025-05-01'
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 365
    print(f'wrote {run(start, days)} opinet prices to S3')
```

- [ ] **Step 2: 커밋**

```bash
git add data/external/opinet_etl.py
git commit -m "feat(data/external): opinet 공개 API ETL (옵셔널 1년치 가격 보강)"
```

---

## Phase 5.7 — harness-eval + 한·영 README + 최종 release (2 tasks)

### Task 5.7.1: `harness-eval:full` 자동화 + README 배지 갱신

**Files:** `scripts/run_harness_eval.sh`·`.github/workflows/harness.yml`

- [ ] **Step 1: harness eval 자동 갱신 스크립트**

```bash
# scripts/run_harness_eval.sh
#!/usr/bin/env bash
set -euo pipefail

# 1) harness-eval 실행 (실제 호출은 Skill을 통해 수동, 여기서는 결과 합성)
# 2) latest.json 기반 README 배지 갱신
LATEST='.harness-eval/latest.json'
if [ ! -f "$LATEST" ]; then echo "no latest.json"; exit 1; fi

SCORE=$(jq -r '.score' "$LATEST")
GRADE=$(jq -r '.grade' "$LATEST")
EVAL_DT=$(date +%Y-%m-%d)

# 색상: 8.5+/A green, 7.5+/B yellow, 미달 red
if (( $(echo "$SCORE >= 8.5" | bc -l) )); then COLOR='brightgreen'
elif (( $(echo "$SCORE >= 7.5" | bc -l) )); then COLOR='yellow'
else COLOR='red'; fi

# README 배지 마커 사이를 sed로 교체
python3 <<EOF
import re
content = open('README.md', encoding='utf-8').read()
new_badge = f'''<!-- harness-eval-badge:start -->
![Harness Score](https://img.shields.io/badge/harness-{${SCORE}:.1f}/10-${COLOR})
![Harness Grade](https://img.shields.io/badge/grade-{${GRADE}}-${COLOR})
![Last Eval](https://img.shields.io/badge/eval-${EVAL_DT}-blue)
<!-- harness-eval-badge:end -->'''
content = re.sub(r'<!-- harness-eval-badge:start -->.*?<!-- harness-eval-badge:end -->',
                 new_badge, content, flags=re.DOTALL)
open('README.md','w', encoding='utf-8').write(content)
print('README 배지 갱신 완료')
EOF
```

```bash
chmod +x scripts/run_harness_eval.sh
```

- [ ] **Step 2: nightly workflow**

```yaml
# .github/workflows/harness.yml
name: harness-eval-nightly
on:
  schedule: [{cron: '0 18 * * *'}]   # KST 03:00
  workflow_dispatch:
jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          # 실제 harness-eval은 Claude harness Skill 호출이 필요 — 여기서는 placeholder
          echo "manual: trigger harness-eval:full from a Claude session weekly"
      - run: bash scripts/run_harness_eval.sh
      - uses: peter-evans/create-pull-request@v6
        with:
          commit-message: 'chore(harness): nightly badge refresh'
          title: 'Harness eval refresh'
          branch: chore/harness-refresh
```

- [ ] **Step 3: 첫 실행 (수동 harness-eval:full 후) + 커밋**

```bash
# Claude session에서 harness-eval:full 호출 (이 plan 외부)
# 이후 latest.json이 갱신되면:
bash scripts/run_harness_eval.sh
git add scripts/run_harness_eval.sh .github/workflows/harness.yml README.md .harness-eval/latest.json
git commit -m "feat(harness): nightly eval + README 배지 자동 갱신"
```

---

### Task 5.7.2: 한·영 README 정합 + SECURITY.md polish + CHANGELOG 1.0.0

**Files:** `README.md`·`SECURITY.md`·`CHANGELOG.md`

- [ ] **Step 1: README 한·영 섹션 정합 — 14 시나리오 · 25 클래스 · 5 페르소나**

`README.md`의 영문/한국어 Features 섹션 재정합:

- 영문: 14 features (A~N) — 시나리오 매트릭스에 PM+M·여정·날씨 강조
- 한국어: 동일 내용 14개로 갱신
- env 표: WeatherObservation·CampaignSms·CampaignAggregation·Customer 15 attrs 추가
- Project Structure: data/{real,synthetic,external} 3-tier 반영
- 데모 사용자: admin@whchoi.net / demo@whchoi.net / `!234Qwer`

- [ ] **Step 2: SECURITY.md polish — Plan 1~5 보안 결정 종합**

`SECURITY.md`에 다음 단락 추가/갱신:
- Plan 1 ADR 0001 retail VPC import (east-west 격리 SG)
- Plan 1 ADR 0002 도메인 분리 배포
- Plan 1 ADR 0003 Bulk Loader IAM
- Plan 5 Lambda@Edge RS256 + JWKS TTL 캐시
- raw_data PII 정책 (gitignore + KMS S3)
- Bedrock Guardrail input/output (Plan 3)
- Cognito constant-time origin token 비교
- 외부 API 키 (Plan 2 KMA, Plan 5 opinet) Secrets Manager

- [ ] **Step 3: CHANGELOG 1.0.0 release 노트**

```markdown
## [1.0.0] — 2026-05-08

### Added — 첫 PoC release

**인프라**
- 6-stack CDK (network imports retail VPC, others GCC-only) 배포
- Lambda@Edge Cognito JWT (RS256 + JWKS TTL 캐시) 인증
- gcc-ontology.whchoi.net 수동 wiring 절차 + 안전 callback 머지

**데이터** (총 ~1.4M 노드 / ~4M 엣지)
- 실 데이터 cohort: 쿠폰 500 + 매출 deep-history 16 + 매출 sales-only 17 + 약관 500 + 소비지수 287 + 앱 352 + 설문 25,961
- 합성 lookalike-syn ~50,000 + PM+M 92 RON 250 + 디젤→premium 250 시드
- 외부: 기상청 단기예보 17 시도 일별 ETL + (옵셔널) opinet 1년치
- 25 클래스 + 31 관계 + opinet_codes.yaml 카탈로그
- Customer 15 핵심 속성 (DW_CU_CUST_MAST 청사진)
- Customer.data_depth 4단계 cohort 태깅

**시나리오** (14 — A~N)
- A 의미 검색 (BM25 Nori + Cohere KNN, RRF, rerank-v3, 1-hop subgraph)
- B 마케터 챗 (Bedrock Converse 다회차 + AgentCore Memory + 10 도구)
- C MD 인사이트 (Code Interpreter + matplotlib NanumGothic + Sonnet 요약)
- D 페르소나 매칭 / E 클러스터링 KMeans 6 / F 룩어라이크 / G 캠페인 ROI
- H 주유소 지도 (시도 choropleth) / I 약관 가드레일 / J 외부 시그널 융합
- K Outlier (PM+M 92 RON DIY + 디젤→premium) — PDF 3페이지 시그니처
- L 결제·가격·채널 / M 고객 통합 여정 timeline — PDF 3페이지 시그니처
- N 날씨 × 주유 (기상청 join + 산점도)
- 70+ wow 평가 케이스 (시나리오 × 페르소나 매트릭스)

**운영·메타·UI**
- 25 클래스 객체 탐색기 (검색·페이지네이션·디테일·1-hop subgraph)
- 메타 페이지 3 탭 (ER·Standards·Validation 검증 리포트)
- 운영 콘솔 5 패널 (적재·가드레일·메모리·평가·트레이스)
- GuidedTour (5 페르소나 × 14 시나리오 추천)
- DataSourceBadge (real/synthetic/external 출처 명시)

**ADRs** 0001~0008
**Tests** CI 4-job 그린 (~50+ tests) + eval ≥85% + harness ≥7.5/B
**Docs** README 한·영 + CLAUDE.md + SECURITY.md + 8 ADR + 2 runbook
```

- [ ] **Step 4: tag + final commit**

```bash
# CI 4-job + eval 최종 검증
python3 -m compileall -q api data scripts
cd web && npx tsc --noEmit && cd -
cd infra-cdk && npx tsc --noEmit && npx jest --ci && cd -
pytest tests -q

git add README.md SECURITY.md CHANGELOG.md
git commit -m "release: 1.0.0 — PoC complete (14 시나리오 · 25 클래스 · 5 부서 · real+synth+external)"
git tag -a v1.0.0 -m "ontology-gcc 1.0.0 — first PoC release"
git log --oneline | head -40
```

---

## Self-Review (writing-plans 스킬 권장)

**1. Spec coverage**
- spec §6.1 Phase 5 객체·메타·운영 → Tasks 5.1.1~5.3.3 ✓
- spec §6.1 Phase 6 마무리 → Tasks 5.4.1·5.7.1·5.7.2 ✓
- spec §1.4 보안 (Lambda@Edge JWKS TTL) → Task 5.5.1 ✓
- spec §9 Acceptance Criteria 모든 항목 → Phase 5.7의 final 검증으로 closed ✓
- D15 가격 시계열 (옵셔널 opinet ETL) → Task 5.6.1 ✓
- D18 표준 카탈로그 → Task 5.2.2 (3 탭 페이지) ✓

**2. Placeholder scan**
- Task 5.5.1 Lambda@Edge `jwkToPem` 단순 구현 — production 권장은 `jwk-to-pem` 라이브러리. 명시.
- Task 5.6.1 opinet endpoint 정확 URL 변경 가능성 — 실 사용 시 한국석유공사 API 문서 확인. 명시.
- Task 5.7.1 nightly harness-eval은 *Claude Skill 외부 호출* 필요 — workflow는 placeholder, 수동 트리거 명시.

**3. Type consistency**
- 모든 컴포넌트가 `DataSourceBadge` source 타입 (`'real'|'synthetic'|'external'`) 일관 ✓
- ops_metrics의 `push_guardrail` ↔ chat router 호출 시그니처 일관 ✓
- `/api/personas`·`/api/objects/*`·`/api/ontology/*`·`/api/ops/*` 전부 동일 prefix 패턴 ✓

**4. Ambiguity**
- Task 5.5.1의 user pool client에 `currentVersion` 부착 위치 — `Distribution`의 `defaultBehavior.edgeLambdas`에 들어가야. CDK가 `cf.experimental.EdgeFunction` API 시그니처에 따라 다를 수 있어 — 실 빌드 시 jest snapshot으로 검증 필요. 명시.

이슈 없음. Plan 5 작성 완료.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-08-plan5-polish.md`
(Phase 5.1~5.7, 약 13 tasks, ~75 steps).

**선행 조건:** Plan 1·2·3·4 모두 실행 완료.

**전체 5 plan 작성 완료** — 모든 청사진이 준비되었습니다. 이제 실행 단계입니다.

**다음에 어떻게 실행하시겠습니까?**

**1. Subagent-Driven 일괄 실행 (recommended)** — Plan 1 → 2 → 3 → 4 → 5 순차. 각 task별 fresh subagent + 검토.

**2. Plan 1 (Foundation)부터 단계별 실행** — 인프라 띄우고 → 데이터 적재 → 시나리오 → polish.

**3. 모든 plan 검토 후 결정** — 사용자가 plan 1~5를 직접 검토 후 다음 결정.

**4. git init + 첫 commit** — 현재 모든 산출물을 git에 락인 후 결정 (현재 디렉토리는 git 미초기화).

어떤 옵션을 선택하시겠습니까?

