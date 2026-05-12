'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Users, BadgeCheck, Layers, Tag, Crown,
  Fuel, Smartphone, ClipboardList, Gift, CreditCard,
  Megaphone, PhoneCall, Send, BarChart3, Mail,
  Building2, MapPin, TrendingUp, Map as MapIcon,
  ScrollText, FileCheck2, Lightbulb, Cloud, Clock,
  Network as NetworkIcon, Search as SearchIcon, ChevronRight,
  PanelRightClose, PanelRightOpen, Database,
} from 'lucide-react';

import * as api from '@/lib/api-client';

const CytoscapeView = dynamic(
  () => import('@/components/CytoscapeView').then((m) => m.CytoscapeView),
  { ssr: false },
);

// ── Per-slug visual identity ──────────────────────────────────────────
// Colors mirror CytoscapeView's per-label styling so list/graph/inspector
// stay visually coherent. Groups follow the GCC 5-domain ontology.
const TYPE_META: Record<
  string,
  {
    ko: string;
    desc: string;
    color: string;
    group: string;
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  }
> = {
  // ── 고객·회원 (5) — 오렌지/앰버 ─────────────────────────
  customer:           { ko: '고객',       desc: 'GS Caltex 비식별고객 — cust_id 1~503 deep-history/coupon-only + la-XXXXXX 합성 룩어라이크',
                        color: '#fb923c', group: '고객·회원', icon: Users },
  persona:            { ko: '부서 페르소나', desc: 'M&M본부 5 부서 — 마케팅·고객전략·데이터·AI·CRM·리테일영업',
                        color: '#f97316', group: '고객·회원', icon: BadgeCheck },
  cluster:            { ko: '클러스터',   desc: 'KMeans 6 — 충전형/출퇴근형/주말장거리/디젤상시/premium성향/신규유입',
                        color: '#fdba74', group: '고객·회원', icon: Layers },
  segment:            { ko: '세그먼트',   desc: '룩어라이크 시드 페르소나로 확장된 ad-hoc 세그먼트',
                        color: '#fcd34d', group: '고객·회원', icon: Tag },
  member:             { ko: '회원·등급', desc: 'Silver/Gold/Black 멤버십 + 누적 포인트',
                        color: '#fbbf24', group: '고객·회원', icon: Crown },

  // ── 행동·거래 (5) — 블루/시안 ─────────────────────────
  fuel_transaction:   { ko: '주유 거래', desc: '139K 거래 — store_cd · fuel_grade · qty_l · unit_price · payment_type',
                        color: '#38bdf8', group: '행동·거래', icon: Fuel },
  app_event:          { ko: '앱 이벤트', desc: 'Energy+ / 보너스카드앱 액션 (login·click·coupon_view 등)',
                        color: '#60a5fa', group: '행동·거래', icon: Smartphone },
  survey_response:    { ko: '설문 응답', desc: '37K 설문 — 26K anonymous + 불편요인·자유서술',
                        color: '#0ea5e9', group: '행동·거래', icon: ClipboardList },
  coupon_use:         { ko: '쿠폰 사용', desc: '발급·사용 결합 — tx_id 매핑 + use_amt 할인액',
                        color: '#22d3ee', group: '행동·거래', icon: Gift },
  payment_method:     { ko: '결제 수단', desc: 'PLCC/credit/smart/point/cash/kakaopay/naverpay/samsungpay 8종 (정적 카탈로그)',
                        color: '#06b6d4', group: '행동·거래', icon: CreditCard },

  // ── 마케팅 (6) — 핑크/퍼플 ────────────────────────────
  campaign:           { ko: '캠페인',     desc: 'campaign_cd + 기간 + 타겟 페르소나/클러스터/세그먼트',
                        color: '#d946ef', group: '마케팅', icon: Megaphone },
  coupon:             { ko: '쿠폰',       desc: '발급된 쿠폰 — denomination_amt + valid_dates',
                        color: '#f472b6', group: '마케팅', icon: Tag },
  offer:              { ko: '오퍼',       desc: '캠페인 산하 오퍼 — offer_cd + offer_nm',
                        color: '#a78bfa', group: '마케팅', icon: Gift },
  channel:            { ko: '채널',       desc: 'SMS/PUSH/EMAIL/BANNER 발송 채널 (정적 카탈로그)',
                        color: '#c084fc', group: '마케팅', icon: PhoneCall },
  campaign_sms:       { ko: 'SMS 발송',   desc: 'D17 — 1:1 캠페인 메시지 + delivered/open/click',
                        color: '#ec4899', group: '마케팅', icon: Mail },
  campaign_aggregation: { ko: '캠페인 집계', desc: 'D17 — target/delivered/converted + ROI%',
                        color: '#818cf8', group: '마케팅', icon: BarChart3 },

  // ── 운영·상품 (4) — 그린/틸 ───────────────────────────
  fuel_product:       { ko: '유종',       desc: 'regular(91) / premium(95) / diesel / kerosene / lpg (정적 카탈로그)',
                        color: '#34d399', group: '운영·상품', icon: Fuel },
  gas_station:        { ko: '주유소',     desc: '8.5K 주유소 — opinet_no + 시도/시군구 + GSC/SK/HD/Self/Other',
                        color: '#10b981', group: '운영·상품', icon: Building2 },
  fuel_price:         { ko: '유가 시계열', desc: 'Opinet 시계열 — station × grade × dt × amount',
                        color: '#14b8a6', group: '운영·상품', icon: TrendingUp },
  region:             { ko: '권역',       desc: 'KOSTAT 행정구역 — sido/sgg level',
                        color: '#2dd4bf', group: '운영·상품', icon: MapIcon },

  // ── 컴플·외부 (4) — 옐로/라임 ─────────────────────────
  term:               { ko: '약관',       desc: 'term_cd + 필수동의/마케팅수신 여부',
                        color: '#fde047', group: '컴플·외부', icon: ScrollText },
  term_agreement:     { ko: '약관 동의',  desc: '회원별 동의 시점·채널·승인여부',
                        color: '#facc15', group: '컴플·외부', icon: FileCheck2 },
  consumption_index:  { ko: '소비 지수',  desc: 'DW_CU_CUST_MAST 78필드 — 보너스카드/Energy+ 사용 + 행동지수',
                        color: '#f59e0b', group: '컴플·외부', icon: Lightbulb },
  weather_observation: { ko: '기상 관측', desc: 'D13 KMA — sido × dt × hour: 기온·강우·풍속·PM10',
                        color: '#84cc16', group: '컴플·외부', icon: Cloud },

  // ── 시간 (1) — 회색 ──────────────────────────────────
  time_slot:          { ko: '시간대',     desc: '5 슬롯 — commute_morning/lunch/commute_evening/late_night/weekend',
                        color: '#9ca3af', group: '시간', icon: Clock },
};

