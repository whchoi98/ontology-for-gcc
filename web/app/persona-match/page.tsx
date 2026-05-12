'use client';
import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { ScenarioHeader } from '@/components/ScenarioHeader';
import PersonaSwitchGcc from '@/components/PersonaSwitchGcc';
import InsightReport from '@/components/InsightReport';
import PipelineChips, { phaseMeta, type PhaseChip } from '@/components/PipelineChips';
import { streamSSE } from '@/lib/api-client';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

type Match = { cust_id: string; best_persona: string; all_scores: Record<string, number> };
type Sample = { label: string; csv: string; persona: Persona };

const SAMPLES: Sample[] = [
  { persona: 'marketing',  csv: '1,2,3,4,5',                        label: 'deep-history 5명 매칭' },
  { persona: 'marketing',  csv: '1,5,12,15,19',                     label: '20대 vs 50대 페르소나 차이' },
  { persona: 'marketing',  csv: '1,2,3,4,5,460,401,288,471,342',    label: '코호트 혼합 10명' },
  { persona: 'strategy',   csv: '460,401,288,471,342',              label: 'coupon-only 5명 매칭' },
  { persona: 'strategy',   csv: '1,2,3',                            label: 'VIP 후보 매칭 점수 분포' },
  { persona: 'strategy',   csv: '12,15,19',                         label: '20대 충성 분석' },
  { persona: 'data-ai',    csv: '1,2,3,4,5,6,7,8,9,10',             label: 'KPI 가중치 × Customer 10명' },
  { persona: 'data-ai',    csv: '460,401,288,471,342',              label: '점수 분포 anomaly 탐지' },
  { persona: 'data-ai',    csv: '1,12,15',                          label: 'best_persona 분포' },
  { persona: 'crm',        csv: '1,2,3,4,5',                        label: 'Black 등급 페르소나 매칭' },
  { persona: 'crm',        csv: '460,401,288',                      label: 'PLCC 보유자 매칭' },
  { persona: 'crm',        csv: '12,15,19',                         label: '멤버십 등급별 페르소나' },
  { persona: 'retail-ops', csv: '1,2,3',                            label: '서울/경기 거주 매칭' },
  { persona: 'retail-ops', csv: '460,401,288,471,342',              label: '시도 권역 페르소나 분포' },
  { persona: 'retail-ops', csv: '1,2,3,4,5',                        label: '주유소 권역 5명' },
];

const PERSONA_TONE: Record<Persona, string> = {
  marketing:    'border-blue-500/50    bg-blue-500/15    text-blue-200',
  strategy:     'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  'data-ai':    'border-amber-500/50   bg-amber-500/15   text-amber-200',
  crm:          'border-rose-500/50    bg-rose-500/15    text-rose-200',
  'retail-ops': 'border-violet-500/50  bg-violet-500/15  text-violet-200',
};
const PERSONA_LABEL: Record<Persona, string> = {
  marketing: '마케팅', strategy: '고객전략', 'data-ai': '데이터·AI', crm: 'CRM·회원사업', 'retail-ops': '리테일영업',
};

