// web/app/insights/page.tsx — 시나리오 C: MD 인사이트 (Code Interpreter + Sonnet 요약)
'use client';
import { useState } from 'react';
import { streamSSE } from '../../lib/api-client';
import ChartImage from '../../components/ChartImage';
import StreamPanel from '../../components/StreamPanel';
import PersonaSwitchGcc from '../../components/PersonaSwitchGcc';
import DataSourceBadge from '../../components/DataSourceBadge';

type StreamEvent = { type: string; data: unknown };
type ResultData = {
  chart_png_b64?: string;
  summary?: string;
  rows?: unknown[];
};

export default function InsightsPage() {
  const [persona, setPersona] = useState('marketing');
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [chart, setChart] = useState<string | undefined>();
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    setEvents([]);
    setChart(undefined);
    setSummary('');
    for await (const ev of streamSSE<unknown>('/api/insights/stream', {
      persona_id: persona,
      topic: 'fuel_grade_trend',
    })) {
      setEvents((p) => [...p, ev as StreamEvent]);
      if (ev.type === 'result') {
        const d = ev.data as ResultData;
        setChart(d.chart_png_b64);
        setSummary(d.summary || '');
      }
    }
    setLoading(false);
  }
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>
        C. MD 인사이트 (월별 유종 트렌드)
      </h1>
      <PersonaSwitchGcc value={persona} onChange={setPersona} />
      <div className='flex gap-2 mt-3 mb-3'>
        <DataSourceBadge source='real' />
        <DataSourceBadge source='synthetic' />
      </div>
      <button
        onClick={go}
        disabled={loading}
        className='bg-blue-600 text-white px-4 py-2 rounded mb-3'
      >
        {loading ? '분석 중...' : '인사이트 생성'}
      </button>
      <StreamPanel events={events} />
      <div className='grid grid-cols-2 gap-4 mt-4'>
        <ChartImage base64Png={chart} loading={loading} />
        <div className='border rounded p-3 text-sm whitespace-pre-wrap'>
          {summary || '요약 대기'}
        </div>
      </div>
    </div>
  );
}
