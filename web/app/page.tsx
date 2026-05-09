'use client';
import Link from 'next/link';
import GuidedTourGcc from '../components/GuidedTour';
import {
  Search, MessageSquare, BarChart3, Users, Layers, GitMerge,
  Megaphone, Map, ShieldCheck, Radio, AlertTriangle, CreditCard,
  Compass, Cloud, Network, ArrowRight, Fuel, Tag, Gift, BadgeCheck,
  PhoneCall, Smartphone, ClipboardList, Building2, Clock, TrendingUp,
  ScrollText, Lightbulb, GitBranch,
} from 'lucide-react';

type Color =
  | 'blue' | 'emerald' | 'amber' | 'violet' | 'rose' | 'cyan'
  | 'sky' | 'teal' | 'orange' | 'fuchsia' | 'yellow' | 'lime'
  | 'pink' | 'indigo';

type Scenario = {
  href: string;
  tag: string;
  title: string;
  desc: string;
  color: Color;
  icon: React.ComponentType<{ className?: string }>;
};

const SCENARIOS: Scenario[] = [
  { href: '/search',          tag: 'A', title: '하이브리드 검색',   desc: '자연어 → BM25 (Nori) + Cohere KNN + Reranker → 1-hop 그래프 시각화.',                            color: 'blue',    icon: Search },
  { href: '/chat',            tag: 'B', title: '페르소나 챗봇',     desc: 'Bedrock Sonnet 4.6 + AgentCore Memory + Guardrails + 10 도구 호출 SSE 스트리밍.',                color: 'emerald', icon: MessageSquare },
  { href: '/insights',        tag: 'C', title: '인사이트 카드',     desc: 'Neptune 집계 + Sonnet 요약 + AgentCore Code Interpreter matplotlib (NanumGothic).',              color: 'amber',   icon: BarChart3 },
  { href: '/persona-match',   tag: 'D', title: '페르소나 매칭',     desc: '5 부서 페르소나 가중치 × Customer KPI → 매칭 점수 + 차별화 포인트.',                                color: 'violet',  icon: Users },
  { href: '/cluster',         tag: 'E', title: '고객 클러스터링',   desc: 'KMeans 6 + LLM 라벨링 + 프로파일 카드 + Neptune write-back.',                                       color: 'rose',    icon: Layers },
  { href: '/lookalike',       tag: 'F', title: '룩어라이크 확장',   desc: 'Seed 페르소나 → 50K 합성 코호트 임베딩 KNN → 유사 고객 풀.',                                          color: 'cyan',    icon: GitMerge },
  { href: '/campaign-roi',    tag: 'G', title: '캠페인 ROI',         desc: 'Bayesian 분포 시뮬레이션 + SMS 발송 효율 + 어트리뷰션.',                                              color: 'sky',     icon: Megaphone },
  { href: '/network-map',     tag: 'H', title: '권역 경쟁 지도',     desc: '시도 choropleth + GSC vs 경쟁사 매트릭스 + Region 드릴다운.',                                          color: 'teal',    icon: Map },
  { href: '/compliance',      tag: 'I', title: '약관·가드레일',     desc: 'TermAgreement 추적 + Bedrock Guardrails 4 토픽 + 위반 경로.',                                          color: 'orange',  icon: ShieldCheck },
  { href: '/external-signal', tag: 'J', title: '외부 시그널 융합',   desc: '현대카드 소비지수 + 앱 행동 + 설문 + 날씨 cross-source narrative.',                                    color: 'fuchsia', icon: Radio },
  { href: '/outlier',         tag: 'K', title: '이상 행동 탐지',     desc: 'PM+M 92 RON DIY 블렌딩 + 디젤→premium 전환 (PDF 3페이지 시그니처).',                                  color: 'lime',    icon: AlertTriangle },
  { href: '/payment',         tag: 'L', title: '결제·멤버십',       desc: '결제 수단 × 가격 × 채널 매트릭스 + 멤버십 유지율.',                                                    color: 'pink',    icon: CreditCard },
  { href: '/journey',         tag: 'M', title: '고객 통합 여정',     desc: 'App + Tx + Term + Coupon 타임라인 + 유종 전환 강조 (PDF 3 시그니처).',                                color: 'yellow',  icon: Compass },
  { href: '/weather',         tag: 'N', title: '날씨 × 주유 상관',   desc: '기상청 WeatherObservation × FuelTransaction 산점도 + 권역별 상관.',                                  color: 'indigo',  icon: Cloud },
];

