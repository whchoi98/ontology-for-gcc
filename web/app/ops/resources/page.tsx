'use client';
import { useEffect, useState } from 'react';
import {
  RefreshCw, Database, Search as SearchIcon, Server, Cloud,
  HardDrive, Lock, Cpu, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react';
import { ScenarioHeader } from '@/components/ScenarioHeader';

type EcsService = {
  name?: string;
  desired?: number;
  running?: number;
  rollout_state?: string;
  task_definition?: string;
  updated_at?: string;
};

type ResourcesPayload = {
  compute?: { service: string; cluster?: string; services?: EcsService[] };
  database?: { service: string; status?: string; engine?: string; engine_version?: string;
                instance_class?: string; free_memory_gb?: number; endpoint?: string; iam_auth?: boolean };
  search?: { service: string; status?: string; collection?: string; index?: string;
              doc_count?: number | null };
  edge?: { service: string; status?: string; domain_name?: string; aliases?: string[]; enabled?: boolean };
  storage?: { service: string; buckets?: { role: string; name: string; size_gb?: number | null; objects?: number | null }[] };
  auth?: { service: string; pool_id?: string; pool_name?: string; user_count?: number | null };
  ai?: { service: string; chat_model?: string; embed_model?: string; guardrail_id?: string };
};

function StatusChip({ value }: { value?: string }) {
  if (!value) return <span className="text-[10px] text-ink-500 font-mono">—</span>;
  const v = value.toLowerCase();
  const ok = ['available', 'active', 'completed', 'deployed', 'running'].includes(v);
  const warn = ['storage-optimization', 'in_progress', 'modifying', 'updating'].includes(v);
  const tone = ok
    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
    : warn
    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
    : 'bg-rose-500/15 text-rose-300 border-rose-500/40';
  const Icon = ok ? CheckCircle2 : warn ? Loader2 : AlertCircle;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border ${tone}`}>
      <Icon className={`w-3 h-3 ${warn ? 'animate-spin' : ''}`} />
      {value}
    </span>
  );
}

function Card({
  icon: Icon, title, kind, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  kind: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5 text-accent-400" />
        <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
        <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-800 border border-ink-700 text-ink-400">
          {kind}
        </span>
      </div>
      <div className="space-y-1.5 text-xs">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-ink-400 shrink-0 w-28 font-mono text-[11px]">{label}</span>
      <span className="text-ink-200 break-all">{value ?? <span className="text-ink-500">—</span>}</span>
    </div>
  );
}

export default function ResourcesPage() {
  const [data, setData] = useState<ResourcesPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/ops/resources', { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as ResourcesPayload;
      setData(j);
      setUpdatedAt(new Date().toLocaleTimeString('ko-KR', { hour12: false }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader
        title="인프라 자원 상태"
        tech="Neptune · OpenSearch · ECS Fargate · CloudFront · S3 · Cognito · Bedrock — 실시간 boto3 probe"
      />

      <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6">
        <div className="mb-5 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-ink-50 mb-1.5">프로젝트 자원의 현재 상태</h1>
            <p className="text-sm text-ink-300 leading-relaxed">
              GCC PoC 인프라의 7개 그룹 (compute · database · search · edge · storage · auth · ai)
              상태를 한 화면에서 확인합니다. 각 카드의 상태 칩은 AWS 서비스 status를 색상으로
              표시합니다 (green=정상, amber=변경 중, rose=오류).
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {updatedAt && <span className="text-[11px] font-mono text-ink-400">갱신 {updatedAt}</span>}
            <button
              onClick={() => void load()}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-ink-700 bg-ink-800 text-ink-200 hover:border-accent-500/60 hover:text-accent-300 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-200 text-sm">
            로드 실패: {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Compute (ECS) */}
          <Card icon={Server} title={data?.compute?.service ?? 'ECS Fargate'} kind="compute">
            <Row label="cluster" value={data?.compute?.cluster} />
            {(data?.compute?.services ?? []).map((s) => (
              <div key={s.name} className="border-t border-ink-700/50 pt-1.5 mt-1.5 space-y-1">
                <Row label="service" value={<span className="font-mono">{s.name}</span>} />
                <Row label="running" value={<>{s.running}/{s.desired} · <StatusChip value={s.rollout_state} /></>} />
                <Row label="task def" value={<span className="font-mono">rev:{s.task_definition}</span>} />
                <Row label="updated" value={<span className="font-mono">{s.updated_at}</span>} />
              </div>
            ))}
          </Card>

          {/* Database (Neptune) */}
          <Card icon={Database} title={data?.database?.service ?? 'Amazon Neptune'} kind="database">
            <Row label="status" value={<StatusChip value={data?.database?.status} />} />
            <Row label="engine" value={<span className="font-mono">{data?.database?.engine} {data?.database?.engine_version}</span>} />
            <Row label="instance" value={<span className="font-mono">{data?.database?.instance_class}</span>} />
            <Row label="free memory" value={data?.database?.free_memory_gb ? `${data.database.free_memory_gb} GB` : '—'} />
            <Row label="iam auth" value={data?.database?.iam_auth ? '✓ 활성' : '비활성'} />
            <Row label="endpoint" value={<span className="font-mono text-[10px]">{data?.database?.endpoint}</span>} />
          </Card>

          {/* Search (OpenSearch Serverless) */}
          <Card icon={SearchIcon} title={data?.search?.service ?? 'OpenSearch Serverless'} kind="search">
            <Row label="status" value={<StatusChip value={data?.search?.status} />} />
            <Row label="collection" value={<span className="font-mono">{data?.search?.collection}</span>} />
            <Row label="index" value={<span className="font-mono text-[10px]">{data?.search?.index}</span>} />
            <Row label="doc count" value={data?.search?.doc_count ?? '—'} />
            <Row label="type" value="VECTORSEARCH (KNN+BM25)" />
          </Card>

          {/* Edge (CloudFront) */}
          <Card icon={Cloud} title={data?.edge?.service ?? 'CloudFront'} kind="edge">
            <Row label="status" value={<StatusChip value={data?.edge?.status} />} />
            <Row label="domain" value={<span className="font-mono text-[10px]">{data?.edge?.domain_name}</span>} />
            <Row label="aliases" value={(data?.edge?.aliases ?? []).join(', ') || '—'} />
            <Row label="enabled" value={data?.edge?.enabled ? '✓' : '—'} />
          </Card>

          {/* Storage (S3) */}
          <Card icon={HardDrive} title={data?.storage?.service ?? 'Amazon S3'} kind="storage">
            {(data?.storage?.buckets ?? []).map((b) => (
              <div key={b.name} className="border-t border-ink-700/50 pt-1.5 first:border-t-0 first:pt-0">
                <Row label={b.role} value={
                  <>
                    <span className="font-mono text-[10px] block">{b.name}</span>
                    <span className="text-[10px] text-ink-400">
                      {b.size_gb !== null && b.size_gb !== undefined ? `${b.size_gb} GB` : '—'}
                      {' · '}
                      {b.objects !== null && b.objects !== undefined ? `${b.objects} objects` : '—'}
                    </span>
                  </>
                } />
              </div>
            ))}
          </Card>

          {/* Auth (Cognito) */}
          <Card icon={Lock} title={data?.auth?.service ?? 'Cognito'} kind="auth">
            <Row label="pool name" value={<span className="font-mono">{data?.auth?.pool_name}</span>} />
            <Row label="pool id" value={<span className="font-mono text-[10px]">{data?.auth?.pool_id}</span>} />
            <Row label="users" value={data?.auth?.user_count ?? '—'} />
          </Card>

          {/* AI (Bedrock) */}
          <Card icon={Cpu} title={data?.ai?.service ?? 'Amazon Bedrock'} kind="ai">
            <Row label="chat model" value={<span className="font-mono text-[10px]">{data?.ai?.chat_model}</span>} />
            <Row label="embed model" value={<span className="font-mono text-[10px]">{data?.ai?.embed_model}</span>} />
            <Row label="guardrail" value={<span className="font-mono">{data?.ai?.guardrail_id}</span>} />
          </Card>
        </div>

        {/* 동작 설명 */}
        <div className="mt-8 p-5 rounded-lg border border-ink-700 bg-ink-900/60">
          <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
            <span className="text-accent-400">⚙</span> 이 페이지는 무엇인가요?
          </h3>
          <p className="text-xs text-ink-300 leading-relaxed">
            <strong className="text-ink-200">자원 상태</strong> 페이지는 GCC PoC를 운영하는 7개 AWS 자원
            (ECS Fargate · Neptune · OpenSearch Serverless · CloudFront · S3 · Cognito · Bedrock)의
            현재 상태를 boto3 호출 한 번으로 모아 표시합니다. 데모 직전 health check, 인프라 변경 후
            실시간 검증, 관리자 인계 시 가시성 확보용으로 활용하세요. 패턴은
            <a className="text-accent-300 hover:text-accent-200 underline ml-1"
               href="https://github.com/whchoi98/awsops" target="_blank" rel="noreferrer">
              github.com/whchoi98/awsops
            </a> 의 운영 대시보드에서 차용했습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
