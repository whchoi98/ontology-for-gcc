'use client';
import { useEffect, useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { streamSSE } from '@/lib/api-client';
import SubgraphView from '@/components/SubgraphView';
import PersonaSwitchGcc from '@/components/PersonaSwitchGcc';
import { ScenarioHeader } from '@/components/ScenarioHeader';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

type PersonaId = Persona;

type Sample = { label: string; persona: PersonaId };

// 부서별 추천 쿼리 (각 부서 우선 시나리오에 맞춰 큐레이션)
const SAMPLES: Sample[] = [
  // 마케팅 — G(ROI) / B(챗봇) / F(룩어라이크)
  { persona: 'marketing',  label: '고급휘발유에 충성도가 높은 30대 직장인' },
  { persona: 'marketing',  label: '캠페인 ROI가 높은 SMS 발송 세그먼트' },
  { persona: 'marketing',  label: 'VIP Black 등급 룩어라이크 후보' },
  // 고객전략 — D(매칭) / E(클러스터) / K(이상행동)
  { persona: 'strategy',   label: '디젤 헤비유저 클러스터' },
  { persona: 'strategy',   label: '충성 vs 가격민감 세그먼트 차이' },
  { persona: 'strategy',   label: '디젤 → premium 전환 outlier' },
  // 데이터·AI — C(인사이트) / J(외부 시그널) / K(이상)
  { persona: 'data-ai',    label: 'PM+M 92 RON DIY 블렌딩 패턴' },
  { persona: 'data-ai',    label: '현대카드 소비지수와 결합한 인사이트' },
  { persona: 'data-ai',    label: '주유 패턴의 시간대별 이상 탐지' },
  // CRM·회원사업 — L(결제) / I(약관) / D(매칭)
  { persona: 'crm',        label: 'Black 등급 PLCC 보유 결제 매트릭스' },
  { persona: 'crm',        label: '마케팅 동의 약관 보유 고객' },
  { persona: 'crm',        label: '멤버십 등급별 페르소나 차이' },
  // 리테일영업 — H(권역) / F(룩어라이크) / A(검색)
  { persona: 'retail-ops', label: '서울 권역 경쟁 주유소 매트릭스' },
  { persona: 'retail-ops', label: '셀프 주유소 고매출 룩어라이크' },
  { persona: 'retail-ops', label: '디젤 비즈니스 고객 거주지 검색' },
];

const PERSONA_TONE: Record<PersonaId, string> = {
  marketing:    'border-blue-500/50    bg-blue-500/15    text-blue-200',
  strategy:     'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  'data-ai':    'border-amber-500/50   bg-amber-500/15   text-amber-200',
  crm:          'border-rose-500/50    bg-rose-500/15    text-rose-200',
  'retail-ops': 'border-violet-500/50  bg-violet-500/15  text-violet-200',
};

const PERSONA_LABEL: Record<PersonaId, string> = {
  marketing:    '마케팅',
  strategy:     '고객전략',
  'data-ai':    '데이터·AI',
  crm:          'CRM·회원사업',
  'retail-ops': '리테일영업',
};

// 검색 파이프라인 단계 (실제 SSE phase + 시각 시뮬)
type PhaseChip = { name: string; label: string; tone: string };
const PHASE_TONES: Record<string, string> = {
  bm25:      'border-blue-500/50    bg-blue-500/15    text-blue-200',
  knn:       'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  rrf:       'border-amber-500/50   bg-amber-500/15   text-amber-200',
  rerank:    'border-rose-500/50    bg-rose-500/15    text-rose-200',
  subgraph:  'border-violet-500/50  bg-violet-500/15  text-violet-200',
};

const CLASS_TONE: Record<string, string> = {
  Segment:            'bg-violet-500/15 text-violet-300 border-violet-500/40',
  Customer:           'bg-blue-500/15   text-blue-300   border-blue-500/40',
  Cluster:            'bg-amber-500/15  text-amber-300  border-amber-500/40',
  Persona:            'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  FuelProduct:        'bg-orange-500/15 text-orange-300 border-orange-500/40',
  FuelTransaction:    'bg-orange-500/15 text-orange-300 border-orange-500/40',
  GasStation:         'bg-sky-500/15    text-sky-300    border-sky-500/40',
  Campaign:           'bg-rose-500/15   text-rose-300   border-rose-500/40',
  Coupon:             'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40',
  Term:               'bg-indigo-500/15 text-indigo-300 border-indigo-500/40',
  WeatherObservation: 'bg-cyan-500/15   text-cyan-300   border-cyan-500/40',
  Scenario:           'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
};

type Hit = {
  id?: string;
  text?: string;
  class_name?: string;
  metadata?: { kind?: string; name?: string; code?: string; title?: string };
  rrf_score?: number;
};

function splitText(text: string): { title: string; body: string } {
  if (!text) return { title: '', body: '' };
  const idx = text.indexOf(': ');
  if (idx > 0 && idx < 60) {
    return { title: text.slice(0, idx), body: text.slice(idx + 2) };
  }
  const dash = text.indexOf(' — ');
  if (dash > 0 && dash < 80) {
    return { title: text.slice(0, dash), body: text.slice(dash + 3) };
  }
  return { title: text.slice(0, 40) + (text.length > 40 ? '…' : ''), body: text };
}

export default function SearchPage() {
  const { active, setActive } = useActivePersona();
  const persona = active;
  const setPersona = (p: PersonaId) => setActive(p);
  const [query, setQuery] = useState('고급휘발유에 충성도가 높은 30대 직장인');
  const [results, setResults] = useState<Hit[]>([]);
  const [subgraph, setSubgraph] = useState<{
    nodes: { id: string; label?: string }[];
    edges: { id?: string; source: string; target: string; type?: string }[];
  }>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);
  const [phases, setPhases] = useState<PhaseChip[]>([]);

  // 부서 변경 시 결과·그래프·파이프라인 초기화 → 추천 풍선말 재표시.
  useEffect(() => {
    setResults([]);
    setSubgraph({ nodes: [], edges: [] });
    setPhases([]);
  }, [active]);

  async function go(qOverride?: string, personaOverride?: PersonaId) {
    const q = (qOverride ?? query).trim();
    if (!q) return;
    const p = personaOverride ?? persona;
    setLoading(true);
    setResults([]);
    setSubgraph({ nodes: [], edges: [] });
    setPhases([{ name: 'bm25', label: 'BM25 (Nori 한국어)', tone: PHASE_TONES.bm25 }]);
    type SearchData = {
      results?: Hit[];
      subgraph?: {
        nodes: { id: string; label?: string }[];
        edges: { id?: string; source: string; target: string; type?: string }[];
      };
    };
    for await (const ev of streamSSE<SearchData>('/api/search/stream', {
      query: q, persona_id: p, size: 10,
    })) {
      if (ev.type === 'phase') {
        const data = ev.data as { name?: string; count?: number; nodes?: number };
        if (data.name === 'embedding') {
          setPhases((cur) => [...cur, { name: 'knn', label: 'Cohere v4 KNN', tone: PHASE_TONES.knn }]);
        } else if (data.name === 'reranked') {
          setPhases((cur) => [
            ...cur,
            { name: 'rrf', label: `RRF fusion (${data.count} hits)`, tone: PHASE_TONES.rrf },
            { name: 'rerank', label: 'Cohere rerank-v3', tone: PHASE_TONES.rerank },
          ]);
        } else if (data.name === 'subgraph') {
          setPhases((cur) => [...cur, { name: 'subgraph', label: `Neptune 1-hop (${data.nodes} nodes)`, tone: PHASE_TONES.subgraph }]);
        }
      }
      if (ev.type === 'result' && ev.data) {
        setResults(ev.data.results ?? []);
        setSubgraph(ev.data.subgraph ?? { nodes: [], edges: [] });
      }
    }
    setLoading(false);
  }

  function pickSample(s: Sample) {
    setPersona(s.persona);
    setQuery(s.label);
    void go(s.label, s.persona);
  }

  const filteredSamples = SAMPLES.filter((s) => s.persona === persona);

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader
        scenario="A"
        title="하이브리드 검색"
        tech="자연어 → BM25 (Nori) + Cohere v4 KNN → RRF fusion → Cohere rerank-v3 → Neptune 1-hop subgraph"
      />

      <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
        {/* 페이지 인트로 */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink-50 mb-1.5">A. 의미 검색 + 1-hop subgraph</h1>
          <p className="text-sm text-ink-300 leading-relaxed">
            한국어 자연어 쿼리를 BM25 키워드 매칭과 Cohere v4 임베딩 KNN으로 동시에 검색해
            <span className="text-accent-300 font-semibold"> RRF (Reciprocal Rank Fusion)</span>로 합치고,
            <span className="text-accent-300 font-semibold"> Cohere rerank-v3</span>로 순위를 재조정한 다음,
            상위 노드에서 <span className="text-accent-300 font-semibold">Neptune 1-hop 그래프</span>를 가져와
            의미·관계 양쪽 시점을 한 화면에 보여줍니다.
          </p>
        </div>

        {/* 부서 토글 + 페르소나 라벨 */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">
            부서 페르소나
          </span>
          <PersonaSwitchGcc value={persona} onChange={(v) => setPersona(v as PersonaId)} />
        </div>

        {/* 검색 입력 */}
        <form onSubmit={(e) => { e.preventDefault(); void go(); }} className="mb-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
              <input
                className="w-full bg-ink-800 border border-ink-700 rounded-md pl-10 pr-3 py-2.5 text-sm text-ink-100 outline-none focus:border-accent-500 placeholder:text-ink-500"
                placeholder="예: 고급휘발유에 충성도가 높은 30대 직장인"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 font-semibold px-5 py-2 rounded-md text-sm transition"
            >
              {loading ? '검색 중...' : '검색'}
            </button>
          </div>
        </form>

        {/* 부서별 추천 쿼리 풍선말 (선택 시 즉시 검색) */}
        {results.length === 0 && !loading && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
              {PERSONA_LABEL[persona]} 부서 추천 쿼리 — 클릭하면 바로 검색됩니다
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {filteredSamples.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={loading}
                  onClick={() => pickSample(s)}
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

        {/* 파이프라인 단계 */}
        {(loading || phases.length > 0) && (
          <div className="mb-5 p-4 rounded-lg border border-ink-700 bg-ink-900">
            <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2 flex items-center gap-2">
              <span className={`inline-block w-1.5 h-1.5 rounded-full bg-accent-500 ${loading ? 'animate-pulse' : ''}`} />
              검색 파이프라인 — {phases.length}단계 {loading ? '진행 중' : '완료'}
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

        {/* 결과 + 그래프 (2 컬럼) */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <section>
            <h2 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
              <span>검색 결과</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-800 border border-ink-700 text-ink-400">
                {results.length}건
              </span>
            </h2>
            <ul className="space-y-2">
              {results.map((r, i) => {
                const cn = String(r.class_name ?? '');
                const tone = CLASS_TONE[cn] ?? 'bg-ink-800 text-ink-300 border-ink-700';
                const { title, body } = splitText(String(r.text ?? ''));
                const score = typeof r.rrf_score === 'number' ? r.rrf_score : null;
                return (
                  <li key={i} className="bg-ink-800 border border-ink-700 rounded-lg p-3 hover:border-accent-500/50 transition">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${tone}`}>
                        {cn || '?'}
                      </span>
                      <h3 className="text-sm font-bold text-ink-100 truncate">{title}</h3>
                      {score !== null && (
                        <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent-500/15 text-accent-300 border border-accent-500/30 shrink-0">
                          rrf {score.toFixed(3)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-300 leading-relaxed">{body}</p>
                  </li>
                );
              })}
              {results.length === 0 && !loading && (
                <li className="text-xs text-ink-500 italic px-3 py-6 text-center border border-dashed border-ink-700 rounded-lg">
                  검색 결과가 여기에 표시됩니다. 위 추천 쿼리를 클릭하거나 자유 입력 후 검색하세요.
                </li>
              )}
            </ul>
          </section>

          <section className="flex flex-col">
            <h2 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
              <span>1-hop Subgraph</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-800 border border-ink-700 text-ink-400">
                {subgraph.nodes.length} 노드 · {subgraph.edges.length} 엣지
              </span>
            </h2>
            <p className="text-[11px] text-ink-400 mb-2">
              상위 5건 결과의 1-hop 이웃 그래프 (Neptune openCypher). 노드 클릭 가능.
            </p>
            <SubgraphView nodes={subgraph.nodes} edges={subgraph.edges} />
          </section>
        </div>

        {/* 하단 동작 설명 */}
        <div className="mt-8 p-5 rounded-lg border border-ink-700 bg-ink-900/60">
          <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
            <span className="text-accent-400">⚙</span> 이 시나리오는 무엇을 하나요?
          </h3>
          <p className="text-xs text-ink-300 leading-relaxed">
            <strong className="text-ink-200">의미 검색</strong>은 단순 키워드 일치를 넘어
            한국어 자연어 의도를 이해해 25 클래스 (Customer, Segment, FuelProduct, Campaign 등)에서
            가장 관련 높은 노드를 찾는 동작입니다. 백엔드는 (1) 한국어 형태소 분석기 Nori 기반 BM25,
            (2) Cohere embed-v4 임베딩의 KNN, 두 결과를 RRF로 융합하고 Cohere rerank-v3로 재순위
            매겨 상위 결과를 반환합니다. 이어서 상위 노드의 Neptune 1-hop 이웃을 함께 시각화해
            <span className="text-accent-300"> 의미적 유사성 + 그래프 구조 관계</span>를 동시에 봅니다.
            우상단 부서 페르소나를 바꾸면 동일 쿼리에 대한 추천 검색어가 부서 KPI 시점으로 전환됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
