'use client';
import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import ChartImage from '@/components/ChartImage';
import { ScenarioHeader } from '@/components/ScenarioHeader';
import PersonaSwitchGcc from '@/components/PersonaSwitchGcc';
import InsightReport from '@/components/InsightReport';
import PipelineChips, { phaseMeta, type PhaseChip } from '@/components/PipelineChips';
import { streamSSE } from '@/lib/api-client';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

type RoiOut = {
  projected_conversion?: number; baseline_roi_pct?: number; note?: string;
  chart_png_b64?: string; segment_id?: string; coupon_amt?: number; duration_days?: number;
  summary?: string;
};
type Sample = { label: string; amt: number; seg: string; days: number; persona: Persona };

const SAMPLES: Sample[] = [
  { persona: 'marketing',  amt: 1000, seg: 'seg-001', days: 30, label: '쿠폰 1,000원 × 30일 (기본)' },
  { persona: 'marketing',  amt: 3000, seg: 'seg-vip', days: 14, label: 'VIP 3,000원 × 14일 단기' },
  { persona: 'marketing',  amt: 500,  seg: 'seg-002', days: 60, label: '소액 500원 × 60일 장기' },
  { persona: 'strategy',   amt: 2000, seg: 'seg-loyal', days: 30, label: '충성 고객 2,000원 × 30일' },
  { persona: 'strategy',   amt: 1500, seg: 'seg-churn', days: 21, label: 'churn 위험 1,500원' },
  { persona: 'strategy',   amt: 1000, seg: 'seg-new', days: 45, label: '신규 가입 1,000원 × 45일' },
  { persona: 'data-ai',    amt: 1000, seg: 'seg-001', days: 30, label: 'baseline A/B 시뮬' },
  { persona: 'data-ai',    amt: 5000, seg: 'seg-001', days: 30, label: '한계 효용 — 고액 5,000원' },
  { persona: 'data-ai',    amt: 1000, seg: 'seg-001', days: 7,  label: '단기 1주 시뮬' },
  { persona: 'crm',        amt: 1000, seg: 'seg-plcc', days: 30, label: 'PLCC 보유자 1,000원' },
  { persona: 'crm',        amt: 2000, seg: 'seg-black', days: 30, label: 'Black 등급 2,000원' },
  { persona: 'crm',        amt: 800,  seg: 'seg-silver', days: 30, label: 'Silver 등급 800원' },
  { persona: 'retail-ops', amt: 1000, seg: 'seg-seoul', days: 30, label: '서울 권역 1,000원' },
  { persona: 'retail-ops', amt: 1500, seg: 'seg-self', days: 21, label: '셀프 주유소 1,500원' },
  { persona: 'retail-ops', amt: 1000, seg: 'seg-region', days: 30, label: '권역 광역 캠페인' },
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

export default function CampaignRoiPage() {
  const { active, setActive } = useActivePersona();
  const [amt, setAmt] = useState(1000);
  const [seg, setSeg] = useState('seg-001');
  const [days, setDays] = useState(30);
  const [out, setOut] = useState<RoiOut | null>(null);
  const [phases, setPhases] = useState<PhaseChip[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setOut(null); setPhases([]); }, [active]);

  async function go(a?: number, s?: string, d?: number) {
    const aa = a ?? amt; const ss = s ?? seg; const dd = d ?? days;
    setLoading(true); setOut(null); setPhases([]);
    const acc: RoiOut = {};
    try {
      for await (const ev of streamSSE<{ name?: string; count?: number; len?: number; desc?: string;
                                          text?: string; channel?: string } & RoiOut>(
        '/api/campaign-roi/stream',
        { coupon_amt: aa, target_segment_id: ss, duration_days: dd, persona_id: active },
      )) {
        const dd2 = ev.data ?? {};
        if (ev.type === 'phase' && dd2.name) {
          setPhases((q) => [...q, phaseMeta(dd2.name!, dd2)]);
        } else if (ev.type === 'delta' && typeof dd2.text === 'string') {
          acc.summary = (acc.summary ?? '') + dd2.text;
          setOut({ ...acc });
        } else if (ev.type === 'result') {
          Object.assign(acc, dd2);
          setOut({ ...acc });
        }
      }
    } finally { setLoading(false); }
  }

  const filtered = SAMPLES.filter((s) => s.persona === active);

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="G" title="캠페인 ROI 시뮬"
        tech="Bayesian 분포 시뮬 + SMS 발송 효율 + baseline 대비 uplift + matplotlib chart" />
      <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink-50 mb-1.5">G. 캠페인 ROI 시뮬레이터</h1>
          <p className="text-sm text-ink-300 leading-relaxed">
            쿠폰 금액·타겟 세그먼트·기간을 입력하면 Bayesian 분포 시뮬로
            <span className="text-accent-300 font-semibold"> projected_conversion (전환률)</span>과
            <span className="text-accent-300 font-semibold"> baseline ROI</span>를 계산합니다.
            상단 부서 페르소나가 KPI 가중치를 결정합니다.
          </p>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">부서 페르소나</span>
          <PersonaSwitchGcc value={active} onChange={(v) => setActive(v as Persona)} />
        </div>
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <label className="text-sm text-ink-300">쿠폰액
            <input type="number" value={amt} onChange={(e) => setAmt(parseInt(e.target.value, 10))}
              className="ml-2 bg-ink-800 border border-ink-700 rounded-md px-2 py-1 w-28 text-ink-100 text-sm" />
          </label>
          <label className="text-sm text-ink-300">세그먼트
            <input value={seg} onChange={(e) => setSeg(e.target.value)}
              className="ml-2 bg-ink-800 border border-ink-700 rounded-md px-2 py-1 w-32 text-ink-100 text-sm" />
          </label>
          <label className="text-sm text-ink-300">기간(일)
            <input type="number" value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}
              className="ml-2 bg-ink-800 border border-ink-700 rounded-md px-2 py-1 w-20 text-ink-100 text-sm" />
          </label>
          <button onClick={() => void go()} disabled={loading}
            className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 font-semibold px-5 py-2 rounded-md text-sm">
            <Megaphone className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
            {loading ? '시뮬레이션 중...' : '시뮬'}
          </button>
        </div>

        <PipelineChips phases={phases} loading={loading} />

        {!out && !loading && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
              {PERSONA_LABEL[active]} 부서 추천 — 클릭 즉시 시뮬
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {filtered.map((s, i) => (
                <button key={i} type="button" disabled={loading}
                  onClick={() => { setAmt(s.amt); setSeg(s.seg); setDays(s.days); void go(s.amt, s.seg, s.days); }}
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
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="rounded-lg border border-ink-700 bg-ink-800 p-4 space-y-3">
              <div>
                <div className="text-xs text-ink-400">예상 전환률</div>
                <div className="text-3xl font-bold text-accent-300">
                  {((out.projected_conversion ?? 0) * 100).toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-ink-400">baseline ROI</div>
                <div className="text-2xl font-bold text-ink-100">{out.baseline_roi_pct ?? 0}%</div>
              </div>
              <div className="pt-2 border-t border-ink-700/50 text-xs text-ink-400">
                <div>seg <span className="font-mono text-ink-300">{out.segment_id}</span></div>
                <div>쿠폰 <span className="font-mono text-ink-300">{out.coupon_amt}원 × {out.duration_days}일</span></div>
                {out.note && <div className="mt-1 italic text-ink-400">{out.note}</div>}
              </div>
            </div>
            <ChartImage base64Png={out.chart_png_b64} />
          </div>
        )}

        {(out || loading) && (
          <InsightReport title="캠페인 ROI 시뮬" scenarioCode="G"
            personaLabel={PERSONA_LABEL[active]}
            sources={['synthetic:CampaignSim', 'real:CampaignAggregation']}
            summary={out?.summary} loading={loading}
            filenameBase={`campaign-roi-${active}`} />
        )}

        <div className="mt-8 p-5 rounded-lg border border-ink-700 bg-ink-900/60">
          <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
            <span className="text-accent-400">⚙</span> 이 시나리오는 무엇을 하나요?
          </h3>
          <p className="text-xs text-ink-300 leading-relaxed">
            <strong className="text-ink-200">캠페인 ROI 시뮬</strong>은 쿠폰액 × 타겟 세그먼트 × 기간을 입력으로 받아
            과거 SMS 캠페인 결과의 Bayesian 사후 분포에서 sample을 추출 → 평균 전환률과 confidence 분포를 차트로 보여줍니다.
            baseline ROI는 동일 세그먼트의 무캠페인 기간 매출 대비 uplift입니다. 마케팅 의사결정 직전 실험 비용 추정에 사용.
          </p>
        </div>
      </div>
    </div>
  );
}
