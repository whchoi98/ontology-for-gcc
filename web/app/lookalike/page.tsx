'use client';
import { useEffect, useState } from 'react';
import { GitMerge } from 'lucide-react';
import { ScenarioHeader } from '@/components/ScenarioHeader';
import PersonaSwitchGcc from '@/components/PersonaSwitchGcc';
import InsightReport from '@/components/InsightReport';
import PipelineChips, { phaseMeta, type PhaseChip } from '@/components/PipelineChips';
import { streamSSE } from '@/lib/api-client';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

type Profile = {
  cust_id?: string; age?: number; gender?: string; sido?: string;
  grade?: string; vip?: string; occupation?: string; depth?: string;
};
type LookalikeOut = {
  count?: number; expanded?: string[]; error?: string;
  expanded_profiles?: Profile[]; summary?: string;
};

function profileLabel(p: Profile): string {
  const parts: string[] = [];
  if (p.cust_id) parts.push(`고객-${p.cust_id}`);
  const meta: string[] = [];
  if (p.age) meta.push(`${p.age}세`);
  if (p.gender) meta.push(p.gender === 'M' ? '남' : p.gender === 'F' ? '여' : p.gender);
  if (p.sido) meta.push(p.sido);
  if (p.grade) meta.push(p.grade);
  if (p.vip === 'Y') meta.push('VIP');
  return parts[0] + (meta.length ? ` (${meta.join(', ')})` : '');
}
type Sample = { label: string; seeds: string; pct: number; persona: Persona };

