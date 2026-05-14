# Cross-browser Popup / Chat Window 패턴

> 다른 프로젝트의 Claude / GPT 세션에 *그대로 복사*해 넣으면, 이 디자인을
> 따르는 popup 챗 창 / 모달 / fallback 구현·마이그레이션·코드 리뷰가 가능한
> 재사용 가능한 프롬프트.
>
> **출처**: GS Caltex M&M본부 PoC (`ontology-gcc`, 2026-05) — Cally 챗봇
> popup 이 Chrome 에서 새 탭으로 fallback 되던 회귀를 UA 분기 + iframe modal
> 패턴으로 두 브라우저 동시 호환 해결.
>
> **관련 가이드**: `prompts/sse-agent-design.md` (LLM streaming agent 디자인)

---

## 어떻게 쓰나

### (A) 새 프로젝트에 처음 적용
> "아래 cross-browser popup 가이드를 따라 우리 챗 위젯 / 미리보기 창 /
> 모달이 Chrome 과 Firefox 양쪽에서 정상 동작하도록 구현해줘.
> 백엔드 라우트 / 페이지 URL: `<...>`."

### (B) 기존 popup 회귀 디버깅
> "Chrome 에서 popup window 가 새 탭으로 떨어지는 회귀가 발생했습니다.
> 아래 가이드의 *진단 체크리스트* 와 *안티패턴 섹션* 기준으로 우리 코드
> `<file:line>` 의 원인 분석 + fix 제안해줘. 변경 전후 코드 + 검증 절차 포함."

### (C) Popup → Modal 마이그레이션
> "우리 `<위젯>` 을 popup window 에서 iframe modal 로 마이그레이션해줘.
> 아래 가이드의 *iframe modal 구현* 섹션을 참고하고, 기존 popup 의
> 인증 쿠키·SSE·context 가 modal 에서도 동작하는지 점검."

---

## 이하: LLM 세션에 그대로 붙여넣을 본문

```text
# Cross-browser Popup / Chat Window 패턴

당신은 같은 origin 의 chat / preview / 별도 페이지를 popup window 또는
modal 로 띄우는 웹 위젯을 설계·구현합니다. Chrome 과 Firefox 의 popup 정책
차이를 인지하고, 두 브라우저 모두에서 일관된 사용자 경험을 제공하면서
popup blocker 환경에도 graceful degrade 되는 디자인을 따르세요.

## 한 줄 요약

Firefox = features 만으로 popup 보장.
Chrome = Site Engagement Score 가 낮으면 popup→tab fallback.
→ UA 감지 후 Chrome 은 iframe modal 우회. 그 외는 window.open popup.

## 5 가지 절대 원칙

1. **`window.open` 은 hint, 보장 아님** — features 가 충분해도 브라우저가
   *제안*으로만 받음. 100% 보장 가능한 건 같은 페이지 내 modal/drawer 뿐.

2. **Chrome 과 Firefox 의 정책 차이를 인지** — 같은 코드가 두 브라우저에서
   다르게 동작하는 가장 흔한 이유. UA 분기가 정답.

3. **iframe modal 은 popup window 의 가장 충실한 대체** — same-origin 이면
   인증 쿠키 / SSE / context 모두 자동 동작.

4. **Fallback 체인 명시** — popup blocked → modal → ESC/X 닫기 제공.
   사용자가 *무엇이 일어났는지* 항상 인지 가능하게.

5. **ESC + 배경 클릭 + X 버튼** 3 가지 닫기 경로 — 사용자가 어떻게든 빠져나갈 수 있게.

## 브라우저별 popup 정책 차이

| 정책 | Firefox | Chrome |
|------|---------|--------|
| `window.open(url, name, features)` 의 features | `width`/`height` 명시만으로 popup 인정 | features 충분해도 *Site Engagement Score* 가 낮으면 새 탭 |
| user-activation 요구 | onClick 핸들러 직접 호출 시 통과 | 동일 |
| window name `'_blank'` vs `'cally-chat'` | 둘 다 동일 | named window 는 reuse 가능성 때문에 popup→tab 비율 ↑ |
| 신규 도메인 첫 방문 | 즉시 popup | 사용자 직접 상호작용 누적 후 popup 허용 |
| 사용자 직접 차단 | `about:preferences#privacy` | `chrome://settings/content/popups` |