export default function PersonaMatchPage() {
  const { active, setActive } = useActivePersona();
  const [csv, setCsv] = useState('1,2,3,4,5,460,401,288,471,342');
  const [matches, setMatches] = useState<Match[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [phases, setPhases] = useState<PhaseChip[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    setMatches([]); setSummary(''); setPhases([]); setHasRun(false);
  }, [active]);

  async function go(idsCsv?: string) {
    const ids = (idsCsv ?? csv).split(',').map((s) => s.trim()).filter(Boolean);
    setLoading(true); setMatches([]); setSummary(''); setPhases([]); setHasRun(true);
    try {
      for await (const ev of streamSSE<{
        name?: string; count?: number; len?: number; desc?: string;
        text?: string; channel?: string;
        matches?: Match[]; summary?: string;
      }>('/api/persona-match/stream', { cust_ids: ids, persona_id: active })) {
        const d = ev.data ?? {};
        if (ev.type === 'phase' && d.name) {
          setPhases((p) => [...p, phaseMeta(d.name!, d)]);
        } else if (ev.type === 'delta' && typeof d.text === 'string') {
          setSummary((s) => s + d.text);
        } else if (ev.type === 'result') {
          if (Array.isArray(d.matches)) setMatches(d.matches as Match[]);
          if (typeof d.summary === 'string') setSummary(d.summary);
        }
      }
    } finally { setLoading(false); }
  }

  const scoreKeys = matches[0]?.all_scores ? Object.keys(matches[0].all_scores) : [];
  const filtered = SAMPLES.filter((s) => s.persona === active);

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="D" title="페르소나 매칭"
        tech="Customer KPI × 5 부서 가중치 → 매칭 점수 + 차별화 포인트" />
      <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink-50 mb-1.5">D. 페르소나 매칭</h1>
          <p className="text-sm text-ink-300 leading-relaxed">
            고객 cust_id 리스트와 5 부서 페르소나의 KPI 가중치 (마케팅: ROAS · CRM: PLCC · 리테일: 매출 등)를
            곱해 부서별 매칭 점수를 산출합니다. <span className="text-accent-300 font-semibold">best_persona</span>는
            가장 높은 점수를 받은 부서이며, 차별화가 큰 고객일수록 점수 분산이 큽니다.
          </p>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">부서 페르소나</span>
          <PersonaSwitchGcc value={active} onChange={(v) => setActive(v as Persona)} />
        </div>
        <textarea className="w-full bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-ink-100 mb-2 focus:border-accent-500 outline-none"
          rows={2} value={csv} onChange={(e) => setCsv(e.target.value)}
          placeholder="cust_id를 쉼표로 구분 (예: 1,2,3,4,5)" />
        <button onClick={() => void go()} disabled={loading}
          className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 font-semibold px-5 py-2 rounded-md text-sm transition mb-4">
          <Users className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
          {loading ? '매칭 중...' : '매칭 실행'}
        </button>

        {/* SSE 데이터 파이프라인 진행 표시 */}
        <PipelineChips phases={phases} loading={loading} />

        {!hasRun && !loading && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
              {PERSONA_LABEL[active]} 부서 추천 — 클릭 즉시 매칭
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {filtered.map((s, i) => (
                <button key={i} type="button" disabled={loading}
                  onClick={() => { setCsv(s.csv); void go(s.csv); }}
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

        {matches.length > 0 && (
          <>
            {/* cust_id 설명 카드 */}
            <div className="mb-4 p-3 rounded-lg border border-ink-700 bg-ink-900/60 text-xs text-ink-300 leading-relaxed">
              <div className="font-semibold text-ink-100 mb-1.5">📌 cust_id 안내 (비식별 고객번호)</div>
              <ul className="space-y-0.5 ml-3 list-disc">
                <li><span className="font-mono text-blue-300">1 ~ 19</span> — <strong>deep-history</strong> 코호트 (실 데이터 33명 중 일부, 거래·앱·약관·쿠폰·설문 모두 보유)</li>
                <li><span className="font-mono text-amber-300">20 ~ 503</span> — <strong>coupon-only</strong> 코호트 (484명, 쿠폰 발급/사용 데이터 위주)</li>
                <li><span className="font-mono text-emerald-300">la-XXXXXX</span> — <strong>합성 룩어라이크</strong> 50K (deep-history 시드 임베딩 KNN 확장, 캠페인 타겟팅용)</li>
              </ul>
              <div className="mt-1.5 text-ink-400">PoC 비식별 데이터로 실명 없음. 식별이 필요한 경우 "고객-N (47세 여, 경남, Gold)" 형식으로 속성 라벨링 사용 (룩어라이크 페이지 참고).</div>
            </div>

            {/* 점수 의미 안내 */}
            <div className="mb-4 p-3 rounded-lg border border-ink-700 bg-ink-900/60 text-xs text-ink-300 leading-relaxed">
              <div className="font-semibold text-ink-100 mb-1.5">📊 매칭 점수 (0 ~ 1) 의미</div>
              <p className="text-ink-300">
                각 부서의 KPI 가중치 × Customer 속성을 곱한 합. 가까울수록 그 부서 시점에서 의미가 큰 고객.
                <strong className="text-accent-300 mx-1">best_persona</strong>는 max 점수 부서. 우측 막대는 0~1 시각화이며,
                <strong className="text-amber-300 mx-1">margin</strong>은 best와 second-best의 격차 (큰 값일수록 부서 시점이 명확히 다름).
              </p>
            </div>

            {/* 결과 카드 (테이블 대신 row 카드) */}
            <div className="space-y-2">
              {matches.map((m, i) => {
                const sorted = Object.entries(m.all_scores).sort((a, b) => b[1] - a[1]);
                const top = sorted[0];
                const second = sorted[1];
                const margin = top && second ? Math.max(0, top[1] - second[1]) : 0;
                const maxScore = top ? top[1] : 0;
                return (
                  <div key={i} className="rounded-lg border border-ink-700 bg-ink-800 p-3">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-ink-500">cust_id</span>
                        <span className="font-mono text-sm font-bold text-ink-100">{m.cust_id}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-ink-500">best</span>
                        <span className={`text-[11px] font-mono px-2 py-0.5 rounded border font-semibold ${PERSONA_TONE[m.best_persona as Persona] ?? 'border-ink-700 bg-ink-900 text-ink-300'}`}>
                          {PERSONA_LABEL[m.best_persona as Persona] ?? m.best_persona} · {top?.[1].toFixed(3)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-ink-500">margin</span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${margin >= 0.15 ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-ink-700 bg-ink-900 text-ink-400'}`}>
                          {margin.toFixed(3)} {margin >= 0.15 ? '뚜렷' : '근소'}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5">
                      {scoreKeys.map((k) => {
                        const s = m.all_scores[k] ?? 0;
                        const ratio = maxScore > 0 ? s / maxScore : 0;
                        const isBest = k === m.best_persona;
                        const tone = PERSONA_TONE[k as Persona] ?? 'border-ink-700 bg-ink-900 text-ink-300';
                        return (
                          <div key={k} className={`rounded border p-1.5 ${isBest ? tone : 'border-ink-700 bg-ink-900'}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-mono text-ink-300 truncate">{PERSONA_LABEL[k as Persona] ?? k}</span>
                              <span className="text-[10px] font-mono font-bold text-ink-100">{s.toFixed(3)}</span>
                            </div>
                            <div className="h-1 rounded bg-ink-700 overflow-hidden">
                              <div
                                className={`h-full ${isBest ? 'bg-accent-400' : 'bg-ink-500'}`}
                                style={{ width: `${ratio * 100}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {hasRun && matches.length === 0 && !loading && (
          <p className="text-sm text-ink-500 italic px-3 py-4 text-center border border-dashed border-ink-700 rounded-lg">
            매칭 결과 없음. cust_id를 확인하거나 다른 코호트로 시도하세요.
          </p>
        )}

        {hasRun && (
          <InsightReport title="페르소나 매칭" scenarioCode="D"
            personaLabel={PERSONA_LABEL[active]}
            sources={['real:Customer', 'real:FuelTransaction']}
            summary={summary} loading={loading}
            filenameBase={`persona-match-${active}`} />
        )}

        <div className="mt-8 p-5 rounded-lg border border-ink-700 bg-ink-900/60">
          <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
            <span className="text-accent-400">⚙</span> 이 시나리오는 무엇을 하나요?
          </h3>
          <p className="text-xs text-ink-300 leading-relaxed">
            <strong className="text-ink-200">페르소나 매칭</strong>은 각 부서의 KPI 우선순위 (마케팅 conversion·roas, 고객전략 retention·clv,
            데이터·AI cluster_quality, CRM member_active·plcc, 리테일 station_volume·self_rate)를 가중치 벡터로 보고,
            고객 속성 점수와 내적해 부서별 매칭 점수를 만듭니다. best_persona는 그 고객을 가장 잘 설명하는 부서입니다.
          </p>
        </div>
      </div>
    </div>
  );
}
