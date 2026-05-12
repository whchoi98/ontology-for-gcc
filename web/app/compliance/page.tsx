'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { ScenarioHeader } from '@/components/ScenarioHeader';
import PersonaSwitchGcc from '@/components/PersonaSwitchGcc';
import InsightReport from '@/components/InsightReport';
import PipelineChips, { phaseMeta, type PhaseChip } from '@/components/PipelineChips';
import { streamSSE } from '@/lib/api-client';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

type CheckOut = {
  action_cleaned?: string; guardrail_violations?: string[];
  eligible_count?: number; blocked_count?: number;
  eligible_sample?: string[]; blocked_sample?: string[];
  recommendation?: string; summary?: string;
};
type Sample = { label: string; csv: string; action: string; persona: Persona };

const SAMPLES: Sample[] = [
  { persona: 'marketing',  csv: '1,2,3,4,5',                  action: '고급휘발유 충성 고객 SMS 캠페인',     label: '고급휘발유 SMS 캠페인 5명' },
  { persona: 'marketing',  csv: '460,401,288,471,342',        action: '쿠폰 발급 + SMS 알림',                 label: 'coupon-only 5명 SMS' },
  { persona: 'marketing',  csv: '1,2,3,4,5,460,401,288',      action: 'PUSH 마케팅 알림',                     label: '혼합 코호트 PUSH' },
  { persona: 'strategy',   csv: '1,2,3,4,5',                  action: '신규 멤버십 등급 오퍼',                label: 'VIP 신규 오퍼 5명' },
  { persona: 'strategy',   csv: '12,15,19',                   action: '20대 충성 캠페인',                    label: '20대 충성 캠페인' },
  { persona: 'strategy',   csv: '460,401,288',                action: 'churn 위험 고객 retention',           label: 'Churn retention' },
  { persona: 'data-ai',    csv: '1,2,3,4,5',                  action: 'A/B 실험 그룹 분류',                  label: 'A/B 실험 5명' },
  { persona: 'data-ai',    csv: '460,401,288,471,342',        action: '모델 학습 데이터 수집 동의',          label: '학습 데이터 동의' },
  { persona: 'data-ai',    csv: '1,2,3',                      action: 'AI 추천 알림',                        label: 'AI 추천 알림' },
  { persona: 'crm',        csv: '1,2,3,4,5',                  action: 'PLCC 카드 안내',                      label: 'PLCC 카드 안내 5명' },
  { persona: 'crm',        csv: '460,401,288',                action: '멤버십 등급 변경 통지',               label: '등급 변경 통지' },
  { persona: 'crm',        csv: '1,5,12',                     action: '포인트 만료 알림',                    label: '포인트 만료 알림' },
  { persona: 'retail-ops', csv: '1,2,3,4,5',                  action: '인근 주유소 프로모션',                label: '인근 주유소 프로모션' },
  { persona: 'retail-ops', csv: '460,401,288,471,342',        action: '셀프 주유소 안내',                    label: '셀프 주유소 안내' },
  { persona: 'retail-ops', csv: '1,15,19',                    action: '서울 권역 이벤트',                    label: '서울 권역 이벤트' },
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

export default function CompliancePage() {
  const { active, setActive } = useActivePersona();
  const [csv, setCsv] = useState('1,2,3,4,5');
  const [action, setAction] = useState('고급휘발유 충성 고객 대상 SMS 캠페인');
  const [out, setOut] = useState<CheckOut | null>(null);
  const [phases, setPhases] = useState<PhaseChip[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setOut(null); setPhases([]); }, [active]);

  async function go(c?: string, a?: string) {
    const cc = c ?? csv; const aa = a ?? action;
    setLoading(true); setOut(null); setPhases([]);
    const acc: CheckOut = {};
    try {
      for await (const ev of streamSSE<{ name?: string; count?: number; len?: number; desc?: string;
                                          text?: string; channel?: string } & CheckOut>(
        '/api/compliance/stream',
        {
          target_cust_ids: cc.split(',').map((x) => x.trim()).filter(Boolean),
          marketing_action: aa, persona_id: active,
        },
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
      <ScenarioHeader scenario="I" title="약관·가드레일"
        tech="TermAgreement 매트릭스 + Bedrock Guardrails 4 토픽 → 적격/차단 판정" />
      <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink-50 mb-1.5">I. 약관·규제 가드레일</h1>
          <p className="text-sm text-ink-300 leading-relaxed">
            마케팅 액션 (텍스트)을 Bedrock Guardrails 4토픽으로 검사하고, 대상 고객의
            <span className="text-accent-300 font-semibold"> TermAgreement 매트릭스</span>
            (마케팅 동의 / 제3자 제공 / SMS 수신 등 24개 약관)로 적격 vs 차단을 판정합니다. 컴플라이언스
            게이트 통과 후에만 실제 발송이 가능합니다.
          </p>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">부서 페르소나</span>
          <PersonaSwitchGcc value={active} onChange={(v) => setActive(v as Persona)} />
        </div>
        <textarea className="w-full bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-ink-100 mb-2 outline-none focus:border-accent-500"
          rows={2} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="cust_ids (쉼표 구분)" />
        <input className="w-full bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-sm text-ink-100 mb-3 outline-none focus:border-accent-500"
          value={action} onChange={(e) => setAction(e.target.value)} placeholder="마케팅 액션 설명" />
        <button onClick={() => void go()} disabled={loading}
          className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-400 disabled:opacity-50 text-ink-950 font-semibold px-5 py-2 rounded-md text-sm mb-4">
          <ShieldCheck className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
          {loading ? '검사 중...' : '컴플라이언스 검사'}
        </button>

        <PipelineChips phases={phases} loading={loading} />

        {!out && !loading && (
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
              {PERSONA_LABEL[active]} 부서 추천 — 클릭 즉시 검사
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {filtered.map((s, i) => (
                <button key={i} type="button" disabled={loading}
                  onClick={() => { setCsv(s.csv); setAction(s.action); void go(s.csv, s.action); }}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
              <div className="text-xs text-emerald-300 font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> 적격 (마케팅 가능)
              </div>
              <div className="text-3xl font-bold text-emerald-200 mt-1">{out.eligible_count ?? 0}</div>
              <div className="text-[10px] font-mono text-ink-400 mt-2 break-all">
                {(out.eligible_sample ?? []).join(', ') || '—'}
              </div>
            </div>
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4">
              <div className="text-xs text-rose-300 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> 차단
              </div>
              <div className="text-3xl font-bold text-rose-200 mt-1">{out.blocked_count ?? 0}</div>
              <div className="text-[10px] font-mono text-ink-400 mt-2 break-all">
                {(out.blocked_sample ?? []).join(', ') || '—'}
              </div>
            </div>
            <div className="md:col-span-2 rounded-lg border border-ink-700 bg-ink-900 p-4 space-y-2">
              <div className="text-xs text-ink-400">
                가드레일 위반: <span className="font-mono text-ink-200">{out.guardrail_violations?.length ?? 0}</span>
                {(out.guardrail_violations ?? []).length > 0 && (
                  <span className="ml-2 font-mono text-rose-300">{out.guardrail_violations?.join(', ')}</span>
                )}
              </div>
              {out.action_cleaned && out.action_cleaned !== action && (
                <div className="text-xs text-amber-300">
                  cleaned: <span className="font-mono">{out.action_cleaned}</span>
                </div>
              )}
              <div className="text-sm font-semibold text-ink-100">
                권고: <span className="text-accent-300">{out.recommendation || '—'}</span>
              </div>
            </div>
          </div>
        )}

        {(out || loading) && (
          <InsightReport title="약관·가드레일" scenarioCode="I"
            personaLabel={PERSONA_LABEL[active]}
            sources={['real:Customer', 'real:Term', 'real:TermAgreement', 'Bedrock:Guardrails']}
            summary={out?.summary} loading={loading}
            filenameBase={`compliance-${active}`} />
        )}

        <div className="mt-8 p-5 rounded-lg border border-ink-700 bg-ink-900/60">
          <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
            <span className="text-accent-400">⚙</span> 이 시나리오는 무엇을 하나요?
          </h3>
          <p className="text-xs text-ink-300 leading-relaxed">
            <strong className="text-ink-200">약관·가드레일</strong>은 캠페인 발송 직전 (1) Bedrock Guardrails로 마케팅 텍스트가 폭력·증오·성·misinformation
            토픽을 위반하는지 입력 검사, (2) Customer × Term AGREED_TO 매트릭스로 각 고객의 약관 동의 상태를 확인해 적격/차단 판정. 약관 미동의는
            추가 동의 캠페인 또는 제외 처리.
          </p>
        </div>
      </div>
    </div>
  );
}
