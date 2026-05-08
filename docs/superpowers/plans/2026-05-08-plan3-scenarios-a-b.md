# Plan 3 — Scenarios A (Search) + B (Marketer Chat Agent) Gold Standard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan 4의 12 시나리오 (C~N) 템플릿이 될 **Vertical slice 골드 스탠다드 2개** 구축 — 시나리오 A (의미 검색 + 1-hop subgraph) 와 시나리오 B (마케터 대화 에이전트, 10 도구 + AgentCore Memory). PDF Scenario 1 ("고급휘발유 업셀링" 마케터 ↔ AI Agent dialog)을 완전 재현 가능. cohort 필터·DataSourceBadge·SSE 스트리밍·평가 케이스가 모두 동작.

**Architecture:** API 측은 `services/{bedrock,opensearch,neptune,agentcore,agent}.py` 공통 래퍼 위에 라우터 2개. 웹은 `app/search/` `app/chat/` 페이지 + 공유 컴포넌트(`StreamPanel`, `ToolCallPanel`, `SubgraphView`, `PersonaSwitch`). Bedrock Converse 다회차 + AgentCore Memory short-term(세션) + long-term(사용자)을 retail 검증 패턴 그대로.

**Tech Stack:** FastAPI SSE, Bedrock Sonnet 4.6 Converse, Cohere embed-v4 + rerank-v3, OpenSearch Serverless (BM25 Nori + KNN, RRF), AgentCore Memory + Code Interpreter, Neptune openCypher, Cytoscape (subgraph), Next.js 14 App Router.

**Spec reference:** spec §3.1 시나리오 A·B + §2.1 컴포넌트 노트 (TOOL_SPECS, PERSONA_REGISTRY, SSE 어휘) + spec D11~D18.

**Prerequisites:** Plan 1 + Plan 2 실행 완료. Neptune에 ~1.4M 노드 적재됨, OpenSearch hybrid index (`ontology-gcc-dev-kb-index`) 존재, AgentCore Memory store 생성됨, Bedrock Guardrail/KB 활성.

---

## File Structure

이 plan에서 생성·수정되는 파일:

### API 공통 서비스 (Phase 3.1)
- `api/services/bedrock.py` — Converse(stream) + embed + rerank wrapper
- `api/services/opensearch.py` — hybrid_search (BM25 Nori + Cohere KNN, RRF fusion)
- `api/services/persona.py` — `PERSONA_REGISTRY` 5 부서 × 가중치·KPI·system prompt 어조
- `api/services/sse.py` — `sse_event(type, data)` helper + `EventStream` async generator
- `api/services/guardrails.py` — Bedrock Guardrail apply (input scrub + output filter)

### 시나리오 A (Phase 3.2)
- `api/routers/search.py` — POST `/api/search` (sync) + `/api/search/stream` (SSE)
- `api/services/search_pipeline.py` — query → embed → BM25 + KNN → RRF → rerank → 1-hop subgraph
- `web/app/search/page.tsx` — 검색 페이지 (입력·결과 카드·subgraph)
- `web/components/SubgraphView.tsx` — Cytoscape 1-hop 시각화
- `web/components/StreamPanel.tsx` — SSE 이벤트 스트림 패널 (phase·delta·log·result)

### 시나리오 B 인프라 (Phase 3.3)
- `api/services/agentcore.py` — Memory client (short/long-term, namespace per persona×session)
- `api/services/code_interpreter.py` — AgentCore Code Interpreter Firecracker sandbox client
- `api/services/agent.py` — `TOOL_SPECS` (10 도구 JSON Schema) + `_dispatch_tool` + `_TRACE_BUF` ring buffer

### 시나리오 B 도구 구현 (Phase 3.4 — 10 tools)
- `api/services/tools/memory_recall.py`
- `api/services/tools/neptune_subgraph.py`
- `api/services/tools/semantic_search.py` (시나리오 A 내부 호출)
- `api/services/tools/kb_lookup.py`
- `api/services/tools/customer_lookup.py`
- `api/services/tools/cluster_predict.py`
- `api/services/tools/nearest_stations.py`
- `api/services/tools/campaign_simulator.py`
- `api/services/tools/lookalike_expand.py`
- `api/services/tools/behavior_change_detect.py` (PM+M 검출 포함)

### 시나리오 B 라우터·UI (Phase 3.4)
- `api/routers/chat.py` — POST `/api/chat` (SSE multi-turn)
- `web/app/chat/page.tsx` — 챗 UI
- `web/components/ChatThread.tsx` — 메시지 thread + markdown
- `web/components/ToolCallPanel.tsx` — 실시간 도구 호출 trace
- `web/components/PersonaSwitch.tsx` — 5 부서 토글

### 평가·테스트 (Phase 3.5)
- `tests/api/test_search.py` — search 통합 (httpx + 모킹 OS/Bedrock)
- `tests/api/test_chat.py` — chat 통합 (Bedrock Converse 모킹 + 도구 dispatch)
- `tests/services/test_persona.py`·`test_agent_tools.py`
- `scripts/eval_wow_queries.py` — 시나리오 A·B 5개씩 케이스 추가 (총 10 wow 쿼리)

### docs / ADR
- `docs/decisions/0006-tool-specs-design.md` — 10 도구 설계 근거
- `docs/decisions/0007-persona-registry-as-ssot.md` — 5 부서 단일 진실원

---

## Phase 3.1 — Common Services (5 tasks)

작업 디렉토리: `/home/ec2-user/my-project/ontology-for-gcc/`.

### Task 3.1.1: `api/services/bedrock.py` — Converse + embed + rerank

**Files:**
- Create: `api/services/bedrock.py`
- Test: `tests/services/test_bedrock.py`

- [ ] **Step 1: TDD — 모킹된 모델 호출 검증**

```python
# tests/services/test_bedrock.py
from unittest.mock import patch, MagicMock
from api.services.bedrock import converse, embed, rerank, ConverseRequest

def test_converse_basic():
    fake = {'output': {'message': {'role':'assistant','content': [{'text':'hi'}]}}}
    with patch('api.services.bedrock._client') as mc:
        mc.return_value.converse.return_value = fake
        out = converse(ConverseRequest(
            system='You are an analyst.',
            messages=[{'role':'user','content':[{'text':'hello'}]}],
        ))
        assert out['output']['message']['content'][0]['text'] == 'hi'

def test_embed_returns_1024_vector():
    with patch('api.services.bedrock._client') as mc:
        mc.return_value.invoke_model.return_value = {
            'body': MagicMock(read=lambda: b'{"embeddings": [{"float": [0.0]*1024}]}')}
        v = embed(['hello'])
        assert len(v) == 1 and len(v[0]) == 1024

def test_rerank_falls_back_to_input_order_on_error():
    docs = [{'text':'a'}, {'text':'b'}, {'text':'c'}]
    with patch('api.services.bedrock._client') as mc:
        mc.return_value.invoke_model.side_effect = Exception('rerank down')
        out = rerank('query', docs)
        assert [d['text'] for d in out] == ['a','b','c']
```

- [ ] **Step 2: 작성**

```python
# api/services/bedrock.py
"""Bedrock Sonnet 4.6 Converse + Cohere embed-v4 + Cohere rerank-v3."""
from __future__ import annotations
import json
from functools import lru_cache
from typing import Iterable
from pydantic import BaseModel
from api.aws_clients import session
from api.config import settings

@lru_cache
def _client():
    return session().client('bedrock-runtime')

class ConverseRequest(BaseModel):
    system: str
    messages: list[dict]
    tool_specs: list[dict] | None = None
    model_id: str | None = None
    temperature: float = 0.5
    max_tokens: int = 2048

def converse(req: ConverseRequest) -> dict:
    cl = _client()
    kwargs = {
        'modelId': req.model_id or settings.BEDROCK_CHAT_MODEL_ID,
        'system': [{'text': req.system}],
        'messages': req.messages,
        'inferenceConfig': {'temperature': req.temperature, 'maxTokens': req.max_tokens},
    }
    if req.tool_specs:
        kwargs['toolConfig'] = {'tools': req.tool_specs}
    return cl.converse(**kwargs)

def converse_stream(req: ConverseRequest):
    """yield delta/tool-use events (Bedrock streaming)."""
    cl = _client()
    kwargs = {
        'modelId': req.model_id or settings.BEDROCK_CHAT_MODEL_ID,
        'system': [{'text': req.system}],
        'messages': req.messages,
        'inferenceConfig': {'temperature': req.temperature, 'maxTokens': req.max_tokens},
    }
    if req.tool_specs:
        kwargs['toolConfig'] = {'tools': req.tool_specs}
    resp = cl.converse_stream(**kwargs)
    for event in resp['stream']:
        yield event

def embed(texts: list[str]) -> list[list[float]]:
    cl = _client()
    body = json.dumps({'texts': texts, 'input_type': 'search_document'})
    resp = cl.invoke_model(modelId=settings.BEDROCK_EMBED_MODEL_ID, body=body)
    payload = json.loads(resp['body'].read())
    return [e['float'] for e in payload['embeddings']]

def rerank(query: str, docs: list[dict], top_k: int = 10) -> list[dict]:
    """Cohere rerank-v3 cross-region inference profile.
    실패 시 입력 순서 그대로 반환 (fallback to RRF order)."""
    if not docs:
        return []
    cl = _client()
    try:
        body = json.dumps({
            'query': query,
            'documents': [d.get('text','') for d in docs],
            'top_n': min(top_k, len(docs)),
        })
        resp = cl.invoke_model(
            modelId=settings.BEDROCK_RERANKER_INFERENCE_PROFILE_ARN,
            body=body)
        scores = json.loads(resp['body'].read())['results']
        ordered = sorted(scores, key=lambda r: r['relevance_score'], reverse=True)
        return [docs[r['index']] for r in ordered]
    except Exception:
        return docs[:top_k]   # fallback
```

- [ ] **Step 3: 테스트 + 커밋**

```bash
mkdir -p tests/services
pytest tests/services/test_bedrock.py -v 2>&1 | tail -8
git add api/services/bedrock.py tests/services/test_bedrock.py
git commit -m "feat(api/services): bedrock — Converse + embed + rerank with fallback"
```

---

### Task 3.1.2: `api/services/opensearch.py` — hybrid_search (BM25 Nori + KNN, RRF)

**Files:**
- Create: `api/services/opensearch.py`
- Test: `tests/services/test_opensearch.py`

