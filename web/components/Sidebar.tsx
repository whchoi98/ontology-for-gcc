'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Search, MessageSquare, BarChart3, Users, Layers, GitMerge,
  Megaphone, Map, ShieldCheck, Radio, AlertTriangle, CreditCard,
  Compass, Cloud, GitBranch, Database, Brain, ListTree, Network,
  Sparkles, ChevronRight, Activity, Fuel, Tag, Gift, BadgeCheck,
  PhoneCall, Smartphone, ClipboardList, Building2, Calendar, Clock,
  TrendingUp, ScrollText, Lightbulb, Code2,
} from 'lucide-react';

import { SidebarAuth } from './SidebarAuth';
import { CompanyLogo } from './CompanyLogo';

type Item = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: string;
  match?: (path: string) => boolean;
};

type Section = { title: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    title: '인사이트 페르소나 (5 부서 · 14 시나리오)',
    items: [
      { href: '/',                icon: Home,           label: '홈' },
      { href: '/search',          icon: Search,         label: '하이브리드 검색',     badge: 'A' },
      { href: '/chat',            icon: MessageSquare,  label: '페르소나 챗봇',       badge: 'B' },
      { href: '/insights',        icon: BarChart3,      label: '인사이트 카드',       badge: 'C' },
      { href: '/persona-match',   icon: Users,          label: '페르소나 매칭',       badge: 'D' },
      { href: '/cluster',         icon: Layers,         label: '고객 클러스터링',     badge: 'E' },
      { href: '/lookalike',       icon: GitMerge,       label: '룩어라이크 확장',     badge: 'F' },
      { href: '/campaign-roi',    icon: Megaphone,      label: '캠페인 ROI',          badge: 'G' },
      { href: '/network-map',     icon: Map,            label: '권역 경쟁 지도',      badge: 'H' },
      { href: '/compliance',      icon: ShieldCheck,    label: '약관·가드레일',       badge: 'I' },
      { href: '/external-signal', icon: Radio,          label: '외부 시그널 융합',    badge: 'J' },
      { href: '/outlier',         icon: AlertTriangle,  label: '이상 행동 탐지',      badge: 'K' },
      { href: '/payment',         icon: CreditCard,     label: '결제·멤버십',         badge: 'L' },
      { href: '/journey',         icon: Compass,        label: '고객 통합 여정',      badge: 'M' },
      { href: '/weather',         icon: Cloud,          label: '날씨 × 주유 상관',    badge: 'N' },
    ],
  },
  {
    title: '메타 (Ontology)',
    items: [
      { href: '/meta',      icon: GitBranch, label: '온톨로지 (25 클래스 · 표준 · 검증)' },
      { href: '/codegraph', icon: Code2,     label: '코드 지식 그래프 (graphify)' },
    ],
  },
  {
    title: '객체 탐색 (Knowledge Graph · 25 클래스)',
    items: [
      // 고객 코어 (5)
      { href: '/objects/customer',     icon: Users,          label: '고객 (Customer)' },
      { href: '/objects/persona',      icon: BadgeCheck,     label: '페르소나 (Persona · 5 부서)' },
      { href: '/objects/cluster',      icon: Layers,         label: '클러스터 (Cluster)' },
      { href: '/objects/segment',      icon: Tag,            label: '세그먼트 (Segment)' },
      { href: '/objects/member',       icon: Smartphone,     label: '멤버십 (Member)' },
      // 행동 / 거래 (4)
      { href: '/objects/fuel_transaction', icon: Fuel,         label: '주유 거래 (FuelTransaction)' },
      { href: '/objects/app_event',        icon: Smartphone,   label: '앱 이벤트 (AppEvent)' },
      { href: '/objects/survey_response',  icon: ClipboardList, label: '설문 응답 (SurveyResponse)' },
      { href: '/objects/coupon_use',       icon: Gift,          label: '쿠폰 사용 (CouponUse)' },
      // 마케팅 / 결제 (6)
      { href: '/objects/campaign',           icon: Megaphone,     label: '캠페인 (Campaign)' },
      { href: '/objects/coupon',             icon: Tag,           label: '쿠폰 (Coupon)' },
      { href: '/objects/offer',              icon: Gift,          label: '오퍼 (Offer)' },
      { href: '/objects/channel',            icon: PhoneCall,     label: '채널 (Channel)' },
      { href: '/objects/campaign_sms',       icon: PhoneCall,     label: 'SMS 발송 (CampaignSms)' },
      { href: '/objects/payment_method',     icon: CreditCard,    label: '결제 수단 (PaymentMethod)' },
      // 주유소 / 가격 (3)
      { href: '/objects/gas_station',  icon: Building2,  label: '주유소 (GasStation)' },
      { href: '/objects/fuel_product', icon: Fuel,       label: '유종 (FuelProduct)' },
      { href: '/objects/fuel_price',   icon: TrendingUp, label: '가격 시계열 (FuelPrice)' },
      // 외부 / 컨텍스트 (5)
      { href: '/objects/region',            icon: Map,         label: '지역 (Region · 시도/시군구)' },
      { href: '/objects/term',              icon: ScrollText,  label: '약관 (Term)' },
      { href: '/objects/term_agreement',    icon: ScrollText,  label: '약관 동의 (TermAgreement)' },
      { href: '/objects/consumption_index', icon: Lightbulb,   label: '소비지수 (ConsumptionIndex)' },
      { href: '/objects/weather_observation', icon: Cloud,     label: '기상 관측 (WeatherObservation)' },
      // 시간 (1)
      { href: '/objects/time_slot',         icon: Clock,       label: '시간대 (TimeSlot)' },
      // D17 청사진 (1)
      { href: '/objects/campaign_aggregation', icon: BarChart3, label: '캠페인 집계 (CampaignAggregation)' },
    ],
  },
  {
    title: '파이프라인 (Ops)',
    items: [
      { href: '/ops/resources', icon: Network,     label: '인프라 자원 상태' },
      { href: '/ops/ingest',    icon: Database,    label: '데이터 적재' },
      { href: '/ops/guardrail', icon: ShieldCheck, label: '가드레일' },
      { href: '/ops/memory',    icon: Brain,       label: '메모리 히스토리' },
      { href: '/ops/eval',      icon: Activity,    label: '평가 결과' },
      { href: '/ops/trace',     icon: ListTree,    label: '도구 호출 트레이스' },
    ],
  },
];