const CARD_COLOR: Record<Color, string> = {
  blue:    'from-blue-500/20 to-blue-500/0 border-blue-500/40',
  emerald: 'from-emerald-500/20 to-emerald-500/0 border-emerald-500/40',
  amber:   'from-amber-500/20 to-amber-500/0 border-amber-500/40',
  violet:  'from-violet-500/20 to-violet-500/0 border-violet-500/40',
  rose:    'from-rose-500/20 to-rose-500/0 border-rose-500/40',
  cyan:    'from-cyan-500/20 to-cyan-500/0 border-cyan-500/40',
  sky:     'from-sky-500/20 to-sky-500/0 border-sky-500/40',
  teal:    'from-teal-500/20 to-teal-500/0 border-teal-500/40',
  orange:  'from-orange-500/20 to-orange-500/0 border-orange-500/40',
  fuchsia: 'from-fuchsia-500/20 to-fuchsia-500/0 border-fuchsia-500/40',
  yellow:  'from-yellow-500/20 to-yellow-500/0 border-yellow-500/40',
  lime:    'from-lime-500/20 to-lime-500/0 border-lime-500/40',
  pink:    'from-pink-500/20 to-pink-500/0 border-pink-500/40',
  indigo:  'from-indigo-500/20 to-indigo-500/0 border-indigo-500/40',
};

type ObjectType = {
  href: string;
  label_en: string;
  label_ko: string;
  count: string;
  color: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
};

