# ADR 0011 — Cross-Browser Popup UA 분기 (Chrome iframe modal)

- Status: Accepted
- Date: 2026-05-14
- Deciders: 사용자 보고 ("크롬에서 popup 새 창이 안 뜸") + 개발팀

## Context

Cally 챗봇 floating 버튼이 `window.open(url, '_blank', features)` 로 480×760 popup 창을 시도. v1.0.55 까지 모든 브라우저에서 동작했으나 v1.0.59 의 features 정리 시도 후 *Chrome 만* 새 탭으로 fallback.

진단:
- **Firefox**: `width/height` features 명시만으로 popup window 보장
- **Chrome 122+**: *Site Engagement Score* 정책으로 신규 도메인의 popup 을 새 탭으로 변환. features 가 *모호* 하다고 판정되면 fallback. `popup=true` + window name 변경 등 시도해도 *근본적 한계*.

사용자 환경 (data point):
- Firefox: 480×760 popup 정상 (v1.0.60 부터)
- Chrome 시크릿 창: 새 탭으로 fallback 지속 (v1.0.62 까지)

## Decision

UA 분기 패턴 도입:

```typescript
function openCallyWindow() {
  const isChrome = /Chrome/.test(navigator.userAgent)
                && !/Edg|OPR|Brave/.test(navigator.userAgent);

  if (isChrome) {
    setModalOpen(true);   // 분기 (1): iframe-based in-page modal
    return;
  }

  const popup = window.open(url, '_blank', features);
  if (!popup || popup.closed) {
    setModalOpen(true);   // 분기 (3): popup blocked fallback → modal
    return;
  }
  popup.focus();
}
```

- **Chrome**: 페이지 가운데 480×760 iframe modal. `<iframe src="/cally" />` 로 `/cally` 페이지를 그대로 임베드 (same-origin → Cognito 쿠키 + SSE 자동 동작).
- **Firefox / Safari / Edge / Brave / Opera**: 기존 popup window. features 에 `popup=true` + 4개 chrome-UI 제거 hint (`toolbar/menubar/location/status=no`).
- **popup blocked fallback**: window.open 실패 시 modal 로 자동 전환 (사용자가 항상 무언가 본다).
- **3-way 닫기**: X 버튼 + 배경 클릭 + ESC 키.

## Consequences

- **Chrome 사용자도 별도 창과 *동등한 시각 경험*** — modal 헤더 + content 분리, popup 처럼 보임.
- **Cally 의 페르소나 context 유지**: same-origin iframe 이므로 부모 페이지의 `PersonaProvider` 컨텍스트 *재초기화 안 됨*. popup window 였다면 새 브라우저 컨텍스트라 context 분리되던 부수 효과 사라짐.
- **UA 분기의 spoofing 취약성**: Edge/Opera/Brave 가 Chrome 으로 위장한 UA 사용 시 fallback path. 정규식 `!/Edg|OPR|Brave/` 이 일반적이지만 *새 Chromium 기반 브라우저* 추가 시 명시 추가 필요.
- **Drag/resize 불가**: popup window 의 *드래그·리사이즈* 자유도가 iframe modal 에 없음. 향후 `react-rnd` 또는 직접 mousemove 핸들러로 추가 가능.

## Alternatives Considered

- **모든 브라우저 iframe modal 통일**: 가장 단순하지만 Firefox 의 *별도 창* 경험 가치 손실. UA 분기가 *각 브라우저의 자연 동작* 보존.
- **Drawer 슬라이드 (v1.0.50 이전)**: drawer 코드가 FloatingChat.tsx 에 살아있음. 100% 작동 보장이지만 popup 의도와 다름.
- **Chrome popup blocker 사용자 안내**: `chrome://settings/content/popups` 에서 도메인 허용 안내. UX 부담 + 매번 새 사용자가 같은 과정 반복.

## Related Code / Files

- `web/components/FloatingChat.tsx:150-173` — UA 분기 + popup features
- `web/components/FloatingChat.tsx:308-345` — iframe modal JSX
- `web/components/FloatingChat.tsx:96-105` — ESC 키 통합 핸들러
- `prompts/cross-browser-popup-pattern.md` — 재사용 가능한 prompt 문서

## Verification

- Firefox: 480×760 별도 popup window 정상 ✓
- Chrome 시크릿 창: 화면 가운데 480×760 iframe modal 정상 ✓
- popup 차단 환경: window.open 실패 → 자동 modal fallback ✓
- ESC / X / 배경 클릭: 모두 닫기 ✓

---
*Implemented in commits `d41bd4e` (UA 분기) + `57f2e0d` (재사용 prompt 문서) (2026-05-14). Cally floating chat 정착 사이클.*