// Neptune label → URL slug (snake_case). Used by graph-tap navigation
// so a click on a 1-hop neighbour fetches detail for that node, regardless
// of which type the page is currently scoped to.
const LABEL_TO_SLUG: Record<string, string> = {
  Customer: 'customer', Persona: 'persona', Cluster: 'cluster',
  Segment: 'segment', Member: 'member',
  FuelTransaction: 'fuel_transaction', AppEvent: 'app_event',
  Survey: 'survey_response', SurveyResponse: 'survey_response',
  CouponUse: 'coupon_use', PaymentMethod: 'payment_method',
  Campaign: 'campaign', Coupon: 'coupon', Offer: 'offer',
  Channel: 'channel',
  CampaignSMS: 'campaign_sms', CampaignSms: 'campaign_sms',
  CampaignAggregation: 'campaign_aggregation',
  FuelProduct: 'fuel_product', GasStation: 'gas_station',
  FuelPrice: 'fuel_price', Region: 'region',
  Term: 'term', TermAgreement: 'term_agreement',
  ConsumptionIndex: 'consumption_index',
  WeatherObservation: 'weather_observation',
  TimeSlot: 'time_slot',
};

export default function ObjectTypePage({ params }: { params: { type: string } }) {
  const meta = TYPE_META[params.type] ?? {
    ko: params.type, desc: '', color: '#94a3b8', group: '', icon: NetworkIcon,
  };
  const Icon = meta.icon;

  const [list, setList] = useState<api.ObjectListResponse | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailSlug, setDetailSlug] = useState<string>(params.type);
  const [detail, setDetail] = useState<api.ObjectDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  // Load list on type change
  useEffect(() => {
    let cancelled = false;
    setList(null); setListError(null); setSelectedId(null); setDetail(null);
    api.listObjects(params.type, 30)
      .then((res) => { if (!cancelled) setList(res); })
      .catch((e) => {
        if (!cancelled) setListError(e instanceof Error ? e.message : 'list failed');
      });
    return () => { cancelled = true; };
  }, [params.type]);

  // Reset detailSlug whenever the URL type changes
  useEffect(() => {
    setDetailSlug(params.type);
  }, [params.type]);

  // Load detail when selection changes
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true); setDetailError(null); setDetail(null);
    api.getObjectDetail(detailSlug, selectedId)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e) => {
        if (!cancelled) setDetailError(e instanceof Error ? e.message : 'detail failed');
      })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [detailSlug, selectedId]);

  // Cytoscape tap → load detail for the tapped node
  function handleNodeTap(id: string, label: string) {
    const slug = (label && LABEL_TO_SLUG[label]) || params.type;
    setDetailSlug(slug);
    setSelectedId(id);
    if (!inspectorOpen) setInspectorOpen(true);
  }

  // Auto-select first item once list arrives
  useEffect(() => {
    if (list && list.items.length && !selectedId) setSelectedId(list.items[0].id);
  }, [list, selectedId]);

  const filteredItems = useMemo(() => {
    if (!list) return [];
    const f = filter.trim().toLowerCase();
    if (!f) return list.items;
    return list.items.filter(
      (it) => it.name.toLowerCase().includes(f) || it.id.toLowerCase().includes(f),
    );
  }, [list, filter]);

  // Build CytoscapeGraph from detail.subgraph (already in {nodes,edges} shape)
  const graph = useMemo(() => {
    if (!detail) return { nodes: [], edges: [] };
    return {
      nodes: detail.subgraph.nodes.map((n) => ({ data: n.data })),
      edges: detail.subgraph.edges.map((e) => ({ data: e.data })),
    };
  }, [detail]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Top breadcrumb / type chip ─────────────────────── */}
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6 gap-3">
        <div className="text-xs text-ink-400 flex items-center gap-2">
          <Link href="/" className="hover:text-accent-300">홈</Link>
          <ChevronRight className="w-3 h-3" />
          <span>객체 탐색</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-ink-200 font-medium">{meta.ko}</span>
          {meta.group && (
            <>
              <span className="text-ink-600">·</span>
              <span className="text-ink-400">{meta.group}</span>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
            style={{ borderColor: `${meta.color}60`, color: meta.color, backgroundColor: `${meta.color}14` }}
          >
            :{params.type}
          </span>
          {list && (
            <span className="text-[10px] font-mono text-ink-400">
              total {list.total.toLocaleString()}
            </span>
          )}
        </div>
      </header>

      <div
        className={[
          'flex-1 grid grid-cols-1 min-h-0',
          inspectorOpen
            ? 'xl:grid-cols-[280px_1fr_360px]'
            : 'xl:grid-cols-[280px_1fr]',
        ].join(' ')}
      >
        {/* ── List pane (left) ───────────────────────────── */}
        <aside className="border-r border-ink-700 bg-ink-900 flex flex-col min-h-0">
          <div className="p-4 border-b border-ink-700 flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${meta.color}22`, border: `1px solid ${meta.color}55` }}
            >
              <Icon className="w-4 h-4" style={{ color: meta.color }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink-100 truncate">{meta.ko}</div>
              <div className="text-[10px] text-ink-400 leading-snug mt-0.5 line-clamp-3">{meta.desc}</div>
            </div>
          </div>
          <div className="px-3 py-2 border-b border-ink-700 relative">
            <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-500" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`${meta.ko} 필터…`}
              className="w-full rounded bg-ink-800 border border-ink-700 text-xs pl-8 pr-3 py-1.5 text-ink-100 outline-none focus:border-accent-500 placeholder:text-ink-500"
            />
          </div>
          <ul className="flex-1 overflow-y-auto">
            {listError && (
              <li className="m-3 p-3 rounded text-xs bg-red-500/10 border border-red-500/30 text-red-300">
                {listError}
              </li>
            )}
            {!list && !listError && (
              <li className="text-xs text-ink-500 italic p-4">로딩 중…</li>
            )}
            {list && filteredItems.length === 0 && (
              <li className="text-xs text-ink-500 italic p-4">
                {filter ? '검색 결과 없음' : '데이터 없음 (Neptune 미적재)'}
              </li>
            )}
            {filteredItems.map((it) => {
              const active = it.id === selectedId && detailSlug === params.type;
              return (
                <li key={it.id}>
                  <button
                    onClick={() => { setDetailSlug(params.type); setSelectedId(it.id); }}
                    className={[
                      'w-full text-left px-4 py-2.5 border-b border-ink-700/40 transition',
                      active
                        ? 'bg-accent-500/10 border-l-2 border-l-accent-500'
                        : 'hover:bg-ink-800',
                    ].join(' ')}
                  >
                    <div className={`text-sm font-medium truncate ${active ? 'text-accent-200' : 'text-ink-100'}`}>
                      {it.name}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] font-mono text-ink-500 truncate">{it.id}</span>
                      {it.rank_score > 0 && (
                        <span className="text-[10px] font-mono text-ink-400">·{it.rank_score}</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ── Graph canvas (center) ──────────────────────── */}
        <section className="relative min-h-[600px] xl:min-h-0 p-4 flex flex-col">
          <div className="mb-2 flex items-center gap-2 text-xs flex-wrap">
            {detail ? (
              <>
                <span
                  className="px-1.5 py-0.5 rounded font-mono text-[10px] border"
                  style={{ borderColor: `${meta.color}60`, color: meta.color, backgroundColor: `${meta.color}14` }}
                >
                  {detail.label}
                </span>
                <span className="text-ink-100 font-semibold truncate">{detail.name}</span>
                <span className="font-mono text-[10px] text-ink-500 truncate">{detail.id}</span>
                {Object.entries(detail.neighbor_summary).slice(0, 6).map(([lbl, cnt]) => (
                  <span
                    key={lbl}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-800 text-ink-300 border border-ink-700"
                  >
                    {lbl} ·{cnt}
                  </span>
                ))}
              </>
            ) : (
              <span className="text-ink-500 italic">객체를 선택하세요</span>
            )}
            <button
              type="button"
              onClick={() => setInspectorOpen((v) => !v)}
              className="ml-auto px-2.5 py-1 text-xs rounded-md border border-ink-600 bg-ink-800 text-ink-200 hover:bg-ink-700 hover:border-accent-500/60 flex items-center gap-1.5"
              title={inspectorOpen ? '속성 패널 접기 — 그래프 전체 너비' : '속성 패널 펴기'}
            >
              {inspectorOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
              {inspectorOpen ? '속성 접기' : '속성 펴기'}
            </button>
          </div>

          {detailLoading && (
            <div className="flex-1 flex items-center justify-center text-sm text-ink-400">
              그래프 로딩 중…
            </div>
          )}
          {detailError && !detailLoading && (
            <div className="m-3 p-3 rounded text-sm bg-red-500/10 border border-red-500/30 text-red-300">
              {detailError}
            </div>
          )}
          {!detailLoading && detail && (
            <div className="flex-1 min-h-[600px]">
              <CytoscapeView
                graph={graph}
                anchorIds={[selectedId ?? '']}
                height={Math.max(600, typeof window !== 'undefined' ? window.innerHeight - 240 : 700)}
                onNodeTap={handleNodeTap}
              />
            </div>
          )}
          {!detailLoading && !detail && !detailError && (
            <div className="flex-1 flex items-center justify-center text-sm text-ink-500">
              좌측에서 객체를 선택하면 1-hop 관계 그래프가 표시됩니다.
            </div>
          )}
        </section>

        {/* ── Inspector pane (right, collapsible) ───────── */}
        {inspectorOpen && (
          <aside className="border-l border-ink-700 bg-ink-900 flex flex-col min-h-0">
            {detail ? (
              <>
                <div className="p-4 border-b border-ink-700">
                  <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-0.5">
                    {detail.label}
                  </div>
                  <h2 className="text-base font-bold text-ink-50 leading-tight">{detail.name}</h2>
                  <div className="text-[11px] font-mono text-ink-500 mt-1 break-all">id: {detail.id}</div>
                  {Object.keys(detail.neighbor_summary).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {Object.entries(detail.neighbor_summary).map(([lbl, cnt]) => {
                        const slug = LABEL_TO_SLUG[lbl];
                        const tone = TYPE_META[slug]?.color ?? '#94a3b8';
                        return (
                          <span
                            key={lbl}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
                            style={{
                              borderColor: `${tone}60`,
                              color: tone,
                              backgroundColor: `${tone}14`,
                            }}
                          >
                            {lbl} ·{cnt}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="w-3 h-3 text-ink-400" />
                    <span className="text-[10px] uppercase tracking-wider text-ink-400">속성</span>
                    <span className="text-[10px] font-mono text-ink-500">
                      ({Object.keys(detail.properties).length})
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {Object.entries(detail.properties).map(([k, v]) => (
                      <li key={k} className="text-xs">
                        <div className="text-ink-400 font-mono text-[10px]">{k}</div>
                        <div className="text-ink-100 break-words">
                          {Array.isArray(v)
                            ? v.length === 0 ? '—' : v.map(String).join(', ')
                            : typeof v === 'object' && v !== null
                              ? JSON.stringify(v)
                              : String(v ?? '—')}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-ink-500 italic px-4 text-center">
                선택된 객체의 속성과 인접 통계가 여기에 표시됩니다.
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
