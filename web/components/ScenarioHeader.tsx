"use client";
// Per-scenario top header — 시나리오 코드 (A~N) + 한국어 제목 + 기술 파이프라인 + active persona.

import { useActivePersona } from "@/lib/persona-context";

interface Props {
  scenario?: string;          // "A" .. "N"
  title: string;
  tech: string;
  showPersona?: boolean;
  rightSlot?: React.ReactNode;
}

const PERSONA_LABEL: Record<string, string> = {
  marketing:    '마케팅',
  strategy:     '고객전략',
  'data-ai':    '데이터·AI',
  crm:          'CRM·회원사업',
  'retail-ops': '리테일영업',
};

export function ScenarioHeader({ scenario, title, tech, showPersona = true, rightSlot }: Props) {
  const persona = useActivePersona();
  return (
    <header className="border-b border-ink-700 bg-ink-900 px-6 py-2.5 pr-72 lg:pr-80 flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="flex items-center gap-2 shrink-0">
        {scenario && (
          <span className="text-[11px] font-mono px-2 py-0.5 rounded border border-accent-500/40 bg-accent-500/10 text-accent-200 font-bold">
            시나리오 {scenario}
          </span>
        )}
        <h1 className="text-sm font-semibold text-ink-100">{title}</h1>
      </div>
      <div className="text-[11px] text-ink-400 font-mono leading-snug min-w-0 flex-1">
        {tech}
      </div>
      {showPersona && persona.active && (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-orange-500/40 bg-orange-500/10 text-orange-200 shrink-0">
          {PERSONA_LABEL[persona.active] ?? persona.active}
        </span>
      )}
      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </header>
  );
}
