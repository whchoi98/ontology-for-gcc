# Agent SSE 설계 가이드 — 체감 효과적인 LLM 스트리밍

> 다른 프로젝트의 Claude / GPT 세션에 *그대로 복사*해 넣으면, 이 디자인을
> 따르는 SSE agent 파이프라인 구현·마이그레이션·코드 리뷰가 가능한
> 재사용 가능한 프롬프트.
>
> **출처**: GS Caltex M&M본부 PoC (`ontology-gcc`, 2026-05) — 14 시나리오
> agent streaming 파이프라인에서 검증.
> Wall-clock 22초 응답을 사용자가 "10-12초로 느꼈다" 라고 보고한 패턴.

---

## 어떻게 쓰나

### (A) 새 프로젝트에 처음 적용
> "아래 SSE 디자인 가이드를 따라 우리 프로젝트의 `/api/<endpoint>` 에
> streaming agent 응답을 구현해줘. 백엔드는 `<Python FastAPI / Node Express / ...>`,
> 프론트는 `<React / Vue / ...>`. 도메인 컨텍스트는 `<...>`"

### (B) 기존 동기식 API 마이그레이션
> "아래 가이드 기준으로 우리 `<router.py>` 의 동기식 응답을 SSE 로 마이그레이션해줘.
> 변경 전후 코드 + 클라이언트 변경 + CloudFront(또는 사용하는 CDN) 설정 변경을 포함해서."

### (C) 코드 리뷰 / 감사
> "첨부한 SSE 라우터·클라이언트 코드를 아래 가이드의 *안티패턴 섹션*과
> *체크리스트* 기준으로 감사해줘. 각 위반은 `file:line + 위반 항목 + 수정 코드` 형태로."

---

## 이하: LLM 세션에 그대로 붙여넣을 본문

```text
# Agent SSE 설계 가이드 — 체감 효과적인 LLM 스트리밍

당신은 AI agent / chatbot / streaming 인사이트를 만드는 풀스택 시스템의
실시간 응답 파이프라인을 설계·구현합니다. 사용자 체감 latency 를
최소화하고, 운영자가 추적 가능하며, CloudFront·ALB·Lambda 같은 일반적인
프록시·엣지 인프라와 호환되는 SSE (Server-Sent Events) 디자인을 따르세요.

## 5 가지 절대 원칙

1. **TTFB < 1.5s** — 첫 이벤트가 사용자에게 1.5초 안에 도착. 사용자
   인지 임계점 3초를 절대 침묵으로 넘기지 말 것. 모델 호출 *이전에*
   `phase` 이벤트 2-3개를 emit.

2. **5-type 이벤트 어휘만 사용**:
   - `phase` — 단계 전환 (예: turn_start / guardrail_ok / bedrock_thinking)
   - `delta` — 점진적 출력 (텍스트 토큰, 차트 partial)
   - `log` — 부가 정보 (도구 호출, 가드레일 위반, trace)
   - `result` — 완료된 구조화 결과 (final_text, followups, iterations)
   - `final` — 종료 시그널 (`{ok: true}` 또는 `{ok: false, error}`)
   각 type 의 역할이 정확히 분리되어야 함. 같은 type 이 두 의미를 가지면 거부.

3. **에러도 stream 안에서** — HTTP 500 으로 떨어뜨리지 말고
   `final {ok: false, error, error_type}` 로 emit. stack trace 는
   CloudWatch / log 에 별도 기록. 클라이언트가 *정확한 원인*을 알 수
   있어야 함.

4. **항상 final emit** — 성공/실패 무관 try/except 로 감싸서 마지막
   이벤트가 `final` 이 되도록 보장. 클라이언트 hang 방지.

5. **도구 호출 가시화** — agent 가 tool/function call 을 할 때마다
   `log {tool_call, input}` → 실행 → `log {tool_result, output_summary}`.
   사용자가 "AI 가 일하고 있다" 인지하게.

## 응답 메시지 포맷

각 SSE 라인:
```
data: {"type": "phase|delta|log|result|final", "data": {...}}\n\n
```

`data` 필드 예시:
- `phase`: `{"name": "embed_query"}`
- `delta`: `{"text": "고급휘발유...", "channel": "summary"}`
   (channel 로 멀티 스트림 구분 가능 — chart_partial / summary 등)
- `log`: `{"tool_call": "search", "input": {...}}` 또는
   `{"guardrail": "INPUT", "violations": [...]}`
- `result`: `{"final_text": "...", "iterations": 3,
   "suggested_followups": [...], "trace": [...]}` — 완료 후
   *메타데이터 한 번에 묶어*. 클라이언트가 별도 API 재호출 불필요.
- `final`: `{"ok": true}` 또는
   `{"ok": false, "error": "msg", "error_type": "AuthorizationException"}`

## 백엔드 구현 패턴 (FastAPI 예시)

```python
async def stream_phases(phases: AsyncIterator) -> AsyncIterator[str]:
    """모든 streaming wrapper 가 따라야 할 try/except 패턴."""
    try:
        async for ev in phases:
            yield sse_event(*ev)
        yield sse_event('final', {'ok': True})
    except Exception as e:
        log.exception("stream failed: %s: %s", type(e).__name__, e)
        yield sse_event('final', {
            'ok': False,
            'error': str(e) or repr(e),
            'error_type': type(e).__name__,
        })

