'use client';
import { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { ScenarioHeader } from '@/components/ScenarioHeader';
import { MarkdownView } from '@/components/MarkdownView';
import PersonaSwitchGcc from '@/components/PersonaSwitchGcc';
import InsightReport from '@/components/InsightReport';
import { streamSSE } from '@/lib/api-client';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

type Sample = { label: string; cid: string; persona: Persona };

const SAMPLES: Sample[] = [
  { persona: 'marketing',  cid: '1',  label: 'cust_id=1 — 마케팅 시점 narrative' },
  { persona: 'marketing',  cid: '5',  label: 'cust_id=5 — 캠페인 타이밍 분석' },
  { persona: 'marketing',  cid: '12', label: 'cust_id=12 — 20대 행동 패턴' },
  { persona: 'strategy',   cid: '1',  label: 'cust_id=1 — 세그먼트 영향도' },
  { persona: 'strategy',   cid: '15', label: 'cust_id=15 — 50대 충성 분석' },
  { persona: 'strategy',   cid: '460', label: 'cust_id=460 — coupon-only 행동' },
  { persona: 'data-ai',    cid: '1',  label: 'cust_id=1 — 4-source cross-correlation' },
  { persona: 'data-ai',    cid: '12', label: 'cust_id=12 — anomaly 탐지' },
  { persona: 'data-ai',    cid: '',   label: 'cohort 평균 — 4 source 분포' },
  { persona: 'crm',        cid: '1',  label: 'cust_id=1 — 멤버 행동 narrative' },
  { persona: 'crm',        cid: '5',  label: 'cust_id=5 — Black 등급' },
  { persona: 'crm',        cid: '460', label: 'cust_id=460 — PLCC 보유자' },
  { persona: 'retail-ops', cid: '1',  label: 'cust_id=1 — 거주지 권역 영향' },
  { persona: 'retail-ops', cid: '12', label: 'cust_id=12 — 권역 + 날씨' },
  { persona: 'retail-ops', cid: '',   label: '권역별 cohort 평균' },
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

// ── SSE phase chips (mirrors insights pattern) ────────────────────────
type PhaseChip = { name: string; label: string; tone: string };

const PHASE_TONES: Record<string, string> = {
  querying_neptune:    'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  neptune_done:        'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  narrative_streaming: 'border-cyan-500/50    bg-cyan-500/15    text-cyan-200',
  narrative_done:      'border-cyan-500/50    bg-cyan-500/15    text-cyan-200',
  summary_streaming:   'border-orange-500/50  bg-orange-500/15  text-orange-200',
  summary_done:        'border-orange-500/50  bg-orange-500/15  text-orange-200',
};

function phaseMeta(name: string, count?: number, len?: number): PhaseChip {
  const map: Record<string, string> = {
    querying_neptune:    'Neptune 4-source 집계 중',
    neptune_done:        `Neptune 집계 완료 (${count ?? 0} rows)`,
    narrative_streaming: 'Sonnet 4.6 narrative 생성 중',
    narrative_done:      `narrative 완성 (${len ?? 0}자)`,
    summary_streaming:   'Sonnet 4.6 5섹션 인사이트 생성 중',
    summary_done:        `5섹션 인사이트 완성 (${len ?? 0}자)`,
  };
  return {
    name,
    label: map[name] ?? name,
    tone: PHASE_TONES[name] ?? 'border-slate-500/50 bg-slate-500/15 text-slate-200',
  };
}

type FuseResult = {
  fused_rows?: unknown[];
  narrative?: string;
  summary?: string;
};

export default function ExternalSignalPage() {
  const { active, setActive } = useActivePersona();
  const [cid, setCid] = useState('1');
  const [phases, setPhases] = useState<PhaseChip[]>([]);
  const [narrative, setNarrative] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [fusedRows, setFusedRows] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    setPhases([]); setNarrative(''); setSummary(''); setFusedRows([]); setHasRun(false);
  }, [active]);

  async function go(c?: string) {
    const cc = c ?? cid;
    setLoading(true); setHasRun(true);
    setPhases([]); setNarrative(''); setSummary(''); setFusedRows([]);

    try {
      for await (const ev of streamSSE<{
        name?: string; count?: number; len?: number;
        text?: string; channel?: string;
        fused_rows?: unknown[]; narrative?: string; summary?: string;
      }>('/api/external-signal/fuse-stream', { persona_id: active, cust_id: cc || null })) {
        const d = ev.data ?? {};
        if (ev.type === 'phase' && d.name) {
          setPhases((p) => [...p, phaseMeta(d.name!, d.count, d.len)]);
        } else if (ev.type === 'delta' && typeof d.text === 'string') {
          if (d.channel === 'summary') {
            setSummary((s) => s + d.text);
          } else {
            setNarrative((n) => n + (d.text || ''));
          }
        } else if (ev.type === 'result') {
          if (Array.isArray(d.fused_rows)) setFusedRows(d.fused_rows);
          if (typeof d.narrative === 'string') setNarrative(d.narrative);
          if (typeof d.summary === 'string') setSummary(d.summary);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const filtered = SAMPLES.filter((s) => s.persona === active);
  const showOutput = hasRun || loading;

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="J" title="외부 시그널 융합"
        tech="현대카드 ConsumptionIndex + AppEvent + SurveyResponse + KMA WeatherObservation → cross-source narrative + 5섹션 인사이트 (SSE)" />
      <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink-50 mb-1.5">J. 외부 시그널 융합</h1>
          <p className="text-sm text-ink-300 leading-relaxed">
            4 source (현대카드 소비지수 · 앱 행동 로그 · 운전중 불편 설문 · KMA 기상)를
            <span className="text-accent-300 font-semibold"> Bedrock Sonnet 4.6</span>이 cross-source narrative로 묶고,
            연이어 5섹션 markdown 인사이트를 생성합니다. 각 단계는 SSE phase 칩으로 실시간 노출됩니다.
          </p>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">부서 페르소나</span>
          <PersonaSwitchGcc value={active} onChange={(v) => setActive(v as Persona)} />
        </div>
        <div className="flex gap-2 mb-4">
          <input className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-ink-100 outline-none focus:border-accent-500"
            placeholder="cust_id (없으면 cohort 평균)" value={cid} onChange={(e) => setCid(e.target.value)} />
          <button onClick={() => void go()} disabled={loading}
            className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 font-semibold px-5 py-2 rounded-md text-sm">
            <Radio className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
            {loading ? '융합 중...' : '융합 분석'}
          </button>
        </div>

        {!showOutput && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
              {PERSONA_LABEL[active]} 부서 추천 — 클릭 즉시 융합
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

        {/* ── SSE phase chips (live pipeline) ───────────── */}
        {showOutput && phases.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {phases.map((p, i) => (
              <span key={i}
                className={`text-[11px] font-mono px-2 py-1 rounded-md border ${p.tone}`}>
                {p.label}
              </span>
            ))}
            {loading && (
              <span className="text-[11px] font-mono px-2 py-1 rounded-md border border-ink-700 bg-ink-800 text-ink-400 animate-pulse">
                ...
              </span>
            )}
          </div>
        )}

        {/* ── 융합 데이터 + narrative (좌우 분할) ────── */}
        {showOutput && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            <div className="rounded-lg border border-ink-700 bg-ink-800 p-4">
              <h2 className="text-sm font-semibold text-ink-100 mb-2">
                융합 데이터 (4 source) <span className="text-[10px] font-mono text-ink-400">{fusedRows.length} rows</span>
              </h2>
              <pre className="text-[11px] text-ink-300 overflow-auto max-h-80 font-mono whitespace-pre-wrap">
                {fusedRows.length > 0
                  ? JSON.stringify(fusedRows, null, 2)
                  : (loading ? 'Neptune 집계 대기...' : '데이터 없음')}
              </pre>
            </div>
            <div className="rounded-lg border border-ink-700 bg-ink-800 p-4">
              <h2 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
                <span>{PERSONA_LABEL[active]} 시점 narrative</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-900 border border-ink-700 text-ink-400">Sonnet 4.6</span>
                {narrative && (
                  <span className="text-[10px] font-mono text-ink-500 ml-auto">{narrative.length}자</span>
                )}
              </h2>
              {narrative
                ? <MarkdownView text={narrative} />
                : <p className="text-sm text-ink-500 italic">{loading ? '생성 중...' : 'narrative 없음'}</p>}
            </div>
          </div>
        )}

        {/* ── 5섹션 인사이트 + MD/PDF ─────────────── */}
        {showOutput && (
          <InsightReport title="외부 시그널 융합" scenarioCode="J"
            personaLabel={PERSONA_LABEL[active]}
            sources={['external:현대카드ConsumptionIndex', 'external:KMA',
                      'real:AppEvent', 'real:SurveyResponse', 'real:Customer']}
            summary={summary} loading={loading}
            filenameBase={`external-signal-${cid || 'cohort'}-${active}`} />
        )}

        <div className="mt-8 p-5 rounded-lg border border-ink-700 bg-ink-900/60">
          <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
            <span className="text-accent-400">⚙</span> 이 시나리오는 무엇을 하나요?
          </h3>
          <p className="text-xs text-ink-300 leading-relaxed">
            <strong className="text-ink-200">외부 시그널 융합</strong>은 GCC 내부 데이터 (Customer/Transaction)와 외부 source
            (현대카드 자동차 소비지수 · KMA 기상 관측 · 에어브릿지 앱 이벤트 · 운전중 설문)를 한 고객 단위로 join한 다음,
            Sonnet 4.6이 부서 어조로 종합 narrative + 5섹션 인사이트를 SSE로 생성합니다.
            "이 고객은 평일 출근시간대 휘발유 충성도가 높고 강수일에 셀프 주유를 선호함" 같은 cross-source 인사이트.
          </p>
        </div>
      </div>
    </div>
  );
}