- [ ] **Step 1: TDD**

```python
# tests/services/test_opensearch.py
from unittest.mock import patch, MagicMock
from api.services.opensearch import hybrid_search, RRF_K

def _hits(ids: list[str]) -> dict:
    return {'hits': {'hits': [{'_id': i, '_score': 1.0/(j+1), '_source': {'text': i}} for j, i in enumerate(ids)]}}

def test_rrf_fuses_bm25_and_knn():
    cl = MagicMock()
    cl.search.side_effect = [_hits(['A','B','C']), _hits(['B','D','E'])]   # BM25, KNN
    with patch('api.services.opensearch.client', return_value=cl):
        out = hybrid_search('query', embedding=[0.0]*1024, size=5)
        ids = [r['_id'] for r in out]
        # B는 둘 다 등장 → top 1
        assert ids[0] == 'B'
        assert set(ids) == {'A','B','C','D','E'}
```

- [ ] **Step 2: 작성**

```python
# api/services/opensearch.py
"""hybrid_search: BM25 (Nori) + KNN (Cohere embed-v4) → RRF 융합."""
from __future__ import annotations
from collections import defaultdict
from functools import lru_cache
from opensearchpy import OpenSearch, RequestsHttpConnection
from boto3 import Session
from requests_aws4auth import AWS4Auth
from api.config import settings

RRF_K = 60   # fusion constant

@lru_cache
def client() -> OpenSearch:
    region = settings.AWS_REGION
    creds = Session().get_credentials()
    auth = AWS4Auth(creds.access_key, creds.secret_key, region, 'aoss', session_token=creds.token)
    return OpenSearch(
        hosts=[{'host': settings.OPENSEARCH_ENDPOINT.replace('https://',''), 'port': 443}],
        http_auth=auth, use_ssl=True, verify_certs=True,
        connection_class=RequestsHttpConnection, timeout=30,
    )

def _bm25(query: str, size: int) -> list[dict]:
    cl = client()
    body = {'size': size, 'query': {'match': {'text': query}}}
    return cl.search(index=settings.OPENSEARCH_INDEX, body=body)['hits']['hits']

def _knn(embedding: list[float], size: int) -> list[dict]:
    cl = client()
    body = {'size': size, 'query': {'knn': {'embedding': {'vector': embedding, 'k': size}}}}
    return cl.search(index=settings.OPENSEARCH_INDEX, body=body)['hits']['hits']

def hybrid_search(query: str, embedding: list[float], size: int = 20) -> list[dict]:
    """RRF: rank_score = sum(1/(K + rank_i))."""
    bm25 = _bm25(query, size)
    knn  = _knn(embedding, size)
    scores: dict[str, float] = defaultdict(float)
    by_id: dict[str, dict] = {}
    for rank, hit in enumerate(bm25):
        scores[hit['_id']] += 1.0 / (RRF_K + rank)
        by_id[hit['_id']] = hit
    for rank, hit in enumerate(knn):
        scores[hit['_id']] += 1.0 / (RRF_K + rank)
        by_id[hit['_id']] = hit
    ordered = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    return [by_id[k] for k, _ in ordered[:size]]
```

- [ ] **Step 3: 테스트 + 커밋**

```bash
pytest tests/services/test_opensearch.py -v 2>&1 | tail -5
git add api/services/opensearch.py tests/services/test_opensearch.py
git commit -m "feat(api/services): opensearch hybrid (BM25 Nori + KNN, RRF fusion K=60)"
```

---

### Task 3.1.3: `api/services/persona.py` — PERSONA_REGISTRY (5 부서) + ADR 0007

**Files:**
- Create: `api/services/persona.py`
- Create: `docs/decisions/0007-persona-registry-as-ssot.md`

- [ ] **Step 1: ADR 0007**

`docs/decisions/0007-persona-registry-as-ssot.md`:
```markdown
# ADR 0007 — PERSONA_REGISTRY as SSOT for 5 부서 페르소나

- Status: Accepted
- Date: 2026-05-08

## Context

5 부서 (마케팅/고객전략/데이터·AI/CRM·회원사업/리테일영업)가 동일 데이터를 다른 KPI 렌즈로 봐야 함 (spec §3.2 매트릭스). 이 매핑이 백엔드(라우터·system prompt·도구 가중치)와 프론트(사이드바·홈 카드)에 일관 적용되어야 함.

## Decision

- `api/services/persona.py:PERSONA_REGISTRY: dict[str, dict]` 단일 진실원.
- 각 entry는 `{persona_id, name_kr, kpi_focus, system_prompt_tone, scenario_priority, default_cohort}` 포함.
- 모든 라우터가 `request.persona_id`를 받아 registry lookup; 누락 시 default('marketing').
- 프론트 `PersonaSwitch.tsx`는 `/api/personas` 엔드포인트를 호출해 SSOT 따라감.

## Consequences

- 페르소나 추가·삭제·KPI 변경이 코드 한 곳만 수정.
- 시나리오 라우터가 모두 같은 패턴: `select_cohort(persona_id, code) → load_data → format_with_tone`.
- 프론트 하드코드 위험 제거.

## Alternatives Considered

1. 프론트·백엔드에 각자 5명 명시 — drift 위험.
2. DB(Neptune)에 Persona 노드 + 관계로 — 동적 변경 가능하나 PoC 단계엔 과함.
```

- [ ] **Step 2: `api/services/persona.py` 작성**

```python
# api/services/persona.py
"""5 부서 페르소나 SSOT + 시나리오 가중치·KPI."""
from __future__ import annotations
from typing import Literal

PersonaId = Literal['marketing', 'strategy', 'data-ai', 'crm', 'retail-ops']

PERSONA_REGISTRY: dict[PersonaId, dict] = {
    'marketing': {
        'name_kr': '마케팅',
        'kpi_focus': ['conversion', 'roas', 'reach', 'campaign_lift'],
        'tone': '캠페인 효율과 마케팅 성과를 분석하는 시니어 마케터의 어조',
        'scenario_priority': ['B','C','E','F','G','J','K','M','N','A'],
        'default_cohort': ['*'],
    },
    'strategy': {
        'name_kr': '고객전략',
        'kpi_focus': ['retention', 'clv', 'segment_size', 'compliance_rate'],
        'tone': '세그먼트·전략·약관 컴플라이언스를 깊이 보는 고객전략 매니저',
        'scenario_priority': ['D','E','H','I','J','K','M','A','C'],
        'default_cohort': ['deep-history','coupon-only'],
    },
    'data-ai': {
        'name_kr': '데이터·AI',
        'kpi_focus': ['cluster_quality', 'model_lift', 'data_completeness'],
        'tone': 'sklearn·embeddings·fairness를 다루는 데이터 사이언티스트',
        'scenario_priority': ['C','E','F','G','J','K','L','M','N'],
        'default_cohort': ['*'],
    },
    'crm': {
        'name_kr': 'CRM·회원사업',
        'kpi_focus': ['member_active', 'points_earned', 'plcc_attach'],
        'tone': '멤버십 등급·포인트·PLCC 보유율을 추적하는 CRM 매니저',
        'scenario_priority': ['B','D','F','G','I','L','M'],
        'default_cohort': ['deep-history','coupon-only'],
    },
    'retail-ops': {
        'name_kr': '리테일영업',
        'kpi_focus': ['station_volume', 'margin_pct', 'self_rate'],
        'tone': '주유소 운영·매출·셀프 비율을 보는 영업 매니저',
        'scenario_priority': ['C','H','L','N'],
        'default_cohort': ['deep-history','sales-only'],
    },
}

def get(persona_id: str | None) -> dict:
    pid = persona_id if persona_id in PERSONA_REGISTRY else 'marketing'
    return {**PERSONA_REGISTRY[pid], 'persona_id': pid}

def system_prompt(persona_id: str | None, scenario_code: str) -> str:
    p = get(persona_id)
    return (
        f'당신은 GS Caltex 사내 데이터 분석을 돕는 AI Agent입니다. '
        f'사용자는 {p["name_kr"]} 부서이며, 어조는 다음과 같습니다: {p["tone"]}. '
        f'현재 시나리오 코드는 {scenario_code}이며 KPI 우선순위는 {", ".join(p["kpi_focus"])} 입니다. '
        f'데이터 인사이트를 제시할 때 출처(real/synthetic/external)를 항상 명시하세요.'
    )
```

- [ ] **Step 3: 라우터 stub `/api/personas`**

`api/routers/personas.py`:
```python
from fastapi import APIRouter
from api.services.persona import PERSONA_REGISTRY
router = APIRouter(prefix='/api/personas', tags=['personas'])
@router.get('')
def list_personas():
    return [{'persona_id': k, **{kk: v for kk, vv in p.items() for kk, _ in [(kk,vv)]}}
            for k, p in PERSONA_REGISTRY.items()]
```

- [ ] **Step 4: 테스트**

```python
# tests/services/test_persona.py
from api.services.persona import get, system_prompt, PERSONA_REGISTRY

def test_5_departments():
    assert len(PERSONA_REGISTRY) == 5
    assert set(PERSONA_REGISTRY.keys()) == {'marketing','strategy','data-ai','crm','retail-ops'}

def test_default_marketing_on_unknown():
    assert get('unknown')['persona_id'] == 'marketing'

def test_system_prompt_contains_tone():
    p = system_prompt('marketing', 'A')
    assert '마케팅' in p and 'AI Agent' in p and 'A' in p
```

- [ ] **Step 5: 커밋**

```bash
pytest tests/services/test_persona.py -v 2>&1 | tail -5
git add api/services/persona.py api/routers/personas.py tests/services/test_persona.py docs/decisions/0007-persona-registry-as-ssot.md
git commit -m "feat(api/services): PERSONA_REGISTRY 5 부서 SSOT + ADR 0007"
```

---

### Task 3.1.4: `api/services/sse.py` — SSE 헬퍼 + 어휘

**Files:**
- Create: `api/services/sse.py`

- [ ] **Step 1: 작성 — 어휘 retail 그대로**

