'use client';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { streamSSE } from '@/lib/api-client';
import ChartImage from '@/components/ChartImage';
import { MarkdownView } from '@/components/MarkdownView';
import PersonaSwitchGcc from '@/components/PersonaSwitchGcc';
import { ScenarioHeader } from '@/components/ScenarioHeader';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

type Sample = { label: string; persona: Persona };

const SAMPLES: Sample[] = [
  { persona: 'marketing',  label: '월별 유종 거래 트렌드 — 캠페인 타이밍 시각화' },
  { persona: 'marketing',  label: '고급휘발유 대비 일반휘발유 전환율 추이' },
  { persona: 'marketing',  label: 'VIP/Black 멤버 vs 일반 거래량 비교' },
  { persona: 'strategy',   label: '월별 유종 거래 트렌드 — 세그먼트 영향도' },
  { persona: 'strategy',   label: 'data_depth 코호트별 거래 패턴 차이' },
  { persona: 'strategy',   label: '디젤·premium 이중 사용 고객 비중 변화' },
  { persona: 'data-ai',    label: '월별 유종 거래 — 시계열 anomaly 탐지' },
  { persona: 'data-ai',    label: '소비지수와 주유 거래량 상관 분석' },
  { persona: 'data-ai',    label: '계절별 유종 비중의 KMeans 6 군집 결과' },
  { persona: 'crm',        label: '월별 거래 — 멤버십 등급 분포 변화' },
  { persona: 'crm',        label: 'PLCC 보유자 vs 미보유자 거래 트렌드' },
  { persona: 'crm',        label: '쿠폰 사용 → 주유 전환율 시계열' },
  { persona: 'retail-ops', label: '시도별 유종 거래량 (서울/경기/부산 비교)' },
  { persona: 'retail-ops', label: '셀프 주유소 vs 풀서비스 거래 비중' },
  { persona: 'retail-ops', label: '권역별 가격 대비 거래량 (탄력성)' },
];

const PERSONA_TONE: Record<Persona, string> = {
  marketing:    'border-blue-500/50    bg-blue-500/15    text-blue-200',
  strategy:     'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  'data-ai':    'border-amber-500/50   bg-amber-500/15   text-amber-200',
  crm:          'border-rose-500/50    bg-rose-500/15    text-rose-200',
  'retail-ops': 'border-violet-500/50  bg-violet-500/15  text-violet-200',
};

const PERSONA_LABEL: Record<Persona, string> = {
  marketing:    '마케팅',
  strategy:     '고객전략',
  'data-ai':    '데이터·AI',
  crm:          'CRM·회원사업',
  'retail-ops': '리테일영업',
};

type PhaseChip = { name: string; label: string; tone: string };

const PHASE_TONES: Record<string, string> = {
  aggregating:    'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  aggregated:     'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  rendering:      'border-cyan-500/50    bg-cyan-500/15    text-cyan-200',
  rendering_chart:'border-cyan-500/50    bg-cyan-500/15    text-cyan-200',
  chart_ready:    'border-orange-500/50  bg-orange-500/15  text-orange-200',
  summarizing:    'border-orange-500/50  bg-orange-500/15  text-orange-200',
};

function phaseMeta(name: string): PhaseChip {
  const map: Record<string, string> = {
    aggregating:    'Neptune 집계 중',
    aggregated:     'Neptune 집계 완료',
    rendering:      'Code Interpreter matplotlib',
    rendering_chart:'Code Interpreter matplotlib',
    chart_ready:    'Sonnet 4.6 요약',
    summarizing:    'Sonnet 4.6 요약',
  };
  return {
    name,
    label: map[name] ?? name,
    tone: PHASE_TONES[name] ?? 'border-slate-500/50 bg-slate-500/15 text-slate-200',
  };
}

type InsightResult = {
  chart_png_b64?: string;
  summary?: string;
  rows?: unknown[];
};