@router.post('/api/chat')
async def chat(req: ChatRequest):
    async def gen():
        yield ('phase', {'name': 'turn_start'})        # TTFB 보장
        cleaned = guardrail_apply(req.message)
        yield ('phase', {'name': 'guardrail_ok'})
        # ... 모델 호출 (긴 작업)
        for ev in converse_stream(...):
            if 'contentBlockDelta' in ev:
                yield ('delta', {'text': ev['contentBlockDelta']
                                         ['delta']['text']})
        followups = generate_followups(...)
        yield ('result', {
            'final_text': clean_out,
            'suggested_followups': followups,
        })
    return StreamingResponse(
        stream_phases(gen()),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',      # nginx/proxy buffering off
            'Connection': 'keep-alive',
        },
    )
```

## 클라이언트 구현 패턴 (TypeScript)

```typescript
export async function* streamSSE<T>(
  path: string, body: object,
): AsyncIterator<{ type: string; data: T }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n\n');
    buf = lines.pop()!;
    for (const line of lines) {
      if (line.startsWith('data: ')) yield JSON.parse(line.slice(6));
    }
  }
}

// 소비:
for await (const ev of streamSSE<ChatData>('/api/chat', payload)) {
  switch (ev.type) {
    case 'phase':  setPhases(p => [...p, ev.data]); break;
    case 'delta':  setText(t => t + ev.data.text); break;
    case 'log':    setTools(l => [...l, ev.data]); break;
    case 'result': setFollowups(ev.data.suggested_followups); break;
    case 'final':  setStreaming(false);
                   if (!ev.data.ok) showError(ev.data.error);
                   break;
  }
}
```

## 인프라 설정 (CloudFront / ALB / proxy 사용 시)

| 설정 | 값 | 이유 |
|------|----|------|
| CloudFront cachePolicy | `CACHING_DISABLED` | SSE 는 stateful, 사용자별 |
| CloudFront originRequestPolicy | `ALL_VIEWER` | 인증 쿠키·헤더 forward |
| CloudFront allowedMethods | `ALLOW_ALL` | POST/PATCH/DELETE 허용 |
| Lambda@Edge 단계 | `VIEWER_REQUEST` 만 | `ORIGIN_RESPONSE` 는 body 전체 buffer → SSE 깨짐 |
| 응답 헤더 | `X-Accel-Buffering: no` | nginx/proxy 64KB buffering off |
| 응답 헤더 | `Cache-Control: no-cache` | 중간 캐시 회피 |
| ALB idle timeout | ≥ 60s | 매 delta 가 reset 하지만 안전 마진 |

## CloudFront 타임아웃 인사이트 (왜 SSE 가 필수인가)

CloudFront 의 *두 종류 타임아웃* 을 이해해야 설계 결정의 이유가 명확해집니다.

### (1) Origin Response Timeout — 기본 30s (max 60s)
- **정의**: CloudFront → origin 의 요청 후, *첫 byte* 가 origin 으로부터 돌아오기까지의 시간 한계.
- **위반 시**: HTTP 504 Gateway Timeout 즉시 반환.
- **AI agent 응답의 함정**: Sonnet 4.6 같은 대형 모델이 *생각하는 시간* (recap of context, 도구 결정 등) 만으로도 5-15초 소요. 동기 응답이면 첫 byte 가 모델 추론 끝난 후 → 18-22초 → CloudFront 30초에 *근접*. 한 번이라도 모델이 느려지면 504.
- **SSE 해결**: 모델 호출 *이전에* `phase` 이벤트를 emit 하면 첫 byte 가 0.3-0.8s 안에 origin response 시작 → CloudFront 30s 카운터가 *그 시점에 stop*.

### (2) Origin Keep-Alive Timeout — 기본 5s
- **정의**: 첫 byte 이후 *idle* (서버가 아무것도 안 보냄) 상태 한계.
- **위반 시**: connection 강제 종료 → 클라이언트는 mid-stream 끊김.
- **모델 응답의 함정**: 도구 호출(tool dispatch) 이 5초 이상 걸리면, 그 사이 토큰 출력이 멈춤 → 5초 idle 임계점 위반 → 끊김. 특히 OpenSearch 검색 + Bedrock rerank 결합이면 자주 발생.
- **SSE 해결**: 도구 호출 직전 `log {tool_call: ...}`, 직후 `log {tool_result: ...}` 를 *반드시* emit. 매 도구 호출이 keep-alive 카운터를 reset. 그 결과 wall-clock 30초+ 응답도 끊김 없이 흐름.

### CloudFront 가 *늘려도* 해결 안 되는 이유
- Origin Response Timeout 은 *최대 60s*. AWS support 티켓으로 더 늘릴 수 있지만 권장 안 함 — 비정상 응답이 *방치*되는 부작용.
- Keep-alive 는 *AWS 관리형 기본값*. 변경 불가.
- 결론: 타임아웃을 늘리는 게 아니라, *흐름을 끊지 않게 만드는* 디자인 (= SSE) 이 정답.

## Token 사이즈 인사이트 (latency·비용·품질의 trade-off)

### Token 수가 latency 의 *주요* 결정자
- LLM 응답 시간 ≈ `(첫 토큰 latency) + (출력 토큰 수 × 토큰당 시간)`.
- Sonnet 4.6 의 경우 토큰당 약 25-40ms (Bedrock cross-region inference profile 기준).
- 4096 token 응답 = ~25-40s wall-clock. 8192 token = ~50-80s.
- **max_tokens 자체가 latency 결정자가 아니라, *생성되는* 토큰 수가 결정자**. 단 max_tokens 가 너무 작으면 `stop_reason=max_tokens` 로 *중간 절단* → 응답 품질 손상.

### 시나리오별 적정 max_tokens — 측정 후 결정
- 한국어 응답은 영어 대비 *토큰 효율이 낮음* (보통 1.3-1.6x 토큰 소비). 영문 기준 1024 가 한국어로는 ~700-800 단어에 해당.
- 응답 길이를 *측정*한 뒤 90 percentile + 20% 여유로 설정. 일률적 8192 는 비용·latency 모두 악화.

| 응답 타입 | max_tokens | 일반적 출력 길이 |
|----------|-----------:|------------------|
| 분류 / 짧은 추천 (예: 후속 질문 3개) | 200-300 | 50-150 토큰 |
| 한 단락 요약 / 통계 해석 | 1024 | 400-800 토큰 |
| 동기 (non-streaming) 인사이트 | 2048 | 1200-1800 토큰 |
| 스트리밍 5섹션 리포트 | 4096 | 2500-3500 토큰 |
| 일반 챗 (도구 사용, 자연 종료) | 8192 | 평균 800-2000 토큰, 상한만 보장 |

### 비용 인사이트 — input vs output
- Sonnet 4.6 가격 (예): input $3/1M tokens, output $15/1M tokens — *output 이 5배 비쌈*.
- 컨텍스트가 길어도 (input ↑) 출력만 짧으면 비용 낮음.
- 따라서 *max_tokens 적정 설정* 이 비용 절감의 핵심:
  - max_tokens 8192 로 두면 모델이 *더 길게 쓰려는 경향* → output token 증가 → 비용 증가
  - max_tokens 1024 로 제한하면 모델이 *압축적으로 응답* → 비용↓, latency↓

### Output Token 절단 (`stop_reason=max_tokens`) 진단
- 응답이 *문장 중간에* 끊겼다면 거의 확실히 max_tokens 부족.
- Bedrock 응답의 `stopReason` 필드를 *항상* 로그에 남길 것:
  ```python
  if resp['stopReason'] == 'max_tokens':
      log.warning("output truncated: scenario=%s persona=%s max_tokens=%d",
                  scenario, persona, max_tokens)
  ```
- 절단이 자주 발생하면 max_tokens 를 25-50% 증액. 절단이 0% 면 25% 감액 가능 (비용 최적화).

## Token 한도 (LLM 호출 시)

응답 특성별로 max_tokens 를 *분리*:
- 후속 질문 / 짧은 분류: 200-300
- 시도별 통계 요약: 1024
- 동기식 (non-streaming) 인사이트: 2048
- 스트리밍 5섹션 리포트: 4096
- 일반 챗 (자연 종료): 8192

일률적인 큰 값은 latency·비용 모두 악화. `stop_reason=max_tokens` 발생 빈도가
*의도된 경우만* 나오도록 조정.

## 도구 사용 실시간 출력 팁 (Tool / Function Call Visibility)

agent 가 도구(tool / function call) 를 호출하는 *모든 시점*을 사용자에게
실시간으로 보여줘야 체감 latency 가 극적으로 좋아집니다. AI 답변 품질만큼이나
*과정의 가시성*이 데모 가치를 결정합니다.

### (1) tool_call → execution → tool_result 의 3-단계 emit

```python
for tc in parsed_tool_calls:
    # 1단계: 호출 시작 시 즉시 emit (이게 keep-alive timer 도 reset)
    yield ('log', {
        'tool_call': tc['name'],
        'input': tc['input_dict'],
    })

    # 2단계: 실제 실행 (5-15초 소요 가능)
    t0 = time.monotonic()
    try:
        output = dispatch(tc['name'], tc['input_dict'], ...)
    except Exception as e:
        # 도구 실패도 stream 안에서 처리 — 전체 응답이 깨지지 않게
        yield ('log', {
            'tool_call': tc['name'],
            'tool_error': str(e),
            'error_type': type(e).__name__,
        })
        output = {'error': str(e)}      # 모델에게도 에러 전달
    elapsed_ms = int((time.monotonic() - t0) * 1000)

    # 3단계: 결과 요약 (full output 이 아니라 *요약*)
    yield ('log', {
        'tool_result': tc['name'],
        'output_summary': _summarize(output),   # 200자 이내
        'elapsed_ms': elapsed_ms,
    })

    # 4단계: 모델에게 결과 전달 (toolUse continuation)
    tool_results.append({
        'toolUseId': tc['toolUseId'],
        'content': [{'json': output}],
    })
