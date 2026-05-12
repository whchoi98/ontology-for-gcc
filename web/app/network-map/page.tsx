'use client';
import { useEffect, useState } from 'react';
import { Map } from 'lucide-react';
import KoreaChoropleth from '@/components/KoreaChoropleth';
import { ScenarioHeader } from '@/components/ScenarioHeader';
import PersonaSwitchGcc from '@/components/PersonaSwitchGcc';
import InsightReport from '@/components/InsightReport';
import PipelineChips, { phaseMeta, type PhaseChip } from '@/components/PipelineChips';
import { StationChatPanel } from '@/components/StationChatPanel';
import { streamSSE } from '@/lib/api-client';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

const PERSONA_LABEL: Record<Persona, string> = {
  marketing: '마케팅', strategy: '고객전략', 'data-ai': '데이터·AI', crm: 'CRM·회원사업', 'retail-ops': '리테일영업',
};

type Row = { sido?: string; brand?: string; stations?: number; avg_price?: number };

export default function NetworkMapPage() {
  const { active, setActive } = useActivePersona();
  const [byBrand, setByBrand] = useState<Row[]>([]);
  const [data, setData] = useState<Record<string, number>>({});
  const [summary, setSummary] = useState<string>('');
  const [phases, setPhases] = useState<PhaseChip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true); setSummary(''); setPhases([]); setByBrand([]); setData({});
    (async () => {
      try {
        for await (const ev of streamSSE<{ name?: string; count?: number; len?: number; desc?: string;
                                            text?: string; channel?: string;
                                            stations_by_sido?: Row[]; summary?: string }>(
          '/api/network-map/stream',
          { persona_id: active },
        )) {
          const d = ev.data ?? {};
          if (ev.type === 'phase' && d.name) {
            setPhases((q) => [...q, phaseMeta(d.name!, d)]);
          } else if (ev.type === 'delta' && typeof d.text === 'string') {
            setSummary((s) => s + d.text);
          } else if (ev.type === 'result') {
            const rows = d.stations_by_sido || [];
            setByBrand(rows);
            if (typeof d.summary === 'string') setSummary(d.summary);
            const m: Record<string, number> = {};
            for (const r of rows) {
              if (!r.sido) continue;
              m[r.sido] = (m[r.sido] ?? 0) + (r.stations ?? 0);
            }
            setData(m);
          }
        }
      } catch {
        setByBrand([]); setData({});
      } finally {
        setLoading(false);
      }
    })();
  }, [active]);

  const totalStations = Object.values(data).reduce((a, b) => a + b, 0);
  const sidoCount = Object.keys(data).length;

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="H" title="권역 경쟁 지도"
        tech="Region(시도) choropleth + GSC vs 경쟁사 매트릭스 + KOSTAT 행정구역 GeoJSON" />
      <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink-50 mb-1.5">H. 권역 경쟁 주유소 지도</h1>
          <p className="text-sm text-ink-300 leading-relaxed">
            17개 시도 × GSC/현대/SK/S-Oil 브랜드 분포를 한반도 choropleth 지도와 매트릭스로 보여줍니다.
            부서 토글로 페르소나 가중치 (마케팅 reach, 리테일 station_volume 등)에 따른 시점 변경.
            KOSTAT 행정구역 GeoJSON 기반.
          </p>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">부서 페르소나</span>
          <PersonaSwitchGcc value={active} onChange={(v) => setActive(v as Persona)} />
        </div>

        <PipelineChips phases={phases} loading={loading} />

        <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="text-xs text-ink-400">총 주유소</div>
            <div className="text-2xl font-bold text-ink-100">{totalStations.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="text-xs text-ink-400">시도</div>
            <div className="text-2xl font-bold text-ink-100">{sidoCount}</div>
          </div>
          <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="text-xs text-ink-400">브랜드 행</div>
            <div className="text-2xl font-bold text-ink-100">{byBrand.length}</div>
          </div>
          <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="text-xs text-ink-400">상태</div>
            {loading ? (
              <div className="text-sm font-semibold text-amber-300 mt-1 animate-pulse flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                로딩 중…
              </div>
            ) : (
              <div className="text-sm font-semibold text-emerald-300 mt-1">✓ 로드됨</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* 좌: 지도 (2 컬럼) */}
          <div className="xl:col-span-2 rounded-lg border border-ink-700 bg-ink-800 p-3">
            <h2 className="text-sm font-semibold text-ink-100 mb-2">시도별 choropleth (총 주유소)</h2>
            <KoreaChoropleth data={data} />
          </div>
          {/* 우: 주유소 도우미 chat panel */}
          <div className="xl:col-span-1 h-[680px]">
            <StationChatPanel />
          </div>
        </div>

        {/* 시도×브랜드 매트릭스 — 전체 너비 */}
        <div className="mt-4 rounded-lg border border-ink-700 bg-ink-800 overflow-x-auto">
          <h2 className="text-sm font-semibold text-ink-100 px-3 pt-3">시도 × 브랜드 매트릭스</h2>
          <table className="w-full text-xs mt-2">
            <thead className="bg-ink-900 text-ink-300">
              <tr>
                <th className="text-left px-3 py-2">시도</th>
                <th className="text-left px-3 py-2">브랜드</th>
                <th className="text-right px-3 py-2">주유소</th>
                <th className="text-right px-3 py-2">평균가</th>
              </tr>
            </thead>
            <tbody>
              {byBrand.slice(0, 60).map((r, i) => (
                <tr key={i} className="border-t border-ink-700/50 text-ink-200">
                  <td className="px-3 py-1.5">{r.sido ?? '—'}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px]">{r.brand ?? '—'}</td>
                  <td className="text-right px-3 py-1.5 font-mono">{r.stations ?? 0}</td>
                  <td className="text-right px-3 py-1.5 font-mono">{r.avg_price ? Math.round(r.avg_price) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sonnet 4.6 5섹션 인사이트 + MD/PDF */}
        <InsightReport title="권역 경쟁 주유소 지도" scenarioCode="H"
          personaLabel={PERSONA_LABEL[active]}
          sources={['real:GasStation', 'real:Region', 'real:Opinet']}
          summary={summary} loading={loading}
          filenameBase={`network-map-${active}`} />

        <div className="mt-8 p-5 rounded-lg border border-ink-700 bg-ink-900/60">
          <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
            <span className="text-accent-400">⚙</span> 이 시나리오는 무엇을 하나요?
          </h3>
          <p className="text-xs text-ink-300 leading-relaxed">
            <strong className="text-ink-200">권역 경쟁 지도</strong>는 8.5K GasStation 노드의 시도/브랜드 속성을 집계해
            한반도 choropleth로 시각화 — 어느 시도가 GSC 비중이 낮은지, 경쟁사 우위 권역은 어디인지를 한 눈에 보여줍니다.
            매트릭스에서 평균가 컬럼은 Opinet 가격 시계열의 시도 단위 평균.
          </p>
        </div>
      </div>
    </div>
  );
}
