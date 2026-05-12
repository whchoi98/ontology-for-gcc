'use client';
import { useEffect, useState } from 'react';
import { Cloud } from 'lucide-react';
import ChartImage from '@/components/ChartImage';
import WeatherOverlay from '@/components/WeatherOverlay';
import { ScenarioHeader } from '@/components/ScenarioHeader';
import PersonaSwitchGcc from '@/components/PersonaSwitchGcc';
import InsightReport from '@/components/InsightReport';
import PipelineChips, { phaseMeta, type PhaseChip } from '@/components/PipelineChips';
import { streamSSE } from '@/lib/api-client';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

type Row = { sido?: string; dt?: string; temp?: number; rain?: number; tx_count?: number; rev?: number };
type CorrOut = {
  rows?: Row[]; chart_png_b64?: string;
  total_rows?: number; weather_count?: number; tx_keys_count?: number;
  correlation_rain_tx?: number | null;
  summary?: string;
};
type Sample = { label: string; sido: string; persona: Persona; nl?: string };

// 풍선 추천 — 5 부서 × 6개. 자연어 질의 (nl) 까지 포함해 Sonnet 5섹션 인사이트
// 프롬프트에 추가 instruction으로 들어감.
const SAMPLES: Sample[] = [
  // 마케팅
  { persona: 'marketing', sido: '',     label: '전국 평균 — 강수일 캠페인 영향',
    nl: '강수일에 캠페인 발송 효율(전환률·매출)이 어떻게 달라지나요? 비 오는 날 SMS·앱푸시 ROI 시점에서 분석해 주세요.' },
  { persona: 'marketing', sido: '서울', label: '서울 — 강수 vs 거래량 탄력성',
    nl: '서울 권역에서 강수량 1mm당 거래량 변화는 어느 정도인가요? 탄력성을 마케팅 ROAS 시점에서 해석해 주세요.' },
  { persona: 'marketing', sido: '경기', label: '경기 — 출퇴근 강수 영향',
    nl: '경기 출퇴근 시간대(7~9시, 18~20시) 강수가 주유 거래에 미치는 영향은? 캠페인 발송 골든타임 추천 포함.' },
  { persona: 'marketing', sido: '부산', label: '부산 — 해안 권역 폭염일 캠페인',
    nl: '부산 해안 권역에서 폭염일(28°C 이상) 거래 패턴은? 여름 LPG/디젤 캠페인 시점 권고.' },
  { persona: 'marketing', sido: '인천', label: '인천 — 공항·항만 권역 기상 캠페인',
    nl: '인천 공항·항만 권역 기상(풍속·강수)과 주유 거래 상관은? 화물·렌터카 타겟 캠페인 시점.' },
  { persona: 'marketing', sido: '대전', label: '대전 — 봄철 황사일 행동 변화',
    nl: '대전 권역 봄철(3~5월) 황사·미세먼지일 거래량 변화는? 친환경 캠페인 (LPG·전기 보조금) 권고.' },
  // 고객전략
  { persona: 'strategy', sido: '',     label: '전국 — 계절 세그먼트 차이',
    nl: '전국 분기별 세그먼트(20대 충성·30대 워킹맘·VIP) 행동이 날씨에 따라 어떻게 갈리나요?' },
  { persona: 'strategy', sido: '부산', label: '부산 — 해안 권역 날씨 영향',
    nl: '부산 해안 권역에서 강수·풍속·기온이 고객 세그먼트별 거래량에 미치는 차별 영향은?' },
  { persona: 'strategy', sido: '강원', label: '강원 — 폭설일 디젤 비중',
    nl: '강원 폭설일(rain_mm > 20)에 디젤 비중이 어떻게 변하나요? 산간 권역 retention 시점 해석.' },
  { persona: 'strategy', sido: '제주', label: '제주 — 관광 성수기 날씨 의존도',
    nl: '제주 6~8월 관광 성수기 날씨와 거래 상관은? 관광객 vs 도민 세그먼트 차이.' },
  { persona: 'strategy', sido: '경남', label: '경남 — 농번기 날씨 영향',
    nl: '경남 농번기(4~10월) 강수와 농업·물류 거래 패턴 상관은? 농촌 세그먼트 retention.' },
  { persona: 'strategy', sido: '전북', label: '전북 — 가을 수확기 거래 패턴',
    nl: '전북 가을(9~11월) 수확기 기상과 농업 차량 거래 패턴은? 시즌 retention 시점.' },
  // 데이터·AI
  { persona: 'data-ai', sido: '',     label: '전국 상관계수 (cohort 평균)',
    nl: '전국 17 시도 Pearson r(강수×거래) 값의 분포 + outlier 시도 식별. 이상점 통계적 해석.' },
  { persona: 'data-ai', sido: '서울', label: '서울 — 시계열 anomaly + 기상',
    nl: '서울 거래 시계열에서 anomaly 시점이 기상 (폭염·폭우·황사)과 일치하나요? 인과 vs 상관 분석.' },
  { persona: 'data-ai', sido: '제주', label: '제주 — 풍속 × 주유량 상관',
    nl: '제주 풍속(태풍·강풍)과 주유 거래량 상관은? 풍속 임계값에 따른 거래 감소 곡선 분석.' },
  { persona: 'data-ai', sido: '부산', label: '부산 — 다변량 회귀 (기온·풍속·강수)',
    nl: '부산 거래량을 기온·풍속·강수 다변량 회귀로 설명한 R² 값과 각 feature 계수는?' },
  { persona: 'data-ai', sido: '대구', label: '대구 — 폭염 7일 ARIMA 예측',
    nl: '대구 폭염(28°C 이상) 7일 연속 기상 시계열로 거래량 ARIMA 예측 가능한가요?' },
  { persona: 'data-ai', sido: '강원', label: '강원 — 폭설 휴리스틱 anomaly',
    nl: '강원 폭설(rain_mm > 30) 시점의 거래량 drop을 임계 휴리스틱으로 detect 가능한지 검증.' },
  // CRM·회원사업
  { persona: 'crm', sido: '',     label: '전국 — 멤버십 등급별 날씨 영향',
    nl: 'Silver/Gold/Black 멤버십 등급별 날씨 의존도 차이는? 등급별 retention 영향 시점.' },
  { persona: 'crm', sido: '서울', label: '서울 PLCC 보유자 강수 행동',
    nl: '서울 PLCC(GS&POINT 신용카드) 보유 회원이 강수일에 어떻게 행동하나요? 비보유자 대비.' },
  { persona: 'crm', sido: '인천', label: '인천 — Black 등급 + 기상',
    nl: '인천 권역 Black 등급 회원의 기상별 거래 패턴은? VIP retention 시점 해석.' },
  { persona: 'crm', sido: '경기', label: '경기 — Gold 회원 출퇴근 + 강수',
    nl: '경기 거주 Gold 회원의 출퇴근(7-9시) 강수일 주유 행동 변화. 멤버십 ROI 시점.' },
  { persona: 'crm', sido: '대구', label: '대구 — 멤버십 가입 후 거래 + 기상',
    nl: '대구 권역 신규 회원의 가입 후 90일 거래 패턴이 기상에 어떻게 반응하나요?' },
  { persona: 'crm', sido: '부산', label: '부산 — 휴면 회원 reactivation + 날씨',
    nl: '부산 휴면 회원(90일+ 미거래) 재활성화 시점이 특정 기상 패턴과 일치하나요?' },
  // 리테일영업
  { persona: 'retail-ops', sido: '',     label: '전국 — 시도 × 강수 매트릭스',
    nl: '전국 17 시도 × 강수 등급 매트릭스에서 GSC 셀프 주유소 거래 비중 변화는?' },
  { persona: 'retail-ops', sido: '대구', label: '대구 — 폭염일 셀프 비중',
    nl: '대구 폭염일(28°C 이상)에 셀프 주유소 vs 풀서비스 거래 비중 변화는?' },
  { persona: 'retail-ops', sido: '광주', label: '광주 — 강수일 매출 변화',
    nl: '광주 강수일 시도 단위 매출 감소율은? 권역 운영 시점에서 보상·재고 권고.' },
  { persona: 'retail-ops', sido: '울산', label: '울산 — 산업 권역 + 폭염',
    nl: '울산 산업 권역(공단·항만) 폭염일 화물·중장비 거래 패턴 + 셀프 비중.' },
  { persona: 'retail-ops', sido: '경기', label: '경기 — 신도시 권역 + 강수',
    nl: '경기 신도시 권역(분당·일산·동탄) 강수일 출퇴근 거래량 변화 + 셀프 비중.' },
  { persona: 'retail-ops', sido: '강원', label: '강원 — 폭설일 권역 운영 권고',
    nl: '강원 폭설일(rain_mm > 20) 산간 GSC 주유소 운영 위험·기회. 디젤·등유 재고 권고.' },
];

