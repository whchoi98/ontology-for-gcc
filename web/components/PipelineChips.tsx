'use client';
// 공통 SSE phase chip 표시기 — 데이터 파이프라인 진행 상황을 페이지 최상단에
// 시각화. external-signal/insights와 동일한 색상 패밀리·애니메이션 사용.
//
// 사용 패턴:
//   const [phases, setPhases] = useState<PhaseChip[]>([]);
//   for await (const ev of streamSSE(...)) {
//     if (ev.type === 'phase' && ev.data.name) {
//       setPhases(p => [...p, phaseMeta(ev.data.name, ev.data)]);
//     }
//   }
//   <PipelineChips phases={phases} loading={loading} />

import React from 'react';

export type PhaseChip = { name: string; label: string; tone: string };

// 공통 phase 색상 — 5 단계 패밀리 (Neptune 집계 → 계산/매칭 → 차트/시각화 →
// Sonnet narrative → Sonnet 인사이트 → 완료)
const PHASE_TONES: Record<string, string> = {
  // 1. 데이터 수집 (emerald)
  querying:                'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  querying_neptune:        'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  query_done:              'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  neptune_done:            'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  aggregating:             'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  aggregated:              'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  // 2. 계산/매칭 (teal/cyan)
  computing:               'border-teal-500/50    bg-teal-500/15    text-teal-200',
  scoring:                 'border-teal-500/50    bg-teal-500/15    text-teal-200',
  clustering:              'border-teal-500/50    bg-teal-500/15    text-teal-200',
  embedding:               'border-teal-500/50    bg-teal-500/15    text-teal-200',
  similarity:              'border-teal-500/50    bg-teal-500/15    text-teal-200',
  matching:                'border-teal-500/50    bg-teal-500/15    text-teal-200',
  detecting:               'border-teal-500/50    bg-teal-500/15    text-teal-200',
  merging:                 'border-teal-500/50    bg-teal-500/15    text-teal-200',
  compute_done:            'border-teal-500/50    bg-teal-500/15    text-teal-200',
  // 3. 차트/시각화 (cyan)
  rendering:               'border-cyan-500/50    bg-cyan-500/15    text-cyan-200',
  rendering_chart:         'border-cyan-500/50    bg-cyan-500/15    text-cyan-200',
  chart_ready:             'border-cyan-500/50    bg-cyan-500/15    text-cyan-200',
  // 4. Sonnet narrative (blue/violet)
  narrative_streaming:     'border-blue-500/50    bg-blue-500/15    text-blue-200',
  narrative_done:          'border-blue-500/50    bg-blue-500/15    text-blue-200',
  // 5. Sonnet 인사이트 (orange)
  summarizing:             'border-orange-500/50  bg-orange-500/15  text-orange-200',
  summary_streaming:       'border-orange-500/50  bg-orange-500/15  text-orange-200',
  summary_done:            'border-orange-500/50  bg-orange-500/15  text-orange-200',
};

const DEFAULT_LABELS: Record<string, string> = {
  querying:            '데이터 조회 중',
  querying_neptune:    'Neptune 쿼리 실행',
  query_done:          '쿼리 완료',
  neptune_done:        'Neptune 완료',
  aggregating:         '집계 중',
  aggregated:          '집계 완료',
  computing:           '계산 중',
  scoring:             '점수 계산',
  clustering:          'KMeans 클러스터링',
  embedding:           '임베딩 추출',
  similarity:          '유사도 검색',
  matching:            '매칭 계산',
  detecting:           '패턴 탐지',
  merging:             '시계열 merge',
  compute_done:        '계산 완료',
  rendering:           '차트 렌더링',
  rendering_chart:     'matplotlib 렌더',
  chart_ready:         '차트 준비 완료',
  narrative_streaming: 'Sonnet 4.6 narrative 생성 중',
  narrative_done:      'narrative 완료',
  summarizing:         'Sonnet 4.6 5섹션 인사이트 생성 중',
  summary_streaming:   'Sonnet 4.6 5섹션 인사이트',
  summary_done:        '5섹션 인사이트 완성',
};

/** Build a phase chip from a server-side phase event.
 * Optional `count`/`len`/`desc`/labelOverride fields enrich the chip text. */
export function phaseMeta(
  name: string,
  extra?: { count?: number; len?: number; desc?: string; label?: string },
): PhaseChip {
  const base = extra?.label ?? DEFAULT_LABELS[name] ?? name;
  let label = base;
  if (extra?.count != null) label = `${base} (${extra.count.toLocaleString()})`;
  else if (extra?.len != null) label = `${base} (${extra.len.toLocaleString()}자)`;
  else if (extra?.desc) label = `${base} — ${extra.desc}`;
  return {
    name,
    label,
    tone: PHASE_TONES[name] ?? 'border-slate-500/50 bg-slate-500/15 text-slate-200',
  };
}

export default function PipelineChips({
  phases, loading, className = '',
}: { phases: PhaseChip[]; loading: boolean; className?: string }) {
  if (phases.length === 0 && !loading) return null;
  return (
    <div className={`mb-4 flex flex-wrap gap-2 items-center ${className}`}>
      <span className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
        파이프라인
      </span>
      {phases.map((p, i) => (
        <span key={i}
          className={`text-[11px] font-mono px-2 py-1 rounded-md border ${p.tone}`}>
          {p.label}
        </span>
      ))}
      {loading && (
        <span className="text-[11px] font-mono px-2 py-1 rounded-md border border-ink-700 bg-ink-800 text-ink-400 animate-pulse">
          …
        </span>
      )}
    </div>
  );
}
