'use client';
import { useEffect, useState } from 'react';
import { Compass } from 'lucide-react';
import JourneyTimeline from '@/components/JourneyTimeline';
import { ScenarioHeader } from '@/components/ScenarioHeader';
import PersonaSwitchGcc from '@/components/PersonaSwitchGcc';
import InsightReport from '@/components/InsightReport';
import PipelineChips, { phaseMeta, type PhaseChip } from '@/components/PipelineChips';
import { streamSSE } from '@/lib/api-client';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

type JourneyEvent = { source?: string; ts?: string; event?: string; detail?: string };
type Transition = { ts?: string; from?: string; to?: string };
type JourneyOut = {
  cust_id?: string;
  profile?: Record<string, unknown> & { '~properties'?: Record<string, unknown> };
  events?: JourneyEvent[]; event_count?: number;
  fuel_grade_transitions?: Transition[]; note?: string;
  summary?: string;
};
type Sample = { label: string; cid: string; persona: Persona };

const SAMPLES: Sample[] = [
  { persona: 'marketing',  cid: '1',   label: 'cust_id=1 — deep-history 전체 여정' },
  { persona: 'marketing',  cid: '5',   label: 'cust_id=5 — 30대 캠페인 시점' },
  { persona: 'marketing',  cid: '12',  label: 'cust_id=12 — 20대 충성 history' },
  { persona: 'strategy',   cid: '1',   label: 'cust_id=1 — 세그먼트 변화' },
  { persona: 'strategy',   cid: '15',  label: 'cust_id=15 — 50대 행동 변화' },
  { persona: 'strategy',   cid: '460', label: 'cust_id=460 — coupon-only 여정' },
  { persona: 'data-ai',    cid: '1',   label: 'cust_id=1 — 시계열 + 유종 전환' },
  { persona: 'data-ai',    cid: '12',  label: 'cust_id=12 — anomaly 탐지' },
  { persona: 'data-ai',    cid: '19',  label: 'cust_id=19 — 패턴 분류' },
  { persona: 'crm',        cid: '1',   label: 'cust_id=1 — 멤버십 등급 history' },
  { persona: 'crm',        cid: '5',   label: 'cust_id=5 — Black 등급 여정' },
  { persona: 'crm',        cid: '460', label: 'cust_id=460 — PLCC 보유 여정' },
  { persona: 'retail-ops', cid: '1',   label: 'cust_id=1 — 주유소 권역 여정' },
  { persona: 'retail-ops', cid: '12',  label: 'cust_id=12 — 시도 이동 패턴' },
  { persona: 'retail-ops', cid: '19',  label: 'cust_id=19 — 셀프 vs 풀서비스' },
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

export default function JourneyPage() {
  const { active, setActive } = useActivePersona();
  const [cid, setCid] = useState('1');
  const [out, setOut] = useState<JourneyOut | null>(null);
  const [phases, setPhases] = useState<PhaseChip[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setOut(null); setPhases([]); }, [active]);

  async function go(c?: string) {
    const cc = c ?? cid;
    if (!cc.trim()) return;
    setLoading(true); setOut(null); setPhases([]);
    const acc: JourneyOut = {};
    try {
      for await (const ev of streamSSE<{ name?: string; count?: number; len?: number; desc?: string;
                                          text?: string; channel?: string } & JourneyOut>(
        '/api/journey/stream',
        { cust_id: cc, persona_id: active },
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

  const profileEntries = Object.entries(
    (out?.profile?.['~properties'] as Record<string, unknown>) || out?.profile || {},
  ).slice(0, 14);
  const filtered = SAMPLES.filter((s) => s.persona === active);

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="M" title="고객 통합 여정"
        tech="App + FuelTransaction + Term + Coupon 타임라인 + 유종 전환 강조 (PDF 3 시그니처)" />
      <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink-50 mb-1.5">M. 고객 통합 여정</h1>
          <p className="text-sm text-ink-300 leading-relaxed">
            한 고객 (cust_id)의 4 source 시계열 (앱 이벤트 · 주유 거래 · 약관 동의 · 쿠폰 사용)을 단일 타임라인으로 통합해 보여줍니다.
            <span className="text-accent-300 font-semibold"> 유종 전환 시점</span>은 따로 강조 — PDF 3페이지 시그니처.
          </p>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">부서 페르소나</span>
          <PersonaSwitchGcc value={active} onChange={(v) => setActive(v as Persona)} />
        </div>
        <div className="flex gap-2 mb-4">
          <input className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-ink-100 outline-none focus:border-accent-500"
            placeholder="cust_id" value={cid} onChange={(e) => setCid(e.target.value)} />
          <button onClick={() => void go()} disabled={loading}
            className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 font-semibold px-5 py-2 rounded-md text-sm">
            <Compass className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
            {loading ? '조회 중...' : '여정 조회'}
          </button>
        </div>

        <PipelineChips phases={phases} loading={loading} />

        {!out && !loading && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
              {PERSONA_LABEL[active]} 부서 추천 — 클릭 즉시 조회
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {filtered.map((s, i) => (
                <button key={i} type="button" disabled={loading}
                  onClick={() => { setCid(s.cid); void go(s.cid); }}
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
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="rounded-lg border border-ink-700 bg-ink-800 p-3">
              <h2 className="text-sm font-semibold text-ink-100 mb-2">프로필 (cust_id={out.cust_id})</h2>
              {profileEntries.length === 0 && (
                <p className="text-xs text-ink-500 italic">Customer 미발견 (cust_id 확인)</p>
              )}
              <div className="space-y-1 text-xs">
                {profileEntries.map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="font-mono text-ink-500 shrink-0 w-28 text-[10px]">{k}</span>
                    <span className="text-ink-200 break-all">{String(v)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-ink-700/50 mt-3 pt-3">
                <h3 className="text-xs font-semibold text-ink-100 mb-1.5">
                  유종 전환 <span className="text-amber-300">({out.fuel_grade_transitions?.length ?? 0})</span>
                </h3>
                {(out.fuel_grade_transitions ?? []).map((t, i) => (
                  <div key={i} className="text-[11px] font-mono text-ink-300">
                    {t.ts}: {t.from} → <span className="text-amber-300 font-bold">{t.to}</span>
                  </div>
                ))}
                {(out.fuel_grade_transitions ?? []).length === 0 && (
                  <p className="text-[11px] text-ink-500 italic">유종 전환 이벤트 없음</p>
                )}
              </div>
            </div>
            <div className="xl:col-span-2 rounded-lg border border-ink-700 bg-ink-800 p-3 max-h-[640px] overflow-y-auto">
              <h2 className="text-sm font-semibold text-ink-100 mb-2">
                통합 타임라인 <span className="text-[10px] font-mono text-ink-400">{out.event_count ?? out.events?.length ?? 0} events</span>
              </h2>
              <JourneyTimeline events={out.events ?? []} transitions={out.fuel_grade_transitions ?? []} />
            </div>
          </div>
        )}

        {(out || loading) && (
          <InsightReport title="고객 통합 여정" scenarioCode="M"
            personaLabel={PERSONA_LABEL[active]}
            sources={['real:Customer', 'real:FuelTransaction', 'real:AppEvent', 'real:CouponUse', 'real:TermAgreement']}
            summary={out?.summary} loading={loading}
            filenameBase={`journey-${out?.cust_id ?? active}`} />
        )}

        <div className="mt-8 p-5 rounded-lg border border-ink-700 bg-ink-900/60">
          <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
            <span className="text-accent-400">⚙</span> 이 시나리오는 무엇을 하나요?
          </h3>
          <p className="text-xs text-ink-300 leading-relaxed">
            <strong className="text-ink-200">고객 통합 여정</strong>은 한 cust_id의 4가지 source 이벤트 (AppEvent · FuelTransaction · TermAgreement · CouponUse)를
            timestamp 기준 단일 타임라인으로 merge하고, 유종 (premium/regular/diesel) 전환 시점에 시각적 강조를 추가합니다.
            PDF 3페이지에 명시된 "PM+M 92 RON DIY" 같은 시그니처가 한 고객 단위로 가시화됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