```

**핵심**:
- `tool_call` 이벤트는 *모델이 결정하자마자* 즉시 emit → 사용자에게
  "AI 가 X 를 조회하기로 결정했다" 인지
- `tool_error` 도 stream 안에서 emit → 도구 실패가 *전체 응답을 깨지 않음*
- `elapsed_ms` 같은 부가 정보로 운영자 진단 가능

### (2) Output Summary 크기 제어

도구 응답 본문은 *클 수 있음* (검색 결과 50개, JSON 트리 등). 클라이언트에 그대로
보내면 stream 이 무거워지고 UI 가 멈춥니다.

```python
def _summarize(output: Any) -> str:
    """200자 이내 요약 — 도구 종류에 맞춰 변환."""
    if isinstance(output, dict):
        if 'results' in output:
            n = len(output['results'])
            return f"{n}건 검색 — 상위: {output['results'][0].get('id', 'N/A')}"
        if 'count' in output:
            return f"집계 결과: {output['count']}건"
        if 'error' in output:
            return f"오류: {output['error'][:100]}"
    return str(output)[:200]
```

전체 결과는 *모델에게는* 보내고, 사용자 UI 에는 *요약만*. 두 stream 분리가 핵심.

### (3) Trace Ring Buffer (운영·디버깅용)

도구 호출 이력을 메모리에 *순환 버퍼*로 저장하면 사후 분석이 쉬워집니다.

```python
from collections import deque

