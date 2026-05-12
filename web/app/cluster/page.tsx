'use client';
import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { streamSSE } from '@/lib/api-client';
import ChartImage from '@/components/ChartImage';
import { ScenarioHeader } from '@/components/ScenarioHeader';
import PersonaSwitchGcc from '@/components/PersonaSwitchGcc';
import InsightReport from '@/components/InsightReport';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

type ResultData = {
  chart_png_b64?: string; labels?: string[]; summary?: string;
  centroids?: number[][]; assignments?: { cust_id: string; cluster: number }[];
};
const PERSONA_LABEL: Record<Persona, string> = {
  marketing: '마케팅', strategy: '고객전략', 'data-ai': '데이터·AI', crm: 'CRM·회원사업', 'retail-ops': '리테일영업',
};
type PhaseChip = { name: string; label: string; tone: string };

const PHASE_TONES: Record<string, string> = {
  fetching_features: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  loading_features:  'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  clustering:        'border-cyan-500/50    bg-cyan-500/15    text-cyan-200',
  kmeans_running:    'border-cyan-500/50    bg-cyan-500/15    text-cyan-200',
  labeling:          'border-blue-500/50    bg-blue-500/15    text-blue-200',
  llm_labeling:      'border-blue-500/50    bg-blue-500/15    text-blue-200',
  summary_streaming: 'border-orange-500/50  bg-orange-500/15  text-orange-200',
  summary_done:      'border-orange-500/50  bg-orange-500/15  text-orange-200',
  rendering_chart:   'border-amber-500/50   bg-amber-500/15   text-amber-200',
  write_back:        'border-rose-500/50    bg-rose-500/15    text-rose-200',
};

function phaseMeta(name: string): PhaseChip {
  const map: Record<string, string> = {
    fetching_features: 'Customer feature 로드',
    loading_features:  'Customer feature 로드',
    clustering:        'sklearn KMeans 6 실행',
    kmeans_running:    'sklearn KMeans 6 실행',
    labeling:          'Sonnet 4.6 라벨링',
    llm_labeling:      'Sonnet 4.6 라벨링',
    summary_streaming: 'Sonnet 4.6 5섹션 인사이트',
    summary_done:      '5섹션 인사이트 완성',
    rendering_chart:   'matplotlib 차트',
    write_back:        'Neptune Cluster write-back',
  };
  return {
    name, label: map[name] ?? name,
    tone: PHASE_TONES[name] ?? 'border-slate-500/50 bg-slate-500/15 text-slate-200',
  };
}

