'use client';
import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
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

type Row = { payment?: string; grade?: string; sido?: string; tx?: number; revenue?: number; avg_price?: number };

export default function PaymentPage() {
  const { active, setActive } = useActivePersona();
  const [grade, setGrade] = useState('');
  const [sido, setSido] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [phases, setPhases] = useState<PhaseChip[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  async function go(g?: string, s?: string) {
    const gg = g ?? grade; const ss = s ?? sido;
    setLoading(true); setHasRun(true); setSummary(''); setRows([]); setPhases([]);
    try {
      for await (const ev of streamSSE<{ name?: string; count?: number; len?: number; desc?: string;
                                          text?: string; channel?: string;
                                          matrix?: Row[]; summary?: string }>(
        '/api/payment/stream',
        { persona_id: active, fuel_grade: gg || null, sido_nm: ss || null },
      )) {
        const d = ev.data ?? {};
        if (ev.type === 'phase' && d.name) {
          setPhases((q) => [...q, phaseMeta(d.name!, d)]);
        } else if (ev.type === 'delta' && typeof d.text === 'string') {
          setSummary((s2) => s2 + d.text);
        } else if (ev.type === 'result') {
          if (Array.isArray(d.matrix)) setRows(d.matrix);
          if (typeof d.summary === 'string') setSummary(d.summary);
        }
      }
    } finally { setLoading(false); }
  }

  // 부서 변경 시 자동 재분석 — 결과·요약 즉시 갱신.
  useEffect(() => {
    setRows([]); setSummary(''); setPhases([]); setHasRun(false);
    void go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const totalTx = rows.reduce((a, r) => a + (r.tx ?? 0), 0);
  const totalRev = rows.reduce((a, r) => a + (r.revenue ?? 0), 0);

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader scenario="L" title="결제·멤버십"
        tech="결제수단 × 유종 × 시도 매트릭스 (139K 거래) + 멤버십 등급 분석" />
      <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink-50 mb-1.5">L. 결제·가격·채널 분석</h1>
          <p className="text-sm text-ink-300 leading-relaxed">
            결제수단 (credit·cash·app_pay·points) × 유종 × 시도 매트릭스를 집계해
            거래수·매출·평균가를 한 화면에 보여줍니다. 부서 토글로 가중치 시점 변경.
          </p>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">부서 페르소나</span>
          <PersonaSwitchGcc value={active} onChange={(v) => setActive(v as Persona)} />
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          <select className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-ink-100 outline-none focus:border-accent-500"
            value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">모든 유종</option>
            <option value="regular">regular (휘발유)</option>
            <option value="premium">premium (고급휘발유)</option>
            <option value="diesel">diesel (경유)</option>
            <option value="kerosene">kerosene (등유)</option>
            <option value="lpg">lpg</option>
          </select>
          <input className="bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-ink-100 outline-none focus:border-accent-500"
            placeholder="시도 (선택, 예: 서울)" value={sido} onChange={(e) => setSido(e.target.value)} />
          <button onClick={() => void go()} disabled={loading}
            className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 font-semibold px-5 py-2 rounded-md text-sm">
            <CreditCard className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
            {loading ? '분석 중...' : '재분석'}
          </button>
        </div>

        <PipelineChips phases={phases} loading={loading} />

        <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="text-xs text-ink-400">총 거래</div>
            <div className="text-2xl font-bold text-ink-100">{totalTx.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="text-xs text-ink-400">총 매출</div>
            <div className="text-2xl font-bold text-ink-100">
              {(totalRev / 1e8).toFixed(1)}<span className="text-sm text-ink-400 ml-1">억원</span>
            </div>
          </div>
          <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="text-xs text-ink-400">매트릭스 행</div>
            <div className="text-2xl font-bold text-ink-100">{rows.length}</div>
          </div>
          <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="text-xs text-ink-400">필터</div>
            <div className="text-sm text-ink-200 mt-1">
              {grade || '전체 유종'} {sido && `· ${sido}`}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-ink-700 bg-ink-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-900 text-ink-300">
              <tr>
                <th className="text-left px-3 py-2 text-[11px]">결제</th>
                <th className="text-left px-3 py-2 text-[11px]">유종</th>
                <th className="text-left px-3 py-2 text-[11px]">시도</th>
                <th className="text-right px-3 py-2 text-[11px]">거래수</th>
                <th className="text-right px-3 py-2 text-[11px]">매출</th>
                <th className="text-right px-3 py-2 text-[11px]">평균가</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 80).map((r, i) => (
                <tr key={i} className="border-t border-ink-700/50 text-ink-200">
                  <td className="px-3 py-1.5 font-mono text-xs">{r.payment ?? '—'}</td>
                  <td className="px-3 py-1.5">{r.grade ?? '—'}</td>
                  <td className="px-3 py-1.5">{r.sido ?? '—'}</td>
                  <td className="text-right px-3 py-1.5 font-mono text-xs">{r.tx?.toLocaleString?.() ?? 0}</td>
                  <td className="text-right px-3 py-1.5 font-mono text-xs">{(r.revenue ?? 0).toLocaleString()}</td>
                  <td className="text-right px-3 py-1.5 font-mono text-xs">{Math.round(r.avg_price ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(hasRun || loading) && (
          <InsightReport title="결제·가격·채널 분석" scenarioCode="L"
            personaLabel={PERSONA_LABEL[active]}
            sources={['real:FuelTransaction', 'real:PaymentMethod', 'real:GasStation']}
            summary={summary} loading={loading}
            filenameBase={`payment-${active}`} />
        )}

        <div className="mt-8 p-5 rounded-lg border border-ink-700 bg-ink-900/60">
          <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
            <span className="text-accent-400">⚙</span> 이 시나리오는 무엇을 하나요?
          </h3>
          <p className="text-xs text-ink-300 leading-relaxed">
            <strong className="text-ink-200">결제·멤버십</strong>은 FuelTransaction 노드 (139K 거래)를 결제수단·유종·시도 3차원으로 집계해
            매트릭스를 만듭니다. PaymentMethod 노드 8종 (credit/cash/app_pay/points 등)과 결합해 채널별 매출 비중,
            앱페이 사용 비율, 멤버십 등급별 평균 결제액 등을 분석합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