## 유효한 features hint (Chrome 기준)

```
'popup=true,width=480,height=760,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no'
```

- `popup=true` — Chrome 122+ 권장 modern hint (단독은 불충분)
- `width` / `height` — popup 판정 핵심 시그널
- `toolbar=no`, `menubar=no`, `location=no`, `status=no` — *chrome UI 제거*.
  이 4개가 있어야 "사용자 의도된 작은 창" 으로 인식
- `resizable=yes`, `scrollbars=yes` — 기능 보장
- `left`, `top` — 위치 (선택)

## UA 감지 + 분기 패턴 (TypeScript)

```typescript
function openWindowOrModal() {
  if (typeof window === 'undefined') return;

  // Chrome 만 분리. Edge / Opera / Brave 는 UA 에 자기 식별자 포함하므로 제외.
  const ua = navigator.userAgent;
  const isChrome = /Chrome/.test(ua) && !/Edg|OPR|Brave/.test(ua);

  if (isChrome) {
    setModalOpen(true);                    // 분기 (1): iframe modal
    return;
  }

  // 분기 (2): popup window — Firefox / Safari / Edge / Brave / Opera
  const url = `${window.location.origin}/cally`;
  const features =
    'popup=true,width=480,height=760,resizable=yes,scrollbars=yes,' +
    'toolbar=no,menubar=no,location=no,status=no';
  const popup = window.open(url, '_blank', features);

  if (!popup || popup.closed) {            // 분기 (3): popup 차단 fallback
    setModalOpen(true);                    // → modal 로 자동 전환
    return;
  }
  try { popup.focus(); } catch { /* cross-origin */ }
}
```

## iframe modal 구현 (Chrome 우회 + 보편 fallback)

```tsx
{modalOpen && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center
               bg-black/40 backdrop-blur-sm"
    onClick={() => setModalOpen(false)}     // 배경 클릭으로 닫기
  >
    <div
      className="relative w-[480px] h-[760px] max-h-[90vh]
                 bg-ink-900 border border-blue-500/40 rounded-lg
                 shadow-2xl overflow-hidden flex flex-col"
      onClick={(e) => e.stopPropagation()}  // modal 내부 클릭은 전파 차단
    >
      {/* 헤더 — popup window 의 chrome 영역 흉내 */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-bold">Cally · GS Caltex AI</span>
        <button onClick={() => setModalOpen(false)} title="닫기 (ESC)">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 본문 — same-origin iframe 으로 /cally 페이지 그대로 임베드 */}
      <iframe
        src="/cally"
        title="Cally 챗봇"
        className="flex-1 w-full border-0"
      />
    </div>
  </div>
)}
```

핵심:
- **same-origin iframe**: 같은 도메인 → Cognito 쿠키 자동 전달, CORS 무관,
  SSE 정상 동작.
- **iframe 안에 페이지 전체**: popup window 와 동일한 기능 (follow-up chips,
  파일 저장 등) 그대로 작동.
- **modal 닫기 3종**: X 버튼 + 배경 클릭 + ESC 키.

## ESC 키 핸들러 (drawer + modal 통합)

```tsx
useEffect(() => {
  if (!open && !modalOpen) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setModalOpen(false);
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [open, modalOpen]);
```

## Fallback 체인 (3-단계 graceful degrade)

```
[1] popup window 시도          (Firefox / Safari / Edge / Brave / Opera)
       ↓ blocked or null
[2] iframe modal               (Chrome 또는 popup 차단 환경)
       ↓ (항상 표시 보장)
[3] 사용자에게 X / ESC / 배경 닫기 제공
```

## 안티패턴 (피해야 할 것)