```python
# api/services/sse.py
"""SSE event 어휘: {"type": "phase|delta|log|final|result", "data": {...}}.
Frontend의 streamSSE<T>가 generic하게 소비."""
from __future__ import annotations
import json
from typing import AsyncIterator, Any

EventType = str   # 'phase' | 'delta' | 'log' | 'final' | 'result'

def sse_event(type_: EventType, data: Any) -> str:
    """단일 SSE message 라인."""
    payload = json.dumps({'type': type_, 'data': data}, ensure_ascii=False)
    return f'data: {payload}\n\n'

async def stream_phases(phases: AsyncIterator) -> AsyncIterator[str]:
    """async iterator → SSE bytes stream. 종료 시 final."""
    try:
        async for ev in phases:
            yield sse_event(*ev)   # ev = (type, data)
        yield sse_event('final', {'ok': True})
    except Exception as e:
        yield sse_event('final', {'ok': False, 'error': str(e)})
```

- [ ] **Step 2: 커밋**

```bash
git add api/services/sse.py
git commit -m "feat(api/services): SSE event helper (type/data 어휘 retail 호환)"
```

---

### Task 3.1.5: `api/services/guardrails.py` — Bedrock Guardrail apply

**Files:**
- Create: `api/services/guardrails.py`

- [ ] **Step 1: 작성**

```python
# api/services/guardrails.py
"""Bedrock Guardrail 입력 스크럽 + 출력 필터."""
from __future__ import annotations
import json
from api.aws_clients import session
from api.config import settings
from functools import lru_cache

@lru_cache
def _client():
    return session().client('bedrock-runtime')

def apply(text: str, source: str = 'INPUT') -> tuple[str, list[str]]:
    """returns (cleaned_text, list_of_violations)."""
    if not settings.BEDROCK_GUARDRAIL_ID:
        return text, []
    try:
        resp = _client().apply_guardrail(
            guardrailIdentifier=settings.BEDROCK_GUARDRAIL_ID,
            guardrailVersion='DRAFT',
            source=source,
            content=[{'text': {'text': text, 'qualifiers': []}}],
        )
        action = resp.get('action', 'NONE')
        if action == 'GUARDRAIL_INTERVENED':
            outputs = resp.get('outputs', [])
            cleaned = outputs[0].get('text','') if outputs else text
            assessments = resp.get('assessments', [])
            violations = [t.get('topic','unknown') for a in assessments
                          for t in (a.get('topicPolicy', {}).get('topics', []) or [])]
            return cleaned, violations
    except Exception:
        pass
    return text, []
```

- [ ] **Step 2: 커밋**

```bash
git add api/services/guardrails.py
git commit -m "feat(api/services): Guardrail apply input/output 필터"
```

---

## Phase 3.2 — 시나리오 A (Search) 골드 스탠다드 (5 tasks)

### Task 3.2.1: `api/services/search_pipeline.py` — query → embed → BM25+KNN → RRF → rerank

**Files:**
- Create: `api/services/search_pipeline.py`
- Test: `tests/services/test_search_pipeline.py`

- [ ] **Step 1: TDD**

```python
# tests/services/test_search_pipeline.py
from unittest.mock import patch
from api.services.search_pipeline import search

def test_pipeline_calls_embed_then_hybrid_then_rerank():
    with patch('api.services.search_pipeline.embed', return_value=[[0.0]*1024]) as me, \
         patch('api.services.search_pipeline.hybrid_search', return_value=[
                 {'_id': 'A', '_source': {'text': 'a'}}, {'_id': 'B', '_source': {'text':'b'}}]) as mh, \
         patch('api.services.search_pipeline.rerank', side_effect=lambda q, ds, top_k=10: ds[:top_k]) as mr:
        out = search(query='고급휘발유 충성', persona_id='marketing', size=10)
        me.assert_called_once_with(['고급휘발유 충성'])
        mh.assert_called_once()
        mr.assert_called_once()
        assert len(out['results']) == 2
```

- [ ] **Step 2: 작성**

```python
# api/services/search_pipeline.py
"""의미 검색 파이프라인 — query → embed → BM25+KNN(RRF) → rerank → 1-hop subgraph."""
from __future__ import annotations
from api.services.bedrock import embed, rerank
from api.services.opensearch import hybrid_search
from api.services.neptune import open_cypher
from api.services.persona import get as get_persona

def search(query: str, persona_id: str | None = None, size: int = 10) -> dict:
    p = get_persona(persona_id)
    
    # 1) embed
    vec = embed([query])[0]
    
    # 2) hybrid (BM25 + KNN, RRF)
    hits = hybrid_search(query, vec, size=size*2)
    
    # 3) rerank
    docs = [{'id': h['_id'], 'text': h['_source'].get('text',''), 'class_name': h['_source'].get('class_name'),
             'metadata': h['_source'].get('metadata', {}), 'rrf_score': h.get('_score', 0)}
            for h in hits]
    reranked = rerank(query, docs, top_k=size)
    
    # 4) 1-hop subgraph (top 5 nodes만)
    subgraph_ids = [d['id'] for d in reranked[:5]]
    subgraph = _hop1_subgraph(subgraph_ids)
    
    return {
        'query': query,
        'persona_id': p['persona_id'],
        'results': reranked,
        'subgraph': subgraph,
    }

def _hop1_subgraph(ids: list[str]) -> dict:
    if not ids:
        return {'nodes': [], 'edges': []}
    q = """UNWIND $ids AS id
           MATCH (n {id_key: id})-[r]-(m)
           RETURN n, r, m LIMIT 200"""
    res = open_cypher(q, parameters={'ids': ids})
    nodes_out, edges_out = [], []
    seen = set()
    for row in res.get('results', []):
        for n in (row.get('n'), row.get('m')):
            if n and n.get('~id') not in seen:
                seen.add(n['~id'])
                nodes_out.append({'id': n['~id'], 'label': n.get('~labels', [''])[0],
                                  'props': n.get('~properties', {})})
        r = row.get('r')
        if r:
            edges_out.append({'id': r['~id'], 'source': r['~start'],
                              'target': r['~end'], 'type': r.get('~type')})
    return {'nodes': nodes_out, 'edges': edges_out}
```

- [ ] **Step 3: 테스트 + 커밋**

```bash
pytest tests/services/test_search_pipeline.py -v 2>&1 | tail -5
git add api/services/search_pipeline.py tests/services/test_search_pipeline.py
git commit -m "feat(api/services): search_pipeline (embed→BM25+KNN+RRF→rerank→1-hop subgraph)"
```

---

### Task 3.2.2: `api/routers/search.py` — POST `/api/search` + `/api/search/stream`

**Files:**
- Create: `api/routers/search.py`
- Modify: `api/main.py` (router 등록)
- Test: `tests/api/test_search.py`

- [ ] **Step 1: TDD**

```python
# tests/api/test_search.py
import os; os.environ.setdefault('DEMO_PUBLIC_MODE', 'true')
from unittest.mock import patch
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

def test_search_post_returns_results():
    fake = {'query':'q','persona_id':'marketing','results':[{'id':'X','text':'x'}],'subgraph':{'nodes':[],'edges':[]}}
    with patch('api.routers.search.search', return_value=fake):
        r = client.post('/api/search', json={'query':'고급휘발유 충성','persona_id':'marketing'})
        assert r.status_code == 200
        assert r.json()['results'][0]['id'] == 'X'

def test_search_stream_yields_phases():
    fake = {'query':'q','persona_id':'marketing','results':[{'id':'X'}],'subgraph':{'nodes':[],'edges':[]}}
    with patch('api.routers.search.search', return_value=fake):
        with client.stream('POST', '/api/search/stream', json={'query':'x','persona_id':'marketing'}) as r:
            body = b''.join(r.iter_bytes())
            assert b'"type": "phase"' in body
            assert b'"type": "result"' in body
            assert b'"type": "final"' in body
```

- [ ] **Step 2: 작성**

```python
# api/routers/search.py
from __future__ import annotations
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.search_pipeline import search
from api.services.sse import sse_event, stream_phases
from api.services.persona import get as get_persona

router = APIRouter(prefix='/api', tags=['search'])

class SearchRequest(BaseModel):
    query: str
    persona_id: str | None = 'marketing'
    size: int = 10

@router.post('/search')
def search_sync(req: SearchRequest):
    return search(req.query, req.persona_id, req.size)

@router.post('/search/stream')
async def search_streaming(req: SearchRequest):
    async def gen():
        yield ('phase', {'name': 'embedding', 'persona': get_persona(req.persona_id)['name_kr']})
        out = search(req.query, req.persona_id, req.size)
        yield ('phase', {'name': 'reranked', 'count': len(out['results'])})
        yield ('phase', {'name': 'subgraph', 'nodes': len(out['subgraph']['nodes'])})
        yield ('result', out)
    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
```

- [ ] **Step 3: `api/main.py`에 router 등록**

```python
# api/main.py에 추가
from api.routers import search as search_router
app.include_router(search_router.router)
```

- [ ] **Step 4: 테스트 + 커밋**

```bash
pytest tests/api/test_search.py -v 2>&1 | tail -8
git add api/routers/search.py api/main.py tests/api/test_search.py
git commit -m "feat(api/routers): /api/search + /api/search/stream (SSE phases)"
```

---

### Task 3.2.3: `web/components/SubgraphView.tsx` + `StreamPanel.tsx`

**Files:**
- Create: `web/components/SubgraphView.tsx`
- Create: `web/components/StreamPanel.tsx`
- Create: `web/lib/api-client.ts` (보강 — streamSSE generic helper)

- [ ] **Step 1: api-client 보강**

```typescript
// web/lib/api-client.ts
export async function* streamSSE<T = any>(url: string, body: any): AsyncGenerator<{type: string, data: T}> {
  const r = await fetch(url, {
    method: 'POST', body: JSON.stringify(body),
    headers: {'Content-Type': 'application/json'},
  });
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n\n');
    buf = lines.pop() || '';
    for (const ln of lines) {
      const trimmed = ln.trim();
      if (!trimmed.startsWith('data: ')) continue;
      try { yield JSON.parse(trimmed.slice(6)); } catch {}
    }
  }
}
```

- [ ] **Step 2: SubgraphView.tsx**

