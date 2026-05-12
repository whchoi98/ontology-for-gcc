'use client';

// 60-min guided tour — GCC 14 scenarios A-N + 메타.
// Triggers on first visit (localStorage gate) and via topbar button.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Play, X, ChevronLeft, ChevronRight, Search, MessageSquare, BarChart3,
  Users, Layers, GitMerge, Megaphone, Map, ShieldCheck, Radio,
  AlertTriangle, CreditCard, Compass, Cloud, GitBranch, Sparkles,
} from 'lucide-react';

const STORAGE_KEY = 'ontology-gcc.tour-seen';

type Step = {
  badge: string;
  ko: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  pitch: string;
  try_it: string;
  tech: string;
};

const STEPS: Step[] = [
  {
    badge: '시작',
    ko: '60분 가이드 투어 — GS Caltex M&M본부',
    href: '/',
    icon: Sparkles,
    pitch: 'GS Caltex 마케팅·고객전략·데이터·AI·CRM·리테일영업 5 부서 페르소나가 동일한 25 클래스 고객 온톨로지를 각자 KPI 시점으로 보는 데모입니다. 14개 시나리오 A-N + 객체 탐색 + 메타 + 운영 콘솔이 좌측 사이드바에 있습니다.',
    try_it: '우상단 페르소나 버튼으로 부서를 선택하면 사이드바 정렬·홈 카드 하이라이트·챗 어조·KPI 우선순위가 모두 그 부서 시점으로 전환됩니다.',
    tech: 'Next.js 14 + FastAPI + Bedrock Sonnet 4.6 + AgentCore Memory/Code Interpreter + Neptune + OpenSearch Serverless · SSE 14/14 시나리오 streaming',
  },
  {
    badge: 'A',
    ko: '하이브리드 검색',
    href: '/search',
    icon: Search,
    pitch: '자연어 질의를 OpenSearch BM25(Nori 한국어) + Cohere embed-v4 KNN 하이브리드로 인덱싱하고 Cohere rerank-v3로 정렬합니다. 50,517 Customer + GasStation + Campaign 노드 대상.',
    try_it: '"서울 강남 30대 PLCC 보유 충성 고객" 검색 — Cytoscape 1-hop 그래프와 BM25/KNN 점수 차이를 함께 확인하세요.',
    tech: 'OpenSearch Serverless (Nori + Cohere embed-v4 1024d) · cross-region rerank-v3 · Neptune openCypher 1-hop',
  },
  {
    badge: 'B',
    ko: '페르소나 챗봇',
    href: '/chat',
    icon: MessageSquare,
    pitch: 'Bedrock Converse 다회차 + AgentCore Memory short/long-term + 10개 도구 (nearest_stations, neptune_subgraph, semantic_search, customer_lookup, fuel_grade_lookup, lookalike_expand, campaign_simulator 등) + Guardrails 4-topic 스크럽.',
    try_it: '"서울 권역 GSC 셀프 주유소 상위 5곳" 또는 "S0148 주유소 인근 5km 경쟁사" 입력 — 도구 호출이 SSE delta로 실시간 표시되고 Memory 패널에 turn이 기록됩니다.',
    tech: 'Bedrock Converse Stream · AgentCore Memory namespace=gcc · 10 tool specs · Guardrails',
  },
  {
    badge: 'C',
    ko: '인사이트 카드',
    href: '/insights',
    icon: BarChart3,
    pitch: 'Neptune 월별 유종 거래 집계 → AgentCore Code Interpreter Firecracker microVM에서 matplotlib + NanumGothic 차트 → Sonnet 4.6 한국어 5섹션 요약 (token streaming).',
    try_it: '"인사이트 생성" 클릭 — 5-phase chip이 흐르고 차트와 요약이 SSE로 실시간 도착합니다. 부서를 바꾸면 동일 데이터에 다른 시점이 적용됩니다.',
    tech: 'Neptune openCypher · AgentCore Code Interpreter · Bedrock Converse Stream · NanumGothic 한글 폰트',
  },
  {
    badge: 'D',
    ko: '페르소나 매칭',
    href: '/persona-match',
    icon: Users,
    pitch: '5 부서 KPI 가중치 (마케팅 ROAS · CRM PLCC · 리테일 station_volume 등) × Customer 속성을 곱해 best_persona를 산출. margin이 큰 고객일수록 부서별 차별화 명확.',
    try_it: 'cust_id "1,2,3,4,5,460,401,288,471,342" 입력 — deep-history vs coupon-only 코호트 혼합 매칭. score bar + margin chip으로 시각 비교.',
    tech: 'Neptune Customer + FuelTransaction 집계 · PERSONA_REGISTRY 5 KPI 가중치 · Sonnet 4.6 5섹션 SSE',
  },
  {
    badge: 'E',
    ko: '고객 클러스터링',
    href: '/cluster',
    icon: Layers,
    pitch: 'sklearn KMeans 6 군집화 + Sonnet 4.6 한국어 라벨링 ("충전형", "출퇴근형", "주말장거리", "디젤상시", "premium성향", "신규유입") + 옵션 Neptune Cluster 노드 write-back.',
    try_it: '"클러스터 생성" 클릭 — fetching_features → clustering → labeling → summary_streaming 5단계 chip + PCA 2D 산점도가 SSE로 흐릅니다.',
    tech: 'sklearn KMeans · Bedrock Sonnet 4.6 라벨 generator · matplotlib · Neptune Cluster write-back',
  },
  {
    badge: 'F',
    ko: '룩어라이크 확장',
    href: '/lookalike',
    icon: GitMerge,
    pitch: 'seed 고객 임베딩 + Cohere embed-v4 KNN 유사도 검색 → top X% 후보 확장. 50,517 인덱싱된 Customer (deep-history 33 + coupon-only 484 + la-XXXXXX 합성 50K) 대상.',
    try_it: 'seed "1,2,3" + top 20% — 연령·등급·시도 분포 차이로 seed cohort vs 확장 cohort 특성 비교.',
    tech: 'OpenSearch Cohere-v4 KNN · seed embedding · top-X% ranking · 5섹션 SSE',
  },
  {
    badge: 'G',
    ko: '캠페인 ROI 시뮬',
    href: '/campaign-roi',
    icon: Megaphone,
    pitch: '쿠폰액 × 타겟 세그먼트 × 기간 → Bayesian 사후 분포에서 5000 sample 추출 → 평균 전환률 + confidence 분포 차트 + baseline ROI uplift.',
    try_it: '"쿠폰 1,000원 × seg-001 × 30일 (기본)" 클릭 — 정규분포 히스토그램 + 부서 시점 인사이트가 SSE로 흐릅니다.',
    tech: 'Bayesian posterior simulation · matplotlib · AgentCore Code Interpreter + 로컬 fallback · Sonnet 4.6 SSE',
  },
  {
    badge: 'H',
    ko: '권역 경쟁 지도',
    href: '/network-map',
    icon: Map,
    pitch: '8.5K GasStation 노드를 시도×브랜드(GSC/현대/SK/S-Oil)로 집계 → 한반도 choropleth + 시도×브랜드 매트릭스 + 주유소 도우미 chat (nearest_stations · neptune_subgraph · semantic_search 도구).',
    try_it: '추천 질문 "디젤 평균 가격이 가장 저렴한 시군구 5곳" 또는 "S0148 주유소 인근 5km" 클릭 — choropleth 옆 chat에 도구 호출 결과가 실시간 표시.',
    tech: 'Neptune GasStation 집계 · KOSTAT 시도 GeoJSON · react-simple-maps · 도우미 chat 도구 chain · Sonnet 4.6 SSE',
  },
  {
    badge: 'I',
    ko: '약관·가드레일',
    href: '/compliance',
    icon: ShieldCheck,
    pitch: '대상 고객의 TermAgreement (마케팅 동의) 매트릭스 + Bedrock Guardrail 4-topic 액션 텍스트 스크럽 → 적격/차단 판정 + 권고.',
    try_it: 'cust_id "1,2,3,4,5" + action "고급휘발유 충성 고객 SMS 캠페인" — 약관 미동의 차단 + Guardrail INPUT 위반 분석 + 부서 권고 SSE.',
    tech: 'Neptune AGREED_TO/FOR edges · Bedrock Guardrails · 4 토픽 · Sonnet 4.6 5섹션 SSE',
  },
  {
    badge: 'J',
    ko: '외부 시그널 융합',
    href: '/external-signal',
    icon: Radio,
    pitch: '현대카드 ConsumptionIndex (78필드) + 에어브릿지 AppEvent + 운전중 SurveyResponse + KMA WeatherObservation 4 source를 한 고객 단위로 join → Sonnet 4.6 cross-source narrative + 5섹션 인사이트.',
    try_it: 'cust_id "1" — 6-phase chip (querying_neptune → narrative_streaming → summary_streaming) + narrative와 5섹션 markdown이 별도 SSE 채널로 실시간 흐릅니다.',
    tech: 'Neptune 4-source LEFT JOIN · Sonnet 4.6 dual SSE channel (narrative + summary) · max_tokens 4096',
  },
  {
    badge: 'K',
    ko: '이상 행동 탐지',
    href: '/outlier',
    icon: AlertTriangle,
    pitch: 'PDF 3페이지 시그니처 — (1) PM+M 92 RON DIY 혼유 (premium+regular 양방향), (2) 디젤→premium 유종 전환, (3) 앱 설치 후 가입. cohort 전체 100% coverage 검사.',
    try_it: '"PM+M 혼유 (92 RON DIY)" 패턴 선택 → "탐지 실행" — 매치 고객 행동 변화 의미 + false positive 검토 + 후속 액션 권고 SSE.',
    tech: 'Neptune FuelTransaction signature query · cohort 100% scan · Sonnet 4.6 SSE',
  },
  {
    badge: 'L',
    ko: '결제·멤버십',
    href: '/payment',
    icon: CreditCard,
    pitch: '139K FuelTransaction × PaymentMethod (PLCC/credit/smart/point/cash 8종) × 시도 매트릭스 → 결제수단·유종·시도 3차원 집계 + 부서별 KPI 시점 해석.',
    try_it: '"재분석" 클릭 — 부서 변경 시 자동 재분석. PLCC 보유율, 앱페이 vs credit 비중, 시도별 평균가가 SSE delta로 실시간 표시.',
    tech: 'Neptune FuelTransaction × GasStation 매트릭스 집계 · auto-rerun on persona change · Sonnet 4.6 SSE',
  },
  {
    badge: 'M',
    ko: '고객 통합 여정',
    href: '/journey',
    icon: Compass,
    pitch: '한 cust_id의 4 source (AppEvent · FuelTransaction · TermAgreement · CouponUse)를 timestamp 기준 단일 타임라인으로 merge + 유종 전환 시점 강조 (PDF 3페이지 PM+M 시그니처).',
    try_it: 'cust_id "1" — deep-history 전체 여정 + 유종 전환 (디젤→premium) 강조. 프로필 + 타임라인 + 부서 시점 인사이트 SSE.',
    tech: 'Neptune 4-source timeline merge · transition detection · Sonnet 4.6 SSE',
  },
  {
    badge: 'N',
    ko: '날씨 × 주유 패턴',
    href: '/weather',
    icon: Cloud,
    pitch: 'KMA 기상청 1,275 WeatherObservation × FuelTransaction을 시도·날짜 단위로 LEFT JOIN → Pearson r(강수×거래) + matplotlib 산점도 + Sonnet 4.6 풍부한 5섹션 cross-channel 인사이트 (4096 토큰).',
    try_it: '"서울 — 강수 vs 거래량 탄력성" 클릭 — 7-phase chip + 산점도 + Sonnet 인사이트가 SSE로 흐릅니다. 폭염일·폭설일·강수일 시도별 차이가 명확.',
    tech: 'KMA API · Neptune WeatherObservation × FuelTransaction · Pearson 상관 · max_tokens 4096 SSE',
  },
  {
    badge: '메타',
    ko: '온톨로지 / 객체 탐색 / 운영 / 코드그래프',
    href: '/meta',
    icon: GitBranch,
    pitch: '시나리오 외에도 — 25 클래스 온톨로지 ER + 표준 매핑 (Opinet·KOSTAT·KFDA·KMA·현대카드) + 검증 리포트 + 25종 객체 탐색 (3-pane Cytoscape 1-hop) + 운영 콘솔 5 영역 + graphify 코드 지식 그래프.',
    try_it: '/meta에서 25 클래스 ER 둘러보고, /objects/customer에서 50,517 고객을 3-pane (리스트 + 1-hop graph + inspector)로 탐색하세요. /codegraph는 이 코드베이스 자체의 graphify 분석.',
    tech: 'Cytoscape ER · 25 클래스 3-pane · graphify AST + Sonnet 4.6 community 라벨링 · 운영 콘솔 5 영역 live',
  },
];