function isActive(pathname: string, item: Item): boolean {
  if (item.match) return item.match(pathname);
  if (item.href === '/') return pathname === '/';
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

export function Sidebar() {
  const pathname = usePathname() ?? '/';
  return (
    <aside className="w-72 shrink-0 bg-ink-900 border-r border-ink-700 flex flex-col">
      <div className="h-14 flex items-center justify-between px-5 border-b border-ink-700 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 shrink-0 rounded-md bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center">
            <Network className="w-4 h-4 text-ink-950" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink-100 leading-tight truncate">Ontology GCC</div>
            <div className="text-[10px] text-ink-400 leading-tight truncate font-mono">{process.env.NEXT_PUBLIC_APP_VERSION ?? 'v1.0.63'}</div>
          </div>
        </div>
        <CompanyLogo />
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-4">
            <div className="px-5 mb-1.5 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">
              {section.title}
            </div>
            <ul>
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={[
                        'flex items-center gap-2.5 mx-2 px-3 py-2 rounded text-sm transition-colors',
                        active
                          ? 'bg-accent-500/10 text-accent-200 ring-1 ring-accent-500/30'
                          : 'text-ink-200 hover:bg-ink-800 hover:text-ink-100',
                      ].join(' ')}
                    >
                      <Icon className={`w-4 h-4 ${active ? 'text-accent-400' : 'text-ink-400'}`} />
                      <span className="flex-1">{item.label}</span>
                      {item.badge && (
                        <span className={[
                          'text-[10px] font-mono px-1.5 py-0.5 rounded',
                          active ? 'bg-accent-500/20 text-accent-300' : 'bg-ink-700 text-ink-300',
                        ].join(' ')}>
                          {item.badge}
                        </span>
                      )}
                      {active && <ChevronRight className="w-3 h-3 text-accent-400" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-ink-700 px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] text-ink-400">
          <Sparkles className="w-3 h-3 text-accent-400 shrink-0" />
          <span className="truncate">실 + 합성 + 외부 (KMA/현대카드/Opinet)</span>
        </div>
      </div>

      <SidebarAuth />
    </aside>
  );
}