const SAMPLES: Sample[] = [
  { persona: 'marketing',  seeds: '1,2,3',          pct: 0.2,  label: 'VIP Black 시드 → 상위 20%' },
  { persona: 'marketing',  seeds: '1,5,12',         pct: 0.1,  label: '고급휘발유 충성 시드 → 상위 10%' },
  { persona: 'marketing',  seeds: '460,401,288',    pct: 0.3,  label: 'coupon-only 시드 → 상위 30%' },
  { persona: 'strategy',   seeds: '1,2,3,4,5',      pct: 0.2,  label: 'deep-history 5명 확장' },
  { persona: 'strategy',   seeds: '12,15,19',       pct: 0.15, label: '20대 충성 확장' },
  { persona: 'strategy',   seeds: '460,471,342',    pct: 0.25, label: 'coupon 사용자 확장' },
  { persona: 'data-ai',    seeds: '1,2,3',          pct: 0.2,  label: 'KNN 임베딩 — 상위 20%' },
  { persona: 'data-ai',    seeds: '460,401,288',    pct: 0.5,  label: '대규모 50% 임베딩 매칭' },
  { persona: 'data-ai',    seeds: '1,12,460',       pct: 0.1,  label: '믹스 코호트 — 정밀 10%' },
  { persona: 'crm',        seeds: '1,2,3',          pct: 0.2,  label: 'PLCC 보유 시드' },
  { persona: 'crm',        seeds: '5,12,19',        pct: 0.15, label: 'Black 등급 시드' },
  { persona: 'crm',        seeds: '460,401,288',    pct: 0.25, label: '쿠폰 적극 사용 시드' },
  { persona: 'retail-ops', seeds: '1,2,3',          pct: 0.2,  label: '서울/경기 시드' },
  { persona: 'retail-ops', seeds: '460,401',        pct: 0.3,  label: '광역 권역 30%' },
  { persona: 'retail-ops', seeds: '1,15,19',        pct: 0.2,  label: '주요 거점 권역' },
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

export default function LookalikePage() {
  const { active, setActive } = useActivePersona();
  const [seeds, setSeeds] = useState('1,2,3');
  const [pct, setPct] = useState(0.2);
  const [out, setOut] = useState<LookalikeOut | null>(null);
  const [phases, setPhases] = useState<PhaseChip[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setOut(null); setPhases([]); }, [active]);

  async function go(s?: string, p?: number) {
    const sd = s ?? seeds; const pp = p ?? pct;
    setLoading(true); setOut(null); setPhases([]);
    const acc: LookalikeOut = {};
    try {
      for await (const ev of streamSSE<{ name?: string; count?: number; len?: number; desc?: string;
                                          text?: string; channel?: string } & LookalikeOut>(
        '/api/lookalike/stream',
        { seed_cust_ids: sd.split(',').map((x) => x.trim()).filter(Boolean),
          top_pct: pp, persona_id: active },
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
      <ScenarioHeader scenario="F" title="룩어라이크 확장"
        tech="Seed Customer 임베딩 → Cohere v4 KNN → 상위 N% 유사 고객 풀 (50K 합성 코호트)" />
      <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink-50 mb-1.5">F. 룩어라이크 확장</h1>
          <p className="text-sm text-ink-300 leading-relaxed">
            소수의 seed 고객 (cust_id 리스트)에서 Cohere v4 임베딩을 추출하고,
            <span className="text-accent-300 font-semibold"> 50K 합성 룩어라이크 코호트</span>에서 KNN으로 가장 유사한
            상위 N% 고객을 확장합니다. 캠페인 타겟팅을 seed 5명 → 1만명 규모로 확장하는 데 사용합니다.
          </p>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">부서 페르소나</span>
          <PersonaSwitchGcc value={active} onChange={(v) => setActive(v as Persona)} />
        </div>
        <textarea className="w-full bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-ink-100 mb-2 outline-none focus:border-accent-500"
          rows={2} value={seeds} onChange={(e) => setSeeds(e.target.value)} placeholder="seed cust_id (쉼표 구분)" />
        <div className="flex flex-wrap gap-3 items-center mb-4">
          <label className="text-sm text-ink-300 flex items-center gap-2">
            상위 비율
            <input type="number" step="0.05" min="0.05" max="1" value={pct}
              onChange={(e) => setPct(parseFloat(e.target.value))}
              className="bg-ink-800 border border-ink-700 rounded-md px-2 py-1 w-24 text-ink-100 text-sm" />
          </label>
          <button onClick={() => void go()} disabled={loading}
            className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 font-semibold px-5 py-2 rounded-md text-sm">
            <GitMerge className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
            {loading ? '확장 중...' : '확장 실행'}
          </button>
        </div>

        <PipelineChips phases={phases} loading={loading} />

        {!out && !loading && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
              {PERSONA_LABEL[active]} 부서 추천 — 클릭 즉시 확장
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {filtered.map((s, i) => (
                <button key={i} type="button" disabled={loading}
                  onClick={() => { setSeeds(s.seeds); setPct(s.pct); void go(s.seeds, s.pct); }}
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
          <div className="space-y-4">
            <div className="rounded-lg border border-ink-700 bg-ink-800 p-4">
              <div className="text-2xl font-bold text-ink-50">
                총 확장 <span className="text-accent-300">{out.count ?? 0}</span>명
              </div>
              {out.error && (
                <div className="mt-3 text-xs font-mono text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1.5">
                  error: {out.error}
                </div>
              )}
            </div>
            {(out.expanded_profiles ?? []).length > 0 && (
              <div className="rounded-lg border border-ink-700 bg-ink-800 overflow-hidden">
                <h3 className="text-sm font-semibold text-ink-100 px-4 pt-3 pb-2">
                  상위 {Math.min(50, (out.expanded_profiles ?? []).length)}명 프로필 (PoC 비식별 — cust_id + 핵심 속성)
                </h3>
                <ul className="divide-y divide-ink-700/50 max-h-[400px] overflow-y-auto">
                  {(out.expanded_profiles ?? []).map((p, i) => (
                    <li key={i} className="px-4 py-2 hover:bg-ink-700/30 transition flex items-center gap-2">
                      <span className="text-[10px] font-mono text-ink-500 w-8">#{i + 1}</span>
                      <span className="text-sm text-ink-100 flex-1">{profileLabel(p)}</span>
                      {p.depth && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-900 border border-ink-700 text-ink-400">
                          {p.depth}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(out.expanded ?? []).length > (out.expanded_profiles ?? []).length && (
              <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
                <div className="text-xs text-ink-400 mb-1">
                  추가 확장 cust_id (프로필 미조회, 51-{Math.min(1000, (out.expanded ?? []).length)} 위):
                </div>
                <div className="font-mono text-[10px] text-ink-500 break-all max-h-24 overflow-y-auto leading-relaxed">
                  {(out.expanded ?? []).slice(50, 200).join(', ')}
                </div>
              </div>
            )}
          </div>
        )}

        {(out || loading) && (
          <InsightReport title="룩어라이크 확장" scenarioCode="F"
            personaLabel={PERSONA_LABEL[active]}
            sources={['real:Customer', 'synthetic:LookalikeCohort', 'OpenSearch:Cohere-v4-KNN']}
            summary={out?.summary} loading={loading}
            filenameBase={`lookalike-${active}`} />
        )}

        <div className="mt-8 p-5 rounded-lg border border-ink-700 bg-ink-900/60">
          <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
            <span className="text-accent-400">⚙</span> 이 시나리오는 무엇을 하나요?
          </h3>
          <p className="text-xs text-ink-300 leading-relaxed">
            <strong className="text-ink-200">룩어라이크 확장</strong>은 캠페인 타겟팅의 핵심 패턴입니다. 소수 seed의 임베딩 평균을 중심으로
            cosine similarity 상위 N%를 추출 — 작은 인사이트를 큰 모집단으로 일반화합니다. 50K 합성 코호트는
            Plan 2에서 deep-history 33명 + coupon-only 484명 + sales-only 17명 + 재구성된 합성 룩어라이크로 구성됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