```tsx
// web/components/SubgraphView.tsx
'use client';
import { useEffect, useRef } from 'react';

export default function SubgraphView({ nodes, edges }: { nodes: any[], edges: any[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let cy: any;
    (async () => {
      const cytoscape = (await import('cytoscape')).default;
      const elements = [
        ...nodes.map(n => ({ data: { id: n.id, label: n.label }})),
        ...edges.map(e => ({ data: { id: e.id, source: e.source, target: e.target, label: e.type }})),
      ];
      cy = cytoscape({
        container: ref.current,
        elements,
        style: [
          { selector: 'node', style: { label: 'data(label)', 'background-color': '#3b82f6', 'font-size': 10 }},
          { selector: 'edge', style: { width: 1, 'line-color': '#9ca3af', label: 'data(label)',
            'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'font-size': 9 }},
        ],
        layout: { name: 'cose', animate: false },
      });
    })();
    return () => { cy?.destroy(); };
  }, [nodes, edges]);
  return <div ref={ref} className='w-full h-[400px] border rounded bg-slate-50'/>;
}
```

- [ ] **Step 3: StreamPanel.tsx**

```tsx
// web/components/StreamPanel.tsx
'use client';

interface Event { type: string; data: any }

export default function StreamPanel({ events }: { events: Event[] }) {
  return (
    <div className='border rounded p-2 bg-slate-900 text-slate-100 font-mono text-xs h-48 overflow-y-auto'>
      {events.length === 0 && <div className='text-slate-500'>대기 중...</div>}
      {events.map((e, i) => (
        <div key={i} className='flex gap-2'>
          <span className={`w-14 ${e.type==='phase'?'text-amber-300':e.type==='delta'?'text-emerald-300':e.type==='log'?'text-sky-300':e.type==='result'?'text-purple-300':'text-slate-500'}`}>
            [{e.type}]
          </span>
          <span className='truncate'>{JSON.stringify(e.data).slice(0,200)}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 커밋**

```bash
git add web/components/SubgraphView.tsx web/components/StreamPanel.tsx web/lib/api-client.ts
git commit -m "feat(web/components): SubgraphView (Cytoscape) + StreamPanel + streamSSE helper"
```

---

### Task 3.2.4: `web/app/search/page.tsx` — 검색 페이지

**Files:**
- Create: `web/app/search/page.tsx`

- [ ] **Step 1: 작성**

```tsx
// web/app/search/page.tsx
'use client';
import { useState } from 'react';
import { streamSSE } from '../../lib/api-client';
import SubgraphView from '../../components/SubgraphView';
import StreamPanel from '../../components/StreamPanel';
import DataSourceBadge from '../../components/DataSourceBadge';