const OBJECT_GROUPS: { title: string; types: ObjectType[] }[] = [
  {
    title: '고객 코어',
    types: [
      { href: '/objects/customer', label_en: 'Customer', label_ko: '고객',         count: '(50K)',  color: '#60a5fa', icon: Users },
      { href: '/objects/persona',  label_en: 'Persona',  label_ko: '페르소나 (5)', count: '',        color: '#34d399', icon: BadgeCheck },
      { href: '/objects/cluster',  label_en: 'Cluster',  label_ko: '클러스터 (6)', count: '',        color: '#fbbf24', icon: Layers },
      { href: '/objects/segment',  label_en: 'Segment',  label_ko: '세그먼트',     count: '(12)',    color: '#a78bfa', icon: Tag },
      { href: '/objects/member',   label_en: 'Member',   label_ko: '멤버십',       count: '(45K)',   color: '#22d3ee', icon: Smartphone },
    ],
  },
  {
    title: '행동 / 거래',
    types: [
      { href: '/objects/fuel_transaction', label_en: 'FuelTransaction', label_ko: '주유 거래',     count: '(420K)', color: '#fb923c', icon: Fuel },
      { href: '/objects/app_event',        label_en: 'AppEvent',        label_ko: '앱 이벤트',     count: '(2.6M)', color: '#0ea5e9', icon: Smartphone },
      { href: '/objects/survey_response',  label_en: 'SurveyResponse',  label_ko: '설문 응답',     count: '(34K)',  color: '#facc15', icon: ClipboardList },
      { href: '/objects/coupon_use',       label_en: 'CouponUse',       label_ko: '쿠폰 사용',     count: '(8.5K)', color: '#f472b6', icon: Gift },
    ],
  },
  {
    title: '마케팅 / 결제',
    types: [
      { href: '/objects/campaign',       label_en: 'Campaign',      label_ko: '캠페인',     count: '(220)',   color: '#f87171', icon: Megaphone },
      { href: '/objects/coupon',         label_en: 'Coupon',        label_ko: '쿠폰',       count: '(1.8K)',  color: '#c084fc', icon: Tag },
      { href: '/objects/offer',          label_en: 'Offer',         label_ko: '오퍼',       count: '(420)',   color: '#fbbf24', icon: Gift },
      { href: '/objects/channel',        label_en: 'Channel',       label_ko: '채널',       count: '(12)',    color: '#94a3b8', icon: PhoneCall },
      { href: '/objects/campaign_sms',   label_en: 'CampaignSms',   label_ko: 'SMS 발송',   count: '(58K)',   color: '#38bdf8', icon: PhoneCall },
      { href: '/objects/payment_method', label_en: 'PaymentMethod', label_ko: '결제 수단',  count: '(8)',     color: '#14b8a6', icon: CreditCard },
    ],
  },
  {
    title: '주유소 / 가격',
    types: [
      { href: '/objects/gas_station',  label_en: 'GasStation',  label_ko: '주유소',      count: '(8.5K)',  color: '#0ea5e9', icon: Building2 },
      { href: '/objects/fuel_product', label_en: 'FuelProduct', label_ko: '유종',        count: '(5)',     color: '#fb923c', icon: Fuel },
      { href: '/objects/fuel_price',   label_en: 'FuelPrice',   label_ko: '가격 시계열', count: '(1.4M)',  color: '#86efac', icon: TrendingUp },
    ],
  },
  {
    title: '외부 / 컨텍스트',
    types: [
      { href: '/objects/region',              label_en: 'Region',             label_ko: '지역 (시도/시군구)',      count: '',        color: '#38bdf8', icon: Map },
      { href: '/objects/term',                label_en: 'Term',               label_ko: '약관',                    count: '(24)',    color: '#a5b4fc', icon: ScrollText },
      { href: '/objects/term_agreement',      label_en: 'TermAgreement',      label_ko: '약관 동의',               count: '(180K)',  color: '#fda4af', icon: ScrollText },
      { href: '/objects/consumption_index',   label_en: 'ConsumptionIndex',   label_ko: '소비지수 (현대카드)',     count: '(360)',   color: '#fde047', icon: Lightbulb },
      { href: '/objects/weather_observation', label_en: 'WeatherObservation', label_ko: '기상 관측 (KMA)',          count: '(1.3K)',  color: '#bfdbfe', icon: Cloud },
    ],
  },
  {
    title: '시간 / 집계',
    types: [
      { href: '/objects/time_slot',            label_en: 'TimeSlot',            label_ko: '시간대',         count: '(96)',  color: '#a3e635', icon: Clock },
      { href: '/objects/campaign_aggregation', label_en: 'CampaignAggregation', label_ko: '캠페인 집계',    count: '(420)', color: '#f9a8d4', icon: BarChart3 },
    ],
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400">홈 / 대시보드</div>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-ink-300">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
            All systems operational
          </span>
        </div>
      </header>

      <div className="flex-1 px-8 py-10 max-w-7xl mx-auto w-full">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-accent-400 mb-2 font-semibold">
            GS Caltex M&amp;M본부 · 14 시나리오 (A~N) × 5 부서 페르소나 × 25 클래스
          </p>
          <h1 className="text-4xl font-bold text-ink-50 leading-tight mb-3">
            고객·캠페인·주유 데이터를{" "}
            <span className="text-accent-300">온톨로지 + Agentic AI</span>로 풀어내는 PoC
          </h1>
          <p className="text-ink-300 leading-relaxed">
            Opinet 가격 + KFDA·KOSTAT 기준 표준 매핑 + KMA 기상 외부 시그널 + 현대카드 소비지수를
            결합한 실 데이터 500 코호트 + 합성 50K 룩어라이크 위에서, 14개 시나리오 (의미 검색 → 날씨 × 주유)와
            25종 Knowledge Graph 객체 탐색을 한 화면에 제공합니다. 우상단에서 부서 페르소나를
            전환하면 사이드바 정렬, 카드 강조, 챗 어조가 5가지 시점으로 바뀝니다.
          </p>
        </div>

        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {SCENARIOS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`group relative rounded-lg border bg-gradient-to-br ${CARD_COLOR[s.color]} bg-ink-800 p-5 hover:bg-ink-700/60 transition`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-md bg-ink-900 border border-ink-700 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-accent-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-accent-400 font-semibold">
                      시나리오 {s.tag}
                    </div>
                    <h3 className="text-base font-bold text-ink-50">{s.title}</h3>
                  </div>
                  <ArrowRight className="w-4 h-4 text-ink-400 group-hover:text-accent-300 group-hover:translate-x-0.5 transition shrink-0" />
                </div>
                <p className="text-xs text-ink-300 leading-relaxed">{s.desc}</p>
              </Link>
            );
          })}
        </section>

        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-ink-100 flex items-center gap-2">
              <Network className="w-5 h-5 text-accent-400" />
              Knowledge Graph 객체 타입
            </h2>
            <span className="text-xs text-ink-400">25 types · Neptune openCypher · 실 + 합성 데이터</span>
          </div>

          {OBJECT_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1.5 mt-3">
                {g.title}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                {g.types.map((t) => {
                  const Icon = t.icon;
                  return (
                    <Link
                      key={t.href}
                      href={t.href}
                      className="group rounded-md bg-ink-800 border border-ink-700 px-3 py-2.5 flex items-center gap-2 hover:border-accent-500/60 hover:bg-ink-700/40 transition"
                    >
                      <div
                        className="w-7 h-7 rounded flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${t.color}22`, border: `1px solid ${t.color}55` }}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color: t.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-ink-100 truncate">{t.label_en}</div>
                        <div className="text-[10px] text-ink-400 truncate">{t.label_ko} {t.count}</div>
                      </div>
                      <ArrowRight className="w-3 h-3 text-ink-500 group-hover:text-accent-400 group-hover:translate-x-0.5 transition shrink-0" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="mb-10 rounded-lg border border-ink-700 bg-ink-800/50 p-5">
          <h2 className="text-lg font-semibold text-ink-100 flex items-center gap-2 mb-2">
            <GitBranch className="w-5 h-5 text-accent-400" /> 메타 페이지
          </h2>
          <p className="text-xs text-ink-300 mb-3">
            ER 다이어그램 (25 클래스) · Standards (Opinet/KFDA/KOSTAT) · Validation (Neptune 카운트 vs 기대 범위) — 3 탭 통합
          </p>
          <Link
            href="/meta"
            className="inline-flex items-center gap-1.5 text-sm text-accent-300 hover:text-accent-200"
          >
            온톨로지 메타 열기 <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </section>

        <footer className="border-t border-ink-700 pt-6 text-xs text-ink-400">
          본 데모: 실 코호트 500명 (raw_data) + 50K 합성 룩어라이크 + 외부 KMA 기상 1,275건.
          표준 매핑: Opinet 유종 코드 · KFDA 유해성 분류 · KOSTAT 행정구역 코드 · 현대카드 소비지수 카테고리.
          페르소나: 마케팅 · 고객전략 · 데이터·AI · CRM·회원사업 · 리테일영업 (5 부서).
        </footer>

        <GuidedTourGcc persona="marketing" />
      </div>
    </div>
  );
}