export default function ClusterPage() {
  const { active, setActive } = useActivePersona();
  const [chart, setChart] = useState<string | undefined>();
  const [labels, setLabels] = useState<string[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [phases, setPhases] = useState<PhaseChip[]>([]);
  const [wb, setWb] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    setChart(undefined); setLabels([]); setSummary(''); setPhases([]); setHasRun(false);
  }, [active]);

  async function go() {
    setLoading(true); setHasRun(true);
    setChart(undefined); setLabels([]); setSummary(''); setPhases([]);
    try {
      for await (const ev of streamSSE<ResultData & { name?: string; text?: string; channel?: string }>(
        '/api/cluster/stream',
        { persona_id: active, write_back: wb },
      )) {
        const d = ev.data as { name?: string; text?: string; channel?: string } & ResultData;
        if (ev.type === 'phase' && d.name) {
          setPhases((p) => [...p, phaseMeta(d.name!)]);
        } else if (ev.type === 'delta' && typeof d.text === 'string') {
          setSummary((s) => s + d.text);
        } else if (ev.type === 'result') {
          if (d.chart_png_b64 !== undefined) setChart(d.chart_png_b64);
          if (Array.isArray(d.labels)) setLabels(d.labels);
          if (typeof d.summary === 'string') setSummary(d.summary);
        }
      }
    } finally { setLoading(false); }
  }

  const CLUSTER_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#22d3ee'];

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="E" title="고객 클러스터링"
        tech="sklearn KMeans 6 → Sonnet 4.6 라벨링 → matplotlib 차트 → Neptune Cluster 노드 write-back" />
      <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink-50 mb-1.5">E. 고객 클러스터링 (K-Means 6 + LLM 라벨링)</h1>
          <p className="text-sm text-ink-300 leading-relaxed">
            Customer 노드의 KPI 속성 (RFM·유종 비중·앱 활성도)을 입력으로 sklearn KMeans 6 군집화하고,
            <span className="text-accent-300 font-semibold"> Bedrock Sonnet 4.6</span>이 각 군집의 centroid 특성을 한국어 라벨로 명명합니다.
            "Cluster 노드 write-back" 체크 시 결과를 Neptune에 저장.
          </p>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">부서 페르소나</span>
          <PersonaSwitchGcc value={active} onChange={(v) => setActive(v as Persona)} />
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-4">
          <label className="flex items-center gap-2 text-sm text-ink-200">
            <input type="checkbox" checked={wb} onChange={(e) => setWb(e.target.checked)}
              className="accent-accent-500" />
            Cluster 노드에 결과 write-back
          </label>
          <button onClick={() => void go()} disabled={loading}
            className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 font-semibold px-5 py-2 rounded-md text-sm">
            <Layers className="w-4 h-4" /> {loading ? '클러스터링 중...' : '클러스터 생성'}
          </button>
        </div>

        {(loading || phases.length > 0) && (
          <div className="mb-5 p-4 rounded-lg border border-ink-700 bg-ink-900">
            <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2 flex items-center gap-2">
              <span className={`inline-block w-1.5 h-1.5 rounded-full bg-accent-500 ${loading ? 'animate-pulse' : ''}`} />
              클러스터링 파이프라인 — {phases.length}단계 {loading ? '진행 중' : '완료'}
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

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div>
            <h2 className="text-sm font-semibold text-ink-100 mb-2">군집 산점도 (PCA 2D)</h2>
            <ChartImage base64Png={chart} loading={loading} />
          </div>
          <div className="rounded-lg border border-ink-700 bg-ink-800 p-4">
            <h2 className="text-sm font-semibold text-ink-100 mb-3">6 클러스터 라벨 (Sonnet 4.6)</h2>
            {labels.length === 0 && (
              <p className="text-sm text-ink-500 italic">
                {loading ? '라벨 생성 중...' : '"클러스터 생성" 버튼을 눌러 시작'}
              </p>
            )}
            <ul className="space-y-2">
              {labels.map((l, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink-200">
                  <span className="text-[10px] font-mono px-1.5 py-1 rounded shrink-0"
                    style={{ backgroundColor: `${CLUSTER_COLORS[i]}25`, border: `1px solid ${CLUSTER_COLORS[i]}55`, color: CLUSTER_COLORS[i] }}>
                    cl-{i + 1}
                  </span>
                  <span className="font-semibold">{l}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {hasRun && (
          <InsightReport title="고객 클러스터링" scenarioCode="E"
            personaLabel={PERSONA_LABEL[active]}
            sources={['real:Customer', 'real:FuelTransaction', 'sklearn:KMeans']}
            summary={summary} loading={loading}
            filenameBase={`cluster-${active}`} />
        )}

        <div className="mt-8 p-5 rounded-lg border border-ink-700 bg-ink-900/60">
          <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
            <span className="text-accent-400">⚙</span> 이 시나리오는 무엇을 하나요?
          </h3>
          <p className="text-xs text-ink-300 leading-relaxed">
            <strong className="text-ink-200">고객 클러스터링</strong>은 Customer 노드의 feature 벡터 (R: 최근 거래, F: 빈도, M: 금액,
            premium 비중, 앱 활성도 등)에 대해 sklearn KMeans 6 군집을 만들고, Sonnet 4.6에 centroid의 특성을 보내 한국어 라벨링합니다.
            "충성 헤비유저", "가격민감 가족", "도시 가벼운 사용자", "디젤 비즈니스" 같은 라벨이 자동 생성됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
