'use client';

// 운영 콘솔 5 영역 (적재 / 가드레일 / 메모리 / 평가 / 도구 트레이스).
// retail의 /ops/[area] 5-view 패턴 + GCC live 엔드포인트 (/api/ops/live/{area}).
// 모든 데이터는 in-process buffer 또는 Neptune live count — stub 없음.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Database, ShieldCheck, Brain, Activity, ChevronRight, RefreshCcw,
  CheckCircle2, XCircle, AlertCircle, ListTree, Wrench,
} from 'lucide-react';

import * as api from '@/lib/api-client';

const META: Record<string, { ko: string; desc: string; icon: React.ComponentType<{ className?: string }> }> = {
  ingest:    { ko: '데이터 적재',         desc: 'Neptune 25 클래스 노드 카운트 + OpenSearch 인덱스 통계',                 icon: Database },
  guardrail: { ko: '가드레일',             desc: 'Bedrock Guardrail INPUT/OUTPUT 위반 in-process 버퍼 (최근 200건)',        icon: ShieldCheck },
  memory:    { ko: '메모리 히스토리',     desc: 'AgentCore Memory namespace=gcc — 단기 세션 + 장기 (7일) 이벤트',          icon: Brain },
  eval:      { ko: '평가 결과',            desc: '14 시나리오 × 5 페르소나 wow query 평가 — pass rate + p95 latency',       icon: Activity },
  trace:     { ko: '도구 호출 트레이스',  desc: '대화형 에이전트 도구 호출 — nearest_stations · neptune_subgraph 등 (최근 100건)', icon: ListTree },
};

// 5 도메인 색상 패밀리 — Ingest 그룹별 시각화에 사용.
const DOMAIN_OF: Record<string, string> = {
  Customer: '고객·회원', Persona: '고객·회원', Cluster: '고객·회원', Segment: '고객·회원', Member: '고객·회원',
  FuelTransaction: '행동·거래', AppEvent: '행동·거래', Survey: '행동·거래', SurveyResponse: '행동·거래', CouponUse: '행동·거래', PaymentMethod: '행동·거래',
  Campaign: '마케팅', Coupon: '마케팅', Offer: '마케팅', Channel: '마케팅', CampaignSms: '마케팅', CampaignSMS: '마케팅', CampaignAggregation: '마케팅',
  FuelProduct: '운영·상품', GasStation: '운영·상품', FuelPrice: '운영·상품', Region: '운영·상품',
  Term: '컴플·외부', TermAgreement: '컴플·외부', ConsumptionIndex: '컴플·외부', WeatherObservation: '컴플·외부',
  TimeSlot: '시간',
};
const DOMAIN_TONE: Record<string, string> = {
  '고객·회원':  'border-orange-500/50 bg-orange-500/15 text-orange-200',
  '행동·거래':  'border-sky-500/50 bg-sky-500/15 text-sky-200',
  '마케팅':       'border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-200',
  '운영·상품':  'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  '컴플·외부':  'border-amber-500/50 bg-amber-500/15 text-amber-200',
  '시간':         'border-slate-500/50 bg-slate-500/15 text-slate-200',
};

export default function OpsPage({ params }: { params: { area: string } }) {
  const meta = META[params.area] ?? { ko: params.area, desc: '', icon: Activity };
  const Icon = meta.icon;
  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6">
        <div className="text-xs text-ink-400 flex items-center gap-2">
          <Link href="/" className="hover:text-accent-300">홈</Link>
          <ChevronRight className="w-3 h-3" />
          <span>파이프라인</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-ink-200 font-medium">{meta.ko}</span>
        </div>
      </header>
      <div className="flex-1 px-8 py-8 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-md bg-ink-800 border border-ink-700 flex items-center justify-center">
            <Icon className="w-5 h-5 text-accent-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink-50">{meta.ko}</h1>
            <p className="text-sm text-ink-400">{meta.desc}</p>
          </div>
        </div>
        {params.area === 'ingest'    && <IngestView />}
        {params.area === 'guardrail' && <GuardrailView />}
        {params.area === 'memory'    && <MemoryView />}
        {params.area === 'eval'      && <EvalView />}
        {params.area === 'trace'     && <TraceView />}
        {!META[params.area] && (
          <p className="text-sm text-ink-400 italic">알 수 없는 ops 영역: <span className="font-mono">{params.area}</span></p>
        )}
      </div>
    </div>
  );
}

