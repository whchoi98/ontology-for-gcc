'use client';
import { useState } from 'react';
import { streamSSE } from '@/lib/api-client';
import SubgraphView from '@/components/SubgraphView';
import StreamPanel from '@/components/StreamPanel';

/** Plan 3 Task 3.2.4 — 시나리오 A 검색 페이지.
 *  Persona switch (5 부서 SSOT) + query input + SSE timeline + result list +
 *  1-hop subgraph from Neptune. */
export default function SearchPage() {
  const [query, setQuery] = useState('고급휘발유에 충성도가 높은 30대 직장인');
  const [persona, setPersona] = useState('marketing');
  const [events, setEvents] = useState<{ type: string; data: unknown }[]>([]);
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [subgraph, setSubgraph] = useState<{
    nodes: { id: string; label?: string }[];
    edges: { id?: string; source: string; target: string; type?: string }[];
  }>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    setEvents([]);
    setResults([]);
    setSubgraph({ nodes: [], edges: [] });
    type SearchData = {
      results?: Record<string, unknown>[];
      subgraph?: {
        nodes: { id: string; label?: string }[];
        edges: { id?: string; source: string; target: string; type?: string }[];
      };
    };
    for await (const ev of streamSSE<SearchData>('/api/search/stream', {
      query,
      persona_id: persona,
      size: 10,
    })) {
      setEvents((prev) => [...prev, ev]);
      if (ev.type === 'result' && ev.data) {
        setResults(ev.data.results ?? []);
        setSubgraph(ev.data.subgraph ?? { nodes: [], edges: [] });
      }
    }
    setLoading(false);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">A. 의미 검색 + 1-hop subgraph</h1>
      <div className="flex gap-2 mb-4 text-xs">
        <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">real</span>
        <span className="px-2 py-1 rounded bg-amber-100 text-amber-700 border border-amber-200">synthetic</span>
      </div>
      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 border rounded px-3 py-2"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="자연어 쿼리"
        />
        <select
          className="border rounded px-3"
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
        >
          <option value="marketing">마케팅</option>
          <option value="strategy">고객전략</option>
          <option value="data-ai">데이터·AI</option>
          <option value="crm">CRM·회원사업</option>
          <option value="retail-ops">리테일영업</option>
        </select>
        <button
          onClick={go}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? '검색 중...' : '검색'}
        </button>
      </div>

      <StreamPanel events={events} />

      <div className="grid grid-cols-2 gap-4 mt-4">
        <div>
          <h3 className="font-semibold mb-2">결과 ({results.length})</h3>
          <ul className="space-y-1">
            {results.map((r, i) => (
              <li key={i} className="border rounded p-2 text-sm">
                <div className="font-mono text-xs text-slate-400">
                  {String(r.class_name ?? '')} · {String(r.id ?? '')}
                </div>
                <div>{String(r.text ?? '')}</div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold mb-2">1-hop Subgraph</h3>
          <SubgraphView nodes={subgraph.nodes} edges={subgraph.edges} />
        </div>
      </div>
    </div>
  );
}
