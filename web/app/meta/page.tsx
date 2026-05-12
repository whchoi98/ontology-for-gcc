'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, GitBranch, Network, ListChecks, FileJson } from 'lucide-react';
import CytoscapeView from '../../components/CytoscapeView';

type Tab = 'er' | 'standards' | 'validation';

const TAB_META: Record<Tab, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  er:         { label: 'ER 다이어그램', icon: Network },
  standards:  { label: '표준 코드',     icon: FileJson },
  validation: { label: '검증 리포트',   icon: ListChecks },
};

// Dark-mode group palette — must match the 5-domain ontology coloring used
// elsewhere (CytoscapeView's per-label selectors + objects/[type] TYPE_META).
const GROUP_BADGE: Record<string, { ko: string; tone: string }> = {
  customer:            { ko: '고객·회원',   tone: 'border-orange-500/50 bg-orange-500/15 text-orange-200' },
  behavior:            { ko: '행동·거래',   tone: 'border-sky-500/50    bg-sky-500/15    text-sky-200' },
  marketing:           { ko: '마케팅',       tone: 'border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-200' },
  operations:          { ko: '운영·상품',   tone: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' },
  compliance_external: { ko: '컴플·외부',   tone: 'border-amber-500/50  bg-amber-500/15  text-amber-200' },
  time:                { ko: '시간',         tone: 'border-slate-500/50  bg-slate-500/15  text-slate-200' },
};

const groupOf = (name: string): string => {
  if (['Customer','Persona','Cluster','Segment','Member'].includes(name)) return 'customer';
  if (['FuelTransaction','AppEvent','SurveyResponse','Survey','CouponUse','PaymentMethod'].includes(name)) return 'behavior';
  if (['Campaign','Coupon','Offer','Channel','CampaignSms','CampaignSMS','CampaignAggregation'].includes(name)) return 'marketing';
  if (['FuelProduct','GasStation','FuelPrice','Region'].includes(name)) return 'operations';
  if (['Term','TermAgreement','ConsumptionIndex','WeatherObservation'].includes(name)) return 'compliance_external';
  return 'time';
};

export default function MetaPage() {
  const [tab, setTab] = useState<Tab>('er');
  const [schema, setSchema] = useState<any>(null);
  const [standards, setStandards] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
    Promise.allSettled([
      fetch(`${base}/ontology/schema`).then((r) => r.json()).then(setSchema),
      fetch(`${base}/ontology/standards`).then((r) => r.json()).then(setStandards),
      fetch(`${base}/ontology/validation`).then((r) => r.json()).then(setValidation),
    ]).finally(() => setLoading(false));
  }, []);

  const elements = schema?.classes
    ? [
        ...schema.classes.map((c: any) => ({
          data: { id: c.name, label: c.name, group: groupOf(c.name) },
        })),
        ...schema.relations.map((r: any) => ({
          data: {
            id: `${r.source}-${r.edge}-${r.target}`,
            source: r.source,
            target: r.target,
            edge: r.edge,
          },
        })),
      ]
    : [];

  // Group classes for legend display
  const classesByGroup = (schema?.classes ?? []).reduce(
    (acc: Record<string, string[]>, c: any) => {
      const g = groupOf(c.name);
      (acc[g] ??= []).push(c.name);
      return acc;
    },
    {},
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-700 bg-ink-900 flex items-center px-6 shrink-0">
        <div className="text-xs text-ink-400 flex items-center gap-2">
          <Link href="/" className="hover:text-accent-300">홈</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-ink-200 font-medium">메타 (Ontology)</span>
        </div>
      </header>

      <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1.5">
            <GitBranch className="w-5 h-5 text-accent-300" />
            <h1 className="text-2xl font-bold text-ink-50">온톨로지 메타</h1>
          </div>
          <p className="text-sm text-ink-300 leading-relaxed">
            25 클래스 · 30+ 관계의 ER 다이어그램, 표준 코드 (Opinet · KOSTAT · KFDA · KMA · 현대카드) 매핑,
            적재 검증 리포트를 한 곳에 모았습니다.
          </p>
        </div>

        {/* ── 그룹 범례 (다크 패밀리 색상) ───────────────── */}
        {schema && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {Object.entries(classesByGroup).map(([g, names]) => {
              const meta = GROUP_BADGE[g];
              if (!meta) return null;
              return (
                <span
                  key={g}
                  className={`text-[10px] font-mono px-2 py-1 rounded border ${meta.tone}`}
                  title={(names as string[]).join(', ')}
                >
                  {meta.ko} · {(names as string[]).length}
                </span>
              );
            })}
          </div>
        )}

        {/* ── 탭 ──────────────────────────────────────── */}
        <div className="flex gap-2 border-b border-ink-700 mb-4">
          {(Object.keys(TAB_META) as Tab[]).map((t) => {
            const meta = TAB_META[t];
            const Icon = meta.icon;
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={[
                  'px-4 py-2 text-sm flex items-center gap-1.5 border-b-2 transition',
                  active
                    ? 'border-accent-500 text-accent-300 font-semibold'
                    : 'border-transparent text-ink-400 hover:text-ink-200',
                ].join(' ')}
              >
                <Icon className="w-3.5 h-3.5" />
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* ── ER 다이어그램 ──────────────────────────── */}
        {tab === 'er' && (
          <div>
            {schema ? (
              <>
                <div className="mb-3 text-xs text-ink-400 flex flex-wrap gap-3">
                  <span>클래스 <b className="text-ink-100 font-mono">{schema.class_count}</b></span>
                  <span>관계 <b className="text-ink-100 font-mono">{schema.relation_count}</b></span>
                  <span className="text-ink-500 italic">— cose layout · 5 도메인 색상 패밀리</span>
                </div>
                <CytoscapeView elements={elements}/>
              </>
            ) : (
              <p className="text-xs text-ink-500 italic">{loading ? '스키마 로딩 중…' : 'schema 로드 실패'}</p>
            )}
          </div>
        )}

        {/* ── 표준 코드 ───────────────────────────────── */}
        {tab === 'standards' && (
          <div className="rounded-lg border border-ink-700 bg-ink-900 overflow-auto max-h-[640px]">
            {standards ? (
              <pre className="text-xs text-ink-200 font-mono p-4 whitespace-pre-wrap">
                {JSON.stringify(standards, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-ink-500 italic p-4">{loading ? '표준 코드 로딩 중…' : 'standards 로드 실패'}</p>
            )}
          </div>
        )}

        {/* ── 검증 리포트 ─────────────────────────────── */}
        {tab === 'validation' && (
          <div>
            {validation ? (
              <>
                <div
                  className={[
                    'mb-3 px-3 py-2 rounded text-sm border',
                    validation.all_ok
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                      : 'bg-rose-500/10 border-rose-500/40 text-rose-200',
                  ].join(' ')}
                >
                  전체 적재 검증: <b>{validation.all_ok ? '✓ 정상' : '✗ 일부 미달 또는 미연결'}</b>
                </div>
                <div className="rounded-lg border border-ink-700 bg-ink-900 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-ink-800 text-ink-300">
                      <tr>
                        <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider">클래스</th>
                        <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider">실제</th>
                        <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider">min</th>
                        <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider">max</th>
                        <th className="text-center px-3 py-2 text-[11px] uppercase tracking-wider">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validation.checks?.map((c: any, i: number) => (
                        <tr key={i} className="border-t border-ink-700/50 text-ink-200">
                          <td className="px-3 py-1.5 font-mono text-xs">{c.class}</td>
                          <td className="text-right px-3 py-1.5 font-mono text-xs">
                            {typeof c.count === 'number' ? c.count.toLocaleString() : c.count ?? '—'}
                          </td>
                          <td className="text-right px-3 py-1.5 font-mono text-xs text-ink-400">
                            {c.expected_min?.toLocaleString?.() ?? '—'}
                          </td>
                          <td className="text-right px-3 py-1.5 font-mono text-xs text-ink-400">
                            {c.expected_max?.toLocaleString?.() ?? '—'}
                          </td>
                          <td className={`text-center px-3 py-1.5 font-semibold ${c.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {c.ok ? '✓' : '✗'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-xs text-ink-500 italic">{loading ? '검증 리포트 로딩 중…' : 'validation 로드 실패'}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