_TRACE_BUF: deque = deque(maxlen=200)

def trace_log(name: str, input: dict, output: Any, ms: int):
    _TRACE_BUF.append({
        'tool': name, 'input': input,
        'output': output, 'ms': ms,
        'ts': time.time(),
    })

# 응답 끝에서 result 이벤트와 함께 최근 10개를 클라이언트로
yield ('result', {
    'final_text': clean_out,
    'trace': list(_TRACE_BUF)[-10:],   # 우측 패널에 도구 호출 이력
    'suggested_followups': followups,
})
```

운영자가 `/api/ops/trace` 같은 endpoint 로 *전체 ring buffer* 를 조회하면
"가장 자주 호출되는 도구", "가장 느린 도구", "에러 빈도 높은 도구" 분석 가능.

### (4) Partial Output 가능한 도구 — 순차 emit

검색 / 가져오기 / 클러스터링 같은 *결과 자체가 점진적인* 도구는 *결과를 stream*
하면 체감이 더 좋아집니다.

```python
# 일반 (한 번에 결과)
output = search_pipeline.search(query)
yield ('log', {'tool_result': 'search', 'output_summary': f"{len(output)}건"})

# 순차 (점진적 결과)
yield ('log', {'tool_call': 'search', 'input': {'query': query}})
for i, hit in enumerate(search_pipeline.stream_search(query)):
    yield ('log', {
        'tool_partial': 'search',
        'rank': i + 1,
        'item': {'id': hit['id'], 'score': hit['score']},
    })
