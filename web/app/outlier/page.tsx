'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ScenarioHeader } from '@/components/ScenarioHeader';
import PersonaSwitchGcc from '@/components/PersonaSwitchGcc';
import InsightReport from '@/components/InsightReport';
import PipelineChips, { phaseMeta, type PhaseChip } from '@/components/PipelineChips';
import { streamSSE } from '@/lib/api-client';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

const PERSONA_LABEL: Record<Persona, string> = {
  marketing: '마케팅', strategy: '고객전략', 'data-ai': '데이터·AI', crm: 'CRM·회원사업', 'retail-ops': '리테일영업',
};

const PATTERNS: { id: string; label: string }[] = [
  { id: 'pm_m_mixing',              label: 'PM+M 혼유 (92 RON DIY)' },
  { id: 'fuel_grade_transition',    label: '유종 전환 (디젤→고급)' },
  { id: 'app_signup_after_install', label: '앱 설치 후 가입' },
];

type DetectOut = {
  pattern?: string; count?: number; matches?: Record<string, unknown>[];
  cohort_size?: number; matches_count?: number; coverage?: string; note?: string;
  summary?: string;
};

export default function OutlierPage() {
  const { active, setActive } = useActivePersona();
  const [pattern, setPattern] = useState('pm_m_mixing');
  const [out, setOut] = useState<DetectOut | null>(null);
  const [phases, setPhases] = useState<PhaseChip[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setOut(null); setPhases([]); }, [active]);

  async function go(p?: string) {
    const pp = p ?? pattern;
    setLoading(true); setOut(null); setPhases([]);
    const acc: DetectOut = {};
    try {
      for await (const ev of streamSSE<{ name?: string; count?: number; len?: number; desc?: string;
                                          text?: string; channel?: string } & DetectOut>(
        '/api/outlier/detect-stream',
        { pattern: pp, persona_id: active },
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

  const matchCount = out?.count ?? out?.matches?.length ?? out?.matches_count ?? 0;

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="K" title="이상 행동 탐지"
        tech="PM+M 92 RON DIY blending + 디젤→premium 유종 전환 + 앱 가입 후 패턴 (PDF 3페이지 시그니처)" />
      <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink-50 mb-1.5">K. 이상 행동 탐지 (Outlier)</h1>
          <p className="text-sm text-ink-300 leading-relaxed">
            PDF 3페이지 시그니처에 명시된 3 패턴 — (1) <span className="text-accent-300">PM+M 92 RON DIY</span>:
            premium·regular 양방향 사용 고객 (DIY 옥탄가 조정), (2) 디젤→premium 전환,
            (3) 앱 설치 후 가입. cohort 전체에 대해 100% coverage로 검사.
          </p>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">부서 페르소나</span>
          <PersonaSwitchGcc value={active} onChange={(v) => setActive(v as Persona)} />
        </div>
        <div className="flex flex-wrap gap-2 items-center mb-4">
          {PATTERNS.map((p) => (
            <button key={p.id} onClick={() => setPattern(p.id)}
              className={[
                'text-xs px-3 py-1.5 rounded-md border font-medium transition',
                pattern === p.id
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                  : 'border-ink-700 bg-ink-800 text-ink-300 hover:border-amber-500/40',
              ].join(' ')}>
              {p.label}
            </button>
          ))}
          <button onClick={() => void go()} disabled={loading}
            className="ml-auto inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 font-semibold px-5 py-2 rounded-md text-sm">
            <AlertTriangle className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
            {loading ? '탐지 중...' : '탐지 실행'}
          </button>
        </div>

        <PipelineChips phases={phases} loading={loading} />

        {out && (
          <div className="rounded-lg border border-ink-700 bg-ink-800 p-4">
            <div className="flex flex-wrap gap-3 mb-3">
              <div>
                <div className="text-xs text-ink-400">매치 수</div>
                <div className="text-2xl font-bold text-amber-300">{matchCount.toLocaleString()}</div>
              </div>
              {out.cohort_size !== undefined && (
                <div>
                  <div className="text-xs text-ink-400">cohort size</div>
                  <div className="text-lg font-semibold text-ink-100">{out.cohort_size}</div>
                </div>
              )}
              {out.coverage && (
                <div>
                  <div className="text-xs text-ink-400">coverage</div>
                  <div className="text-sm font-mono text-emerald-300 mt-1">{out.coverage}</div>
                </div>
              )}
            </div>
            {out.note && <p className="text-xs text-ink-400 italic mb-3">{out.note}</p>}
            {(out.matches ?? []).length > 0 && (
              <div className="overflow-x-auto rounded border border-ink-700">
                <table className="w-full text-xs">
                  <thead className="bg-ink-900 text-ink-300">
                    <tr>
                      {Object.keys((out.matches ?? [{}])[0] ?? {}).map((k) => (
                        <th key={k} className="text-left px-3 py-1.5 font-mono">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(out.matches ?? []).slice(0, 50).map((m, i) => (
                      <tr key={i} className="border-t border-ink-700/50 text-ink-200">
                        {Object.entries(m).map(([k, v]) => (
                          <td key={k} className="px-3 py-1 font-mono">{String(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {(out || loading) && (
          <InsightReport title="이상 행동 탐지" scenarioCode="K"
            personaLabel={PERSONA_LABEL[active]}
            sources={['real:Customer', 'real:FuelTransaction']}
            summary={out?.summary} loading={loading}
            filenameBase={`outlier-${pattern}-${active}`} />
        )}

        <div className="mt-8 p-5 rounded-lg border border-ink-700 bg-ink-900/60">
          <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
            <span className="text-accent-400">⚙</span> 이 시나리오는 무엇을 하나요?
          </h3>
          <p className="text-xs text-ink-300 leading-relaxed">
            <strong className="text-ink-200">이상 행동 탐지</strong>는 GCC 희망 시나리오 PDF 3페이지에 명시된 시그니처 패턴을
            FuelTransaction 시계열에서 탐지합니다. PM+M 혼유는 premium과 regular를 동일 고객이 양방향으로 구매한 경우 (옥탄가 92로 자가 조정 추정),
            디젤→premium 전환은 5턴 시계열에서 grade가 diesel에서 premium/regular로 갈아탄 경우. 발견되면 행동 변화 캠페인 후보.
          </p>
        </div>
      </div>
    </div>
  );
}