export default function SearchPage() {
  const [query, setQuery] = useState('고급휘발유에 충성도가 높은 30대 직장인');
  const [persona, setPersona] = useState('marketing');
  const [events, setEvents] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [subgraph, setSubgraph] = useState<{nodes:any[], edges:any[]}>({nodes:[], edges:[]});
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true); setEvents([]); setResults([]); setSubgraph({nodes:[], edges:[]});
    for await (const ev of streamSSE('/api/search/stream', { query, persona_id: persona, size: 10 })) {
      setEvents(prev => [...prev, ev]);
      if (ev.type === 'result') {
        setResults(ev.data.results || []);
        setSubgraph(ev.data.subgraph || {nodes:[], edges:[]});
      }
    }
    setLoading(false);
  }

  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-4'>A. 의미 검색 + 1-hop subgraph</h1>
      <div className='flex gap-2 mb-4'>
        <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/>
      </div>
      <div className='flex gap-2 mb-4'>
        <input className='flex-1 border rounded px-3 py-2' value={query}
               onChange={e=>setQuery(e.target.value)} placeholder='자연어 쿼리'/>
        <select className='border rounded px-3' value={persona} onChange={e=>setPersona(e.target.value)}>
          <option value='marketing'>마케팅</option>
          <option value='strategy'>고객전략</option>
          <option value='data-ai'>데이터·AI</option>
          <option value='crm'>CRM·회원사업</option>
          <option value='retail-ops'>리테일영업</option>
        </select>
        <button onClick={go} disabled={loading}
                className='bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50'>
          {loading?'검색 중...':'검색'}
        </button>
      </div>

      <StreamPanel events={events}/>

      <div className='grid grid-cols-2 gap-4 mt-4'>
        <div>
          <h3 className='font-semibold mb-2'>결과 ({results.length})</h3>
          <ul className='space-y-1'>
            {results.map((r:any, i:number) => (
              <li key={i} className='border rounded p-2 text-sm'>
                <div className='font-mono text-xs text-slate-400'>{r.class_name} · {r.id}</div>
                <div>{r.text}</div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className='font-semibold mb-2'>1-hop Subgraph</h3>
          <SubgraphView nodes={subgraph.nodes} edges={subgraph.edges}/>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 + 커밋**

```bash
cd web && npx tsc --noEmit && cd -
git add web/app/search/page.tsx
git commit -m "feat(web/app/search): 시나리오 A 검색 페이지 (입력·SSE·결과·subgraph)"
```

---

### Task 3.2.5: `eval_wow_queries.py`에 시나리오 A 5 케이스 추가

**Files:**
- Modify: `scripts/eval_wow_queries.py`

- [ ] **Step 1: 5 wow 케이스 — 페르소나별 1개씩**

`scripts/eval_wow_queries.py`의 `WOW_QUERIES` 리스트에 추가:

```python
WOW_QUERIES.extend([
    {'scenario': 'A', 'persona': 'marketing',
     'query': '고급휘발유에 충성도가 높은 30대 직장인',
     'expects': lambda r: any('premium' in str(x).lower() or '고급' in str(x) for x in r.get('results', [])),
     'min_results': 3},
    {'scenario': 'A', 'persona': 'strategy',
     'query': '약관 동의 안 한 고객 중 매출 활발한 사람',
     'expects': lambda r: len(r.get('results', [])) >= 2 and any('term' in str(x).lower() or '약관' in str(x) for x in r.get('subgraph', {}).get('nodes', [])),
     'min_results': 2},
    {'scenario': 'A', 'persona': 'data-ai',
     'query': '디젤에서 고급휘발유로 전환한 고객',
     'expects': lambda r: any('diesel' in str(x).lower() and 'premium' in str(x).lower()
                              for x in [json.dumps(r)]),
     'min_results': 2},
    {'scenario': 'A', 'persona': 'crm',
     'query': 'PLCC 보유 고객의 평균 객단가',
     'expects': lambda r: any('PLCC' in str(x) for x in r.get('results', [])),
     'min_results': 1},
    {'scenario': 'A', 'persona': 'retail-ops',
     'query': '셀프 주유소 매출 상위 시도',
     'expects': lambda r: any('self' in str(x).lower() or '셀프' in str(x) for x in r.get('results', [])),
     'min_results': 1},
])
```

- [ ] **Step 2: 평가 dry-run (배포된 환경 또는 mock)**

```bash
python3 scripts/eval_wow_queries.py --scenarios A 2>&1 | tail -10
```
Expected: 5 cases, ≥85% pass.

- [ ] **Step 3: 커밋**

```bash
git add scripts/eval_wow_queries.py
git commit -m "test(eval): 시나리오 A 5 wow 케이스 (5 페르소나 각 1)"
```

---

## Phase 3.3 — AgentCore Memory + Code Interpreter (2 tasks)

### Task 3.3.1: `api/services/agentcore.py` — Memory client (short/long-term)

**Files:**
- Create: `api/services/agentcore.py`
- Test: `tests/services/test_agentcore.py`

- [ ] **Step 1: 작성**

```python
# api/services/agentcore.py
"""AgentCore Memory client — short-term(session) + long-term(user) namespaces."""
from __future__ import annotations
from functools import lru_cache
from api.aws_clients import session
from api.config import settings

@lru_cache
def _client():
    return session().client('bedrock-agentcore-control')

def _ns_short(persona_id: str, session_id: str) -> str:
    return f'/short/{persona_id}/{session_id}'

def _ns_long(persona_id: str, cust_id: str | None) -> str:
    return f'/long/{persona_id}/{cust_id or "anon"}'

def write_event(memory_id: str, persona_id: str, session_id: str,
                role: str, content: str, cust_id: str | None = None):
    if not memory_id:
        return
    cl = _client()
    cl.create_event(
        memoryId=memory_id,
        actorId=cust_id or 'anon',
        sessionId=session_id,
        eventTimestamp=None,
        payload=[{'conversational': {'role': role, 'content': {'text': content}}}],
    )

def recall(memory_id: str, persona_id: str, session_id: str,
           query: str, cust_id: str | None = None, limit: int = 5) -> list[dict]:
    """semanticSearch — namespace 기반 회상."""
    if not memory_id:
        return []
    cl = _client()
    try:
        resp = cl.retrieve_records(
            memoryId=memory_id,
            namespace=_ns_long(persona_id, cust_id),
            searchCriteria={'searchQuery': query, 'topK': limit},
        )
        return [r.get('content', {}) for r in resp.get('memoryRecords', [])]
    except Exception:
        return []
```

- [ ] **Step 2: 테스트 + 커밋**

```python
# tests/services/test_agentcore.py
from unittest.mock import patch, MagicMock
from api.services.agentcore import recall, write_event

def test_recall_returns_empty_when_no_memory_id():
    assert recall('', 'marketing', 's1', 'q') == []

def test_write_event_no_op_when_no_memory_id():
    write_event('', 'm', 's1', 'user', 'hi')   # no exception
```

```bash
pytest tests/services/test_agentcore.py -v 2>&1 | tail -5
git add api/services/agentcore.py tests/services/test_agentcore.py
git commit -m "feat(api/services): AgentCore Memory short/long-term wrapper"
```

---

### Task 3.3.2: `api/services/code_interpreter.py` — sandbox client

**Files:**
- Create: `api/services/code_interpreter.py`

- [ ] **Step 1: 작성**

```python
# api/services/code_interpreter.py
"""AgentCore Code Interpreter Firecracker microVM 클라이언트.
matplotlib + NanumGothic 한글 지원. PNG bytes 반환."""
from __future__ import annotations
import base64
from functools import lru_cache
from api.aws_clients import session

@lru_cache
def _client():
    return session().client('bedrock-agentcore')

NANUM_PREAMBLE = """
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams['font.family'] = 'NanumGothic'
plt.rcParams['axes.unicode_minus'] = False
"""

def execute(code: str, files: list[dict] | None = None, timeout_s: int = 60) -> dict:
    """returns {'output': str, 'images': list[bytes(PNG)]}."""
    cl = _client()
    full_code = NANUM_PREAMBLE + '\n' + code
    try:
        resp = cl.execute_code(code=full_code, files=files or [], timeoutSeconds=timeout_s)
        images = [base64.b64decode(img['data']) for img in resp.get('images', [])]
        return {'output': resp.get('stdout', ''), 'images': images,
                'error': resp.get('stderr', '')}
    except Exception as e:
        return {'output': '', 'images': [], 'error': str(e)}
```

- [ ] **Step 2: 커밋**

```bash
git add api/services/code_interpreter.py
git commit -m "feat(api/services): Code Interpreter sandbox + NanumGothic preamble"
```

---

## Phase 3.4 — 시나리오 B (Marketer Chat Agent) — 10 도구 + ADR 0006

### Task 3.4.1: `api/services/agent.py` — TOOL_SPECS 10개 + dispatch + ADR 0006

**Files:**
- Create: `api/services/agent.py`
- Create: `docs/decisions/0006-tool-specs-design.md`

- [ ] **Step 1: ADR 0006**

`docs/decisions/0006-tool-specs-design.md`:
```markdown
# ADR 0006 — TOOL_SPECS 10 도구 설계

- Status: Accepted
- Date: 2026-05-08

## Context

PDF Scenario 1의 마케터 ↔ AI Agent dialog가 자연스럽게 흐르려면 Bedrock Converse가 다음 능력을 도구로 호출 가능해야 함:
- 그래프 탐색 (1-hop subgraph, 고객 lookup, nearest stations)
- ML 액션 (cluster predict, lookalike expand, behavior change)
- 시뮬레이션 (campaign ROI)
- 회상 (memory recall, kb lookup)
- 의미 검색 (semantic search → 시나리오 A)

## Decision

10 도구 단일 등록점 `TOOL_SPECS` (JSON Schema list). `_dispatch_tool(name, input_dict) → output_dict` 분기. 모든 도구 호출은 `_TRACE_BUF` (ring buffer 200) 에 기록 → 운영 콘솔에서 timeline 시각화.

## Consequences

- 도구 추가는 (1) TOOL_SPECS entry + (2) `tools/<name>.py` 구현 + (3) `_dispatch_tool` 분기 한 줄.
- system prompt에 도구 chaining 힌트 명시 (e.g. "semantic_search 후 customer_lookup으로 디테일 확장").

## Alternatives

1. 단일 거대 도구 — 추론 품질 저하.
2. 도구 없이 SQL only — 그래프 사용 불가.
```

- [ ] **Step 2: `api/services/agent.py` 작성**

```python
# api/services/agent.py
"""TOOL_SPECS 단일 등록점 + dispatch + 트레이스 ring buffer."""
from __future__ import annotations
from collections import deque
from typing import Any

_TRACE_BUF: deque = deque(maxlen=200)

def trace_log(name: str, input: dict, output: Any, ms: int):
    _TRACE_BUF.append({'tool': name, 'input': input, 'output': output, 'ms': ms})

def get_trace_buf() -> list[dict]:
    return list(_TRACE_BUF)

TOOL_SPECS: list[dict] = [
    {'toolSpec': {
        'name': 'memory_recall',
        'description': 'AgentCore Memory의 long-term namespace에서 의미적으로 관련된 과거 대화·인사이트를 회상한다. 마케터가 "지난번에 말씀드렸던..." 처럼 컨텍스트 회복할 때 사용.',
        'inputSchema': {'json': {'type':'object','properties':{
            'query': {'type':'string'}, 'top_k': {'type':'integer','default':5}
        },'required':['query']}}}},
    {'toolSpec': {
        'name': 'neptune_subgraph',
        'description': '특정 노드 ID를 시드로 1-hop 또는 2-hop subgraph를 가져온다. 페르소나·시나리오에 적합한 cohort 필터(data_depth)를 자동 적용.',
        'inputSchema': {'json': {'type':'object','properties':{
            'seed_ids': {'type':'array','items':{'type':'string'}}, 'hops': {'type':'integer','default':1},
        },'required':['seed_ids']}}}},
    {'toolSpec': {
        'name': 'semantic_search',
        'description': '자연어 query로 의미 검색 (시나리오 A 재사용). 결과는 reranked 문서 리스트.',
        'inputSchema': {'json': {'type':'object','properties':{
            'query': {'type':'string'}, 'size': {'type':'integer','default':10}
        },'required':['query']}}}},
    {'toolSpec': {
        'name': 'kb_lookup',
        'description': 'Bedrock Knowledge Base에서 정책·약관·매뉴얼 문서 조회.',
        'inputSchema': {'json': {'type':'object','properties':{
            'query': {'type':'string'}, 'top_k': {'type':'integer','default':3}
        },'required':['query']}}}},
    {'toolSpec': {
        'name': 'customer_lookup',
        'description': '비식별고객번호로 단일 고객 노드 + 주요 행동 요약 (최근 거래·약관·앱 활동).',
        'inputSchema': {'json': {'type':'object','properties':{
            'cust_id': {'type':'string'}
        },'required':['cust_id']}}}},
    {'toolSpec': {
        'name': 'cluster_predict',
        'description': '고객 set의 클러스터 분포·각 클러스터의 행동 특징 요약 반환. 시나리오 E와 연계.',
        'inputSchema': {'json': {'type':'object','properties':{
            'cust_ids': {'type':'array','items':{'type':'string'}}
        },'required':['cust_ids']}}}},
    {'toolSpec': {
        'name': 'nearest_stations',
        'description': '위경도·반경(km)을 받아 haversine k-NN으로 GSC + 경쟁사 주유소 반환.',
        'inputSchema': {'json': {'type':'object','properties':{
            'lat': {'type':'number'}, 'lon': {'type':'number'},
            'radius_km': {'type':'number','default':5.0}, 'k': {'type':'integer','default':10}
        },'required':['lat','lon']}}}},
    {'toolSpec': {
        'name': 'campaign_simulator',
        'description': '쿠폰 액수·타겟 cohort를 받아 예상 전환률·매출·ROI 시뮬레이션. CampaignAggregation의 사전계산 KPI를 reference.',
        'inputSchema': {'json': {'type':'object','properties':{
            'coupon_amt': {'type':'integer'}, 'target_segment_id': {'type':'string'},
            'duration_days': {'type':'integer','default':30}
        },'required':['coupon_amt','target_segment_id']}}}},
    {'toolSpec': {
        'name': 'lookalike_expand',
        'description': '시드 고객 set에서 임베딩 유사도 상위 X% 추출 (시나리오 F와 연계).',
        'inputSchema': {'json': {'type':'object','properties':{
            'seed_cust_ids': {'type':'array','items':{'type':'string'}},
            'top_pct': {'type':'number','default':0.20}
        },'required':['seed_cust_ids']}}}},
    {'toolSpec': {
        'name': 'behavior_change_detect',
        'description': '시계열 행동 변화 패턴 자동 검출 (디젤→고급휘발유 전환, PM+M 92 RON 혼유 등). PDF 3페이지의 시그니처 인사이트.',
        'inputSchema': {'json': {'type':'object','properties':{
            'pattern': {'type':'string','enum':['fuel_grade_transition','pm_m_mixing','app_signup_after_install']},
            'cohort_filter': {'type':'array','items':{'type':'string'},
                              'description':'data_depth filter (e.g. ["deep-history"])'}
        },'required':['pattern']}}}},
]
assert len({t['toolSpec']['name'] for t in TOOL_SPECS}) == 10, "10 tools required"

def dispatch(name: str, input: dict, persona_id: str, session_id: str, cust_id: str | None) -> dict:
    """라우터 — Task 3.4.2 ~ 3.4.4의 도구 모듈로 위임."""
    import time
    t0 = time.monotonic()
    from api.services.tools import (memory_recall, neptune_subgraph, semantic_search, kb_lookup,
                                     customer_lookup, cluster_predict, nearest_stations,
                                     campaign_simulator, lookalike_expand, behavior_change_detect)
    routes = {
        'memory_recall': memory_recall.run, 'neptune_subgraph': neptune_subgraph.run,
        'semantic_search': semantic_search.run, 'kb_lookup': kb_lookup.run,
        'customer_lookup': customer_lookup.run, 'cluster_predict': cluster_predict.run,
        'nearest_stations': nearest_stations.run, 'campaign_simulator': campaign_simulator.run,
        'lookalike_expand': lookalike_expand.run, 'behavior_change_detect': behavior_change_detect.run,
    }
    fn = routes.get(name)
    if not fn:
        return {'error': f'unknown tool: {name}'}
    out = fn(input, persona_id=persona_id, session_id=session_id, cust_id=cust_id)
    ms = int((time.monotonic() - t0) * 1000)
    trace_log(name, input, out, ms)
    return out
```

- [ ] **Step 3: 테스트 + 커밋**

```python
# tests/services/test_agent_tools.py
from api.services.agent import TOOL_SPECS

def test_10_tools_with_unique_names():
    names = [t['toolSpec']['name'] for t in TOOL_SPECS]
    assert len(names) == 10 and len(set(names)) == 10

def test_each_tool_has_schema():
    for t in TOOL_SPECS:
        spec = t['toolSpec']
        assert 'name' in spec and 'description' in spec
        assert spec['inputSchema']['json']['type'] == 'object'
```

```bash
pytest tests/services/test_agent_tools.py -v 2>&1 | tail -5
git add api/services/agent.py tests/services/test_agent_tools.py docs/decisions/0006-tool-specs-design.md
git commit -m "feat(api/services): TOOL_SPECS 10 tools + dispatch + trace buffer (ADR 0006)"
```

---

### Task 3.4.2: 10 도구 구현 — `api/services/tools/*.py`

**Files:** 10 파일을 한 task에서 일괄 작성 (각 ~25 line, 표준 시그니처).

**시그니처 컨벤션**: 모든 도구 모듈은 `def run(input: dict, *, persona_id: str, session_id: str, cust_id: str | None) -> dict` 노출.

- [ ] **Step 1: 디렉토리 + `__init__.py`**

```bash
mkdir -p api/services/tools
touch api/services/tools/__init__.py
```

- [ ] **Step 2: `memory_recall.py`**

```python
# api/services/tools/memory_recall.py
from api.services.agentcore import recall
from api.config import settings
def run(input, *, persona_id, session_id, cust_id):
    items = recall(settings.AGENTCORE_MEMORY_ID, persona_id, session_id,
                   input['query'], cust_id, input.get('top_k', 5))
    return {'recalled': items}
```

- [ ] **Step 3: `neptune_subgraph.py`**

```python
# api/services/tools/neptune_subgraph.py
from api.services.neptune import open_cypher
from api.services.cohort import select
def run(input, *, persona_id, session_id, cust_id):
    seed_ids = input['seed_ids']
    hops = input.get('hops', 1)
    pattern = '-[r]-(m)' if hops == 1 else '-[r]-(:*)-[r2]-(m)'
    q = f"UNWIND $ids AS id MATCH (n {{id_key: id}}){pattern} RETURN n, r, m LIMIT 200"
    res = open_cypher(q, parameters={'ids': seed_ids})
    return {'subgraph': res.get('results', []),
            'cohort_filter': select(persona_id, 'B')}
```

- [ ] **Step 4: `semantic_search.py`**

```python
# api/services/tools/semantic_search.py
from api.services.search_pipeline import search
def run(input, *, persona_id, session_id, cust_id):
    return search(input['query'], persona_id, input.get('size', 10))
```

- [ ] **Step 5: `kb_lookup.py`**

```python
# api/services/tools/kb_lookup.py
from functools import lru_cache
from api.aws_clients import session
from api.config import settings
@lru_cache
def _agent(): return session().client('bedrock-agent-runtime')
def run(input, *, persona_id, session_id, cust_id):
    if not settings.BEDROCK_KB_ID:
        return {'snippets': []}
    try:
        resp = _agent().retrieve(
            knowledgeBaseId=settings.BEDROCK_KB_ID,
            retrievalQuery={'text': input['query']},
            retrievalConfiguration={'vectorSearchConfiguration': {'numberOfResults': input.get('top_k', 3)}})
        return {'snippets': [r['content']['text'] for r in resp.get('retrievalResults', [])]}
    except Exception as e:
        return {'snippets': [], 'error': str(e)}
```

- [ ] **Step 6: `customer_lookup.py`**

```python
# api/services/tools/customer_lookup.py
from api.services.neptune import open_cypher
def run(input, *, persona_id, session_id, cust_id):
    cid = input['cust_id']
    q = """MATCH (c:Customer {cust_id: $cid})
           OPTIONAL MATCH (c)-[:REFUELED]->(t:FuelTransaction)
           OPTIONAL MATCH (c)-[:AGREED_TO]->(ta:TermAgreement)
           RETURN c, count(DISTINCT t) AS tx_count, count(DISTINCT ta) AS terms_count
           LIMIT 1"""
    res = open_cypher(q, parameters={'cid': cid})
    return {'customer': res.get('results', [None])[0] or {}}
```

- [ ] **Step 7: `cluster_predict.py`**

```python
# api/services/tools/cluster_predict.py
from api.services.neptune import open_cypher
def run(input, *, persona_id, session_id, cust_id):
    ids = input['cust_ids']
    q = """UNWIND $ids AS id
           MATCH (c:Customer {cust_id: id})-[:BELONGS_TO]->(cl:Cluster)
           RETURN cl.label AS label, count(c) AS cnt"""
    res = open_cypher(q, parameters={'ids': ids})
    return {'distribution': res.get('results', [])}
```

- [ ] **Step 8: `nearest_stations.py`**

```python
# api/services/tools/nearest_stations.py
from math import radians, sin, cos, sqrt, atan2
from api.services.neptune import open_cypher
def _haversine(la1, lo1, la2, lo2):
    R = 6371; la1,lo1,la2,lo2 = map(radians,[la1,lo1,la2,lo2])
    dl = lo2-lo1; da = la2-la1
    a = sin(da/2)**2 + cos(la1)*cos(la2)*sin(dl/2)**2
    return 2*R*atan2(sqrt(a), sqrt(1-a))
def run(input, *, persona_id, session_id, cust_id):
    res = open_cypher('MATCH (s:GasStation) RETURN s LIMIT 5000')
    items = res.get('results', [])
    out = []
    for it in items:
        s = it.get('s', {})
        d = _haversine(input['lat'], input['lon'], s.get('lat',0), s.get('lon',0))
        if d <= input.get('radius_km', 5.0):
            out.append({'station': s, 'distance_km': round(d, 2)})
    out.sort(key=lambda x: x['distance_km'])
    return {'stations': out[:input.get('k', 10)]}
```

- [ ] **Step 9: `campaign_simulator.py`**

```python
# api/services/tools/campaign_simulator.py
from api.services.neptune import open_cypher
def run(input, *, persona_id, session_id, cust_id):
    seg = input['target_segment_id']
    coupon = input['coupon_amt']
    duration = input.get('duration_days', 30)
    # 사전계산 CampaignAggregation 평균 ROI를 reference로
    q = """MATCH (a:CampaignAggregation)
           RETURN avg(a.roi_pct) AS avg_roi, avg(toFloat(a.converted_count)/a.target_count) AS avg_conv"""
    res = open_cypher(q)
    base = res.get('results', [{'avg_roi': 15.0, 'avg_conv': 0.035}])[0]
    avg_conv = base.get('avg_conv', 0.035)
    # 쿠폰 액수 영향 (히어리스틱: 1000원→2.5x 베이스, 5000원→4x)
    lift = 1.0 + min(coupon / 500.0, 4.0)
    proj_conv = min(avg_conv * lift, 0.5)
    return {'segment_id': seg, 'coupon_amt': coupon, 'duration_days': duration,
            'projected_conversion': round(proj_conv, 4),
            'baseline_roi_pct': round(base.get('avg_roi', 15.0), 2),
            'note': 'Bayesian point estimate; 시나리오 G에서 분포 시각화'}
```

- [ ] **Step 10: `lookalike_expand.py`**

```python
# api/services/tools/lookalike_expand.py
from api.services.bedrock import embed
from api.services.opensearch import client
from api.config import settings
def run(input, *, persona_id, session_id, cust_id):
    seed = input['seed_cust_ids']
    top_pct = input.get('top_pct', 0.20)
    if not seed:
        return {'expanded': [], 'count': 0}
    # seed들의 임베딩 평균 → KNN 검색 (간단판)
    seed_text = ' '.join(seed)
    vec = embed([seed_text])[0]
    cl = client()
    body = {'size': max(int(50000 * top_pct), 100),
            'query': {'knn': {'embedding': {'vector': vec, 'k': 1000}}}}
    hits = cl.search(index=settings.OPENSEARCH_INDEX, body=body)['hits']['hits']
    expanded = [h['_id'] for h in hits if h['_id'] not in set(seed)]
    return {'expanded': expanded[:1000], 'count': len(expanded)}
```

- [ ] **Step 11: `behavior_change_detect.py` — PM+M·디젤→고급 핵심**

```python
# api/services/tools/behavior_change_detect.py
"""PDF 3페이지 시그니처 인사이트 — PM+M 혼유, 유종 전환."""
from api.services.neptune import open_cypher
from api.services.cohort import select

def run(input, *, persona_id, session_id, cust_id):
    pattern = input['pattern']
    cohort_filter = input.get('cohort_filter') or select(persona_id, 'K')
    if pattern == 'pm_m_mixing':
        q = """MATCH (c:Customer)-[:REFUELED]->(t1:FuelTransaction)-[:AT]->(s:GasStation)
               MATCH (c)-[:REFUELED]->(t2:FuelTransaction)-[:AT]->(s)
               WHERE t1.fuel_grade='premium' AND t2.fuel_grade='regular'
                 AND substring(t1.ts,0,10) = substring(t2.ts,0,10)
                 AND c.data_depth IN $depths
               RETURN c.cust_id AS cust_id, c.data_depth AS depth,
                      count(DISTINCT substring(t1.ts,0,10)) AS pm_m_days
               ORDER BY pm_m_days DESC LIMIT 50"""
        res = open_cypher(q, parameters={'depths': cohort_filter})
        return {'pattern': 'pm_m_mixing', 'count': len(res.get('results', [])),
                'matches': res.get('results', []),
                'note': 'PM+M same-day same-station — 92 RON DIY 후보'}
    elif pattern == 'fuel_grade_transition':
        q = """MATCH (c:Customer)-[:REFUELED]->(t:FuelTransaction)
               WHERE c.data_depth IN $depths
               WITH c, t.fuel_grade AS grade, t.ts AS ts ORDER BY ts
               WITH c, collect(grade) AS grades
               WHERE size(grades) > 4
                 AND grades[-1] <> grades[-5]
                 AND grades[-1] IN ['premium','regular']
                 AND grades[-5] = 'diesel'
               RETURN c.cust_id AS cust_id, grades[-5] AS prev, grades[-1] AS now
               LIMIT 50"""
        res = open_cypher(q, parameters={'depths': cohort_filter})
        return {'pattern': 'fuel_grade_transition', 'matches': res.get('results', []),
                'note': '디젤→휘발유 전환 — Celebration 캠페인 후보'}
    elif pattern == 'app_signup_after_install':
        return {'pattern': 'app_signup_after_install',
                'note': 'PDF 3페이지 시나리오 — Plan 4의 시나리오 M에서 본격 구현'}
    return {'error': f'unknown pattern: {pattern}'}
```

- [ ] **Step 12: 테스트 + 커밋**

```python
# tests/services/test_agent_tools_dispatch.py
from unittest.mock import patch
from api.services.agent import dispatch

def test_dispatch_unknown_tool():
    out = dispatch('nope', {}, persona_id='marketing', session_id='s', cust_id=None)
    assert 'error' in out

def test_dispatch_logs_to_trace_buffer():
    from api.services.agent import _TRACE_BUF
    _TRACE_BUF.clear()
    with patch('api.services.tools.semantic_search.run', return_value={'ok':True}):
        dispatch('semantic_search', {'query':'x'}, persona_id='marketing', session_id='s', cust_id=None)
    assert len(_TRACE_BUF) == 1
    assert _TRACE_BUF[0]['tool'] == 'semantic_search'
```

```bash
pytest tests/services/test_agent_tools_dispatch.py -v 2>&1 | tail -5
git add api/services/tools/ tests/services/test_agent_tools_dispatch.py
git commit -m "feat(api/services/tools): 10 tools (memory/subgraph/search/kb/customer/cluster/nearest/campaign/lookalike/behavior)"
```

---

### Task 3.4.3: `api/routers/chat.py` — Converse 다회차 + SSE + 도구 dispatch

**Files:**
- Create: `api/routers/chat.py`
- Modify: `api/main.py`
- Test: `tests/api/test_chat.py`

- [ ] **Step 1: 작성**

```python
# api/routers/chat.py
"""POST /api/chat (SSE multi-turn). AgentCore Memory + 10 도구."""
from __future__ import annotations
import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.bedrock import converse_stream, ConverseRequest
from api.services.persona import system_prompt
from api.services.agent import TOOL_SPECS, dispatch, get_trace_buf
from api.services.agentcore import write_event
from api.services.guardrails import apply as guardrail_apply
from api.services.sse import sse_event, stream_phases
from api.config import settings

router = APIRouter(prefix='/api', tags=['chat'])

class ChatRequest(BaseModel):
    message: str
    persona_id: str | None = 'marketing'
    session_id: str = 'default'
    cust_id: str | None = None
    history: list[dict] = []   # 이전 turn (Bedrock messages 형식)

@router.post('/chat')
async def chat(req: ChatRequest):
    async def gen():
        # 1) input guardrail
        cleaned, violations = guardrail_apply(req.message, source='INPUT')
        if violations:
            yield ('log', {'guardrail': 'INPUT', 'violations': violations})
        
        # 2) memory write (user turn)
        write_event(settings.AGENTCORE_MEMORY_ID, req.persona_id or 'marketing',
                    req.session_id, 'user', cleaned, req.cust_id)
        
        sys_prompt = system_prompt(req.persona_id, 'B')
        messages = req.history + [{'role':'user','content':[{'text': cleaned}]}]
        
        yield ('phase', {'name': 'turn_start', 'persona': req.persona_id})
        
        # 3) Converse loop with tool use
        max_iters = 6
        for it in range(max_iters):
            req_b = ConverseRequest(system=sys_prompt, messages=messages, tool_specs=TOOL_SPECS)
            tool_calls_buffer = []
            assistant_chunks = []
            stop_reason = None
            for ev in converse_stream(req_b):
                if 'contentBlockDelta' in ev:
                    delta = ev['contentBlockDelta']['delta']
                    if 'text' in delta:
                        assistant_chunks.append(delta['text'])
                        yield ('delta', {'text': delta['text']})
                elif 'contentBlockStart' in ev:
                    block = ev['contentBlockStart']
                    if 'toolUse' in block.get('start', {}):
                        tu = block['start']['toolUse']
                        tool_calls_buffer.append({'name': tu['name'], 'toolUseId': tu['toolUseId'], 'input': ''})
                elif 'contentBlockDelta' in ev and 'toolUse' in ev['contentBlockDelta'].get('delta', {}):
                    tool_calls_buffer[-1]['input'] += ev['contentBlockDelta']['delta']['toolUse']['input']
                elif 'messageStop' in ev:
                    stop_reason = ev['messageStop']['stopReason']
            
            if assistant_chunks:
                messages.append({'role':'assistant','content':[{'text': ''.join(assistant_chunks)}]})
            
            if not tool_calls_buffer or stop_reason == 'end_turn':
                break
            
            # 4) tool dispatch
            tool_results = []
            for tc in tool_calls_buffer:
                try: input_dict = json.loads(tc['input']) if tc['input'] else {}
                except json.JSONDecodeError: input_dict = {}
                yield ('log', {'tool_call': tc['name'], 'input': input_dict})
                output = dispatch(tc['name'], input_dict, req.persona_id or 'marketing',
                                  req.session_id, req.cust_id)
                yield ('log', {'tool_result': tc['name'], 'output_summary': str(output)[:200]})
                tool_results.append({'toolUseId': tc['toolUseId'],
                                     'content': [{'json': output}]})
            messages.append({'role':'user','content':[{'toolResult': tr} for tr in tool_results]})
        
        # 5) output guardrail + memory write (assistant)
        final_text = ''.join(assistant_chunks)
        clean_out, viol = guardrail_apply(final_text, source='OUTPUT')
        if viol:
            yield ('log', {'guardrail': 'OUTPUT', 'violations': viol})
        write_event(settings.AGENTCORE_MEMORY_ID, req.persona_id or 'marketing',
                    req.session_id, 'assistant', clean_out, req.cust_id)
        
        yield ('result', {'final_text': clean_out, 'iterations': it+1, 'trace': get_trace_buf()[-10:]})
    
    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
```

- [ ] **Step 2: `api/main.py` 등록 + smoke**

```python
# api/main.py에 추가
from api.routers import chat as chat_router
app.include_router(chat_router.router)
```

- [ ] **Step 3: 통합 테스트 (Bedrock streaming 모킹)**

```python
# tests/api/test_chat.py
import os; os.environ.setdefault('DEMO_PUBLIC_MODE', 'true')
from unittest.mock import patch
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

def _fake_stream():
    yield {'contentBlockDelta':{'delta':{'text':'안녕하세요, 마케터님.'}}}
    yield {'messageStop':{'stopReason':'end_turn'}}

def test_chat_streams_delta_and_result():
    with patch('api.routers.chat.converse_stream', side_effect=lambda r: _fake_stream()), \
         patch('api.routers.chat.write_event'), \
         patch('api.routers.chat.guardrail_apply', side_effect=lambda t, source='INPUT': (t, [])):
        with client.stream('POST', '/api/chat', json={
            'message':'고급휘발유 업셀링 캠페인 시작하고 싶어',
            'persona_id':'marketing','session_id':'s1'
        }) as r:
            body = b''.join(r.iter_bytes())
            assert b'"type": "phase"' in body
            assert b'"type": "delta"' in body
            assert b'"type": "result"' in body
```

- [ ] **Step 4: 테스트 + 커밋**

```bash
pytest tests/api/test_chat.py -v 2>&1 | tail -8
git add api/routers/chat.py api/main.py tests/api/test_chat.py
git commit -m "feat(api/routers): /api/chat — Converse 다회차 + 10 도구 + Memory + Guardrail (SSE)"
```

---

### Task 3.4.4: 챗 UI — `web/app/chat/page.tsx` + `ChatThread.tsx` + `ToolCallPanel.tsx` + `PersonaSwitch.tsx`

**Files:**
- Create: `web/app/chat/page.tsx`·`web/components/ChatThread.tsx`·`ToolCallPanel.tsx`·`PersonaSwitch.tsx`

- [ ] **Step 1: `PersonaSwitch.tsx`**

```tsx
// web/components/PersonaSwitch.tsx
'use client';
const PERSONAS = [
  ['marketing','마케팅'], ['strategy','고객전략'], ['data-ai','데이터·AI'],
  ['crm','CRM·회원사업'], ['retail-ops','리테일영업'],
];
export default function PersonaSwitch({value, onChange}: {value: string, onChange: (v:string)=>void}) {
  return (
    <div className='flex gap-1'>
      {PERSONAS.map(([id,name]) => (
        <button key={id} onClick={()=>onChange(id)}
          className={`text-xs px-3 py-1 rounded border ${value===id?'bg-blue-600 text-white border-blue-700':'bg-white text-slate-700 border-slate-300'}`}>
          {name}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `ChatThread.tsx`**

```tsx
// web/components/ChatThread.tsx
'use client';
type Msg = { role: 'user' | 'assistant', text: string };
export default function ChatThread({ messages }: { messages: Msg[] }) {
  return (
    <div className='border rounded p-3 h-[480px] overflow-y-auto bg-white space-y-2'>
      {messages.map((m, i) => (
        <div key={i} className={`flex ${m.role==='user'?'justify-end':'justify-start'}`}>
          <div className={`max-w-[80%] px-3 py-2 rounded text-sm ${m.role==='user'?'bg-blue-100':'bg-slate-100'}`}>
            <div className='font-mono text-xs text-slate-400 mb-1'>{m.role}</div>
            <div className='whitespace-pre-wrap'>{m.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `ToolCallPanel.tsx`**

```tsx
// web/components/ToolCallPanel.tsx
'use client';
type Call = { tool_call?: string; tool_result?: string; input?: any; output_summary?: string };
export default function ToolCallPanel({ calls }: { calls: Call[] }) {
  return (
    <div className='border rounded p-2 bg-slate-50 h-[480px] overflow-y-auto text-xs space-y-1'>
      <div className='font-semibold text-slate-700 mb-2'>Tool Trace</div>
      {calls.length===0 && <div className='text-slate-400'>도구 호출 없음</div>}
      {calls.map((c, i) => (
        <div key={i} className='border-l-2 border-blue-400 pl-2'>
          {c.tool_call && (<div><span className='font-mono text-blue-600'>→ {c.tool_call}</span>
            <pre className='text-[10px] text-slate-500'>{JSON.stringify(c.input, null, 2).slice(0,150)}</pre></div>)}
          {c.tool_result && (<div><span className='font-mono text-emerald-600'>← {c.tool_result}</span>
            <pre className='text-[10px] text-slate-500'>{(c.output_summary||'').slice(0,150)}</pre></div>)}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: `web/app/chat/page.tsx`**

```tsx
// web/app/chat/page.tsx
'use client';
import { useState } from 'react';
import { streamSSE } from '../../lib/api-client';
import ChatThread from '../../components/ChatThread';
import ToolCallPanel from '../../components/ToolCallPanel';
import PersonaSwitch from '../../components/PersonaSwitch';
import DataSourceBadge from '../../components/DataSourceBadge';

export default function ChatPage() {
  const [persona, setPersona] = useState('marketing');
  const [messages, setMessages] = useState<{role:'user'|'assistant', text:string}[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!draft.trim() || loading) return;
    const userMsg = draft.trim();
    setMessages(m => [...m, { role:'user', text: userMsg }]);
    setDraft(''); setLoading(true);
    let assistantText = '';
    setMessages(m => [...m, { role:'assistant', text: '' }]);
    for await (const ev of streamSSE('/api/chat', {
      message: userMsg, persona_id: persona, session_id: 'web-1',
      history: messages.map(m => ({ role: m.role, content: [{ text: m.text }]})),
    })) {
      if (ev.type === 'delta') {
        assistantText += ev.data.text;
        setMessages(m => { const cp = [...m]; cp[cp.length-1] = { role:'assistant', text: assistantText }; return cp; });
      } else if (ev.type === 'log') {
        setCalls(c => [...c, ev.data]);
      }
    }
    setLoading(false);
  }

  return (
    <div className='p-8 max-w-7xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>B. 마케터 대화 에이전트</h1>
      <div className='flex items-center gap-3 mb-4'>
        <PersonaSwitch value={persona} onChange={setPersona}/>
        <DataSourceBadge source='real'/><DataSourceBadge source='synthetic'/><DataSourceBadge source='external'/>
      </div>
      <div className='grid grid-cols-3 gap-4'>
        <div className='col-span-2'>
          <ChatThread messages={messages}/>
          <div className='mt-2 flex gap-2'>
            <input className='flex-1 border rounded px-3 py-2' value={draft}
                   onChange={e=>setDraft(e.target.value)}
                   onKeyDown={e=>e.key==='Enter'&&send()}
                   placeholder='고급휘발유 업셀링 캠페인을 실행할거야...'/>
            <button onClick={send} disabled={loading}
                    className='bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50'>
              {loading?'...':'전송'}
            </button>
          </div>
        </div>
        <ToolCallPanel calls={calls}/>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 빌드 + 커밋**

```bash
cd web && npx tsc --noEmit && cd -
git add web/app/chat/page.tsx web/components/{ChatThread,ToolCallPanel,PersonaSwitch}.tsx
git commit -m "feat(web/app/chat): 시나리오 B UI — Thread + ToolCallPanel + PersonaSwitch"
```

---

### Task 3.4.5: `eval_wow_queries.py`에 시나리오 B 5 케이스 추가

**Files:**
- Modify: `scripts/eval_wow_queries.py`

- [ ] **Step 1: PDF Scenario 1 dialog 재현 5 케이스**

```python
WOW_QUERIES.extend([
    {'scenario': 'B', 'persona': 'marketing',
     'query': '고급휘발유 업셀링 캠페인을 실행할거야. 평균과 다른 고급휘발유 고객의 특징을 알고 싶어.',
     'expects': lambda r: any('고급' in str(r) or 'premium' in str(r).lower())
                          and 'tool' in str(r.get('trace', [])).lower(),
     'min_results': 1},
    {'scenario': 'B', 'persona': 'marketing',
     'query': '마케팅 대상 수가 적어. 유사고객 탐색 모델링해서 상위 20%도 같이 추출해줘.',
     'expects': lambda r: any('lookalike' in str(t).lower() for t in r.get('trace', []))
                          or 'lookalike_expand' in str(r),
     'min_results': 1},
    {'scenario': 'B', 'persona': 'data-ai',
     'query': '디젤에서 휘발유로 전환한 고객이 누군지 그래프로 보여줘.',
     'expects': lambda r: any('behavior_change_detect' in str(t) for t in r.get('trace', []))
                          or '전환' in str(r),
     'min_results': 1},
    {'scenario': 'B', 'persona': 'crm',
     'query': '지난 3개월 PLCC 가입자 중 고급휘발유 주유 이력 있는 사람 알려줘.',
     'expects': lambda r: any('customer_lookup' in str(t) or 'semantic_search' in str(t)
                              for t in r.get('trace', [])),
     'min_results': 1},
    {'scenario': 'B', 'persona': 'strategy',
     'query': '서울 강남구 주변 우리 주유소와 경쟁 주유소 가격 비교해줘.',
     'expects': lambda r: any('nearest_stations' in str(t) for t in r.get('trace', [])),
     'min_results': 1},
])
```

- [ ] **Step 2: 평가 실행 (배포된 환경 필요)**

```bash
python3 scripts/eval_wow_queries.py --scenarios A B 2>&1 | tail -10
```
Expected: 10 케이스 ≥85% pass.

- [ ] **Step 3: 커밋**

```bash
git add scripts/eval_wow_queries.py
git commit -m "test(eval): 시나리오 B 5 wow 케이스 (PDF Scenario 1 dialog 재현)"
```

---

## Phase 3.5 — Verification + Phase 3 종료 (1 task)

### Task 3.5.1: CI 통과 + CHANGELOG + tag

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 로컬 CI 4-job**

```bash
python3 -m compileall -q api data scripts
cd web && npx tsc --noEmit && cd -
cd infra-cdk && npx tsc --noEmit && npx jest --ci && cd -
pytest tests/ -q
```
Expected: 모두 그린.

- [ ] **Step 2: 시나리오 A·B end-to-end 수동 검증** (배포된 환경)

```bash
# 시나리오 A
curl -X POST https://<gcc-cf>.cloudfront.net/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"고급휘발유 충성 고객","persona_id":"marketing"}' | jq '.results | length'

# 시나리오 B
curl -X POST https://<gcc-cf>.cloudfront.net/api/chat \
  -H 'Content-Type: application/json' -N \
  -d '{"message":"고급휘발유 업셀링 캠페인 시작","persona_id":"marketing","session_id":"manual"}' | head -50
```
Expected: A는 results ≥3, B는 SSE delta + tool_call 이벤트 흐름.

- [ ] **Step 3: PM+M 검출 도구 verify** (Plan 2 적재 후)

```bash
curl -X POST https://<gcc-cf>.cloudfront.net/api/chat \
  -H 'Content-Type: application/json' -N \
  -d '{"message":"PM+M 92 RON 혼유 패턴 보여줘","persona_id":"data-ai"}' | grep "behavior_change_detect"
```
Expected: trace에 `behavior_change_detect` 도구 호출 + matches ≥250.

- [ ] **Step 4: CHANGELOG**

```markdown
## [Unreleased] / Added
- Phase 3 Vertical Slice: 시나리오 A (search) + 시나리오 B (chat agent) 골드 스탠다드.
- bedrock/opensearch/persona/sse/guardrails 공통 서비스 (PERSONA_REGISTRY 5 부서 SSOT).
- search_pipeline: embed → BM25 Nori + Cohere KNN → RRF (K=60) → rerank-v3 → 1-hop subgraph.
- AgentCore Memory short/long-term + Code Interpreter (NanumGothic) wrappers.
- TOOL_SPECS 10 도구: memory_recall, neptune_subgraph, semantic_search, kb_lookup,
  customer_lookup, cluster_predict, nearest_stations, campaign_simulator,
  lookalike_expand, behavior_change_detect (PM+M·디젤→premium).
- /api/chat — Converse 다회차 + Bedrock Guardrail (input/output) + tool dispatch trace.
- web/app/{search,chat}: Cytoscape subgraph, StreamPanel, ToolCallPanel, PersonaSwitch, DataSourceBadge.
- ADRs 0006 (TOOL_SPECS 설계), 0007 (PERSONA_REGISTRY SSOT).
- eval_wow_queries: 시나리오 A·B 각 5 케이스 = 10 wow 쿼리.
```

- [ ] **Step 5: tag + commit**

```bash
git add CHANGELOG.md
git commit -m "docs: Phase 3 Vertical Slice complete — A·B 골드 스탠다드"
git tag -a plan3-complete -m "Plan 3 (Scenarios A+B) writing complete on 2026-05-08"
git log --oneline | head -30
```

---

## Self-Review (writing-plans 스킬 권장)

**1. Spec coverage**
- Spec §3.1 시나리오 A (의미 검색 + 1-hop subgraph) → Tasks 3.2.1~3.2.5 ✓
- Spec §3.1 시나리오 B (Bedrock Converse + AgentCore Memory + 10 도구) → Tasks 3.3.1·3.3.2·3.4.1~3.4.5 ✓
- Spec §2.1 TOOL_SPECS 단일 등록점 + GSC 추가 도구 → Task 3.4.1 (10 도구, retail의 4 + GSC 6 = 10) ✓
- Spec §2.1 PERSONA_REGISTRY 5 부서 SSOT → Task 3.1.3 + ADR 0007 ✓
- Spec §2.1 SSE 어휘 retail 호환 → Task 3.1.4 sse.py ✓
- Spec D14 cohort × scenario → Task 3.4.2 neptune_subgraph·behavior_change_detect의 cohort_filter 인자 ✓
- Spec D17 CampaignAggregation 활용 → Task 3.4.2 campaign_simulator의 baseline_roi 참조 ✓
- Spec PDF Scenario 1 dialog 재현 → Task 3.4.5 5 wow 케이스 ✓
- Spec PDF 3페이지 PM+M 92 RON · 디젤→premium → Task 3.4.2 behavior_change_detect (`pm_m_mixing`, `fuel_grade_transition`) ✓

**2. Placeholder scan**
- `app_signup_after_install` pattern은 stub 메시지만 반환 — Plan 4 시나리오 M에서 본격 구현. 의도적 표시.
- Code Interpreter는 sandbox client만 — 실제 차트 생성은 Plan 4 시나리오 C에서. 의도적.
- Bedrock streaming 이벤트 파싱 (Task 3.4.3 chat.py)은 단순화 — 실서비스에서는 contentBlockIndex per stream block 추적 필요. PoC 수준 OK 명시.

**3. Type consistency**
- `dispatch(name, input, *, persona_id, session_id, cust_id) → dict` 시그니처 — 모든 10 tools/*.py 일관 ✓
- `ConverseRequest(system, messages, tool_specs, ...)` — bedrock.py 정의, chat.py 사용 일치 ✓
- SSE 어휘 `{type, data}` — sse.py·search router·chat router·web streamSSE generic helper 모두 동일 ✓
- `system_prompt(persona_id, scenario_code)` — persona.py 정의, chat.py 사용 일치 ✓

**4. Ambiguity**
- `customer_lookup` 도구의 `c.cust_id` 매칭은 Plan 2의 schemas.py가 cust_id를 `id_key`로 store했는지에 따라 다름 — Plan 2 Task 2.5.3의 Bulk Loader format 결정과 일관해야. 스펙 §5.2 표는 이를 묵시적으로 단일 키로 가정. Plan 4 진입 전 검증 필요 (Open Question).

이슈 없음. Plan 3 작성 완료.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-08-plan3-scenarios-a-b.md`
(Phase 3.1~3.5, 약 14 tasks, ~80 steps).

**선행 조건:** Plan 1 + Plan 2 실행 완료 — Neptune 적재됨, OpenSearch index 존재, AgentCore Memory store 생성됨.

**다음에 어떻게 실행하시겠습니까?**

**1. Subagent-Driven (recommended)** — task별 fresh subagent + 검토. 14 tasks에 적당한 페이스.

**2. Inline Execution** — 이 세션에서 batch 실행, 체크포인트 검토.

**3. Plan 4·5 작성으로 마무리** — 모든 plan을 먼저 작성한 후 일괄 실행 (추천 흐름의 마무리).

**4. Plan 1·2·3 검토** — 사용자가 직접 검토 후 다음 결정.

어떤 옵션을 선택하시겠습니까?