// ─── Ingest ────────────────────────────────────────────────────────────
function IngestView() {
  const [data, setData] = useState<api.IngestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true); setError(null);
    try { setData(await api.opsIngest()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  if (loading && !data) return <p className="text-sm text-ink-400">Neptune 카운트 조회 중…</p>;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const counts = data.counts ?? [];
  const totalNodes = counts.reduce((a, c) => a + Math.max(0, c.count), 0);
  const groupTotals: Record<string, { count: number; classes: number }> = {};
  for (const c of counts) {
    const g = DOMAIN_OF[c.class] ?? '시간';
    if (!groupTotals[g]) groupTotals[g] = { count: 0, classes: 0 };
    groupTotals[g].count += Math.max(0, c.count);
    groupTotals[g].classes += 1;
  }

  return (
    <div className="space-y-5">
      <RefreshButton onClick={load} loading={loading} />
      <Section title="요약">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="적재 클래스" value={String(counts.length)} />
          <Stat label="총 노드" value={totalNodes.toLocaleString()} />
          <Stat label="실패 클래스" value={String(counts.filter((c) => c.count < 0).length)} />
          <Stat label="평균/클래스" value={Math.round(totalNodes / Math.max(counts.length, 1)).toLocaleString()} />
        </div>
      </Section>
      <Section title="도메인별 분포">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries(groupTotals).sort((a, b) => b[1].count - a[1].count).map(([g, v]) => (
            <div key={g} className={`px-3 py-2 rounded-md border ${DOMAIN_TONE[g] ?? 'border-ink-700 bg-ink-800 text-ink-200'}`}>
              <div className="text-[10px] uppercase tracking-wider opacity-70">{g}</div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-lg font-bold">{v.count.toLocaleString()}</span>
                <span className="text-[10px] opacity-70">· {v.classes} 클래스</span>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title={`Neptune 클래스별 카운트 (${counts.length})`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {counts.sort((a, b) => b.count - a.count).map((c) => {
            const tone = DOMAIN_TONE[DOMAIN_OF[c.class] ?? '시간'] ?? '';
            return (
              <div key={c.class} className={`px-3 py-2 rounded-md border ${c.count < 0 ? 'border-red-500/40 bg-red-500/10' : 'border-ink-700 bg-ink-800'}`}>
                <div className={`text-[10px] font-mono ${c.count < 0 ? 'text-red-300' : 'text-ink-400'}`}>{c.class}</div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-sm font-bold ${c.count < 0 ? 'text-red-300' : 'text-ink-100'}`}>
                    {c.count < 0 ? '실패' : c.count.toLocaleString()}
                  </span>
                  {c.count >= 0 && (
                    <span className={`text-[9px] font-mono px-1 py-0.5 rounded border ${tone}`}>
                      {DOMAIN_OF[c.class] ?? '시간'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

// ─── Guardrail ─────────────────────────────────────────────────────────
function GuardrailView() {
  const [data, setData] = useState<api.GuardrailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true); setError(null);
    try { setData(await api.opsGuardrail()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  return (
    <div className="space-y-4">
      <RefreshButton onClick={load} loading={loading} />
      {error && <ErrorBox msg={error} />}
      {data && data.guardrail.length === 0 && (
        <div className="p-4 rounded border border-dashed border-ink-700 text-xs text-ink-500 italic text-center">
          가드레일 위반 이벤트가 없습니다 — INPUT/OUTPUT 스크럽이 정상 동작 중. /chat에서 민감 키워드를 시도하면 여기에 기록됩니다.
        </div>
      )}
      {data && data.guardrail.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="총 이벤트" value={String(data.guardrail.length)} />
            <Stat label="INPUT 차단" value={String(data.guardrail.filter((g) => g.source === 'INPUT').length)} />
            <Stat label="OUTPUT 차단" value={String(data.guardrail.filter((g) => g.source === 'OUTPUT').length)} />
          </div>
          <Section title="최근 위반 (snippet 미리보기)">
            <ul className="space-y-2">
              {data.guardrail.slice().reverse().map((e, i) => (
                <li key={i} className="p-3 rounded border border-ink-700 bg-ink-800">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                      e.source === 'INPUT'
                        ? 'border-orange-500/50 bg-orange-500/15 text-orange-200'
                        : 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                    }`}>{e.source}</span>
                    {e.violations.map((v) => (
                      <span key={v} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-900 border border-ink-700 text-ink-300">
                        {v}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-ink-200 font-mono whitespace-pre-wrap break-all">{e.snippet}</p>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}

// ─── Memory ────────────────────────────────────────────────────────────
function MemoryView() {
  const [data, setData] = useState<api.MemorySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true); setError(null);
    try { setData(await api.opsMemory()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  return (
    <div className="space-y-4">
      <RefreshButton onClick={load} loading={loading} />
      {error && <ErrorBox msg={error} />}
      {data && (
        <>
          <Section title="AgentCore Memory">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat label="네임스페이스" value="gcc" mono />
              <Stat label="단기 (세션)" value="활성" />
              <Stat label="장기 (7일)" value="활성" />
            </div>
          </Section>
          {data.note && (
            <p className="text-xs text-ink-400 italic px-1 leading-relaxed">{data.note}</p>
          )}
          {!data.events?.length && (
            <div className="p-4 rounded border border-dashed border-ink-700 text-xs text-ink-500 italic text-center">
              세션 이벤트가 표시되지 않습니다 — full mem.list_events는 별도 chat router 통합 작업으로 후속 단계.
              /chat에서 메시지를 보내면 user/assistant turn이 namespace=gcc 안에 저장됩니다.
            </div>
          )}
          {!!data.events?.length && (
            <Section title={`최근 이벤트 (${data.events.length})`}>
              <ul className="space-y-2">
                {data.events.map((e, i) => (
                  <li key={i} className="p-3 rounded border border-ink-700 bg-ink-800">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-ink-400 mb-1">
                      <span>{e.role ?? '(role?)'}</span>
                      <span>·</span>
                      <span>{e.actor_id ?? '(actor?)'}</span>
                      <span>·</span>
                      <span>{e.event_timestamp ?? '(ts?)'}</span>
                    </div>
                    <p className="text-sm text-ink-100 whitespace-pre-wrap">{e.text ?? '(no text)'}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

// ─── Eval ──────────────────────────────────────────────────────────────
function EvalView() {
  const [data, setData] = useState<api.EvalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true); setError(null);
    try { setData(await api.opsEval()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  if (loading && !data) return <p className="text-sm text-ink-400">평가 결과 로딩 중…</p>;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;
  const rows = data.scenarios ?? data.rows ?? [];
  const passRate = data.overall_pass_pct ?? (data.pass_rate ? data.pass_rate * 100 : null);
  return (
    <div className="space-y-4">
      <RefreshButton onClick={load} loading={loading} />
      {data.note && (
        <div className="p-3 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs">
          {data.note}
        </div>
      )}
      {(passRate !== null && passRate !== undefined) && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Pass Rate" value={`${typeof passRate === 'number' ? passRate.toFixed(0) : passRate}%`} />
          <Stat label="Passes / Total"
                value={data.passes != null && data.total != null ? `${data.passes} / ${data.total}` : `${rows.filter((r) => r.passed).length} / ${rows.length}`} />
          {data.avg_latency_ms != null && <Stat label="Avg Latency" value={`${data.avg_latency_ms}ms`} mono />}
        </div>
      )}
      {rows.length > 0 && (
        <Section title={`${rows.length} Wow Queries`}>
          <ul className="space-y-1.5 text-xs">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-ink-700 bg-ink-800">
                {r.error
                  ? <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  : r.passed
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                <span className="flex-1 text-ink-100 truncate">{r.q ?? r.id ?? '(no label)'}</span>
                {r.hit_count != null && <span className="text-[10px] font-mono text-ink-400">hits {r.hit_count}</span>}
                {r.latency_ms != null && <span className="text-[10px] font-mono text-ink-400">{r.latency_ms}ms</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {rows.length === 0 && !data.note && (
        <div className="p-4 rounded border border-dashed border-ink-700 text-xs text-ink-500 italic text-center">
          평가 결과가 없습니다 — <code className="text-ink-300">scripts/eval_wow_queries.py</code> 실행 후 nightly로 적재됩니다.
        </div>
      )}
    </div>
  );
}

// ─── Trace ─────────────────────────────────────────────────────────────
function TraceView() {
  const [data, setData] = useState<api.TraceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  async function load() {
    setLoading(true); setError(null);
    try { setData(await api.opsTrace()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  if (loading && !data) return <p className="text-sm text-ink-400">트레이스 로딩 중…</p>;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;
  const events = data.trace ?? [];
  const filtered = events.filter((e) =>
    !filter
    || e.tool.toLowerCase().includes(filter.toLowerCase())
    || (e.session_id ?? '').includes(filter)
    || (e.actor_id ?? '').includes(filter)
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <RefreshButton onClick={load} loading={loading} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="도구명 / 세션 / 액터 필터"
          className="rounded bg-ink-800 border border-ink-700 px-3 py-1.5 text-xs text-ink-100 outline-none focus:border-accent-500 placeholder:text-ink-500 flex-1 max-w-xs"
        />
        <span className="text-xs text-ink-400 ml-auto">
          {filtered.length} / {events.length} 이벤트
        </span>
      </div>
      {events.length === 0 && (
        <div className="p-4 rounded border border-dashed border-ink-700 text-xs text-ink-500 italic text-center">
          트레이스가 없습니다 — /chat에서 메시지를 보내거나 권역 경쟁 지도의 주유소 도우미를 사용하면 도구 호출이 여기에 기록됩니다.
        </div>
      )}
      <ul className="space-y-2">
        {filtered.map((e, i) => (
          <li key={i} className="p-3 rounded border border-ink-700 bg-ink-800">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Wrench className="w-3.5 h-3.5 text-accent-300 shrink-0" />
              <span className="font-mono text-xs font-semibold text-accent-200">{e.tool}</span>
              <span className="text-[10px] font-mono text-ink-500">
                @ {typeof e.ts === 'number' ? new Date(e.ts * 1000).toLocaleTimeString() : String(e.ts ?? '?')}
              </span>
              {e.session_id && (
                <span className="ml-auto text-[10px] font-mono text-ink-400 truncate max-w-[180px]">
                  session: {e.session_id.slice(-8)}
                </span>
              )}
              {e.actor_id && (
                <span className="text-[10px] font-mono text-orange-300 truncate max-w-[120px]">
                  actor: {e.actor_id}
                </span>
              )}
            </div>
            <pre className="text-[10px] text-ink-300 overflow-x-auto whitespace-pre-wrap break-all leading-snug font-mono">
              {JSON.stringify(e.input ?? {}, null, 2)}
            </pre>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── shared bits ───────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">{title}</h2>
      {children}
    </section>
  );
}
function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="px-3 py-2.5 rounded-md border border-ink-700 bg-ink-800">
      <div className="text-[10px] text-ink-400 font-mono">{label}</div>
      <div className={`text-sm text-ink-100 ${mono ? 'font-mono' : 'font-semibold'} truncate`}>{value}</div>
    </div>
  );
}
function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="p-3 rounded-md bg-red-500/10 text-red-300 border border-red-500/30 text-sm">
      {msg}
    </div>
  );
}
function RefreshButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="px-3 py-1.5 rounded-md border border-ink-700 text-ink-200 text-xs hover:bg-ink-800 disabled:opacity-50 inline-flex items-center gap-1.5">
      <RefreshCcw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
      {loading ? '로딩 중…' : '새로고침'}
    </button>
  );
}