| 안티패턴 | 왜 |
|----------|-----|
| `window.open(url)` features 없이 호출 | 모든 브라우저가 새 탭 fallback |
| named window (`'cally-chat'`) 만 사용 | Chrome 이 reuse 가능성 때문에 popup→tab 비율 ↑ |
| `popup=true` 만 명시 + chrome-UI hint 제거 | Chrome 이 "ambiguous" 판정 → 새 탭 |
| popup 차단 시 무음 fallback | 사용자가 *무엇이 일어났는지* 모름 — modal 노출로 visible feedback |
| iframe `sandbox` 무분별 적용 | same-origin 이면 불필요. 다른 origin 임베드 시만 `sandbox="allow-scripts allow-same-origin"` |
| UA 정규식 `/Chrome/` 만 | Edge/Opera/Brave 가 같이 잡힘. `!/Edg|OPR|Brave/` exclude 필수 |
| popup window 안에서 부모 페이지 state 직접 의존 | 새 브라우저 컨텍스트라 PersonaContext 등 *재초기화*. 같은 origin 이라도 React state 는 분리 |

## 출시 전 체크리스트

```
[ ] Firefox / Chrome 양쪽 모두 동작 확인 (시크릿 창 + 일반 창)
[ ] popup blocker 환경에서 modal 로 fallback 되는지
[ ] modal 의 X / ESC / 배경 클릭 모두 닫기 작동
[ ] iframe 안 페이지가 부모와 같은 origin (Cognito 쿠키 전달)
[ ] iframe 안 SSE / WebSocket 정상 동작
[ ] modal 안의 키보드 입력이 부모 페이지로 새지 않음
[ ] 모바일 / 태블릿 (features 무시) 에서 새 탭 또는 modal 둘 다 작동
[ ] z-index 가 다른 fixed 요소 (헤더·toast)보다 위
[ ] iframe loading="lazy" 또는 첫 열림 시에만 mount (성능)
```

## 진단 체크리스트 (회귀 발생 시)

```
[ ] 작동했던 버전 / 작동 안 하는 버전의 git diff
[ ] 작동 안 하는 브라우저의 chrome://site-engagement (또는 about:engagement) 점수
[ ] 작동 안 하는 브라우저의 settings/content/popups 에 도메인이 차단 목록인지
[ ] 브라우저 확장 (uBlock, Privacy Badger 등) 일시 비활성 후 재시도
[ ] DevTools Console 에 "popup was opened as tab" 류 경고 메시지
[ ] window.open 반환값이 null 인지 (true blocked) 또는 popup.closed 즉시 true 인지
[ ] features 문자열에 chrome-UI 제거 hint 4개 모두 있는지
[ ] window name 이 `'_blank'` 인지 (named window 는 Chrome 에 덜 관대)
```

## 한 줄 정리

체감 효과적인 popup = (UA 분기) + (features 명시 4+개) + (window name `_blank`)
+ (iframe modal fallback) + (3-way 닫기)

이 가이드를 따르면 *모든* 브라우저에서 같은 시각적 경험을 제공할 수 있습니다.
```

---

## 참고 — 이 패턴이 검증된 배경

- **프로젝트**: `ontology-gcc` (GS Caltex M&M본부 PoC, 2026-05)
- **증상**: v1.0.55 (5/12 빌드) 에서 Cally popup 정상 동작 → v1.0.59 에서
  features 정리·간소화 + window name 변경 후 Chrome 만 새 탭 fallback
- **회귀 추적**: git diff 로 features 차이 + window name 차이 발견 → v1.0.60
  에서 v1.0.55 features 복귀 → Firefox 작동, Chrome 여전히 실패 →
  v1.0.63 에서 UA 분기 + iframe modal 추가 → 양쪽 모두 정상
- **검증**: Firefox 별도 popup window, Chrome 화면 가운데 iframe modal
- **재사용**: Cally floating chat 외에도 데모 PoC 의 도움말 popup / 미리보기
  창 / 외부 링크 preview 등에 동일 패턴 적용 가능

## 변경 로그

- `2026-05-14` (v1.0): 초기 작성. v1.0.63 에서 검증된 UA 분기 + iframe modal
  + 3-way fallback 패턴 반영.
- 향후 갱신 시: 본문의 코드 블록 갱신 + *변경 이력*만 여기에 한 줄 추가.
