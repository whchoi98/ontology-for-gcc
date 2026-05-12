# web/ — Next.js 14 프론트엔드

> Next.js 14 App Router + React 18 + Tailwind. Node 20 / Fargate ARM64. standalone output.

## 모듈 역할

- **데모 UX**: 14 시나리오 페이지 + 객체 탐색 (25 클래스) + 코드 지식 그래프 + Cally 챗봇 popup.
- **페르소나 컨텍스트**: 5 부서 페르소나 토글이 사이드바·홈 카드·챗 톤·KPI 우선순위에 즉시 반영.
- **API 클라이언트**: `web/lib/api-client.ts` 가 REST + SSE 타입 안전 호출. 모든 페이지가 이걸로 백엔드 호출.

## 디렉토리 지도

```
web/
├── app/                     14 시나리오 + objects/[type]/[id] + meta + ops + cally + codegraph
│   ├── layout.tsx           Root layout (PersonaProvider + LayoutShell)
│   ├── page.tsx             홈 카드 그리드 (시나리오 + 객체)
│   └── cally/page.tsx       Chat-only popup (LayoutShell이 사이드바 숨김)
├── components/
│   ├── LayoutShell.tsx      pathname 분기 (/cally는 minimal)
│   ├── Sidebar.tsx          5 부서 페르소나 정렬 + 객체 탐색
│   ├── PersonaSwitch.tsx    top-bar 페르소나 토글
│   ├── GuidedTour.tsx       다크 테마 가이드 (jargon 없음)
│   ├── FloatingChat.tsx     Cally 챗봇 (Bot 아이콘, GS navy gradient)
│   ├── CytoscapeView.tsx    객체 탐색 1-hop 그래프
│   └── MarkdownView.tsx     react-markdown v10 + remark-gfm
└── lib/
    ├── api-client.ts        REST + SSE 타입 클라이언트
    ├── persona-context.tsx  useActivePersona() — 5 부서 컨텍스트
    └── types.ts             Persona, ChatEvent 등 공통 타입
```

## 핵심 컨벤션

- **클라이언트 컴포넌트**: 인터랙티브 / 훅 사용 시만 `'use client'`. 서버 컴포넌트가 기본.
- **API 호출**: 직접 `fetch` 금지 — `web/lib/api-client.ts` 의 타입드 헬퍼 사용. 새 엔드포인트 = 새 헬퍼 함수 + 응답 타입.
- **SSE 소비**: `streamSSE<T>` 또는 `chatStream` 헬퍼. 페이지마다 직접 SSE 파싱 금지.
- **Markdown**: 챗·인사이트 답변은 `<MarkdownView />` 로만 렌더. `.chat-markdown` 스코프 스타일.
- **컬러**: GS Caltex navy `#003278` / `#0050A0` / `#0067B1` 가 Cally / 챗·hover 강조 톤. Caltex 적색은 sub 만.
- **버전 표시**: 사이드바 좌상단은 `process.env.NEXT_PUBLIC_APP_VERSION ?? 'v1.0.XX'`. 빌드 시 `--build-arg NEXT_PUBLIC_APP_VERSION=$TAG` 로 주입.

## 라우팅 패턴

- 시나리오 라우트는 한 폴더 = 한 페이지. App Router의 `loading.tsx`, `error.tsx` 가 페이지별로 들어갈 수 있음.
- `/cally` 는 popup window 전용 — `LayoutShell` 의 `usePathname` 분기로 사이드바·top-bar·FloatingChat 모두 숨김.
- 객체 탐색은 `[type]/[id]` 동적 라우트. 25 클래스를 한 페이지로 처리.

## 빌드 / 배포

```bash
docker build --platform linux/arm64 -f web/Dockerfile \
  --build-arg NEXT_PUBLIC_APP_VERSION=$TAG \
  -t 061525506239.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-gcc-dev-web:$TAG .
```

ARM64 빌드 필수. ECS 서비스 `ontology-gcc-dev-web` 가 `:latest` + SHA 태그 사용.

## 새 시나리오 추가 (Auto-Sync Rules 발췌)

1. `app/<slug>/page.tsx` 작성.
2. `components/Sidebar.tsx` 시나리오 섹션에 등록 (페르소나 우선순위 반영).
3. `lib/api-client.ts` 에 타입드 헬퍼 + 응답 타입.
4. `app/page.tsx` 카드 그리드에 추가 (`CARD_COLOR` 맵 unique 색상).
5. `components/GuidedTour.tsx` step 한 줄.
