'use client';
import { useState } from 'react';
import { Download, FileText, Sparkles } from 'lucide-react';
import { MarkdownView } from './MarkdownView';

type Props = {
  title: string;
  scenarioCode?: string;
  personaLabel?: string;
  sources?: string[];
  summary?: string;
  loading?: boolean;
  filenameBase?: string;
};

/** Sonnet 4.6 5섹션 markdown 인사이트 + MD/PDF 다운로드 버튼.
 *  모든 시나리오 페이지가 공통으로 사용. */
export default function InsightReport({
  title, scenarioCode, personaLabel, sources = ['real'],
  summary, loading, filenameBase = 'insight',
}: Props) {
  const [exporting, setExporting] = useState(false);

  function downloadMarkdown() {
    if (!summary) return;
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const md = [
      `# ${title} — Sonnet 4.6 인사이트`,
      '',
      `- 시나리오: ${scenarioCode ?? '—'}`,
      `- 부서 페르소나: ${personaLabel ?? '—'}`,
      `- 출처: ${sources.join(', ')}`,
      `- 생성: ${stamp}`,
      '',
      '---',
      '',
      summary,
    ].join('\n');
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenameBase}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadPdf() {
    if (!summary || exporting) return;
    setExporting(true);
    try {
      const { exportToPdf } = await import('@/lib/pdf-export');
      const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
      // 5섹션 markdown을 ## 헤더로 split → PDF section.
      const parts = summary.split(/\n##\s+/m);
      const sections = parts
        .map((part, i) => {
          if (i === 0) {
            // 첫 부분은 헤더 없는 도입부 또는 첫 섹션.
            const lines = part.split('\n').filter((l) => l.trim());
            const firstLine = lines[0] ?? '';
            const heading = firstLine.startsWith('## ') ? firstLine.replace(/^##\s+/, '') : '요약';
            const body = firstLine.startsWith('## ')
              ? lines.slice(1).join('\n')
              : lines.join('\n');
            return { badge: '1', title: heading, body, accentColor: '#fb923c' };
          }
          const newlineIdx = part.indexOf('\n');
          const heading = newlineIdx >= 0 ? part.slice(0, newlineIdx).trim() : part.trim();
          const body = newlineIdx >= 0 ? part.slice(newlineIdx + 1).trim() : '';
          const accents = ['#fb923c', '#34d399', '#60a5fa', '#a78bfa', '#f472b6'];
          return {
            badge: String(i + 1),
            title: heading || `섹션 ${i + 1}`,
            body,
            accentColor: accents[i % accents.length],
          };
        })
        .filter((s) => s.body || s.title);

      await exportToPdf({
        title: `${title} — Sonnet 4.6 인사이트`,
        meta: `${personaLabel ?? '—'} · ${sources.join(', ')} · 생성 ${stamp}`,
        sections,
        footer: `Ontology GCC PoC · ${title} · ${stamp}`,
        filename: `${filenameBase}-${Date.now()}`,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-ink-700 bg-ink-800 p-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Sparkles className="w-4 h-4 text-accent-400" />
        <h2 className="text-sm font-semibold text-ink-100">{title} — Sonnet 4.6 인사이트</h2>
        {personaLabel && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-900 border border-ink-700 text-ink-400">
            {personaLabel} 어조
          </span>
        )}
        {sources.map((s) => (
          <span key={s} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
            {s}
          </span>
        ))}
        {summary && (
          <div className="ml-auto flex items-center gap-2">
            <button onClick={downloadMarkdown}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-ink-700 text-ink-300 hover:border-accent-500 hover:text-accent-300 transition"
              title="Markdown 다운로드">
              <FileText className="w-3.5 h-3.5" /> MD
            </button>
            <button onClick={downloadPdf} disabled={exporting}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-ink-700 text-ink-300 hover:border-accent-500 hover:text-accent-300 transition disabled:opacity-50"
              title="PDF 다운로드">
              <Download className="w-3.5 h-3.5" /> {exporting ? 'PDF 생성 중...' : 'PDF'}
            </button>
          </div>
        )}
      </div>
      {summary ? (
        <MarkdownView text={summary} />
      ) : loading ? (
        <div className="space-y-2">
          <div className="h-3 bg-ink-700 rounded animate-pulse w-2/3" />
          <div className="h-3 bg-ink-700 rounded animate-pulse w-3/4" />
          <div className="h-3 bg-ink-700 rounded animate-pulse w-1/2" />
          <div className="h-3 bg-ink-700 rounded animate-pulse w-full" />
          <div className="h-3 bg-ink-700 rounded animate-pulse w-5/6" />
          <p className="text-xs text-ink-500 italic mt-3">Sonnet 4.6이 5섹션 인사이트를 생성하는 중...</p>
        </div>
      ) : (
        <p className="text-sm text-ink-500 italic">실행 후 Sonnet 4.6 5섹션 인사이트가 여기에 표시됩니다.</p>
      )}
    </section>
  );
}