yield ('log', {'tool_result': 'search', 'output_summary': f"{i+1}건 완료"})
```

UI 가 검색 결과를 *한 줄씩 추가* 렌더 → 사용자가 *결과를 미리 본다*.

### (5) Chaining Hints (도구 간 의존성)

agent 가 도구 체이닝을 잘하려면 도구 정의(TOOL_SPECS)에 *chaining hint* 를 둡니다.

```python
TOOL_SPECS = [
    {
        'toolSpec': {
            'name': 'semantic_search',
            'description': (
                '고객을 자연어로 검색한다. 결과 ID 를 받은 뒤 '
                'fuel_grade_lookup 또는 nearest_stations 로 chain 가능.'  # 힌트
            ),
            'inputSchema': {...},
        },
    },
    {
        'toolSpec': {
            'name': 'fuel_grade_lookup',
            'description': (
                'semantic_search 결과의 customer_id 리스트를 받아 '
                '유종별 충성도를 계산. 단독 호출 비권장.'                  # 힌트
            ),
            ...
        },
    },
]
```

체이닝 힌트가 명시되면 모델이 더 잘 *연속 호출* 합니다. 결과적으로 풍부한
답변 + 사용자가 *과정을 따라갈 수* 있음.

### (6) 클라이언트 chip / badge 렌더 패턴

```typescript
function phaseToneFor(name: string): { label: string; tone: string } {
  if (name.startsWith('tool:')) {
    return { label: name.replace('tool:', '🔧 '),
             tone: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' };
  }
  if (name === 'guardrail') {
    return { label: '🛡 가드레일', tone: 'border-yellow-500/50 ...' };
  }
  if (name === 'bedrock') {
    return { label: '💭 추론 중', tone: 'border-blue-500/50 ...' };
  }
  return { label: name, tone: 'border-slate-500/50 ...' };
}

// 우측 패널 렌더
<ol className="flex flex-wrap items-center gap-2">
  {phases.map((p, i) => {
    const { label, tone } = phaseToneFor(p.name);
    return <li key={i} className={`px-2 py-0.5 rounded border ${tone}`}>
      {label}
    </li>;
  })}
</ol>
```

phase / tool_call 별로 *색깔 톤*을 분리하면 사용자가 *진행 상태* 를 한눈에
파악합니다. "🔧 검색 → 💭 추론 → 🔧 통계 → 💭 추론 → ✅ 완료" 같은 흐름이
가시화.

### (7) 단일 등록점 (TOOL_SPECS 패턴)

도구 정의는 *한 곳에서만* — 다른 위치에 등록 분산 금지.

```python
# api/services/agent.py — 유일한 등록점
TOOL_SPECS = [
    {'toolSpec': {'name': 'semantic_search', 'description': ..., 'inputSchema': ...}},
    {'toolSpec': {'name': 'nearest_stations', ...}},
    ...  # 10개 도구
]

def dispatch(name: str, input_dict: dict, persona_id: str, session_id: str, cust_id: Optional[str]):
    """단일 dispatch 함수 — name 으로 분기."""
    fn = _TOOL_REGISTRY.get(name)
    if fn is None:
        return {'error': f'unknown tool: {name}'}
    return fn(input_dict, persona_id=persona_id, session_id=session_id, cust_id=cust_id)
```

새 도구 추가 = TOOL_SPECS 한 줄 + `_TOOL_REGISTRY` 한 줄. 클라이언트는
*등록만 보고도* 사용 가능 — JSON Schema 가 input validation + 자동 chip 렌더에 사용.

## 출시 전 체크리스트

```
[ ] TTFB < 1.5s (Performance.mark 또는 RUM 측정)
[ ] 5개 type vocabulary 정의, 클라이언트 switch 처리
[ ] 첫 yield 가 모델 호출 *이전*에 있는가
[ ] 에러 path 가 final {ok:false} 로 떨어지는가
[ ] stack trace 가 CloudWatch/log 에 남는가
[ ] CACHING_DISABLED + ALL_VIEWER
[ ] Lambda@Edge VIEWER_REQUEST 만
[ ] X-Accel-Buffering: no 헤더
[ ] 도구 호출이 log 이벤트로 가시화
[ ] phase chip / progress bar UI
[ ] max_tokens 호출처별 분리
[ ] AbortController → 백엔드 generator cleanup
[ ] 사용자 인터뷰 또는 RUM 으로 *체감* latency 측정
```

## 피할 것 (안티패턴)

- `yield 'data: ' + str(obj) + '\n\n'` (직접 문자열 조합) — escape 누락 →
  JSON 깨짐. 헬퍼 `sse_event()` 사용 강제
- 단일 type (`data` 만) — switch 분기 불가, 클라이언트가 추측해야 함
- HTTP 500 으로 mid-stream 에러 던지기 — 클라이언트가 원인 모름
- Lambda@Edge `ORIGIN_RESPONSE` 단계 사용 — body 전체 buffer 됨,
  chunked transfer 깨짐
- async gen 안에서 `time.sleep` 동기 호출 — event loop 차단
- `phase` 이벤트 없이 첫 `delta` 만 — TTFB 가 모델 응답 시간과 동일
- `max_tokens` 일률 큰 값 — latency·비용·진단 모두 악화
- 모델 응답 끝나고 `result` 이벤트 없이 곧장 `final` — 클라이언트가
  메타데이터 fetch 위해 별도 API 호출 필요

## 한 줄 정리

> 체감 효과적인 SSE = (5-type 어휘) + (TTFB < 1.5s) +
> (도구 호출 가시화) + (항상 final emit) + (`ORIGIN_RESPONSE` 회피)

이 가이드를 따르면 wall-clock 20+초 응답도 사용자는 "빠르다" 라고 느낍니다.
```

---

## 참고 — 이 패턴이 검증된 배경

- **프로젝트**: `ontology-gcc` (GS Caltex M&M본부 PoC, 2026-05)
- **규모**: 14 시나리오 × 5 부서 페르소나 × 25 클래스 지식 그래프
- **스택**: Bedrock Sonnet 4.6 + AgentCore + Neptune + AOSS + ECS Fargate + CloudFront + Cognito + Lambda@Edge
- **검증**: M&M본부 데모 세션에서 *"22초 응답이 10-12초로 느껴진다"* 사용자 인터뷰 결과
- **재사용**: 시나리오 A 검색, B 챗, C 인사이트, G 캠페인 ROI, J 외부 신호, N 날씨 × 연료 등 *14 라우터가 동일 SSE 인프라 공유*

## 변경 로그

- `2026-05-13` (v1.0): 초기 작성. 14 시나리오 검증 패턴 반영.
- 향후 갱신 시: `docs/data-pipeline.md` 와 동일하게 *변경 이력*만 여기에 추가하고, 본문은 위 코드 블록을 갱신.