const PERSONA_TONE: Record<Persona, string> = {
  marketing: 'border-blue-500/50 bg-blue-500/15 text-blue-200',
  strategy: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  'data-ai': 'border-amber-500/50 bg-amber-500/15 text-amber-200',
  crm: 'border-rose-500/50 bg-rose-500/15 text-rose-200',
  'retail-ops': 'border-violet-500/50 bg-violet-500/15 text-violet-200',
};
const PERSONA_LABEL: Record<Persona, string> = {
  marketing: '마케팅', strategy: '고객전략', 'data-ai': '데이터·AI', crm: 'CRM·회원사업', 'retail-ops': '리테일영업',
};

export default function WeatherPage() {
  const { active, setActive } = useActivePersona();
  const [sido, setSido] = useState('');
  const [nlQuery, setNlQuery] = useState('');
  const [out, setOut] = useState<CorrOut | null>(null);
  const [phases, setPhases] = useState<PhaseChip[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => { setOut(null); setPhases([]); setHasRun(false); setNlQuery(''); }, [active]);

  async function go(s?: string, nl?: string) {
    const ss = s ?? sido;
    const nlText = nl ?? nlQuery;
    setLoading(true); setOut(null); setPhases([]); setHasRun(true);
    const acc: CorrOut = {};
    try {
      // 진짜 SSE 7단계 파이프라인. nl_query는 Sonnet 5섹션 인사이트의
      // extra_instruction으로 들어가 부서 시점 + 사용자 의도 둘 다 반영.
      for await (const ev of streamSSE<{ name?: string; count?: number; len?: number; desc?: string;
                                          text?: string; channel?: string } & CorrOut>(
        '/api/weather/stream',
        { persona_id: active, sido_nm: ss || null, nl_query: nlText || null },
      )) {
        const d = ev.data ?? {};
        if (ev.type === 'phase' && d.name) {
          setPhases((q) => [...q, phaseMeta(d.name!, d)]);
        } else if (ev.type === 'delta' && typeof d.text === 'string') {
          acc.summary = (acc.summary ?? '') + d.text;
          setOut({ ...acc });
        } else if (ev.type === 'result') {
          Object.assign(acc, d);
          setOut({ ...acc });
        }
      }
    } finally { setLoading(false); }
  }

  const filtered = SAMPLES.filter((s) => s.persona === active);

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="N" title="날씨 × 주유 상관"
        tech="KMA WeatherObservation × FuelTransaction → 시도별 강수·기온 상관 + 산점도" />
      <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink-50 mb-1.5">N. 날씨 × 주유 패턴</h1>
          <p className="text-sm text-ink-300 leading-relaxed">
            기상청 KMA API에서 수집한 <span className="text-accent-300 font-semibold">WeatherObservation</span> 1,275건과
            FuelTransaction을 시도·날짜로 join해 강수량·기온이 거래량·매출에 미치는 상관을 분석합니다.
          </p>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">부서 페르소나</span>
          <PersonaSwitchGcc value={active} onChange={(v) => setActive(v as Persona)} />
        </div>
        <div className="flex gap-2 mb-2">
          <input className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-ink-100 outline-none focus:border-accent-500 w-40"
            placeholder="시도 (선택)" value={sido} onChange={(e) => setSido(e.target.value)} />
          <input className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-ink-100 outline-none focus:border-accent-500"
            placeholder='자연어 질문 (예: "강수일에 캠페인 발송 효율은 어떻게 달라지나요?")'
            value={nlQuery} onChange={(e) => setNlQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !loading) void go(); }} />
          <button onClick={() => void go()} disabled={loading}
            className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 font-semibold px-5 py-2 rounded-md text-sm">
            <Cloud className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
            {loading ? '분석 중...' : '상관분석'}
          </button>
        </div>

        <PipelineChips phases={phases} loading={loading} />

        {!out && !loading && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
              {PERSONA_LABEL[active]} 부서 추천 — 클릭 즉시 분석
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {filtered.map((s, i) => (
                <button key={i} type="button" disabled={loading}
                  onClick={() => { setSido(s.sido); setNlQuery(s.nl ?? ''); void go(s.sido, s.nl); }}
                  className="group flex items-start gap-2 text-left px-3 py-2.5 rounded-lg border border-ink-700 bg-ink-900 hover:border-accent-500/60 hover:bg-ink-800 transition">
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${PERSONA_TONE[s.persona]}`}>
                    {PERSONA_LABEL[s.persona]}
                  </span>
                  <span className="text-sm text-ink-200 leading-snug group-hover:text-accent-200">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {out && (
          <>
            <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
                <div className="text-xs text-ink-400">날씨 관측</div>
                <div className="text-2xl font-bold text-ink-100">{out.weather_count ?? 0}</div>
              </div>
              <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
                <div className="text-xs text-ink-400">거래 키 (sido·dt)</div>
                <div className="text-2xl font-bold text-ink-100">{out.tx_keys_count ?? 0}</div>
              </div>
              <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
                <div className="text-xs text-ink-400">join rows</div>
                <div className="text-2xl font-bold text-accent-300">{out.total_rows ?? 0}</div>
              </div>
              <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
                <div className="text-xs text-ink-400">상관계수 (강수×거래)</div>
                <div className="text-2xl font-bold text-amber-300">
                  {out.correlation_rain_tx === null || out.correlation_rain_tx === undefined ? '—' : out.correlation_rain_tx}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div>
                <h2 className="text-sm font-semibold text-ink-100 mb-2">상관 산점도 + 시도별 평균</h2>
                <ChartImage base64Png={out.chart_png_b64} loading={loading} />
              </div>
              <div className="rounded-lg border border-ink-700 bg-ink-800 p-3">
                <h2 className="text-sm font-semibold text-ink-100 mb-2">날씨 오버레이 ({(out.rows ?? []).length} rows)</h2>
                <WeatherOverlay rows={out.rows ?? []} />
              </div>
            </div>

          </>
        )}

        {/* Sonnet 4.6 5섹션 인사이트 (delta streaming + MD/PDF 다운로드) */}
        {hasRun && (
          <InsightReport title="날씨 × 주유 패턴" scenarioCode="N"
            personaLabel={PERSONA_LABEL[active]}
            sources={['real:KMA WeatherObservation', 'real:FuelTransaction', 'real:Customer']}
            summary={out?.summary} loading={loading}
            filenameBase={`weather-${sido || 'all'}-${active}`} />
        )}

        <div className="mt-8 p-5 rounded-lg border border-ink-700 bg-ink-900/60">
          <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
            <span className="text-accent-400">⚙</span> 이 시나리오는 무엇을 하나요?
          </h3>
          <p className="text-xs text-ink-300 leading-relaxed">
            <strong className="text-ink-200">날씨 × 주유</strong>는 KMA 기상청 API로 수집한 WeatherObservation 노드 (시도별 일별 기온·강수·풍속·습도)와
            FuelTransaction을 시도·날짜로 LEFT JOIN해 산점도와 상관계수를 계산합니다. 강수일 → 셀프 주유 감소, 폭염일 → 등유 감소, 폭설일 → 디젤 비중 증가 같은 패턴 가시화.
          </p>
        </div>
      </div>
    </div>
  );
}