export function GuidedTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const t = setTimeout(() => setOpen(true), 500);
        return () => clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, []);

  const closeAndRemember = () => {
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
  };

  const cur = STEPS[step];
  const Icon = cur.icon;

  return (
    <>
      <button
        onClick={() => { setStep(0); setOpen(true); }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-accent-500/40 bg-accent-500/10 text-accent-200 text-xs font-medium hover:bg-accent-500/15 transition"
        title="60분 가이드 투어"
      >
        <Play className="w-3.5 h-3.5" />
        가이드
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl mx-4 rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
            <button
              onClick={closeAndRemember}
              className="absolute top-3 right-3 p-1.5 rounded hover:bg-ink-800 text-ink-400"
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-7">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-accent-400 to-accent-600">
                  <Icon className="w-5 h-5 text-ink-950" />
                </div>
                <div>
                  <div className="text-[10px] font-mono tracking-wider text-accent-300">
                    {cur.badge} · {step + 1} / {STEPS.length}
                  </div>
                  <h2 className="text-xl font-bold text-ink-50">{cur.ko}</h2>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-ink-200 mb-4">{cur.pitch}</p>

              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 mb-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-300 mb-1">
                  지금 해보기
                </div>
                <p className="text-xs text-ink-200">{cur.try_it}</p>
              </div>

              <div className="text-[10px] font-mono text-ink-500 mb-5">
                {cur.tech}
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-ink-700 text-ink-300 text-xs disabled:opacity-30 hover:bg-ink-800"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> 이전
                </button>

                <Link
                  href={cur.href}
                  onClick={closeAndRemember}
                  className="px-3 py-1.5 rounded bg-accent-500 text-ink-950 text-xs font-semibold hover:bg-accent-400"
                >
                  이 시나리오 열기 →
                </Link>

                {step < STEPS.length - 1 ? (
                  <button
                    onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-ink-800 border border-ink-700 text-ink-100 text-xs hover:border-accent-500"
                  >
                    다음 <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={closeAndRemember}
                    className="px-3 py-1.5 rounded bg-emerald-500 text-ink-950 text-xs font-semibold hover:bg-emerald-400"
                  >
                    완료
                  </button>
                )}
              </div>

              <div className="mt-5 flex justify-center gap-1">
                {STEPS.map((_s, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={[
                      'h-1.5 rounded-full transition-all',
                      i === step ? 'w-8 bg-accent-400' : 'w-1.5 bg-ink-700 hover:bg-ink-600',
                    ].join(' ')}
                    aria-label={`스텝 ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Plan 5 Task 5.4.1 — persona-aware 시나리오 추천 카드 (default export) ──
// ADR 0008 — 5 페르소나 × 14 시나리오 (A~N) 권장 시작점 3개를 카드로 노출.
// 페르소나 변경 시 즉시 갱신. 홈페이지 `<GuidedTour persona={persona} />` 사용.
import { useEffect as _useEffect, useState as _useState } from 'react';

const SCENARIO_META: Record<string, { code: string; label: string; desc: string; href: string }> = {
  A: { code: 'A', label: '의미 검색',       desc: '자연어로 고객·주유 패턴을 1-hop 그래프로 탐색.',     href: '/search' },
  B: { code: 'B', label: '대화 에이전트',    desc: 'PDF Scenario 1 마케터 dialog. 메모리 + 10 도구.',  href: '/chat' },
  C: { code: 'C', label: '인사이트 차트',    desc: 'matplotlib NanumGothic + Sonnet 한국어 요약.',     href: '/insights' },
  D: { code: 'D', label: '페르소나 매칭',    desc: '고객 cohort에 맞는 부서 페르소나 추천.',           href: '/persona-match' },
  E: { code: 'E', label: '클러스터링',       desc: 'KMeans 6 + LLM 라벨링 + Cluster write-back.',     href: '/cluster' },
  F: { code: 'F', label: '룩어라이크',       desc: '시드 고객 임베딩 유사도 상위 X% 확장.',           href: '/lookalike' },
  G: { code: 'G', label: '캠페인 ROI',       desc: '쿠폰액 → 전환률·매출 시뮬 + Bayesian 분포.',      href: '/campaign-roi' },
  H: { code: 'H', label: '주유소 지도',      desc: '한국 시도 choropleth + GSC vs 경쟁사 가격.',      href: '/network-map' },
  I: { code: 'I', label: '약관 가드레일',    desc: '마케팅 자격 + Bedrock Guardrails.',               href: '/compliance' },
  J: { code: 'J', label: '외부 시그널',      desc: '현대카드·앱·설문·날씨 융합 narrative.',           href: '/external-signal' },
  K: { code: 'K', label: 'Outlier 탐지',     desc: 'PM+M 92 RON DIY · 디젤→premium 전환 검출.',       href: '/outlier' },
  L: { code: 'L', label: '결제 분석',        desc: 'PaymentMethod × FuelPrice × Channel 매트릭스.',   href: '/payment' },
  M: { code: 'M', label: '고객 통합 여정',   desc: 'PDF 3페이지 — App+Tx+Term+Coupon timeline.',      href: '/journey' },
  N: { code: 'N', label: '날씨 × 주유',      desc: '기상청 단기예보 × 시도 거래 상관.',               href: '/weather' },
};

const PERSONA_LABEL_FOR_TOUR: Record<string, string> = {
  marketing:    '마케팅',
  strategy:     '고객전략',
  'data-ai':    '데이터·AI',
  crm:          'CRM·회원사업',
  'retail-ops': '리테일영업',
};

export default function GuidedTourGcc({ persona }: { persona: string }) {
  const [priority, setPriority] = _useState<string[]>([]);
  _useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
    fetch(`${base}/personas`)
      .then((r) => r.json())
      .then((arr) => {
        const p = (Array.isArray(arr) ? arr : []).find((x: any) => x.persona_id === persona);
        setPriority((p?.scenario_priority || ['A', 'B', 'C']).slice(0, 3));
      })
      .catch(() => setPriority(['A', 'B', 'C']));
  }, [persona]);
  const personaLabel = PERSONA_LABEL_FOR_TOUR[persona] ?? persona;
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900/60 p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-accent-300" />
        <h3 className="text-sm font-semibold text-ink-100">
          {personaLabel} 부서 추천 시나리오
        </h3>
        <span className="text-[10px] font-mono text-ink-500">Top 3</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {priority.map((code) => {
          const m = SCENARIO_META[code];
          if (!m) return null;
          return (
            <Link
              key={code}
              href={m.href}
              className="group block rounded-md border border-ink-700 bg-ink-800 p-3 hover:border-accent-500/60 hover:bg-ink-700/50 transition"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-accent-500/40 bg-accent-500/10 text-accent-200">
                  {m.code}
                </span>
                <span className="text-sm font-semibold text-ink-100 group-hover:text-accent-200">
                  {m.label}
                </span>
              </div>
              <div className="text-xs text-ink-400 leading-snug">{m.desc}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