export default function InsightsPage() {
  const { active, setActive } = useActivePersona();
  const [chart, setChart] = useState<string | undefined>();
  const [summary, setSummary] = useState('');
  const [rowsCount, setRowsCount] = useState<number>(0);
  const [phases, setPhases] = useState<PhaseChip[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    setChart(undefined);
    setSummary('');
    setRowsCount(0);
    setPhases([]);
    setHasRun(false);
  }, [active]);

  async function go() {
    setLoading(true);
    setChart(undefined);
    setSummary('');
    setRowsCount(0);
    setPhases([]);
    setHasRun(true);
    try {
      for await (const ev of streamSSE<InsightResult & { name?: string; count?: number }>(
        '/api/insights/stream',
        { persona_id: active, topic: 'fuel_grade_trend' },
      )) {
        if (ev.type === 'phase') {
          const data = ev.data as { name?: string; count?: number };
          if (data.name) {
            setPhases((p) => [...p, phaseMeta(data.name!)]);
            if (data.name === 'aggregated' && typeof data.count === 'number') {
              setRowsCount(data.count);
            }
          }
        } else if (ev.type === 'result' && ev.data) {
          const d = ev.data as InsightResult;
          setChart(d.chart_png_b64);
          setSummary(d.summary || '');
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const filteredSamples = SAMPLES.filter((s) => s.persona === active);

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader
        scenario="C"
        title="인사이트 카드"
        tech="Neptune 집계 → AgentCore Code Interpreter (matplotlib + NanumGothic) → Bedrock Sonnet 4.6 요약"
      />

      <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink-50 mb-1.5">C. 인사이트 카드 (월별 유종 트렌드)</h1>
          <p className="text-sm text-ink-300 leading-relaxed">
            Neptune에서 월별·유종별 거래 데이터를 집계하고
            <span className="text-accent-300 font-semibold"> AgentCore Code Interpreter Firecracker microVM</span>
            안에서 matplotlib + NanumGothic 한글 폰트로 차트를 렌더한 다음,
            <span className="text-accent-300 font-semibold"> Bedrock Sonnet 4.6</span>이 부서 페르소나 어조로
            한국어 인사이트를 요약해 한 화면에 보여줍니다. 부서를 바꾸면 동일 데이터에 대해 다른 시점의
            요약이 생성됩니다.
          </p>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">
            부서 페르소나
          </span>
          <PersonaSwitchGcc value={active} onChange={(v) => setActive(v as Persona)} />
        </div>

        <div className="mb-4">
          <button
            onClick={() => void go()}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 font-semibold px-5 py-2 rounded-md text-sm transition"
          >
            <Sparkles className="w-4 h-4" />
            {loading ? '인사이트 생성 중...' : `${PERSONA_LABEL[active]} 시점 인사이트 생성`}
          </button>
        </div>

        {!hasRun && !loading && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
              {PERSONA_LABEL[active]} 부서 추천 인사이트 — 클릭하면 바로 분석됩니다
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {filteredSamples.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={loading}
                  onClick={() => { setActive(s.persona); void go(); }}
                  className="group flex items-start gap-2 text-left px-3 py-2.5 rounded-lg border border-ink-700 bg-ink-900 hover:border-accent-500/60 hover:bg-ink-800 transition disabled:opacity-50"
                >
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${PERSONA_TONE[s.persona]}`}>
                    {PERSONA_LABEL[s.persona]}
                  </span>
                  <span className="text-sm text-ink-200 leading-snug group-hover:text-accent-200">
                    {s.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {(loading || phases.length > 0) && (
          <div className="mb-5 p-4 rounded-lg border border-ink-700 bg-ink-900">
            <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2 flex items-center gap-2">
              <span className={`inline-block w-1.5 h-1.5 rounded-full bg-accent-500 ${loading ? 'animate-pulse' : ''}`} />
              인사이트 파이프라인 — {phases.length}단계 {loading ? '진행 중' : '완료'}
              {rowsCount > 0 && (
                <span className="ml-2 text-[10px] font-mono text-ink-400">집계 {rowsCount} rows</span>
              )}
            </div>
            <ol className="flex flex-wrap gap-2">
              {phases.map((p, i) => (
                <li key={i} className={`flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded border ${p.tone}`}>
                  <span className="text-[9px] opacity-60">{i + 1}.</span>
                  <span className="font-semibold">{p.label}</span>
                </li>
              ))}
              {loading && (
                <li className="text-[11px] font-mono px-2 py-1 rounded border border-ink-600/30 bg-ink-800/50 text-ink-400 animate-pulse">
                  다음 단계…
                </li>
              )}
            </ol>
          </div>
        )}

        {/* 차트 — 전체 너비, 크게 */}
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
            <span>월별 유종별 거래 추이 차트 (matplotlib + NanumGothic)</span>
            {rowsCount > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-800 border border-ink-700 text-ink-400">
                {rowsCount} rows
              </span>
            )}
          </h2>
          <div className="rounded-lg border border-ink-700 bg-ink-950 p-4 flex justify-center min-h-[480px]">
            {chart ? (
              <img src={`data:image/png;base64,${chart}`} alt="월별 유종 트렌드"
                className="max-w-full h-auto rounded-md bg-white p-2" style={{ maxHeight: '720px' }} />
            ) : loading ? (
              <div className="w-full h-[480px] rounded-md bg-ink-800 animate-pulse" />
            ) : (
              <div className="grid place-items-center w-full text-sm text-ink-500 italic">
                인사이트 생성 버튼을 눌러 차트를 생성하세요.
              </div>
            )}
          </div>
        </section>

        {/* Sonnet 4.6 상세 인사이트 — 전체 너비, 5 섹션 markdown */}
        {(summary || loading) && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
              <span>{PERSONA_LABEL[active]} 시점 상세 인사이트</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-800 border border-ink-700 text-ink-400">
                Sonnet 4.6
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
                real:FuelTransaction
              </span>
            </h2>
            <div className="rounded-lg border border-ink-700 bg-ink-800 p-6">
              {summary ? (
                <MarkdownView text={summary} />
              ) : (
                <div className="space-y-2">
                  <div className="h-3 bg-ink-700 rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-ink-700 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-ink-700 rounded animate-pulse w-1/2" />
                  <div className="h-3 bg-ink-700 rounded animate-pulse w-full" />
                  <div className="h-3 bg-ink-700 rounded animate-pulse w-5/6" />
                  <div className="text-xs text-ink-500 italic mt-3">
                    Sonnet 4.6이 5 섹션 (헤드라인 · 트렌드 · 비중 · 함의 · 권고) 상세 인사이트를 생성하는 중...
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        <div className="mt-8 p-5 rounded-lg border border-ink-700 bg-ink-900/60">
          <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
            <span className="text-accent-400">⚙</span> 이 시나리오는 무엇을 하나요?
          </h3>
          <p className="text-xs text-ink-300 leading-relaxed">
            <strong className="text-ink-200">인사이트 카드</strong>는 단일 데이터셋 (월별 유종 거래)에 대해
            (1) Neptune openCypher로 raw 집계, (2) AgentCore Code Interpreter Firecracker microVM 안에서
            matplotlib + NanumGothic 한글 폰트로 차트 PNG 렌더, (3) Bedrock Sonnet 4.6이 부서 페르소나
            시스템 프롬프트로 결과를 한국어로 요약하는 3단계 파이프라인입니다. 동일 데이터를 부서별로
            바꿔보면 마케팅 시점 (캠페인 ROI), 데이터·AI 시점 (anomaly·분포), 리테일영업 시점
            (권역별 매출 비중) 등 시점이 달라지는 것을 확인할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
